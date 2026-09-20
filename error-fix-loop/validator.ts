import { ChildProcess, spawn } from 'child_process';
import {
  AgentOutput, ValidationResult, ValidationRule, ValidationGate,
} from '../core/types';

export interface ValidationRunnerConfig {
  defaultTimeoutMs: number;
  maxConcurrent: number;
  retryOnTimeout: boolean;
  abortController?: AbortController;
}

export interface ValidationRunOptions {
  parallel: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  cwd?: string;
}

export interface AggregatedValidationResult {
  passed: boolean;
  blockingFailures: ValidationResult[];
  warningFailures: ValidationResult[];
  allResults: ValidationResult[];
  summary: ValidationSummary;
}

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  blocking: number;
  warnings: number;
  durationMs: number;
}

export interface ErrorPattern {
  pattern: RegExp;
  category: string;
  suggestedStrategy: string;
  confidence: number;
}

export interface PatternMatch {
  pattern: ErrorPattern;
  matches: string[];
  source: string;
}

export interface ValidationResultAnalysis {
  patterns: PatternMatch[];
  suggestedStrategies: string[];
  rootCause: string;
  fixComplexity: 'low' | 'medium' | 'high';
}

const DEFAULT_VALIDATION_TIMEOUT_MS = 60000;

const ERROR_PATTERNS: ErrorPattern[] = [
  { pattern: /TS(\d+):\s*(.+?)/g, category: 'typescript', suggestedStrategy: 'typescript-fix', confidence: 0.9 },
  { pattern: /error TS(\d+)/g, category: 'typescript', suggestedStrategy: 'typescript-fix', confidence: 0.95 },
  { pattern: /Cannot find module ['"](.+?)['"]/g, category: 'import', suggestedStrategy: 'import-fix', confidence: 0.9 },
  { pattern: /Module not found: Error: Can't resolve ['"](.+?)['"]/g, category: 'import', suggestedStrategy: 'import-fix', confidence: 0.95 },
  { pattern: /Circular dependency detected:\s*(.+)/g, category: 'import', suggestedStrategy: 'import-fix', confidence: 0.85 },
  { pattern: /\s(\w[\w-/]+)\s\s\s\d+\s\d+\s(?:error|warning)/g, category: 'eslint', suggestedStrategy: 'eslint-fix', confidence: 0.8 },
  { pattern: /(?:FAIL|✗|×)\s+(.+)/g, category: 'test', suggestedStrategy: 'test-fix', confidence: 0.85 },
  { pattern: /expect\(received?\)\.\w+\(expected\)/g, category: 'test', suggestedStrategy: 'test-fix', confidence: 0.9 },
  { pattern: /TypeError: Cannot read propert/g, category: 'runtime', suggestedStrategy: 'runtime-fix', confidence: 0.9 },
  { pattern: /undefined is not/g, category: 'runtime', suggestedStrategy: 'runtime-fix', confidence: 0.9 },
  { pattern: /null pointer|NullPointer/g, category: 'runtime', suggestedStrategy: 'runtime-fix', confidence: 0.85 },
  { pattern: /CVE-\d{4}-\d+/g, category: 'security', suggestedStrategy: 'security-fix', confidence: 0.95 },
  { pattern: /eval\s*\(/g, category: 'security', suggestedStrategy: 'security-fix', confidence: 0.8 },
  { pattern: /hardcoded|hard-coded/gi, category: 'security', suggestedStrategy: 'security-fix', confidence: 0.75 },
  { pattern: /N\+1|n\+1/g, category: 'performance', suggestedStrategy: 'performance-fix', confidence: 0.85 },
  { pattern: /memory leak|heap limit/gi, category: 'performance', suggestedStrategy: 'performance-fix', confidence: 0.8 },
  { pattern: /out of memory/gi, category: 'performance', suggestedStrategy: 'performance-fix', confidence: 0.9 },
  { pattern: /ENOENT|EACCES|ECONNREFUSED/g, category: 'config', suggestedStrategy: 'config-fix', confidence: 0.7 },
];

export class ValidationRunner {
  private config: ValidationRunnerConfig;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(config: Partial<ValidationRunnerConfig> = {}) {
    this.config = {
      defaultTimeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
      maxConcurrent: 5,
      retryOnTimeout: true,
      ...config,
    };
  }

  async runValidation(
    rule: ValidationRule,
    options: ValidationRunOptions = { parallel: false },
  ): Promise<ValidationResult> {
    const timeoutMs = options.timeoutMs || rule.timeoutMs || this.config.defaultTimeoutMs;
    const signal = options.signal || this.config.abortController?.signal;

    if (signal?.aborted) {
      return {
        rule,
        passed: false,
        output: '',
        error: 'Validation aborted',
        durationMs: 0,
      };
    }

    const start = Date.now();
    const processId = `${rule.type}-${Date.now()}`;

    try {
      const result = await this.executeCommand(rule.command, rule.args, timeoutMs, signal, options);
      const durationMs = Date.now() - start;

      return {
        rule,
        passed: result.exitCode === 0 && !this.hasBlockingErrors(result.stderr, result.stdout),
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const isTimeout = error instanceof Error && error.message.includes('timeout');

      if (isTimeout && this.config.retryOnTimeout) {
        return this.runValidation(rule, { ...options, timeoutMs: timeoutMs * 1.5 });
      }

      return {
        rule,
        passed: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    } finally {
      this.runningProcesses.delete(processId);
    }
  }

  async runValidations(
    rules: ValidationRule[],
    options: ValidationRunOptions = { parallel: true },
  ): Promise<ValidationResult[]> {
    if (options.parallel) {
      return this.runValidationsParallel(rules, options);
    }
    return this.runValidationsSequential(rules, options);
  }

  private async runValidationsParallel(
    rules: ValidationRule[],
    options: ValidationRunOptions,
  ): Promise<ValidationResult[]> {
    const semaphore = new Semaphore(this.config.maxConcurrent);
    const results: ValidationResult[] = [];

    const promises = rules.map(async (rule) => {
      await semaphore.acquire();
      try {
        const result = await this.runValidation(rule, options);
        results.push(result);
      } finally {
        semaphore.release();
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  private async runValidationsSequential(
    rules: ValidationRule[],
    options: ValidationRunOptions,
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    for (const rule of rules) {
      if (options.signal?.aborted) break;
      const result = await this.runValidation(rule, options);
      results.push(result);
    }
    return results;
  }

  private async executeCommand(
    command: string,
    args: string[] = [],
    timeoutMs: number,
    signal?: AbortSignal,
    options?: ValidationRunOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd || process.cwd(),
        env: { ...process.env, ...options?.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const processId = `${command}-${Date.now()}`;
      this.runningProcesses.set(processId, child);

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timeout = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
      }, timeoutMs);

      const abortHandler = () => {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error('Validation aborted'));
      };

      signal?.addEventListener('abort', abortHandler);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortHandler);
        this.runningProcesses.delete(processId);
        if (!killed) {
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortHandler);
        this.runningProcesses.delete(processId);
        if (!killed) {
          reject(error);
        }
      });
    });
  }

  private hasBlockingErrors(stderr: string, stdout: string): boolean {
    const combined = `${stderr}\n${stdout}`;
    const blockingPatterns = [
      /error\b/i,
      /fatal/i,
      /FAIL/i,
      /TS\d+:\s/,
      /TypeError/,
      /ReferenceError/,
      /SyntaxError/,
    ];
    return blockingPatterns.some(p => p.test(combined));
  }

  abort(): void {
    for (const [id, child] of this.runningProcesses) {
      child.kill('SIGTERM');
      this.runningProcesses.delete(id);
    }
  }
}

class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this.waitQueue.push(resolve));
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

