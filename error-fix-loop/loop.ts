import { EventEmitter } from 'events';
import {
  AgentError, AgentOutput, ErrorContext, ErrorFixLoopConfig, EscalationRule,
  FixLoopIteration, FixStrategy, ProjectProfile, TaskSpec, ValidationResult,
} from '../core/types';
import {
  FixStrategyEngine, FixPromptResult, StrategyHistory, StrategyAnalysis,
  selectBestStrategy, buildFixPromptFromContext, createStrategyHistory, updateStrategyHistory,
} from './strategies';
import {
  ValidationRunner, ValidationAggregator, ValidationResultAnalyzer,
  AggregatedValidationResult, ValidationResultAnalysis,
  createValidationRunner, createValidationAggregator, createValidationResultAnalyzer,
} from './validator';
import {
  EscalationManager, EscalationAction, EscalationContext,
  createEscalationManager, buildDefaultEscalationRules, formatEscalationAction,
} from './escalation';

export interface LoopConfig extends ErrorFixLoopConfig {
  agentId: string;
  agentType: string;
  signal?: AbortSignal;
  onIteration?: (iteration: FixLoopIteration) => void;
  onEscalation?: (action: EscalationAction) => void;
  onProgress?: (progress: LoopProgress) => void;
}

export interface LoopProgress {
  currentIteration: number;
  maxIterations: number;
  totalTokensUsed: number;
  estimatedCostMs: number;
  currentStrategy: string;
  phase: 'analyzing' | 'fixing' | 'validating' | 'escalating' | 'completed' | 'failed';
}

export interface LoopResult {
  success: boolean;
  output: AgentOutput;
  iterations: FixLoopIteration[];
  totalDurationMs: number;
  totalTokensUsed: number;
  escalationActions: EscalationAction[];
  finalValidation: AggregatedValidationResult;
  strategyHistory: StrategyHistory[];
}

export interface IterationContext {
  output: AgentOutput;
  error: AgentError;
  validationResults: ValidationResult[];
  strategyAnalysis: StrategyAnalysis;
  fixPrompt: FixPromptResult;
  attempt: number;
}

const BACKOFF_CALCULATORS: Record<string, (base: number, attempt: number, max: number) => number> = {
  fixed: (base, _attempt, _max) => base,
  exponential: (base, attempt, max) => Math.min(base * Math.pow(2, attempt), max),
  linear: (base, attempt, max) => Math.min(base * (attempt + 1), max),
  adaptive: (base, attempt, max) => {
    const jitter = Math.random() * 0.3 + 0.85;
    return Math.min(base * Math.pow(1.5, attempt) * jitter, max);
  },
};

export class ErrorFixLoop extends EventEmitter {
  private iterations: FixLoopIteration[] = [];
  private strategyHistory: StrategyHistory[];
  private escalationManager: EscalationManager;
  private validationRunner: ValidationRunner;
  private validationAggregator: ValidationAggregator;
  private resultAnalyzer: ValidationResultAnalyzer;
  private totalTokensUsed: number = 0;
  private startTime: number = 0;
  private currentPhase: LoopProgress['phase'] = 'analyzing';

  constructor() {
    super();
    this.strategyHistory = createStrategyHistory();
    this.escalationManager = createEscalationManager();
    this.validationRunner = createValidationRunner();
    this.validationAggregator = createValidationAggregator();
    this.resultAnalyzer = createValidationResultAnalyzer();
  }

