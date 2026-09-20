import {
  AgentError, AgentOutput, AgentType, ErrorContext, EscalationRule,
  ValidationResult,
} from '../core/types';

export interface EscalationAction {
  type: 'spawn-specialist' | 'split-task' | 'reduce-scope' | 'human-intervention' | 'abort';
  reason: string;
  details: EscalationDetails;
  timestamp: Date;
}

export interface EscalationDetails {
  specialistType?: AgentType;
  subtasks?: SubtaskSpec[];
  reducedScope?: ReducedScope;
  message?: string;
  abortReason?: string;
}

export interface SubtaskSpec {
  id: string;
  description: string;
  files: string[];
  priority: number;
  estimatedTokens: number;
}

export interface ReducedScope {
  maxFiles: number;
  excludedPatterns: string[];
  focusPaths: string[];
  simplifiedValidation: boolean;
}

export interface EscalationHistoryEntry {
  iteration: number;
  rule: EscalationRule;
  action: EscalationAction;
  context: ErrorContext;
  outcome?: 'resolved' | 'unresolved' | 'pending';
}

export interface EscalationContext {
  currentIteration: number;
  maxIterations: number;
  errorHistory: AgentError[];
  strategyHistory: string[];
  totalTokensUsed: number;
  filesModified: string[];
  validationResults: ValidationResult[];
}

export interface RuleEvaluationResult {
  rule: EscalationRule;
  matched: boolean;
  reason: string;
  priority: number;
}

export interface SpecialistSpawnRequest {
  agentType: AgentType;
  reason: string;
  context: ErrorContext;
  overridePrompt?: string;
}

export interface TaskSplitRequest {
  subtasks: SubtaskSpec[];
  reason: string;
  context: ErrorContext;
}

export interface ScopeReductionRequest {
  scope: ReducedScope;
  reason: string;
  context: ErrorContext;
}

export class EscalationManager {
  private history: EscalationHistoryEntry[] = [];
  private rules: EscalationRule[];
  private consecutiveSameErrorCount: number = 0;
  private lastErrorHash: string = '';

  constructor(rules: EscalationRule[] = []) {
    this.rules = rules;
  }

  evaluateRules(context: EscalationContext, error: AgentError): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    for (const rule of this.rules) {
      const evaluation = this.evaluateRule(rule, context, error);
      results.push(evaluation);
    }