export class ValidationAggregator {
  aggregate(results: ValidationResult[]): AggregatedValidationResult {
    const blockingFailures = results.filter(r => !r.passed && r.rule.required);
    const warningFailures = results.filter(r => !r.passed && !r.rule.required);
    const passed = results.filter(r => r.passed);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    return {
      passed: blockingFailures.length === 0,
      blockingFailures,
      warningFailures,
      allResults: results,
      summary: {
        total: results.length,
        passed: passed.length,
        failed: blockingFailures.length + warningFailures.length,
        blocking: blockingFailures.length,
        warnings: warningFailures.length,
        durationMs: totalDuration,
      },
    };
  }

  combine(aggregatedResults: AggregatedValidationResult[]): AggregatedValidationResult {
    const allResults = aggregatedResults.flatMap(r => r.allResults);
    return this.aggregate(allResults);
  }

  getBlockingErrors(results: AggregatedValidationResult): string[] {
    return results.blockingFailures.map(f => {
      const errorOutput = f.error || f.output;
      const lines = errorOutput.split('\n').filter(l => l.trim());
      return `[${f.rule.type}] ${lines[0] || 'Validation failed'}`;
    });
  }

  getWarnings(results: AggregatedValidationResult): string[] {
    return results.warningFailures.map(f => {
      const errorOutput = f.error || f.output;
      const lines = errorOutput.split('\n').filter(l => l.trim());
      return `[${f.rule.type}] ${lines[0] || 'Warning'}`;
    });
  }
}