  async run(
    output: AgentOutput,
    strategies: FixStrategy[],
    config: LoopConfig,
    initialError?: AgentError,
    validationResults?: ValidationResult[],
  ): Promise<LoopResult> {
    this.startTime = Date.now();
    this.iterations = [];
    this.strategyHistory = createStrategyHistory();
    this.totalTokensUsed = 0;
    this.escalationManager.reset();

    let currentOutput = output;
    let currentError = initialError || this.buildDefaultError(validationResults);
    let currentValidationResults = validationResults || [];

    this.emitProgress(config, 'analyzing');

    for (let attempt = 0; attempt < config.maxIterations; attempt++) {
      if (config.signal?.aborted) {
        return this.buildResult(false, currentOutput, config);
      }

      const iterationStart = Date.now();

      const errorContext = this.buildErrorContext(
        config.agentId,
        config.agentType as any,
        attempt,
        currentError,
        currentOutput,
        currentValidationResults,
      );

      const strategyAnalysis = this.selectStrategy(errorContext, strategies, config);
      this.emitProgress(config, 'fixing', strategyAnalysis);

      const fixPrompt = this.buildFixPrompt(errorContext, strategyAnalysis.strategy);

      const fixOutput = await this.applyFix(fixPrompt, currentOutput, config);

      this.emitProgress(config, 'validating');
      const newValidationResults = await this.runValidation(config);
      const aggregated = this.validationAggregator.aggregate(newValidationResults);

      const iteration: FixLoopIteration = {
        iteration: attempt,
        timestamp: new Date(),
        error: currentError,
        fixStrategy: strategyAnalysis.strategy.name,
        promptUsed: fixPrompt.userPrompt,
        output: fixOutput,
        validationResults: newValidationResults,
        success: aggregated.passed,
        durationMs: Date.now() - iterationStart,
      };

      this.iterations.push(iteration);
      this.strategyHistory = updateStrategyHistory(
        this.strategyHistory,
        strategyAnalysis.strategy.name,
        aggregated.passed,
        aggregated.passed ? undefined : currentError.message,
      );

      this.totalTokensUsed += strategyAnalysis.estimatedTokens;
      this.emitIteration(config, iteration);

      if (aggregated.passed) {
        this.emitProgress(config, 'completed');
        return this.buildResult(true, fixOutput, config);
      }

      currentOutput = fixOutput;
      currentError = this.extractErrorFromValidation(aggregated);
      currentValidationResults = newValidationResults;

      if (!aggregated.passed && attempt < config.maxIterations - 1) {
        this.emitProgress(config, 'escalating');
        const escalated = await this.handleEscalation(attempt, currentError, config, currentOutput, currentValidationResults);
        if (escalated.type === 'abort') {
          return this.buildResult(false, currentOutput, config);
        }
        if (escalated.type === 'human-intervention') {
          return this.buildResult(false, currentOutput, config);
        }
        if (escalated.type === 'reduce-scope') {
          currentOutput = this.applyScopeReduction(currentOutput, escalated);
        }
        if (escalated.type === 'split-task') {
          return this.buildResult(false, currentOutput, config);
        }
      }

      if (attempt < config.maxIterations - 1) {
        const backoffMs = this.calculateBackoff(config, attempt);
        await this.sleep(backoffMs, config.signal);
      }
    }

    this.emitProgress(config, 'failed');
    return this.buildResult(false, currentOutput, config);
  }

  private selectStrategy(
    context: ErrorContext,
    strategies: FixStrategy[],
    config: LoopConfig,
  ): StrategyAnalysis {
    const patternAnalysis = this.resultAnalyzer.analyze(context.validationResults);
    const adjustedStrategies = this.adjustStrategiesByPattern(strategies, patternAnalysis);
    return selectBestStrategy(context.error, context, this.strategyHistory, adjustedStrategies);
  }

  private adjustStrategiesByPattern(
    strategies: FixStrategy[],
    analysis: ValidationResultAnalysis,
  ): FixStrategy[] {
    if (analysis.suggestedStrategies.length === 0) return strategies;
    const boosted = strategies.map(s => {
      const isSuggested = analysis.suggestedStrategies.includes(s.name);
      return {
        ...s,
        successRate: isSuggested ? Math.min(s.successRate * 1.2, 1.0) : s.successRate * 0.9,
      };
    });
    return boosted;
  }

  private buildFixPrompt(context: ErrorContext, strategy: FixStrategy): FixPromptResult {
    return buildFixPromptFromContext(context, strategy);
  }

  private async applyFix(
    fixPrompt: FixPromptResult,
    currentOutput: AgentOutput,
    config: LoopConfig,
  ): Promise<AgentOutput> {
    return {
      ...currentOutput,
      files: currentOutput.files.map(f => ({
        ...f,
        content: this.injectFixInstructions(f.content, fixPrompt),
      })),
    };
  }

  private injectFixInstructions(content: string, fixPrompt: FixPromptResult): string {
    return content;
  }

  private async runValidation(config: LoopConfig): Promise<ValidationResult[]> {
    const rules = config.validationGates.map(gate => ({
      type: gate.type as any,
      command: gate.command,
      args: gate.args,
      timeoutMs: gate.timeoutMs,
      required: gate.blocking,
    }));

    return this.validationRunner.runValidations(rules, {
      parallel: true,
      signal: config.signal,
    });
  }

  private async handleEscalation(
    iteration: number,
    error: AgentError,
    config: LoopConfig,
    output: AgentOutput,
    validationResults: ValidationResult[],
  ): Promise<EscalationAction> {
    const escalationContext: EscalationContext = {
      currentIteration: iteration + 1,
      maxIterations: config.maxIterations,
      errorHistory: this.iterations.map(i => i.error),
      strategyHistory: this.strategyHistory.map(s => s.strategyName),
      totalTokensUsed: this.totalTokensUsed,
      filesModified: output.files.map(f => f.path),
      validationResults,
    };

    const evaluations = this.escalationManager.evaluateRules(escalationContext, error);
    const action = this.escalationManager.selectEscalation(evaluations, escalationContext);

    if (action) {
      const errorContext = this.buildErrorContext(
        config.agentId,
        config.agentType as any,
        iteration,
        error,
        output,
        validationResults,
      );
      this.escalationManager.recordEscalation(iteration, evaluations[0].rule, action, errorContext);
      this.emitEscalation(config, action);
    }

    return action || {
      type: 'abort',
      reason: 'No escalation rule matched',
      details: { abortReason: 'No applicable escalation rule' },
      timestamp: new Date(),
    };
  }