    return results.sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1;
      return b.priority - a.priority;
    });
  }

  selectEscalation(
    evaluations: RuleEvaluationResult[],
    context: EscalationContext,
  ): EscalationAction | null {
    const matched = evaluations.filter(e => e.matched);
    if (matched.length === 0) return null;

    const bestRule = matched[0];
    return this.buildAction(bestRule.rule, context);
  }

  recordEscalation(
    iteration: number,
    rule: EscalationRule,
    action: EscalationAction,
    context: ErrorContext,
  ): void {
    this.history.push({
      iteration,
      rule,
      action,
      context,
      outcome: 'pending',
    });
  }

  updateEscalationOutcome(iteration: number, outcome: 'resolved' | 'unresolved'): void {
    const entry = this.history.find(h => h.iteration === iteration && h.outcome === 'pending');
    if (entry) {
      entry.outcome = outcome;
    }
  }

  getHistory(): EscalationHistoryEntry[] {
    return [...this.history];
  }

  getSpecialistRequests(): SpecialistSpawnRequest[] {
    return this.history
      .filter(h => h.action.type === 'spawn-specialist')
      .map(h => ({
        agentType: h.action.details.specialistType!,
        reason: h.action.reason,
        context: h.context,
      }));
  }

  getTaskSplitRequests(): TaskSplitRequest[] {
    return this.history
      .filter(h => h.action.type === 'split-task')
      .map(h => ({
        subtasks: h.action.details.subtasks || [],
        reason: h.action.reason,
        context: h.context,
      }));
  }

  getScopeReductions(): ScopeReductionRequest[] {
    return this.history
      .filter(h => h.action.type === 'reduce-scope')
      .map(h => ({
        scope: h.action.details.reducedScope!,
        reason: h.action.reason,
        context: h.context,
      }));
  }

  shouldAbort(context: EscalationContext): boolean {
    const recentAborts = this.history
      .filter(h => h.action.type === 'abort')
      .slice(-3);
    if (recentAborts.length >= 2) return true;
    if (context.currentIteration >= context.maxIterations) return true;
    const humanInterventions = this.history.filter(h => h.action.type === 'human-intervention');
    if (humanInterventions.length >= 3) return true;
    return false;
  }

  reset(): void {
    this.history = [];
    this.consecutiveSameErrorCount = 0;
    this.lastErrorHash = '';
  }

  private evaluateRule(
    rule: EscalationRule,
    context: EscalationContext,
    error: AgentError,
  ): RuleEvaluationResult {
    switch (rule.condition) {
      case 'retry-exhausted':
        return this.evaluateRetryExhausted(rule, context);
      case 'critical-failure':
        return this.evaluateCriticalFailure(rule, context, error);
      case 'timeout':
        return this.evaluateTimeout(rule, context, error);
      case 'resource-exhausted':
        return this.evaluateResourceExhausted(rule, context);
      case 'custom':
        return this.evaluateCustom(rule, context, error);
      default:
        return { rule, matched: false, reason: 'Unknown condition', priority: 0 };
    }
  }

  private evaluateRetryExhausted(
    rule: EscalationRule,
    context: EscalationContext,
  ): RuleEvaluationResult {
    const matched = context.currentIteration >= context.maxIterations * 0.75;
    return {
      rule,
      matched,
      reason: matched
        ? `Retry exhausted: ${context.currentIteration}/${context.maxIterations} iterations`
        : `Retry not yet exhausted: ${context.currentIteration}/${context.maxIterations}`,
      priority: matched ? 90 : 0,
    };
  }

  private evaluateCriticalFailure(
    rule: EscalationRule,
    context: EscalationContext,
    error: AgentError,
  ): RuleEvaluationResult {
    const isCritical = error.category === 'execution' && !error.recoverable;
    const repeatedCritical = this.detectSameError(error) && this.consecutiveSameErrorCount >= 3;
    const matched = isCritical || repeatedCritical;

    return {
      rule,
      matched,
      reason: matched
        ? `Critical failure: ${error.code} - ${error.message.slice(0, 100)}`
        : 'No critical failure detected',
      priority: matched ? 95 : 0,
    };
  }

  private evaluateTimeout(
    rule: EscalationRule,
    context: EscalationContext,
    error: AgentError,
  ): RuleEvaluationResult {
    const isTimeout = error.category === 'timeout' || error.code === 'TIMEOUT';
    const matched = isTimeout;

    return {
      rule,
      matched,
      reason: matched ? 'Timeout error detected' : 'No timeout detected',
      priority: matched ? 80 : 0,
    };
  }

  private evaluateResourceExhausted(
    rule: EscalationRule,
    context: EscalationContext,
  ): RuleEvaluationResult {
    const highTokenUsage = context.totalTokensUsed > 100000;
    const manyFilesModified = context.filesModified.length > 20;
    const matched = highTokenUsage || manyFilesModified;

    return {
      rule,
      matched,
      reason: matched
        ? `Resource exhausted: ${context.totalTokensUsed} tokens, ${context.filesModified.length} files`
        : 'Resources within limits',
      priority: matched ? 70 : 0,
    };
  }

  private evaluateCustom(
    rule: EscalationRule,
    context: EscalationContext,
    error: AgentError,
  ): RuleEvaluationResult {
    if (!rule.customCondition) {
      return { rule, matched: false, reason: 'No custom condition defined', priority: 0 };
    }

    const errorContext: ErrorContext = {
      agentId: '',
      agentType: 'feature-coder',
      attempt: context.currentIteration,
      error,
      previousOutput: { files: [], artifacts: [], changes: [] },
      validationResults: context.validationResults,
      projectProfile: undefined as any,
      taskSpec: undefined as any,
    };

    const matched = rule.customCondition(errorContext);
    return {
      rule,
      matched,
      reason: matched ? 'Custom condition met' : 'Custom condition not met',
      priority: matched ? 60 : 0,
    };
  }

  private buildAction(rule: EscalationRule, context: EscalationContext): EscalationAction {
    switch (rule.action) {
      case 'spawn-specialist':
        return this.buildSpawnSpecialistAction(rule, context);
      case 'split-task':
        return this.buildSplitTaskAction(rule, context);
      case 'reduce-scope':
        return this.buildReduceScopeAction(rule, context);
      case 'human-intervention':
        return this.buildHumanInterventionAction(rule, context);
      case 'abort':
        return this.buildAbortAction(rule, context);
      default:
        return this.buildAbortAction(rule, context);
    }
  }

  private buildSpawnSpecialistAction(
    rule: EscalationRule,
    context: EscalationContext,
  ): EscalationAction {
    const specialistType = this.determineSpecialistType(context);
    return {
      type: 'spawn-specialist',
      reason: `Spawning specialist agent for persistent ${context.errorHistory[context.errorHistory.length - 1]?.category || 'unknown'} errors`,
      details: {
        specialistType,
        message: `Specialist agent needed after ${context.currentIteration} failed attempts`,
      },
      timestamp: new Date(),
    };
  }

  private buildSplitTaskAction(
    rule: EscalationRule,
    context: EscalationContext,
  ): EscalationAction {
    const subtasks = this.generateSubtasks(context);
    return {
      type: 'split-task',
      reason: `Splitting task into ${subtasks.length} subtasks after ${context.currentIteration} failed attempts`,
      details: {
        subtasks,
        message: 'Task is too complex. Breaking into smaller, focused subtasks.',
      },
      timestamp: new Date(),
    };
  }

  private buildReduceScopeAction(
    rule: EscalationRule,
    context: EscalationContext,
  ): EscalationAction {
    const reducedScope = this.calculateReducedScope(context);
    return {
      type: 'reduce-scope',
      reason: `Reducing scope from ${context.filesModified.length} files to ${reducedScope.maxFiles} files`,
      details: {
        reducedScope,
        message: 'Scope too broad. Focusing on most critical files.',
      },
      timestamp: new Date(),
    };
  }

  private buildHumanInterventionAction(
    rule: EscalationRule,
    context: EscalationContext,
  ): EscalationAction {
    const lastError = context.errorHistory[context.errorHistory.length - 1];
    return {
      type: 'human-intervention',
      reason: `Human intervention needed after ${context.currentIteration} failed attempts`,
      details: {
        message: `Unable to resolve error automatically. Error: ${lastError?.code} - ${lastError?.message.slice(0, 200)}`,
      },
      timestamp: new Date(),
    };
  }

  private buildAbortAction(
    rule: EscalationRule,
    context: EscalationContext,
  ): EscalationAction {
    const lastError = context.errorHistory[context.errorHistory.length - 1];
    return {
      type: 'abort',
      reason: `Aborting after ${context.currentIteration} failed attempts. Last error: ${lastError?.code}`,
      details: {
        abortReason: `Max iterations reached or unrecoverable error: ${lastError?.message.slice(0, 200)}`,
      },
      timestamp: new Date(),
    };
  }

  private determineSpecialistType(context: EscalationContext): AgentType {
    const lastError = context.errorHistory[context.errorHistory.length - 1];
    if (!lastError) return 'bug-fixer';

    const categoryMap: Record<string, AgentType> = {
      'validation': 'type-fixer',
      'execution': 'bug-fixer',
      'timeout': 'performance-profiler',
      'context': 'architect',
      'tool': 'bug-fixer',
    };

    const errorCategoryMap: Record<string, AgentType> = {
      'typescript': 'type-fixer',
      'eslint': 'code-reviewer',
      'test': 'test-writer',
      'runtime': 'bug-fixer',
      'security': 'security-scanner',
      'performance': 'performance-profiler',
      'import': 'architect',
      'config': 'config-manager',
    };

    for (const [keyword, agentType] of Object.entries(errorCategoryMap)) {
      if (lastError.message.toLowerCase().includes(keyword) || lastError.code.toLowerCase().includes(keyword)) {
        return agentType;
      }
    }

    return categoryMap[lastError.category] || 'bug-fixer';
  }

  private generateSubtasks(context: EscalationContext): SubtaskSpec[] {
    const subtasks: SubtaskSpec[] = [];
    const filesPerTask = Math.max(1, Math.ceil(context.filesModified.length / 3));
    const files = [...context.filesModified];

    for (let i = 0; i < files.length && subtasks.length < 3; i += filesPerTask) {
      const chunk = files.slice(i, i + filesPerTask);
      subtasks.push({
        id: `subtask-${subtasks.length + 1}`,
        description: `Fix errors in: ${chunk.join(', ')}`,
        files: chunk,
        priority: subtasks.length + 1,
        estimatedTokens: chunk.length * 2000,
      });
    }

    if (subtasks.length === 0) {
      subtasks.push({
        id: 'subtask-1',
        description: 'Fix all errors in current scope',
        files: context.filesModified.slice(0, 5),
        priority: 1,
        estimatedTokens: 5000,
      });
    }

    return subtasks;
  }

  private calculateReducedScope(context: EscalationContext): ReducedScope {
    const currentFiles = context.filesModified.length;
    const maxFiles = Math.max(3, Math.floor(currentFiles * 0.5));
    const errorFiles = this.extractErrorFiles(context);

    return {
      maxFiles,
      excludedPatterns: ['node_modules', '*.test.*', '*.spec.*', '*.config.*'],
      focusPaths: errorFiles.length > 0 ? errorFiles : context.filesModified.slice(0, maxFiles),
      simplifiedValidation: true,
    };
  }

  private extractErrorFiles(context: EscalationContext): string[] {
    const files: string[] = [];
    for (const result of context.validationResults) {
      if (!result.passed && result.error) {
        const fileMatch = result.error.match(/(?:at|in|file)\s+([^\s:]+\.(?:ts|tsx|js|jsx))/i);
        if (fileMatch) {
          files.push(fileMatch[1]);
        }
      }
    }
    return [...new Set(files)];
  }

  private detectSameError(error: AgentError): boolean {
    const errorHash = `${error.code}:${error.category}`;
    if (errorHash === this.lastErrorHash) {
      this.consecutiveSameErrorCount++;
      return true;
    }
    this.lastErrorHash = errorHash;
    this.consecutiveSameErrorCount = 1;
    return false;
  }
}

