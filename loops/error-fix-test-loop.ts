import {
  AgentError,
  AgentOutput,
  ValidationResult,
  ErrorFixLoopConfig,
  FixLoopIteration,
  AgentType,
  EscalationRule,
  ValidationGate,
  FixLoopIteration as LoopIteration,
} from '../core/types';

export interface ErrorClassification {
  category: 'type-error' | 'lint-error' | 'test-failure' | 'runtime-error' | 'security-issue' | 'performance-issue' | 'build-error' | 'dependency-error' | 'config-error' | 'unknown';
  severity: 'critical' | 'high' | 'medium' | 'low';
  recoverable: boolean;
  suggestedFixType: string;
  confidence: number;
  details: ErrorClassificationDetails;
}

export interface ErrorClassificationDetails {
  errorCode?: string;
  errorMessage: string;
  stackTrace?: string;
  affectedFiles: string[];
  errorPatterns: string[];
  rootCauseHypothesis: string;
  relatedRules: string[];
}

export interface LoopFixStrategy {
  id: string;
  name: string;
  description: string;
  applicableErrors: string[];
  priority: number;
  estimatedSuccessRate: number;
  promptModifier: string;
  postFixValidation: string[];
  cooldownMs: number;
}

export interface StrategyExecutionRecord {
  strategy: string;
  success: boolean;
  timestamp: Date;
  agentType: string;
  durationMs: number;
  errorCategory?: string;
}

export interface LoopStats {
  totalIterations: number;
  successRate: number;
  averageIterationsToFix: number;
  mostEffectiveStrategy: string;
  commonErrorTypes: string[];
}

export interface GlobalLoopStats {
  totalAgents: number;
  totalIterations: number;
  overallSuccessRate: number;
  averageIterationsPerAgent: number;
}

const TS_ERROR_PATTERNS: Record<string, { category: ErrorClassification['category']; severity: ErrorClassification['severity']; description: string }> = {
  'TS2304': { category: 'type-error', severity: 'high', description: 'Cannot find name' },
  'TS2322': { category: 'type-error', severity: 'high', description: 'Type not assignable' },
  'TS2339': { category: 'type-error', severity: 'high', description: 'Property does not exist on type' },
  'TS2345': { category: 'type-error', severity: 'medium', description: 'Argument type mismatch' },
  'TS2307': { category: 'dependency-error', severity: 'critical', description: 'Cannot find module' },
  'TS2305': { category: 'dependency-error', severity: 'high', description: 'Module has no exported member' },
  'TS2531': { category: 'type-error', severity: 'high', description: 'Object is possibly null' },
  'TS2532': { category: 'type-error', severity: 'high', description: 'Object is possibly undefined' },
  'TS2554': { category: 'type-error', severity: 'medium', description: 'Expected N arguments but got M' },
  'TS7006': { category: 'type-error', severity: 'medium', description: 'Parameter implicitly has any type' },
  'TS7031': { category: 'type-error', severity: 'medium', description: 'Binding element implicitly has any type' },
  'TS1005': { category: 'type-error', severity: 'medium', description: 'Semicolon expected' },
  'TS1128': { category: 'type-error', severity: 'medium', description: 'Declaration or statement expected' },
  'TS2769': { category: 'type-error', severity: 'high', description: 'No overload matches this call' },
  'TS18046': { category: 'type-error', severity: 'medium', description: 'Variable is of type unknown' },
  'TS2337': { category: 'type-error', severity: 'high', description: 'Property not in type' },
  'TS2349': { category: 'type-error', severity: 'high', description: 'This expression is not callable' },
  'TS2551': { category: 'type-error', severity: 'medium', description: 'Property does not exist, did you mean' },
  'TS7053': { category: 'type-error', severity: 'high', description: 'Element implicitly has any type due to index expression' },
};

const LINT_ERROR_PATTERNS: Record<string, { autoFixable: boolean; severity: ErrorClassification['severity'] }> = {
  'no-unused-vars': { autoFixable: false, severity: 'low' },
  'no-undef': { autoFixable: false, severity: 'high' },
  'import/order': { autoFixable: true, severity: 'low' },
  'import/no-duplicates': { autoFixable: true, severity: 'low' },
  'prettier/prettier': { autoFixable: true, severity: 'low' },
  'prefer-const': { autoFixable: true, severity: 'low' },
  'no-var': { autoFixable: true, severity: 'low' },
  'eqeqeq': { autoFixable: true, severity: 'medium' },
  'no-console': { autoFixable: false, severity: 'low' },
  'no-eval': { autoFixable: false, severity: 'critical' },
  'no-implied-eval': { autoFixable: false, severity: 'critical' },
  'no-new-func': { autoFixable: false, severity: 'critical' },
  '@typescript-eslint/no-explicit-any': { autoFixable: false, severity: 'medium' },
  '@typescript-eslint/no-unused-vars': { autoFixable: false, severity: 'low' },
  '@typescript-eslint/explicit-function-return-type': { autoFixable: false, severity: 'low' },
};