export class ValidationResultAnalyzer {
  private patterns: ErrorPattern[];

  constructor(patterns: ErrorPattern[] = ERROR_PATTERNS) {
    this.patterns = patterns;
  }

  analyze(results: ValidationResult[]): ValidationResultAnalysis {
    const allOutput = results
      .filter(r => !r.passed)
      .map(r => `${r.error || ''}\n${r.output}`)
      .join('\n');

    const matchedPatterns = this.extractPatterns(allOutput);
    const suggestedStrategies = this.deduplicateStrategies(matchedPatterns);
    const rootCause = this.inferRootCause(matchedPatterns, results);
    const fixComplexity = this.assessComplexity(matchedPatterns, results);

    return {
      patterns: matchedPatterns,
      suggestedStrategies,
      rootCause,
      fixComplexity,
    };
  }

  private extractPatterns(output: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      const found: string[] = [];
      let match;
      while ((match = regex.exec(output)) !== null) {
        found.push(match[0]);
      }
      if (found.length > 0) {
        matches.push({ pattern, matches: found, source: output });
      }
    }
    return matches;
  }

  private deduplicateStrategies(patternMatches: PatternMatch[]): string[] {
    const strategyScores = new Map<string, number>();
    for (const pm of patternMatches) {
      const current = strategyScores.get(pm.pattern.suggestedStrategy) || 0;
      strategyScores.set(pm.pattern.suggestedStrategy, current + pm.pattern.confidence * pm.matches.length);
    }
    return Array.from(strategyScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([strategy]) => strategy);
  }

  private inferRootCause(patternMatches: PatternMatch[], results: ValidationResult[]): string {
    if (patternMatches.length === 0) {
      return 'Unknown error pattern. Manual investigation required.';
    }
    const topPattern = patternMatches.sort((a, b) =>
      (b.pattern.confidence * b.matches.length) - (a.pattern.confidence * a.matches.length),
    )[0];
    const category = topPattern.pattern.category;
    const count = topPattern.matches.length;

    switch (category) {
      case 'typescript':
        return `TypeScript compilation errors detected (${count} occurrences). Likely cause: type mismatches or missing type definitions.`;
      case 'eslint':
        return `ESLint violations detected (${count} occurrences). Likely cause: code style or quality rule violations.`;
      case 'test':
        return `Test failures detected (${count} occurrences). Likely cause: assertion mismatches or broken test setup.`;
      case 'runtime':
        return `Runtime errors detected (${count} occurrences). Likely cause: null references or undefined access.`;
      case 'security':
        return `Security issues detected (${count} occurrences). Likely cause: unsafe code patterns or vulnerable dependencies.`;
      case 'performance':
        return `Performance issues detected (${count} occurrences). Likely cause: inefficient algorithms or resource leaks.`;
      case 'import':
        return `Import errors detected (${count} occurrences). Likely cause: missing modules or circular dependencies.`;
      case 'config':
        return `Configuration errors detected (${count} occurrences). Likely cause: invalid config file contents.`;
      default:
        return `Errors detected in category '${category}' (${count} occurrences).`;
    }
  }

  private assessComplexity(patternMatches: PatternMatch[], results: ValidationResult[]): 'low' | 'medium' | 'high' {
    if (patternMatches.length === 0) return 'high';
    const totalMatches = patternMatches.reduce((sum, pm) => sum + pm.matches.length, 0);
    const avgConfidence = patternMatches.reduce((sum, pm) => sum + pm.pattern.confidence, 0) / patternMatches.length;

    if (totalMatches <= 3 && avgConfidence > 0.85) return 'low';
    if (totalMatches <= 10 && avgConfidence > 0.7) return 'medium';
    return 'high';
  }

  formatAnalysis(analysis: ValidationResultAnalysis): string {
    const lines: string[] = ['Validation Analysis:'];
    lines.push(`  Root Cause: ${analysis.rootCause}`);
    lines.push(`  Fix Complexity: ${analysis.fixComplexity}`);
    lines.push(`  Suggested Strategies: ${analysis.suggestedStrategies.join(', ')}`);
    if (analysis.patterns.length > 0) {
      lines.push('  Detected Patterns:');
      for (const pm of analysis.patterns) {
        lines.push(`    - ${pm.pattern.category} (${pm.matches.length} matches, confidence: ${pm.pattern.confidence})`);
      }
    }
    return lines.join('\n');
  }
}