  private applyScopeReduction(output: AgentOutput, action: EscalationAction): AgentOutput {
    const scope = action.details.reducedScope;
    if (!scope) return output;
    return {
      ...output,
      files: output.files.filter(f =>
        scope.focusPaths.some(p => f.path.includes(p)) ||
        output.files.indexOf(f) < scope.maxFiles,
      ),
    };
  }

  private calculateBackoff(config: LoopConfig, attempt: number): number {
    const calculator = BACKOFF_CALCULATORS[config.backoffStrategy] || BACKOFF_CALCULATORS.exponential;
    return calculator(config.baseBackoffMs, attempt, config.maxBackoffMs);
  }

  private buildErrorContext(
    agentId: string,
    agentType: any,
    attempt: number,
    error: AgentError,
    output: AgentOutput,
    validationResults: ValidationResult[],
  ): ErrorContext {
    return {
      agentId,
      agentType,
      attempt,
      error,
      previousOutput: output,
      validationResults,
      projectProfile: undefined as any,
      taskSpec: undefined as any,
    };
  }

  private buildDefaultError(validationResults?: ValidationResult[]): AgentError {
    if (validationResults && validationResults.length > 0) {
      const firstFailure = validationResults.find(r => !r.passed);
      if (firstFailure) {
        return {
          code: 'VALIDATION_FAILED',
          message: firstFailure.error || `Validation failed: ${firstFailure.rule.type}`,
          category: 'validation',
          recoverable: true,
        };
      }
    }
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error occurred',
      category: 'execution',
      recoverable: true,
    };
  }

  private extractErrorFromValidation(aggregated: AggregatedValidationResult): AgentError {
    const firstFailure = aggregated.blockingFailures[0] || aggregated.warningFailures[0];
    if (firstFailure) {
      return {
        code: `VALIDATION_${firstFailure.rule.type.toUpperCase()}`,
        message: firstFailure.error || firstFailure.output.slice(0, 500),
        category: 'validation',
        recoverable: true,
      };
    }
    return {
      code: 'UNKNOWN_VALIDATION_ERROR',
      message: 'Validation failed without specific error',
      category: 'validation',
      recoverable: true,
    };
  }

  private buildResult(
    success: boolean,
    output: AgentOutput,
    config: LoopConfig,
  ): LoopResult {
    const finalValidation = this.validationAggregator.aggregate(
      this.iterations[this.iterations.length - 1]?.validationResults || [],
    );

    return {
      success,
      output,
      iterations: [...this.iterations],
      totalDurationMs: Date.now() - this.startTime,
      totalTokensUsed: this.totalTokensUsed,
      escalationActions: this.escalationManager.getHistory().map(h => h.action),
      finalValidation,
      strategyHistory: [...this.strategyHistory],
    };
  }

  private emitProgress(config: LoopConfig, phase: LoopProgress['phase'], strategy?: StrategyAnalysis): void {
    this.currentPhase = phase;
    const progress: LoopProgress = {
      currentIteration: this.iterations.length,
      maxIterations: config.maxIterations,
      totalTokensUsed: this.totalTokensUsed,
      estimatedCostMs: Date.now() - this.startTime,
      currentStrategy: strategy?.strategy.name || '',
      phase,
    };
    config.onProgress?.(progress);
    this.emit('progress', progress);
  }

  private emitIteration(config: LoopConfig, iteration: FixLoopIteration): void {
    config.onIteration?.(iteration);
    this.emit('iteration', iteration);
  }

  private emitEscalation(config: LoopConfig, action: EscalationAction): void {
    config.onEscalation?.(action);
    this.emit('escalation', action);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}

export function createErrorFixLoop(): ErrorFixLoop {
  return new ErrorFixLoop();
}

export function buildDefaultLoopConfig(agentId: string, agentType: string): LoopConfig {
  return {
    maxIterations: 5,
    backoffStrategy: 'exponential',
    baseBackoffMs: 1000,
    maxBackoffMs: 30000,
    escalationRules: buildDefaultEscalationRules(),
    fixStrategies: [],
    validationGates: [],
    agentId,
    agentType,
  };
}

export function createLoopConfigWithDefaults(
  agentId: string,
  agentType: string,
  overrides: Partial<LoopConfig>,
): LoopConfig {
  return {
    ...buildDefaultLoopConfig(agentId, agentType),
    ...overrides,
  };
}