export function createEscalationManager(rules?: EscalationRule[]): EscalationManager {
  return new EscalationManager(rules);
}

export function buildDefaultEscalationRules(): EscalationRule[] {
  return [
    {
      condition: 'retry-exhausted',
      action: 'spawn-specialist',
    },
    {
      condition: 'critical-failure',
      action: 'reduce-scope',
    },
    {
      condition: 'timeout',
      action: 'split-task',
    },
    {
      condition: 'resource-exhausted',
      action: 'human-intervention',
    },
    {
      condition: 'custom',
      action: 'abort',
      customCondition: (ctx) => ctx.attempt >= 10,
    },
  ];
}

export function formatEscalationAction(action: EscalationAction): string {
  const details = Object.entries(action.details)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ');
  return `[${action.type}] ${action.reason} | Details: {${details}}`;
}

export function getEscalationSummary(history: EscalationHistoryEntry[]): string {
  if (history.length === 0) return 'No escalations occurred.';
  const counts = new Map<string, number>();
  for (const entry of history) {
    counts.set(entry.action.type, (counts.get(entry.action.type) || 0) + 1);
  }
  const lines = [`Escalation Summary (${history.length} total):`];
  for (const [type, count] of counts) {
    lines.push(`  ${type}: ${count}`);
  }
  return lines.join('\n');
}