export function createValidationRunner(config?: Partial<ValidationRunnerConfig>): ValidationRunner {
  return new ValidationRunner(config);
}

export function createValidationAggregator(): ValidationAggregator {
  return new ValidationAggregator();
}

export function createValidationResultAnalyzer(patterns?: ErrorPattern[]): ValidationResultAnalyzer {
  return new ValidationResultAnalyzer(patterns);
}

export function buildTypeScriptValidationRule(): ValidationRule {
  return {
    type: 'typecheck',
    command: 'npx',
    args: ['tsc', '--noEmit'],
    timeoutMs: 120000,
    required: true,
  };
}

export function buildESLintValidationRule(patterns?: string[]): ValidationRule {
  const args = ['eslint', '--format', 'json'];
  if (patterns && patterns.length > 0) {
    args.push(...patterns);
  } else {
    args.push('src/**/*.{ts,tsx,js,jsx}');
  }
  return {
    type: 'lint',
    command: 'npx',
    args,
    timeoutMs: 60000,
    required: true,
  };
}

export function buildTestValidationRule(testPattern?: string): ValidationRule {
  const args = ['vitest', 'run', '--reporter=json'];
  if (testPattern) {
    args.push(testPattern);
  }
  return {
    type: 'test',
    command: 'npx',
    args,
    timeoutMs: 180000,
    required: true,
  };
}

export function buildSecurityValidationRule(): ValidationRule {
  return {
    type: 'custom',
    command: 'npm',
    args: ['audit', '--json'],
    timeoutMs: 60000,
    required: false,
  };
}

export function buildValidationGateFromRule(rule: ValidationRule): ValidationGate {
  return {
    name: `${rule.type}-gate`,
    type: rule.type === 'typecheck' ? 'typecheck' : rule.type === 'lint' ? 'lint' : rule.type === 'test' ? 'test' : 'custom',
    command: rule.command,
    args: rule.args || [],
    threshold: 0,
    blocking: rule.required,
    timeoutMs: rule.timeoutMs,
  };
}