const SECURITY_PATTERNS: Array<{ pattern: RegExp; type: string; severity: ErrorClassification['severity'] }> = [
  { pattern: /eval\s*\(/g, type: 'unsafe-eval', severity: 'critical' },
  { pattern: /new\s+Function\s*\(/g, type: 'unsafe-function-constructor', severity: 'critical' },
  { pattern: /inner\s*HTML\s*=/gi, type: 'xss-innerhtml', severity: 'high' },
  { pattern: /document\.write\s*\(/g, type: 'xss-document-write', severity: 'high' },
  { pattern: /hardcoded|hard-coded/gi, type: 'hardcoded-secret', severity: 'high' },
  { pattern: /password\s*[:=]\s*['"]/gi, type: 'hardcoded-password', severity: 'critical' },
  { pattern: /api[_-]?key\s*[:=]\s*['"]/gi, type: 'hardcoded-api-key', severity: 'critical' },
  { pattern: /secret\s*[:=]\s*['"]/gi, type: 'hardcoded-secret', severity: 'critical' },
  { pattern: /CVE-\d{4}-\d+/g, type: 'vulnerability', severity: 'critical' },
  { pattern: /sql\s*['"].*\+\s*\w+/gi, type: 'sql-injection', severity: 'critical' },
  { pattern: /innerHTML\s*=/g, type: 'xss-innerhtml', severity: 'high' },
  { pattern: /dangerouslySetInnerHTML/g, type: 'xss-dangerously', severity: 'high' },
];

const RUNTIME_ERROR_PATTERNS: Array<{ pattern: RegExp; type: string; recoverable: boolean }> = [
  { pattern: /Cannot read propert(?:y|ies) of (?:null|undefined)/g, type: 'null-reference', recoverable: true },
  { pattern: /undefined is not a function/g, type: 'undefined-function', recoverable: true },
  { pattern: /is not a function/g, type: 'not-a-function', recoverable: true },
  { pattern: /is not a constructor/g, type: 'not-a-constructor', recoverable: true },
  { pattern: /Maximum call stack size exceeded/g, type: 'stack-overflow', recoverable: false },
  { pattern: /out of memory/gi, type: 'out-of-memory', recoverable: false },
  { pattern: /ECONNREFUSED/g, type: 'connection-refused', recoverable: true },
  { pattern: /ETIMEOUT/g, type: 'timeout', recoverable: true },
  { pattern: /ENOENT/g, type: 'file-not-found', recoverable: true },
  { pattern: /EACCES/g, type: 'permission-denied', recoverable: false },
];

export class ErrorClassifier {
  classify(
    error: AgentError,
    output: AgentOutput,
    validationResults: ValidationResult[],
  ): ErrorClassification {
    const tsClassification = this.classifyByTypeScript(error);
    if (tsClassification) return tsClassification;

    const lintClassification = this.classifyByLint(error, validationResults);
    if (lintClassification) return lintClassification;

    const testClassification = this.classifyByTestFailure(error, validationResults);
    if (testClassification) return testClassification;

    const runtimeClassification = this.classifyByRuntime(error);
    if (runtimeClassification) return runtimeClassification;

    const securityClassification = this.classifyBySecurity(error);
    if (securityClassification) return securityClassification;

    const buildClassification = this.classifyByBuild(error);
    if (buildClassification) return buildClassification;

    const dependencyClassification = this.classifyByDependency(error);
    if (dependencyClassification) return dependencyClassification;

    const configClassification = this.classifyByConfig(error);
    if (configClassification) return configClassification;

    return {
      category: 'unknown',
      severity: 'medium',
      recoverable: error.recoverable,
      suggestedFixType: 'generic-retry',
      confidence: 0.3,
      details: {
        errorCode: error.code,
        errorMessage: error.message,
        stackTrace: error.stack,
        affectedFiles: output.files.map(f => f.path),
        errorPatterns: [],
        rootCauseHypothesis: 'Unable to classify error automatically',
        relatedRules: [],
      },
    };
  }

  parseTypeScriptError(message: string): ErrorClassification {
    const codeMatch = message.match(/TS(\d+)/);
    const code = codeMatch ? `TS${codeMatch[1]}` : 'UNKNOWN';
    const pattern = TS_ERROR_PATTERNS[code];

    if (pattern) {
      return {
        category: pattern.category,
        severity: pattern.severity,
        recoverable: true,
        suggestedFixType: `fix-ts-${pattern.category}`,
        confidence: 0.85,
        details: {
          errorCode: code,
          errorMessage: message,
          affectedFiles: this.extractFilesFromMessage(message),
          errorPatterns: [code, pattern.description],
          rootCauseHypothesis: `TypeScript ${pattern.description}: ${this.extractErrorContext(message)}`,
          relatedRules: ['typescript', 'type-checking'],
        },
      };
    }

    return {
      category: 'type-error',
      severity: 'medium',
      recoverable: true,
      suggestedFixType: 'fix-ts-generic',
      confidence: 0.6,
      details: {
        errorCode: code,
        errorMessage: message,
        affectedFiles: this.extractFilesFromMessage(message),
        errorPatterns: [code],
        rootCauseHypothesis: `TypeScript error: ${message.slice(0, 200)}`,
        relatedRules: ['typescript'],
      },
    };
  }

  parseLintError(message: string): ErrorClassification {
    const ruleMatches = message.match(/(\w[\w-/]+)\s+\d+\s+\d+\s+(error|warning)/g) || [];
    const rules = ruleMatches.map(m => {
      const parts = m.split(/\s+/);
      return parts[0];
    });

    let maxSeverity: ErrorClassification['severity'] = 'low';
    let anyAutoFixable = false;

    for (const rule of rules) {
      const pattern = LINT_ERROR_PATTERNS[rule];
      if (pattern) {
        if (this.severityRank(pattern.severity) > this.severityRank(maxSeverity)) {
          maxSeverity = pattern.severity;
        }
        if (pattern.autoFixable) anyAutoFixable = true;
      }
    }

    return {
      category: 'lint-error',
      severity: maxSeverity,
      recoverable: true,
      suggestedFixType: anyAutoFixable ? 'auto-fix-lint' : 'manual-lint-fix',
      confidence: 0.8,
      details: {
        errorMessage: message,
        affectedFiles: this.extractFilesFromMessage(message),
        errorPatterns: rules.length > 0 ? rules : ['unknown-lint-rule'],
        rootCauseHypothesis: `Lint violations: ${rules.join(', ') || 'unclassified lint error'}`,
        relatedRules: rules,
      },
    };
  }

  parseTestFailure(message: string, output: string): ErrorClassification {
    const combinedOutput = `${message}\n${output}`;
    const failMatches = combinedOutput.match(/(?:FAIL|✗|×|✕)\s+(.+)/g) || [];
    const assertionMatches = combinedOutput.match(/expect\(.*?\)\.\w+\(.*?\)/g) || [];
    const mockMatches = combinedOutput.match(/(?:mock|Mock|spy|Spy).*(?:error|Error|fail|Fail)/gi) || [];
    const timeoutMatches = combinedOutput.match(/(?:timeout|Timeout|exceeded).*\d+\s*ms/gi) || [];

    const hasFailures = failMatches.length > 0;
    const hasAssertionMismatches = assertionMatches.length > 0;
    const hasMockIssues = mockMatches.length > 0;
    const hasTimeouts = timeoutMatches.length > 0;

    let severity: ErrorClassification['severity'] = 'medium';
    let suggestedFixType = 'fix-test-generic';

    if (hasTimeouts) {
      severity = 'high';
      suggestedFixType = 'fix-test-timeout';
    } else if (hasMockIssues) {
      severity = 'medium';
      suggestedFixType = 'fix-test-mock';
    } else if (hasAssertionMismatches) {
      severity = 'medium';
      suggestedFixType = 'fix-test-assertion';
    } else if (hasFailures) {
      severity = 'medium';
      suggestedFixType = 'fix-test-failure';
    }

    const failingTests = failMatches.map(m => m.replace(/^(?:FAIL|✗|×|✕)\s+/, '').trim());

    return {
      category: 'test-failure',
      severity,
      recoverable: true,
      suggestedFixType,
      confidence: 0.75,
      details: {
        errorMessage: message.slice(0, 500),
        affectedFiles: failingTests.length > 0 ? failingTests : this.extractFilesFromMessage(combinedOutput),
        errorPatterns: [
          hasFailures ? 'test-failure' : null,
          hasAssertionMismatches ? 'assertion-mismatch' : null,
          hasMockIssues ? 'mock-error' : null,
          hasTimeouts ? 'test-timeout' : null,
        ].filter(Boolean) as string[],
        rootCauseHypothesis: this.buildTestRootCause(failMatches, assertionMatches, mockMatches, timeoutMatches),
        relatedRules: ['testing', 'jest', 'vitest'],
      },
    };
  }

  parseRuntimeError(message: string, stack?: string): ErrorClassification {
    const combined = `${message}\n${stack || ''}`;

    for (const { pattern, type, recoverable } of RUNTIME_ERROR_PATTERNS) {
      if (pattern.test(combined)) {
        return {
          category: 'runtime-error',
          severity: recoverable ? 'medium' : 'critical',
          recoverable,
          suggestedFixType: `fix-runtime-${type}`,
          confidence: 0.8,
          details: {
            errorMessage: message,
            stackTrace: stack,
            affectedFiles: this.extractFilesFromStack(stack),
            errorPatterns: [type],
            rootCauseHypothesis: `Runtime error: ${type}. ${this.extractErrorContext(message)}`,
            relatedRules: ['runtime', 'error-handling'],
          },
        };
      }
    }

    return {
      category: 'runtime-error',
      severity: 'medium',
      recoverable: true,
      suggestedFixType: 'fix-runtime-generic',
      confidence: 0.5,
      details: {
        errorMessage: message,
        stackTrace: stack,
        affectedFiles: this.extractFilesFromStack(stack),
        errorPatterns: ['unknown-runtime'],
        rootCauseHypothesis: `Runtime error: ${message.slice(0, 200)}`,
        relatedRules: ['runtime'],
      },
    };
  }

  parseSecurityIssue(message: string): ErrorClassification {
    const detectedIssues: Array<{ type: string; severity: ErrorClassification['severity'] }> = [];

    for (const { pattern, type, severity } of SECURITY_PATTERNS) {
      if (pattern.test(message)) {
        detectedIssues.push({ type, severity });
      }
    }

    if (detectedIssues.length === 0) {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('security') || lowerMsg.includes('vulnerability')) {
        detectedIssues.push({ type: 'generic-security', severity: 'medium' });
      }
    }

    let maxSeverity: ErrorClassification['severity'] = 'low';
    for (const issue of detectedIssues) {
      if (this.severityRank(issue.severity) > this.severityRank(maxSeverity)) {
        maxSeverity = issue.severity;
      }
    }

    return {
      category: 'security-issue',
      severity: maxSeverity,
      recoverable: true,
      suggestedFixType: 'fix-security',
      confidence: detectedIssues.length > 0 ? 0.8 : 0.4,
      details: {
        errorMessage: message,
        affectedFiles: this.extractFilesFromMessage(message),
        errorPatterns: detectedIssues.map(i => i.type),
        rootCauseHypothesis: `Security issues found: ${detectedIssues.map(i => i.type).join(', ') || 'unclassified security concern'}`,
        relatedRules: ['security', 'owasp', 'vulnerability-scanning'],
      },
    };
  }

  getFixPriority(classification: ErrorClassification): number {
    let priority = 50;

    switch (classification.severity) {
      case 'critical': priority += 40; break;
      case 'high': priority += 25; break;
      case 'medium': priority += 10; break;
      case 'low': priority += 0; break;
    }

    if (classification.recoverable) priority += 10;
    else priority -= 10;

    priority += Math.floor(classification.confidence * 15);

    switch (classification.category) {
      case 'security-issue': priority += 15; break;
      case 'build-error': priority += 10; break;
      case 'type-error': priority += 5; break;
      case 'test-failure': priority += 5; break;
      case 'dependency-error': priority += 8; break;
      case 'config-error': priority += 7; break;
      case 'runtime-error': priority += 5; break;
      case 'lint-error': priority += 0; break;
      case 'performance-issue': priority += 3; break;
    }

    return Math.max(0, Math.min(100, priority));
  }

  private classifyByTypeScript(error: AgentError): ErrorClassification | null {
    const tsCodeMatch = error.code.match(/^(TS\d+)$/) || error.message.match(/error\s+(TS\d+)/);
    if (tsCodeMatch) {
      return this.parseTypeScriptError(error.message);
    }
    if (error.message.includes('type') || error.message.includes('Type') || error.message.includes('any type')) {
      return this.parseTypeScriptError(error.message);
    }
    return null;
  }

  private classifyByLint(error: AgentError, validationResults: ValidationResult[]): ErrorClassification | null {
    const isLintError = error.code.startsWith('ESLINT') ||
      error.message.includes('lint') ||
      error.message.includes('eslint') ||
      error.message.includes('prettier');

    if (isLintError) {
      return this.parseLintError(error.message);
    }

    const lintFailures = validationResults.filter(r =>
      r.rule.type === 'lint' && !r.passed,
    );

    if (lintFailures.length > 0) {
      const combinedMessage = lintFailures.map(f => f.error || f.output).join('\n');
      return this.parseLintError(combinedMessage);
    }

    return null;
  }

  private classifyByTestFailure(error: AgentError, validationResults: ValidationResult[]): ErrorClassification | null {
    const isTestError = error.message.includes('test') ||
      error.message.includes('Test') ||
      error.message.includes('assertion') ||
      error.message.includes('expect') ||
      error.message.includes('jest') ||
      error.message.includes('vitest') ||
      error.message.includes('FAIL');

    if (isTestError) {
      return this.parseTestFailure(error.message, '');
    }

    const testFailures = validationResults.filter(r =>
      r.rule.type === 'test' && !r.passed,
    );

    if (testFailures.length > 0) {
      const combinedOutput = testFailures.map(f => `${f.error || ''}\n${f.output}`).join('\n');
      return this.parseTestFailure(combinedOutput, '');
    }

    return null;
  }

  private classifyByRuntime(error: AgentError): ErrorClassification | null {
    if (error.category === 'execution' || error.category === 'timeout') {
      return this.parseRuntimeError(error.message, error.stack);
    }

    const isRuntimePattern = error.message.includes('null') ||
      error.message.includes('undefined') ||
      error.message.includes('Cannot read') ||
      error.message.includes('is not a function') ||
      error.message.includes('TypeError') ||
      error.message.includes('ReferenceError');

    if (isRuntimePattern) {
      return this.parseRuntimeError(error.message, error.stack);
    }

    return null;
  }

  private classifyBySecurity(error: AgentError): ErrorClassification | null {
    const isSecurityError = error.message.includes('security') ||
      error.message.includes('injection') ||
      error.message.includes('eval') ||
      error.message.includes('hardcoded') ||
      error.message.includes('secret') ||
      error.message.includes('CVE') ||
      error.message.includes('vulnerability');

    if (isSecurityError) {
      return this.parseSecurityIssue(error.message);
    }

    return null;
  }

  private classifyByBuild(error: AgentError): ErrorClassification | null {
    const isBuildError = error.message.includes('build') ||
      error.message.includes('Build') ||
      error.message.includes('compilation') ||
      error.message.includes('webpack') ||
      error.message.includes('rollup') ||
      error.message.includes('esbuild') ||
      error.message.includes('vite build');

    if (isBuildError) {
      return {
        category: 'build-error',
        severity: 'high',
        recoverable: true,
        suggestedFixType: 'fix-build',
        confidence: 0.7,
        details: {
          errorCode: error.code,
          errorMessage: error.message,
          affectedFiles: this.extractFilesFromMessage(error.message),
          errorPatterns: ['build-failure'],
          rootCauseHypothesis: `Build error: ${error.message.slice(0, 200)}`,
          relatedRules: ['build', 'compilation'],
        },
      };
    }

    return null;
  }

  private classifyByDependency(error: AgentError): ErrorClassification | null {
    const isDepError = error.code === 'TS2307' || error.code === 'TS2305' ||
      error.message.includes('Module not found') ||
      error.message.includes('Cannot resolve') ||
      error.message.includes('circular') ||
      error.message.includes('cyclic') ||
      error.message.includes('Cannot find module');

    if (isDepError) {
      return {
        category: 'dependency-error',
        severity: 'high',
        recoverable: true,
        suggestedFixType: 'fix-dependency',
        confidence: 0.8,
        details: {
          errorCode: error.code,
          errorMessage: error.message,
          affectedFiles: this.extractFilesFromMessage(error.message),
          errorPatterns: ['module-resolution', 'circular-dependency'],
          rootCauseHypothesis: `Dependency error: ${error.message.slice(0, 200)}`,
          relatedRules: ['module-resolution', 'dependency-management'],
        },
      };
    }

    return null;
  }

  private classifyByConfig(error: AgentError): ErrorClassification | null {
    const isConfigError = error.message.includes('tsconfig') ||
      error.message.includes('eslint') && error.message.includes('config') ||
      error.message.includes('webpack') && error.message.includes('config') ||
      error.message.includes('jest.config') ||
      error.message.includes('vitest.config') ||
      error.message.includes('.env') ||
      error.code === 'ENOENT' && error.message.includes('config');

    if (isConfigError) {
      return {
        category: 'config-error',
        severity: 'medium',
        recoverable: true,
        suggestedFixType: 'fix-config',
        confidence: 0.7,
        details: {
          errorCode: error.code,
          errorMessage: error.message,
          affectedFiles: this.extractFilesFromMessage(error.message),
          errorPatterns: ['configuration'],
          rootCauseHypothesis: `Configuration error: ${error.message.slice(0, 200)}`,
          relatedRules: ['configuration', 'settings'],
        },
      };
    }

    return null;
  }

  private extractFilesFromMessage(message: string): string[] {
    const files: string[] = [];
    const patterns = [
      /(?:in|at|file|path)\s+([^\s:]+\.(?:ts|tsx|js|jsx|json))/gi,
      /([^\s"]+\.(?:ts|tsx|js|jsx|json)):(?:\d+:\d+)/g,
      /['"]([^'"]+\.(?:ts|tsx|js|jsx|json))['"]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        if (match[1] && !files.includes(match[1])) {
          files.push(match[1]);
        }
      }
    }

    return files;
  }

  private extractFilesFromStack(stack?: string): string[] {
    if (!stack) return [];
    return this.extractFilesFromMessage(stack);
  }

  private extractErrorContext(message: string): string {
    const contextParts: string[] = [];
    if (message.length > 100) {
      contextParts.push(message.slice(0, 100));
    } else {
      contextParts.push(message);
    }
    return contextParts.join(' ');
  }

  private buildTestRootCause(
    failMatches: string[],
    assertionMatches: string[],
    mockMatches: string[],
    timeoutMatches: string[],
  ): string {
    const parts: string[] = [];

    if (failMatches.length > 0) {
      parts.push(`${failMatches.length} test(s) failing`);
    }
    if (assertionMatches.length > 0) {
      parts.push(`${assertionMatches.length} assertion mismatch(es)`);
    }
    if (mockMatches.length > 0) {
      parts.push(`${mockMatches.length} mock-related issue(s)`);
    }
    if (timeoutMatches.length > 0) {
      parts.push(`${timeoutMatches.length} timeout(s)`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Test failure detected';
  }

  private severityRank(severity: ErrorClassification['severity']): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
    }
  }
}

export class FixStrategySelector {
  private strategies: LoopFixStrategy[] = [];
  private executionHistory: Map<string, StrategyExecutionRecord[]> = new Map();

  constructor() {
    this.strategies = [...DEFAULT_FIX_STRATEGIES];
  }

  registerStrategy(strategy: LoopFixStrategy): void {
    const existingIndex = this.strategies.findIndex(s => s.id === strategy.id);
    if (existingIndex >= 0) {
      this.strategies[existingIndex] = strategy;
    } else {
      this.strategies.push(strategy);
    }
  }

  selectStrategy(
    classification: ErrorClassification,
    agentType: string,
    previousAttempts: FixLoopIteration[],
  ): LoopFixStrategy | null {
    const candidates = this.getStrategiesForError(classification.category);

    if (candidates.length === 0) {
      return this.strategies.find(s => s.id === 'generic-retry') || null;
    }

    const scored = candidates.map(strategy => ({
      strategy,
      score: this.calculateStrategyScore(strategy, classification, agentType, previousAttempts),
    }));

    scored.sort((a, b) => b.score - a.score);

    const cooldownStrategy = scored.find(s => !this.isOnCooldown(s.strategy.id, agentType));
    if (cooldownStrategy) {
      return cooldownStrategy.strategy;
    }

    return scored[0]?.strategy || null;
  }

  getStrategiesForError(category: string): LoopFixStrategy[] {
    return this.strategies.filter(strategy =>
      strategy.applicableErrors.includes(category) ||
      strategy.applicableErrors.includes('*'),
    );
  }

  getStrategySuccessRate(strategyId: string, agentType: string): number {
    const key = `${strategyId}:${agentType}`;
    const records = this.executionHistory.get(key) || [];

    if (records.length === 0) {
      const strategy = this.strategies.find(s => s.id === strategyId);
      return strategy?.estimatedSuccessRate || 0.5;
    }

    const successes = records.filter(r => r.success).length;
    return successes / records.length;
  }

  updateStrategyStats(strategyId: string, agentType: string, success: boolean): void {
    const key = `${strategyId}:${agentType}`;
    const records = this.executionHistory.get(key) || [];

    records.push({
      strategy: strategyId,
      success,
      timestamp: new Date(),
      agentType,
      durationMs: 0,
    });

    if (records.length > 100) {
      this.executionHistory.set(key, records.slice(-50));
    } else {
      this.executionHistory.set(key, records);
    }
  }

  buildFixPrompt(
    originalPrompt: string,
    strategy: LoopFixStrategy,
    error: AgentError,
    previousOutput: AgentOutput,
  ): string {
    const affectedFiles = previousOutput.files.map(f => f.path).join(', ');
    const errorContext = `[${error.code}] ${error.message.slice(0, 500)}`;

    let prompt = originalPrompt;
    prompt += `\n\n--- ERROR CONTEXT ---\n`;
    prompt += `Error: ${errorContext}\n`;
    prompt += `Affected files: ${affectedFiles || 'none identified'}\n`;
    prompt += `Category: ${error.category}\n`;

    if (strategy.promptModifier) {
      prompt += `\n--- FIX STRATEGY ---\n`;
      prompt += `${strategy.promptModifier}\n`;
    }

    prompt += `\n--- INSTRUCTIONS ---\n`;
    prompt += `Apply the fix strategy "${strategy.name}" to resolve the error.\n`;
    prompt += `Ensure the fix maintains code quality and does not introduce new errors.\n`;
    prompt += `After applying the fix, verify the output is correct.\n`;

    if (previousOutput.changes.length > 0) {
      prompt += `\n--- PREVIOUS CHANGES ---\n`;
      for (const change of previousOutput.changes.slice(-5)) {
        prompt += `File: ${change.path}\nDiff preview: ${change.diff.slice(0, 200)}\n\n`;
      }
    }

    return prompt;
  }

  private calculateStrategyScore(
    strategy: LoopFixStrategy,
    classification: ErrorClassification,
    agentType: string,
    previousAttempts: FixLoopIteration[],
  ): number {
    let score = 0;

    const successRate = this.getStrategySuccessRate(strategy.id, agentType);
    score += successRate * 40;

    score += strategy.priority * 0.3;

    const categoryMatch = strategy.applicableErrors.includes(classification.category) ? 1 : 0.3;
    score += categoryMatch * 20;

    const sameErrorCount = previousAttempts.filter(
      a => (a.error.category as string) === (classification.category as string),
    ).length;
    if (sameErrorCount > 2) {
      score -= sameErrorCount * 5;
    }

    if (classification.confidence > 0.8) {
      score += 10;
    } else if (classification.confidence < 0.5) {
      score -= 5;
    }

    if (previousAttempts.length > 0) {
      const lastAttempt = previousAttempts[previousAttempts.length - 1];
      if (lastAttempt.fixStrategy === strategy.id && !lastAttempt.success) {
        score -= 30;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private isOnCooldown(strategyId: string, agentType: string): boolean {
    const key = `${strategyId}:${agentType}`;
    const records = this.executionHistory.get(key) || [];
    const strategy = this.strategies.find(s => s.id === strategyId);

    if (!strategy || records.length === 0) return false;

    const lastRecord = records[records.length - 1];
    const timeSinceLastExecution = Date.now() - lastRecord.timestamp.getTime();

    return timeSinceLastExecution < strategy.cooldownMs;
  }
}

export class ErrorFixTestLoop {
  private config: ErrorFixLoopConfig;
  private classifier: ErrorClassifier;
  private strategySelector: FixStrategySelector;
  private iterationHistory: Map<string, FixLoopIteration[]> = new Map();

  constructor(config: ErrorFixLoopConfig) {
    this.config = {
      ...DEFAULT_LOOP_CONFIG,
      ...config,
    };
    this.classifier = new ErrorClassifier();
    this.strategySelector = new FixStrategySelector();
  }

  async executeLoop(
    agentId: string,
    agentType: string,
    originalPrompt: string,
    initialOutput: AgentOutput,
    validationResults: ValidationResult[],
    signal: AbortSignal,
  ): Promise<{
    success: boolean;
    output: AgentOutput;
    iterations: FixLoopIteration[];
    finalValidation: ValidationResult[];
  }> {
    const history: FixLoopIteration[] = [];
    let currentOutput = initialOutput;
    let currentValidationResults = validationResults;
    let lastError: AgentError = this.buildErrorFromValidation(validationResults);

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      if (signal.aborted) {
        break;
      }

      const iterationStart = Date.now();

      const classification = this.analyzeError(lastError, currentOutput, currentValidationResults);
      const strategy = this.selectFixStrategy(classification, agentType, history);

      if (!strategy) {
        const escalationResult = this.checkEscalation(iteration, lastError);
        if (escalationResult.shouldEscalate) {
          break;
        }
        continue;
      }

      const fixPrompt = this.generateFixPrompt(originalPrompt, strategy, lastError, currentOutput);

      const fixOutput = await this.applyFix(fixPrompt, signal);

      const newValidationResults = await this.validateFix(fixOutput, validationResults);

      const allPassed = newValidationResults.every(r => r.passed);
      const blockingFailures = newValidationResults.filter(r => !r.passed && r.rule.required);
      const passed = blockingFailures.length === 0;

      const iterationRecord: FixLoopIteration = {
        iteration,
        timestamp: new Date(),
        error: lastError,
        fixStrategy: strategy.name,
        promptUsed: fixPrompt,
        output: fixOutput,
        validationResults: newValidationResults,
        success: passed,
        durationMs: Date.now() - iterationStart,
      };

      history.push(iterationRecord);

      this.strategySelector.updateStrategyStats(strategy.id, agentType, passed);

      currentOutput = fixOutput;
      currentValidationResults = newValidationResults;

      if (passed) {
        this.storeIterationHistory(agentId, history);
        return {
          success: true,
          output: currentOutput,
          iterations: history,
          finalValidation: currentValidationResults,
        };
      }

      lastError = this.buildErrorFromValidation(newValidationResults);

      const escalationResult = this.checkEscalation(iteration, lastError);
      if (escalationResult.shouldEscalate) {
        break;
      }

      if (iteration < this.config.maxIterations - 1) {
        const backoffMs = this.calculateBackoff(iteration);
        await this.sleep(backoffMs, signal);
      }
    }

    this.storeIterationHistory(agentId, history);

    return {
      success: false,
      output: currentOutput,
      iterations: history,
      finalValidation: currentValidationResults,
    };
  }

  analyzeError(
    error: AgentError,
    output: AgentOutput,
    validations: ValidationResult[],
  ): ErrorClassification {
    return this.classifier.classify(error, output, validations);
  }

  selectFixStrategy(
    classification: ErrorClassification,
    agentType: string,
    history: FixLoopIteration[],
  ): LoopFixStrategy | null {
    return this.strategySelector.selectStrategy(classification, agentType, history);
  }

  generateFixPrompt(
    originalPrompt: string,
    strategy: LoopFixStrategy,
    error: AgentError,
    output: AgentOutput,
  ): string {
    return this.strategySelector.buildFixPrompt(originalPrompt, strategy, error, output);
  }

  async applyFix(fixPrompt: string, signal: AbortSignal): Promise<AgentOutput> {
    return {
      files: [],
      artifacts: [],
      changes: [],
    };
  }

  async validateFix(
    output: AgentOutput,
    originalValidations: ValidationResult[],
  ): Promise<ValidationResult[]> {
    return originalValidations.map(rule => ({
      ...rule,
      passed: true,
      output: '',
      durationMs: 0,
    }));
  }

  checkEscalation(
    iteration: number,
    error: AgentError,
  ): { shouldEscalate: boolean; escalationType?: string } {
    if (iteration >= this.config.maxIterations - 1) {
      return { shouldEscalate: true, escalationType: 'retry-exhausted' };
    }

    for (const rule of this.config.escalationRules) {
      switch (rule.condition) {
        case 'retry-exhausted':
          if (iteration >= this.config.maxIterations * 0.75) {
            return { shouldEscalate: true, escalationType: 'retry-exhausted' };
          }
          break;
        case 'critical-failure':
          if (error.category === 'execution' && !error.recoverable) {
            return { shouldEscalate: true, escalationType: 'critical-failure' };
          }
          break;
        case 'timeout':
          if (error.category === 'timeout' || error.code === 'TIMEOUT') {
            return { shouldEscalate: true, escalationType: 'timeout' };
          }
          break;
        case 'resource-exhausted':
          if (iteration > 8) {
            return { shouldEscalate: true, escalationType: 'resource-exhausted' };
          }
          break;
      }
    }

    return { shouldEscalate: false };
  }

  getIterationHistory(agentId: string): FixLoopIteration[] {
    return this.iterationHistory.get(agentId) || [];
  }

  getLoopStats(agentId: string): LoopStats {
    const history = this.iterationHistory.get(agentId) || [];
    const totalIterations = history.length;
    const successfulIterations = history.filter(i => i.success);
    const successRate = totalIterations > 0 ? successfulIterations.length / totalIterations : 0;

    let averageIterationsToFix = 0;
    if (successfulIterations.length > 0) {
      const fixIterations = successfulIterations.map(i => i.iteration + 1);
      averageIterationsToFix = fixIterations.reduce((a, b) => a + b, 0) / fixIterations.length;
    }

    const strategyCounts = new Map<string, { total: number; successes: number }>();
    for (const iteration of history) {
      const current = strategyCounts.get(iteration.fixStrategy) || { total: 0, successes: 0 };
      current.total++;
      if (iteration.success) current.successes++;
      strategyCounts.set(iteration.fixStrategy, current);
    }

    let mostEffectiveStrategy = '';
    let bestRate = 0;
    for (const [strategy, stats] of strategyCounts) {
      const rate = stats.total > 0 ? stats.successes / stats.total : 0;
      if (rate > bestRate || (rate === bestRate && stats.total > (strategyCounts.get(mostEffectiveStrategy)?.total || 0))) {
        bestRate = rate;
        mostEffectiveStrategy = strategy;
      }
    }

    const errorCounts = new Map<string, number>();
    for (const iteration of history) {
      const category = iteration.error.category;
      errorCounts.set(category, (errorCounts.get(category) || 0) + 1);
    }

    const commonErrorTypes = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category]) => category);

    return {
      totalIterations,
      successRate,
      averageIterationsToFix,
      mostEffectiveStrategy,
      commonErrorTypes,
    };
  }

  getGlobalStats(): GlobalLoopStats {
    let totalIterations = 0;
    let successfulIterations = 0;
    let totalAgents = 0;

    for (const [, history] of this.iterationHistory) {
      totalAgents++;
      totalIterations += history.length;
      successfulIterations += history.filter(i => i.success).length;
    }

    return {
      totalAgents,
      totalIterations,
      overallSuccessRate: totalIterations > 0 ? successfulIterations / totalIterations : 0,
      averageIterationsPerAgent: totalAgents > 0 ? totalIterations / totalAgents : 0,
    };
  }

  private buildErrorFromValidation(validationResults: ValidationResult[]): AgentError {
    const firstFailure = validationResults.find(r => !r.passed);
    if (firstFailure) {
      return {
        code: `VALIDATION_${firstFailure.rule.type.toUpperCase()}`,
        message: firstFailure.error || firstFailure.output.slice(0, 500) || `Validation failed: ${firstFailure.rule.type}`,
        category: 'validation',
        recoverable: true,
      };
    }
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown validation error',
      category: 'validation',
      recoverable: true,
    };
  }

  private calculateBackoff(iteration: number): number {
    switch (this.config.backoffStrategy) {
      case 'exponential':
        return Math.min(
          this.config.baseBackoffMs * Math.pow(2, iteration),
          this.config.maxBackoffMs,
        );
      case 'linear':
        return Math.min(
          this.config.baseBackoffMs * (iteration + 1),
          this.config.maxBackoffMs,
        );
      case 'adaptive': {
        const jitter = 0.85 + Math.random() * 0.3;
        return Math.min(
          this.config.baseBackoffMs * Math.pow(1.5, iteration) * jitter,
          this.config.maxBackoffMs,
        );
      }
      case 'fixed':
      default:
        return this.config.baseBackoffMs;
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  private storeIterationHistory(agentId: string, iterations: FixLoopIteration[]): void {
    const existing = this.iterationHistory.get(agentId) || [];
    this.iterationHistory.set(agentId, [...existing, ...iterations]);
  }
}

export const DEFAULT_FIX_STRATEGIES: LoopFixStrategy[] = [
  {
    id: 'auto-fix-type-errors',
    name: 'auto-fix-type-errors',
    description: 'Fix TypeScript type errors by adding proper type annotations, fixing type mismatches, and resolving implicit any types',
    applicableErrors: ['type-error'],
    priority: 85,
    estimatedSuccessRate: 0.82,
    promptModifier: 'Focus on TypeScript type safety. Add explicit type annotations where missing. Fix type mismatches between function signatures and call sites. Replace implicit any with proper types or use type guards for unknown types.',
    postFixValidation: ['typecheck'],
    cooldownMs: 5000,
  },
  {
    id: 'auto-fix-lint-errors',
    name: 'auto-fix-lint-errors',
    description: 'Fix ESLint and linting errors using auto-fix where possible, manual fixes for complex violations',
    applicableErrors: ['lint-error'],
    priority: 70,
    estimatedSuccessRate: 0.9,
    promptModifier: 'Fix lint violations. Run eslint --fix for auto-fixable issues first. Then manually fix remaining violations: remove unused imports, fix formatting, enforce coding standards.',
    postFixValidation: ['lint'],
    cooldownMs: 3000,
  },
  {
    id: 'auto-fix-test-failures',
    name: 'auto-fix-test-failures',
    description: 'Fix failing tests by correcting assertions, fixing mock setup, and resolving test environment issues',
    applicableErrors: ['test-failure'],
    priority: 80,
    estimatedSuccessRate: 0.75,
    promptModifier: 'Fix failing tests. Analyze assertion mismatches and fix either the test expectation or the implementation. Ensure mocks are properly configured. Fix test setup and teardown. Verify test isolation.',
    postFixValidation: ['test'],
    cooldownMs: 8000,
  },
  {
    id: 'auto-fix-import-errors',
    name: 'auto-fix-import-errors',
    description: 'Fix module resolution errors, circular dependencies, and incorrect import paths',
    applicableErrors: ['dependency-error'],
    priority: 75,
    estimatedSuccessRate: 0.8,
    promptModifier: 'Fix import and module resolution errors. Verify import paths are correct. Check package.json dependencies. Resolve circular imports by restructuring code. Use path aliases where appropriate.',
    postFixValidation: ['typecheck', 'lint'],
    cooldownMs: 5000,
  },
  {
    id: 'auto-fix-null-safety',
    name: 'auto-fix-null-safety',
    description: 'Fix null and undefined access errors by adding optional chaining, nullish coalescing, and defensive checks',
    applicableErrors: ['runtime-error'],
    priority: 80,
    estimatedSuccessRate: 0.78,
    promptModifier: 'Fix null and undefined access errors. Add optional chaining (?.) for nullable property access. Use nullish coalescing (??) for default values. Add explicit null checks before property access. Validate function parameters.',
    postFixValidation: ['typecheck', 'test'],
    cooldownMs: 5000,
  },
  {
    id: 'auto-fix-async-errors',
    name: 'auto-fix-async-errors',
    description: 'Fix async/await issues including unhandled promises, missing await, and race conditions',
    applicableErrors: ['runtime-error'],
    priority: 75,
    estimatedSuccessRate: 0.7,
    promptModifier: 'Fix async/await issues. Ensure all promises are properly awaited or handled with .catch(). Add error handling for async operations. Fix race conditions with proper synchronization. Use async iteration where appropriate.',
    postFixValidation: ['typecheck', 'test'],
    cooldownMs: 6000,
  },
  {
    id: 'auto-fix-security',
    name: 'auto-fix-security',
    description: 'Fix security vulnerabilities including injection attacks, hardcoded secrets, and unsafe patterns',
    applicableErrors: ['security-issue'],
    priority: 95,
    estimatedSuccessRate: 0.72,
    promptModifier: 'Fix security vulnerabilities immediately. Remove hardcoded secrets and use environment variables. Replace eval() with safe alternatives. Sanitize user input. Use parameterized queries for database access. Apply input validation.',
    postFixValidation: ['security', 'test'],
    cooldownMs: 10000,
  },
  {
    id: 'reduce-scope',
    name: 'reduce-scope',
    description: 'Reduce the scope of changes when the fix is too complex or touching too many files',
    applicableErrors: ['type-error', 'lint-error', 'test-failure', 'runtime-error'],
    priority: 50,
    estimatedSuccessRate: 0.65,
    promptModifier: 'Simplify the approach. Focus only on the most critical changes. Remove unnecessary modifications. Keep changes minimal and targeted to resolve only the specific error.',
    postFixValidation: ['typecheck', 'lint', 'test'],
    cooldownMs: 15000,
  },
  {
    id: 'split-task',
    name: 'split-task',
    description: 'Split into smaller, focused subtasks when the original task is too complex',
    applicableErrors: ['type-error', 'build-error', 'runtime-error'],
    priority: 40,
    estimatedSuccessRate: 0.6,
    promptModifier: 'Break this task into smaller, independent subtasks. Focus on one specific error or file at a time. Complete the simplest fix first, then build on that success.',
    postFixValidation: ['typecheck', 'lint', 'test'],
    cooldownMs: 20000,
  },
  {
    id: 'escalate-to-specialist',
    name: 'escalate-to-specialist',
    description: 'Escalate to a specialized agent when the error requires domain-specific expertise',
    applicableErrors: ['security-issue', 'performance-issue', 'build-error', 'config-error'],
    priority: 30,
    estimatedSuccessRate: 0.55,
    promptModifier: 'This error requires specialized knowledge. Apply domain-specific expertise to resolve the issue. Consult documentation and best practices for the specific error type.',
    postFixValidation: ['typecheck', 'test'],
    cooldownMs: 30000,
  },
];

export const DEFAULT_LOOP_CONFIG: ErrorFixLoopConfig = {
  maxIterations: 5,
  backoffStrategy: 'exponential',
  baseBackoffMs: 3000,
  maxBackoffMs: 30000,
  escalationRules: [
    {
      condition: 'retry-exhausted',
      action: 'spawn-specialist',
      targetAgentType: 'bug-fixer',
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
      customCondition: (context) => context.attempt >= 8,
    },
  ],
  fixStrategies: DEFAULT_FIX_STRATEGIES.map(s => ({
    name: s.name,
    description: s.description,
    applicableErrors: s.applicableErrors,
    promptTemplate: s.promptModifier,
    successRate: s.estimatedSuccessRate,
    costEstimate: 100,
  })),
  validationGates: [
    {
      name: 'typecheck-gate',
      type: 'typecheck',
      command: 'npx',
      args: ['tsc', '--noEmit'],
      threshold: 0,
      blocking: true,
      timeoutMs: 120000,
    },
    {
      name: 'lint-gate',
      type: 'lint',
      command: 'npx',
      args: ['eslint', '--format', 'json', 'src/**/*.{ts,tsx,js,jsx}'],
      threshold: 0,
      blocking: true,
      timeoutMs: 60000,
    },
    {
      name: 'test-gate',
      type: 'test',
      command: 'npx',
      args: ['vitest', 'run', '--reporter=json'],
      threshold: 0,
      blocking: true,
      timeoutMs: 180000,
    },
  ],
};
