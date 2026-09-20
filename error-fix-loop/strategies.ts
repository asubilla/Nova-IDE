import {
  AgentError, AgentOutput, ErrorContext, FixStrategy, ProjectProfile,
  TaskSpec, ValidationResult,
} from '../core/types';

export interface StrategyAnalysis {
  strategy: FixStrategy;
  confidence: number;
  estimatedTokens: number;
  estimatedCostMs: number;
  rationale: string;
}

export interface FixPromptResult {
  systemPrompt: string;
  userPrompt: string;
  focusFiles: string[];
}

export interface StrategyHistory {
  strategyName: string;
  attempts: number;
  successes: number;
  failures: number;
  lastError?: string;
}

export interface FixStrategyEngine {
  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis;
  generateFixPrompt(context: ErrorContext, strategy: FixStrategy): FixPromptResult;
  estimateCost(strategy: FixStrategy, context: ErrorContext): number;
  getConfidence(strategy: FixStrategy, error: AgentError, history: StrategyHistory[]): number;
}

const ERROR_PATTERN_MAP: Record<string, string[]> = {
  'TS2304': ['typescript'],
  'TS2322': ['typescript'],
  'TS2339': ['typescript'],
  'TS2345': ['typescript'],
  'TS2531': ['typescript'],
  'TS2554': ['typescript'],
  'TS7006': ['typescript'],
  'TS7031': ['typescript'],
  'TS1005': ['typescript'],
  'TS1128': ['typescript'],
  'TS2769': ['typescript'],
  'TS2307': ['import'],
  'TS2305': ['import'],
  'no-undef': ['eslint'],
  'no-unused-vars': ['eslint'],
  'import/no-duplicates': ['eslint'],
  'import/order': ['eslint'],
  'prettier/prettier': ['eslint'],
  'no-console': ['eslint'],
  'prefer-const': ['eslint'],
  'no-var': ['eslint'],
  'eqeqeq': ['eslint'],
  'no-eval': ['security'],
  'no-implied-eval': ['security'],
  'no-new-func': ['security'],
  'vestigial-code': ['security'],
  'react/no-danger': ['security'],
  'CVE': ['security', 'performance'],
  'vulnerability': ['security'],
  'ECONNREFUSED': ['runtime'],
  'ETIMEOUT': ['runtime'],
  'ENOTFOUND': ['runtime'],
  'null pointer': ['runtime'],
  'undefined is not': ['runtime'],
  'Cannot read propert': ['runtime'],
  'is not a function': ['runtime'],
  'is not a constructor': ['runtime'],
  'Maximum call stack': ['runtime'],
  'out of memory': ['performance'],
  'heap limit': ['performance'],
  'N+1': ['performance'],
  'n+1': ['performance'],
  'slow query': ['performance'],
  'missing index': ['performance'],
  'circular': ['import'],
  'cyclic': ['import'],
  'Module not found': ['import'],
  'Cannot resolve': ['import'],
  'ENOENT': ['config'],
  'tsconfig': ['config'],
  'eslint.*not found': ['config'],
  'webpack.*not found': ['config'],
  'jest.*not found': ['config'],
  'vitest.*not found': ['config'],
};

const STRATEGY_REGISTRIES: Record<string, FixStrategyHandler> = {};

interface FixStrategyHandler {
  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis;
  canHandle(error: AgentError): boolean;
}

class TypeScriptFixStrategy implements FixStrategyHandler {
  readonly name = 'typescript-fix';

  canHandle(error: AgentError): boolean {
    return error.code.startsWith('TS') ||
      error.message.includes('type') ||
      error.message.includes('Type') ||
      error.message.includes('missing import') ||
      error.message.includes('any type');
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const errorPatterns = extractTypeScriptErrorPatterns(error);
    const scope = determineTypeScriptScope(errorPatterns, context);

    return {
      strategy: {
        name: this.name,
        description: 'Fix TypeScript type errors, missing imports, and any types',
        applicableErrors: ['TS2304', 'TS2322', 'TS2339', 'TS2345', 'TS2531', 'TS2554', 'TS7006', 'TS7031', 'TS1005', 'TS1128', 'TS2769'],
        promptTemplate: buildTypeScriptFixPrompt(scope),
        successRate: 0.82,
        costEstimate: estimateTypeScriptCost(scope),
      },
      confidence: calculateTypeScriptConfidence(errorPatterns, context),
      estimatedTokens: estimateTypeScriptTokens(scope),
      estimatedCostMs: estimateTypeScriptCostMs(scope),
      rationale: buildTypeScriptRationale(errorPatterns, scope),
    };
  }
}

class ESLintFixStrategy implements FixStrategyHandler {
  readonly name = 'eslint-fix';

  canHandle(error: AgentError): boolean {
    return error.code.startsWith('ESLINT') ||
      error.category === 'validation' && (
        error.message.includes('lint') ||
        error.message.includes('eslint') ||
        error.message.includes('unused import') ||
        error.message.includes('formatting')
      );
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const lintErrors = extractLintErrors(error);
    const autoFixable = lintErrors.filter(e => e.autoFixable);
    const manualRequired = lintErrors.filter(e => !e.autoFixable);

    return {
      strategy: {
        name: this.name,
        description: 'Auto-fix ESLint errors, unused imports, and formatting issues',
        applicableErrors: ['no-undef', 'no-unused-vars', 'import/order', 'prettier/prettier', 'prefer-const', 'no-var', 'eqeqeq'],
        promptTemplate: buildESLintFixPrompt(lintErrors, autoFixable.length > 0),
        successRate: autoFixable.length > 0 ? 0.95 : 0.70,
        costEstimate: manualRequired.length * 50,
      },
      confidence: calculateESLintConfidence(lintErrors, context),
      estimatedTokens: estimateESLintTokens(lintErrors),
      estimatedCostMs: estimateESLintCostMs(lintErrors),
      rationale: buildESLintRationale(lintErrors, autoFixable.length),
    };
  }
}

class TestFixStrategy implements FixStrategyHandler {
  readonly name = 'test-fix';

  canHandle(error: AgentError): boolean {
    return error.category === 'validation' && (
      error.message.includes('test') ||
      error.message.includes('Test') ||
      error.message.includes('assertion') ||
      error.message.includes('expect') ||
      error.message.includes('mock') ||
      error.message.includes('jest') ||
      error.message.includes('vitest')
    );
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const testFailures = extractTestFailures(error);
    const mockIssues = testFailures.filter(f => f.type === 'mock');
    const assertionMismatches = testFailures.filter(f => f.type === 'assertion');

    return {
      strategy: {
        name: this.name,
        description: 'Fix failing tests, assertion mismatches, and mocking issues',
        applicableErrors: ['TEST_FAILURE', 'ASSERTION_MISMATCH', 'MOCK_ERROR'],
        promptTemplate: buildTestFixPrompt(testFailures, mockIssues.length > 0),
        successRate: 0.75,
        costEstimate: testFailures.length * 100 + mockIssues.length * 150,
      },
      confidence: calculateTestConfidence(testFailures, context),
      estimatedTokens: estimateTestTokens(testFailures),
      estimatedCostMs: estimateTestCostMs(testFailures),
      rationale: buildTestRationale(testFailures, assertionMismatches.length),
    };
  }
}

class RuntimeFixStrategy implements FixStrategyHandler {
  readonly name = 'runtime-fix';

  canHandle(error: AgentError): boolean {
    return error.category === 'execution' || error.category === 'timeout' ||
      error.message.includes('null') ||
      error.message.includes('undefined') ||
      error.message.includes('Cannot read') ||
      error.message.includes('is not a function') ||
      error.message.includes('async');
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const runtimeErrors = extractRuntimeErrors(error);
    const nullRefErrors = runtimeErrors.filter(e => e.type === 'null-reference');
    const asyncErrors = runtimeErrors.filter(e => e.type === 'async');

    return {
      strategy: {
        name: this.name,
        description: 'Fix null references, undefined access, and async issues',
        applicableErrors: ['NULL_REF', 'UNDEFINED_ACCESS', 'ASYNC_ERROR', 'TIMEOUT'],
        promptTemplate: buildRuntimeFixPrompt(runtimeErrors),
        successRate: 0.65,
        costEstimate: runtimeErrors.length * 120,
      },
      confidence: calculateRuntimeConfidence(runtimeErrors, context),
      estimatedTokens: estimateRuntimeTokens(runtimeErrors),
      estimatedCostMs: estimateRuntimeCostMs(runtimeErrors),
      rationale: buildRuntimeRationale(runtimeErrors, nullRefErrors.length, asyncErrors.length),
    };
  }
}

class SecurityFixStrategy implements FixStrategyHandler {
  readonly name = 'security-fix';

  canHandle(error: AgentError): boolean {
    return error.category === 'validation' && (
      error.message.includes('security') ||
      error.message.includes('injection') ||
      error.message.includes('eval') ||
      error.message.includes('hardcoded') ||
      error.message.includes('secret') ||
      error.message.includes('CVE')
    );
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const securityIssues = extractSecurityIssues(error);
    const criticalIssues = securityIssues.filter(i => i.severity === 'critical');

    return {
      strategy: {
        name: this.name,
        description: 'Fix injection patterns, unsafe eval, and hardcoded secrets',
        applicableErrors: ['INJECTION', 'UNSAFE_EVAL', 'HARDCODED_SECRET', 'CVE'],
        promptTemplate: buildSecurityFixPrompt(securityIssues),
        successRate: 0.70,
        costEstimate: securityIssues.length * 200,
      },
      confidence: calculateSecurityConfidence(securityIssues, context),
      estimatedTokens: estimateSecurityTokens(securityIssues),
      estimatedCostMs: estimateSecurityCostMs(securityIssues),
      rationale: buildSecurityRationale(securityIssues, criticalIssues.length),
    };
  }
}

class PerformanceFixStrategy implements FixStrategyHandler {
  readonly name = 'performance-fix';

  canHandle(error: AgentError): boolean {
    return error.category === 'validation' && (
      error.message.includes('performance') ||
      error.message.includes('N+1') ||
      error.message.includes('re-render') ||
      error.message.includes('memory') ||
      error.message.includes('leak')
    );
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const perfIssues = extractPerformanceIssues(error);
    const memoryLeaks = perfIssues.filter(i => i.type === 'memory-leak');
    const nPlusOne = perfIssues.filter(i => i.type === 'n+1-query');

    return {
      strategy: {
        name: this.name,
        description: 'Fix N+1 queries, unnecessary re-renders, and memory leaks',
        applicableErrors: ['N+1_QUERY', 'UNNECESSARY_RENDER', 'MEMORY_LEAK'],
        promptTemplate: buildPerformanceFixPrompt(perfIssues),
        successRate: 0.60,
        costEstimate: perfIssues.length * 250,
      },
      confidence: calculatePerformanceConfidence(perfIssues, context),
      estimatedTokens: estimatePerformanceTokens(perfIssues),
      estimatedCostMs: estimatePerformanceCostMs(perfIssues),
      rationale: buildPerformanceRationale(perfIssues, memoryLeaks.length, nPlusOne.length),
    };
  }
}

class ImportFixStrategy implements FixStrategyHandler {
  readonly name = 'import-fix';

  canHandle(error: AgentError): boolean {
    return error.code === 'TS2307' || error.code === 'TS2305' ||
      error.message.includes('circular') ||
      error.message.includes('Module not found') ||
      error.message.includes('Cannot resolve') ||
      error.message.includes('import');
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const importErrors = extractImportErrors(error);
    const circularDeps = importErrors.filter(e => e.type === 'circular');
    const missingModules = importErrors.filter(e => e.type === 'missing');

    return {
      strategy: {
        name: this.name,
        description: 'Fix circular dependencies, missing modules, and path resolution',
        applicableErrors: ['CIRCULAR_DEP', 'MISSING_MODULE', 'PATH_RESOLUTION'],
        promptTemplate: buildImportFixPrompt(importErrors),
        successRate: 0.80,
        costEstimate: importErrors.length * 80,
      },
      confidence: calculateImportConfidence(importErrors, context),
      estimatedTokens: estimateImportTokens(importErrors),
      estimatedCostMs: estimateImportCostMs(importErrors),
      rationale: buildImportRationale(importErrors, circularDeps.length, missingModules.length),
    };
  }
}

class ConfigFixStrategy implements FixStrategyHandler {
  readonly name = 'config-fix';

  canHandle(error: AgentError): boolean {
    return error.category === 'execution' && (
      error.message.includes('tsconfig') ||
      error.message.includes('eslint') ||
      error.message.includes('webpack') ||
      error.message.includes('jest') ||
      error.message.includes('vitest') ||
      error.message.includes('config')
    );
  }

  analyze(error: AgentError, context: ErrorContext): StrategyAnalysis {
    const configErrors = extractConfigErrors(error);

    return {
      strategy: {
        name: this.name,
        description: 'Fix tsconfig, eslint, webpack, and test runner config issues',
        applicableErrors: ['TSCONFIG_ERROR', 'ESLINT_CONFIG_ERROR', 'WEBPACK_CONFIG_ERROR', 'TEST_CONFIG_ERROR'],
        promptTemplate: buildConfigFixPrompt(configErrors),
        successRate: 0.85,
        costEstimate: configErrors.length * 60,
      },
      confidence: calculateConfigConfidence(configErrors, context),
      estimatedTokens: estimateConfigTokens(configErrors),
      estimatedCostMs: estimateConfigCostMs(configErrors),
      rationale: buildConfigRationale(configErrors),
    };
  }
}

STRATEGY_REGISTRIES['typescript-fix'] = new TypeScriptFixStrategy();
STRATEGY_REGISTRIES['eslint-fix'] = new ESLintFixStrategy();
STRATEGY_REGISTRIES['test-fix'] = new TestFixStrategy();
STRATEGY_REGISTRIES['runtime-fix'] = new RuntimeFixStrategy();
STRATEGY_REGISTRIES['security-fix'] = new SecurityFixStrategy();
STRATEGY_REGISTRIES['performance-fix'] = new PerformanceFixStrategy();
STRATEGY_REGISTRIES['import-fix'] = new ImportFixStrategy();
STRATEGY_REGISTRIES['config-fix'] = new ConfigFixStrategy();

function extractTypeScriptErrorPatterns(error: AgentError): string[] {
  const patterns: string[] = [];
  const codeMatch = error.message.match(/TS(\d+)/);
  if (codeMatch) patterns.push(codeMatch[0]);
  if (error.message.includes('missing import')) patterns.push('missing-import');
  if (error.message.includes('any type')) patterns.push('any-type');
  if (error.message.includes('type mismatch')) patterns.push('type-mismatch');
  if (error.message.includes('undefined')) patterns.push('undefined-access');
  return patterns;
}

function determineTypeScriptScope(patterns: string[], context: ErrorContext): 'file' | 'project' | 'cross-module' {
  if (patterns.includes('missing-import') || patterns.includes('circular')) return 'cross-module';
  if (context.validationResults.length > 5) return 'project';
  return 'file';
}

function buildTypeScriptFixPrompt(scope: 'file' | 'project' | 'cross-module'): string {
  const base = 'Fix TypeScript type errors in the following code.';
  switch (scope) {
    case 'file':
      return `${base} Focus on the specific file with type errors. Add missing type annotations and fix type mismatches.`;
    case 'project':
      return `${base} Analyze the project-level type configuration. Check tsconfig.json settings and fix widespread type issues.`;
    case 'cross-module':
      return `${base} Fix cross-module type issues. Check import paths, module resolution, and shared type definitions.`;
  }
}

function estimateTypeScriptCost(scope: 'file' | 'project' | 'cross-module'): number {
  switch (scope) {
    case 'file': return 80;
    case 'project': return 200;
    case 'cross-module': return 300;
  }
}

function calculateTypeScriptConfidence(patterns: string[], context: ErrorContext): number {
  let confidence = 0.8;
  if (patterns.includes('type-mismatch')) confidence -= 0.1;
  if (patterns.includes('circular')) confidence -= 0.2;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function estimateTypeScriptTokens(scope: 'file' | 'project' | 'cross-module'): number {
  switch (scope) {
    case 'file': return 2000;
    case 'project': return 5000;
    case 'cross-module': return 8000;
  }
}

function estimateTypeScriptCostMs(scope: 'file' | 'project' | 'cross-module'): number {
  switch (scope) {
    case 'file': return 3000;
    case 'project': return 8000;
    case 'cross-module': return 12000;
  }
}

function buildTypeScriptRationale(patterns: string[], scope: string): string {
  return `TypeScript errors detected (${patterns.join(', ')}). Scope: ${scope}. Strategy focuses on adding type annotations and fixing type mismatches.`;
}

function extractLintErrors(error: AgentError): Array<{ rule: string; autoFixable: boolean; count: number }> {
  const errors: Array<{ rule: string; autoFixable: boolean; count: number }> = [];
  const autoFixableRules = ['no-unused-vars', 'import/order', 'prettier/prettier', 'prefer-const', 'no-var', 'eqeqeq'];
  const lines = error.message.split('\n');
  for (const line of lines) {
    const ruleMatch = line.match(/(\w[\w-/]+)/);
    if (ruleMatch) {
      const rule = ruleMatch[1];
      const existing = errors.find(e => e.rule === rule);
      if (existing) {
        existing.count++;
      } else {
        errors.push({ rule, autoFixable: autoFixableRules.includes(rule), count: 1 });
      }
    }
  }
  if (errors.length === 0) {
    errors.push({ rule: 'unknown', autoFixable: false, count: 1 });
  }
  return errors;
}

function buildESLintFixPrompt(lintErrors: Array<{ rule: string; autoFixable: boolean; count: number }>, hasAutoFixable: boolean): string {
  const ruleList = lintErrors.map(e => `- ${e.rule} (${e.count} occurrences, auto-fixable: ${e.autoFixable})`).join('\n');
  if (hasAutoFixable) {
    return `Fix ESLint errors. Some are auto-fixable:\n${ruleList}\n\nRun eslint --fix for auto-fixable issues, then manually fix the rest.`;
  }
  return `Fix ESLint errors that require manual intervention:\n${ruleList}`;
}

function estimateESLintTokens(lintErrors: Array<{ rule: string; autoFixable: boolean; count: number }>): number {
  return lintErrors.reduce((sum, e) => sum + (e.autoFixable ? 500 : 1500) * e.count, 0);
}

function estimateESLintCostMs(lintErrors: Array<{ rule: string; autoFixable: boolean; count: number }>): number {
  return lintErrors.reduce((sum, e) => sum + (e.autoFixable ? 1000 : 4000) * e.count, 0);
}

function calculateESLintConfidence(lintErrors: Array<{ rule: string; autoFixable: boolean; count: number }>, context: ErrorContext): number {
  const autoFixableRatio = lintErrors.filter(e => e.autoFixable).length / lintErrors.length;
  let confidence = 0.5 + autoFixableRatio * 0.45;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildESLintRationale(lintErrors: Array<{ rule: string; autoFixable: boolean; count: number }>, autoFixableCount: number): string {
  return `ESLint errors detected: ${lintErrors.length} unique rules. ${autoFixableCount} auto-fixable. Strategy prioritizes eslint --fix for auto-fixable issues.`;
}

function extractTestFailures(error: AgentError): Array<{ name: string; type: 'assertion' | 'mock' | 'timeout' | 'setup'; message: string }> {
  const failures: Array<{ name: string; type: 'assertion' | 'mock' | 'timeout' | 'setup'; message: string }> = [];
  const lines = error.message.split('\n');
  for (const line of lines) {
    const testMatch = line.match(/(?:FAIL|✓|✗|×)\s+(.+)/);
    if (testMatch) {
      let type: 'assertion' | 'mock' | 'timeout' | 'setup' = 'assertion';
      if (line.includes('mock') || line.includes('Mock')) type = 'mock';
      if (line.includes('timeout') || line.includes('Timeout')) type = 'timeout';
      if (line.includes('setup') || line.includes('beforeEach')) type = 'setup';
      failures.push({ name: testMatch[1].trim(), type, message: line });
    }
  }
  if (failures.length === 0 && error.message.includes('expect')) {
    failures.push({ name: 'unknown-test', type: 'assertion', message: error.message });
  }
  return failures;
}

function buildTestFixPrompt(failures: Array<{ name: string; type: string; message: string }>, hasMockIssues: boolean): string {
  const failureList = failures.map(f => `- ${f.name} (${f.type}): ${f.message}`).join('\n');
  if (hasMockIssues) {
    return `Fix failing tests with mocking issues:\n${failureList}\n\nFocus on mock setup, return values, and call assertions.`;
  }
  return `Fix failing tests:\n${failureList}\n\nAnalyze assertion mismatches and fix the test expectations or the implementation.`;
}

function estimateTestTokens(failures: Array<{ name: string; type: string; message: string }>): number {
  return failures.length * 1500;
}

function estimateTestCostMs(failures: Array<{ name: string; type: string; message: string }>): number {
  return failures.length * 5000;
}

function calculateTestConfidence(failures: Array<{ name: string; type: string; message: string }>, context: ErrorContext): number {
  let confidence = 0.7;
  if (failures.every(f => f.type === 'assertion')) confidence += 0.1;
  if (failures.some(f => f.type === 'mock')) confidence -= 0.1;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildTestRationale(failures: Array<{ name: string; type: string; message: string }>, assertionCount: number): string {
  return `${failures.length} test failures detected. ${assertionCount} assertion mismatches. Strategy focuses on fixing test expectations.`;
}

function extractRuntimeErrors(error: AgentError): Array<{ type: 'null-reference' | 'undefined-access' | 'async' | 'type-error'; location?: string }> {
  const errors: Array<{ type: 'null-reference' | 'undefined-access' | 'async' | 'type-error'; location?: string }> = [];
  if (error.message.includes('null') || error.message.includes('Cannot read')) {
    errors.push({ type: 'null-reference' });
  }
  if (error.message.includes('undefined')) {
    errors.push({ type: 'undefined-access' });
  }
  if (error.message.includes('async') || error.message.includes('await') || error.message.includes('Promise')) {
    errors.push({ type: 'async' });
  }
  if (error.message.includes('is not a function') || error.message.includes('is not a constructor')) {
    errors.push({ type: 'type-error' });
  }
  if (errors.length === 0) {
    errors.push({ type: 'type-error' });
  }
  const locMatch = error.message.match(/at\s+(.+?):(\d+):(\d+)/);
  if (locMatch) {
    errors[errors.length - 1].location = `${locMatch[1]}:${locMatch[2]}`;
  }
  return errors;
}

function buildRuntimeFixPrompt(errors: Array<{ type: string; location?: string }>): string {
  const errorTypes = [...new Set(errors.map(e => e.type))];
  const locations = errors.filter(e => e.location).map(e => e.location).join(', ');
  let prompt = `Fix runtime errors of type: ${errorTypes.join(', ')}.`;
  if (locations) prompt += ` Locations: ${locations}.`;
  prompt += '\n\nAdd null checks, validate undefined access, and ensure proper async/await usage.';
  return prompt;
}

function estimateRuntimeTokens(errors: Array<{ type: string; location?: string }>): number {
  return errors.length * 1800;
}

function estimateRuntimeCostMs(errors: Array<{ type: string; location?: string }>): number {
  return errors.length * 6000;
}

function calculateRuntimeConfidence(errors: Array<{ type: string; location?: string }>, context: ErrorContext): number {
  let confidence = 0.65;
  if (errors.some(e => e.type === 'null-reference')) confidence += 0.05;
  if (errors.some(e => e.type === 'async')) confidence -= 0.1;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildRuntimeRationale(errors: Array<{ type: string; location?: string }>, nullRefs: number, asyncErrors: number): string {
  return `Runtime errors: ${nullRefs} null references, ${asyncErrors} async issues. Strategy adds defensive checks and validates async flows.`;
}

function extractSecurityIssues(error: AgentError): Array<{ type: string; severity: 'critical' | 'high' | 'medium' | 'low'; location?: string }> {
  const issues: Array<{ type: string; severity: 'critical' | 'high' | 'medium' | 'low'; location?: string }> = [];
  if (error.message.includes('eval') || error.message.includes('implied eval')) {
    issues.push({ type: 'unsafe-eval', severity: 'critical' });
  }
  if (error.message.includes('injection') || error.message.includes('SQL')) {
    issues.push({ type: 'injection', severity: 'critical' });
  }
  if (error.message.includes('hardcoded') || error.message.includes('secret') || error.message.includes('password')) {
    issues.push({ type: 'hardcoded-secret', severity: 'high' });
  }
  if (error.message.includes('CVE')) {
    issues.push({ type: 'vulnerability', severity: 'critical' });
  }
  if (error.message.includes('xss') || error.message.includes('XSS')) {
    issues.push({ type: 'xss', severity: 'high' });
  }
  if (issues.length === 0) {
    issues.push({ type: 'unknown-security', severity: 'medium' });
  }
  return issues;
}

function buildSecurityFixPrompt(issues: Array<{ type: string; severity: string; location?: string }>): string {
  const issueList = issues.map(i => `- ${i.type} (${i.severity})`).join('\n');
  return `Fix security issues:\n${issueList}\n\nRemove hardcoded secrets, replace eval with safe alternatives, and sanitize user input.`;
}

function estimateSecurityTokens(issues: Array<{ type: string; severity: string; location?: string }>): number {
  return issues.length * 2500;
}

function estimateSecurityCostMs(issues: Array<{ type: string; severity: string; location?: string }>): number {
  return issues.length * 8000;
}

function calculateSecurityConfidence(issues: Array<{ type: string; severity: string; location?: string }>, context: ErrorContext): number {
  let confidence = 0.7;
  if (issues.some(i => i.severity === 'critical')) confidence -= 0.1;
  if (context.attempt > 1) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildSecurityRationale(issues: Array<{ type: string; severity: string; location?: string }>, criticalCount: number): string {
  return `${issues.length} security issues detected. ${criticalCount} critical. Strategy removes dangerous patterns and applies security best practices.`;
}

function extractPerformanceIssues(error: AgentError): Array<{ type: string; severity: 'high' | 'medium' | 'low'; details: string }> {
  const issues: Array<{ type: string; severity: 'high' | 'medium' | 'low'; details: string }> = [];
  if (error.message.includes('N+1') || error.message.includes('n+1')) {
    issues.push({ type: 'n+1-query', severity: 'high', details: 'Multiple sequential database queries detected' });
  }
  if (error.message.includes('re-render') || error.message.includes('rerender')) {
    issues.push({ type: 'unnecessary-render', severity: 'medium', details: 'Unnecessary component re-renders' });
  }
  if (error.message.includes('memory') || error.message.includes('leak')) {
    issues.push({ type: 'memory-leak', severity: 'high', details: 'Potential memory leak detected' });
  }
  if (error.message.includes('slow') || error.message.includes('timeout')) {
    issues.push({ type: 'slow-operation', severity: 'medium', details: 'Slow operation detected' });
  }
  if (issues.length === 0) {
    issues.push({ type: 'general-perf', severity: 'low', details: 'Performance issue detected' });
  }
  return issues;
}

function buildPerformanceFixPrompt(issues: Array<{ type: string; severity: string; details: string }>): string {
  const issueList = issues.map(i => `- ${i.type}: ${i.details}`).join('\n');
  return `Fix performance issues:\n${issueList}\n\nOptimize database queries, add memoization, and fix memory management.`;
}

function estimatePerformanceTokens(issues: Array<{ type: string; severity: string; details: string }>): number {
  return issues.length * 3000;
}

function estimatePerformanceCostMs(issues: Array<{ type: string; severity: string; details: string }>): number {
  return issues.length * 10000;
}

function calculatePerformanceConfidence(issues: Array<{ type: string; severity: string; details: string }>, context: ErrorContext): number {
  let confidence = 0.6;
  if (issues.every(i => i.type === 'n+1-query')) confidence += 0.1;
  if (issues.some(i => i.type === 'memory-leak')) confidence -= 0.15;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildPerformanceRationale(issues: Array<{ type: string; severity: string; details: string }>, memoryLeaks: number, nPlusOne: number): string {
  return `${issues.length} performance issues: ${nPlusOne} N+1 queries, ${memoryLeaks} memory leaks. Strategy optimizes data access patterns.`;
}

function extractImportErrors(error: AgentError): Array<{ type: 'circular' | 'missing' | 'path'; module?: string }> {
  const errors: Array<{ type: 'circular' | 'missing' | 'path'; module?: string }> = [];
  if (error.message.includes('circular') || error.message.includes('cyclic')) {
    const moduleMatch = error.message.match(/['"](.+?)['"]/);
    errors.push({ type: 'circular', module: moduleMatch?.[1] });
  }
  if (error.message.includes('Module not found') || error.message.includes('Cannot resolve')) {
    const moduleMatch = error.message.match(/['"](.+?)['"]/);
    errors.push({ type: 'missing', module: moduleMatch?.[1] });
  }
  if (error.code === 'TS2307' || error.code === 'TS2305') {
    const moduleMatch = error.message.match(/module ['"](.+?)['"]/);
    errors.push({ type: 'missing', module: moduleMatch?.[1] });
  }
  if (error.message.includes('path') || error.message.includes('resolve')) {
    errors.push({ type: 'path' });
  }
  if (errors.length === 0) {
    errors.push({ type: 'missing' });
  }
  return errors;
}

function buildImportFixPrompt(errors: Array<{ type: string; module?: string }>): string {
  const errorTypes = [...new Set(errors.map(e => e.type))];
  const modules = errors.filter(e => e.module).map(e => e.module).join(', ');
  let prompt = `Fix import errors of type: ${errorTypes.join(', ')}.`;
  if (modules) prompt += ` Affected modules: ${modules}.`;
  prompt += '\n\nCheck import paths, resolve module dependencies, and break circular imports.';
  return prompt;
}

function estimateImportTokens(errors: Array<{ type: string; module?: string }>): number {
  return errors.length * 1200;
}

function estimateImportCostMs(errors: Array<{ type: string; module?: string }>): number {
  return errors.length * 4000;
}

function calculateImportConfidence(errors: Array<{ type: string; module?: string }>, context: ErrorContext): number {
  let confidence = 0.75;
  if (errors.some(e => e.type === 'circular')) confidence -= 0.15;
  if (context.attempt > 2) confidence -= 0.15;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildImportRationale(errors: Array<{ type: string; module?: string }>, circularCount: number, missingCount: number): string {
  return `Import errors: ${missingCount} missing modules, ${circularCount} circular dependencies. Strategy resolves module paths and restructures imports.`;
}

function extractConfigErrors(error: AgentError): Array<{ file: string; issue: string }> {
  const errors: Array<{ file: string; issue: string }> = [];
  const configFiles = ['tsconfig.json', '.eslintrc.js', '.eslintrc.json', 'webpack.config.js', 'jest.config.js', 'vitest.config.ts'];
  for (const file of configFiles) {
    if (error.message.toLowerCase().includes(file.replace('.json', '').replace('.js', '').replace('.ts', ''))) {
      errors.push({ file, issue: error.message });
    }
  }
  if (errors.length === 0) {
    errors.push({ file: 'unknown', issue: error.message });
  }
  return errors;
}

function buildConfigFixPrompt(errors: Array<{ file: string; issue: string }>): string {
  const errorList = errors.map(e => `- ${e.file}: ${e.issue}`).join('\n');
  return `Fix configuration issues:\n${errorList}\n\nValidate config file syntax and ensure correct option values.`;
}

function estimateConfigTokens(errors: Array<{ file: string; issue: string }>): number {
  return errors.length * 1000;
}

function estimateConfigCostMs(errors: Array<{ file: string; issue: string }>): number {
  return errors.length * 3000;
}

function calculateConfigConfidence(errors: Array<{ file: string; issue: string }>, context: ErrorContext): number {
  let confidence = 0.85;
  if (context.attempt > 1) confidence -= 0.1;
  return Math.max(0.3, Math.min(0.95, confidence));
}

function buildConfigRationale(errors: Array<{ file: string; issue: string }>): string {
  return `Configuration errors in: ${errors.map(e => e.file).join(', ')}. Strategy validates and corrects config file contents.`;
}

function matchErrorToCategories(error: AgentError): string[] {
  const categories: string[] = [];
  for (const [pattern, cats] of Object.entries(ERROR_PATTERN_MAP)) {
    if (error.code.includes(pattern) || error.message.toLowerCase().includes(pattern.toLowerCase())) {
      categories.push(...cats);
    }
  }
  return [...new Set(categories)];
}

export function selectBestStrategy(
  error: AgentError,
  context: ErrorContext,
  history: StrategyHistory[],
  availableStrategies: FixStrategy[],
): StrategyAnalysis {
  const categories = matchErrorToCategories(error);
  const candidates: StrategyAnalysis[] = [];

  for (const [name, handler] of Object.entries(STRATEGY_REGISTRIES)) {
    if (handler.canHandle(error)) {
      const analysis = handler.analyze(error, context);
      const historyEntry = history.find(h => h.strategyName === name);
      if (historyEntry) {
        analysis.confidence *= calculateHistoryModifier(historyEntry);
      }
      candidates.push(analysis);
    }
  }

  if (candidates.length === 0) {
    for (const strategy of availableStrategies) {
      if (strategy.applicableErrors.some(e => error.code.includes(e) || error.message.includes(e))) {
        const handler = STRATEGY_REGISTRIES['runtime-fix'];
        if (handler) {
          const analysis = handler.analyze(error, context);
          analysis.strategy = strategy;
          candidates.push(analysis);
        }
      }
    }
  }

  if (candidates.length === 0 && Object.keys(STRATEGY_REGISTRIES).length > 0) {
    const fallbackHandler = STRATEGY_REGISTRIES['runtime-fix'];
    if (fallbackHandler) {
      candidates.push(fallbackHandler.analyze(error, context));
    }
  }

  candidates.sort((a, b) => {
    const scoreA = a.confidence * 0.6 + (1 / Math.max(a.estimatedCostMs, 1)) * 0.4;
    const scoreB = b.confidence * 0.6 + (1 / Math.max(b.estimatedCostMs, 1)) * 0.4;
    return scoreB - scoreA;
  });

  return candidates[0] || {
    strategy: {
      name: 'generic-fix',
      description: 'Generic fix attempt',
      applicableErrors: ['*'],
      promptTemplate: 'Fix the error in the code.',
      successRate: 0.3,
      costEstimate: 100,
    },
    confidence: 0.3,
    estimatedTokens: 2000,
    estimatedCostMs: 5000,
    rationale: 'No specific strategy matched. Applying generic fix.',
  };
}

function calculateHistoryModifier(history: StrategyHistory): number {
  if (history.attempts === 0) return 1.0;
  const successRate = history.successes / history.attempts;
  if (successRate > 0.7) return 1.1;
  if (successRate > 0.4) return 0.9;
  if (successRate > 0.1) return 0.6;
  return 0.3;
}

export function buildFixPromptFromContext(
  context: ErrorContext,
  strategy: FixStrategy,
): FixPromptResult {
  const handler = STRATEGY_REGISTRIES[strategy.name];
  if (handler) {
    return (handler as FixStrategyHandler & { generateFixPrompt?: (ctx: ErrorContext, s: FixStrategy) => FixPromptResult }).generateFixPrompt?.(context, strategy) ||
      buildDefaultFixPrompt(context, strategy);
  }
  return buildDefaultFixPrompt(context, strategy);
}

function buildDefaultFixPrompt(context: ErrorContext, strategy: FixStrategy): FixPromptResult {
  const errorSummary = `[${context.error.code}] ${context.error.message}`;
  const files = context.previousOutput.files.map(f => f.path).join(', ');
  return {
    systemPrompt: `You are an expert developer fixing errors. Strategy: ${strategy.description}`,
    userPrompt: `${strategy.promptTemplate}\n\nError: ${errorSummary}\n\nFiles: ${files}\n\nAttempt ${context.attempt}. Fix the error and return corrected output.`,
    focusFiles: context.previousOutput.files.map(f => f.path),
  };
}

export function createStrategyHistory(): StrategyHistory[] {
  return [];
}

export function updateStrategyHistory(
  history: StrategyHistory[],
  strategyName: string,
  success: boolean,
  error?: string,
): StrategyHistory[] {
  const existing = history.find(h => h.strategyName === strategyName);
  if (existing) {
    existing.attempts++;
    if (success) existing.successes++;
    else existing.failures++;
    if (error) existing.lastError = error;
    return history;
  }
  return [...history, {
    strategyName,
    attempts: 1,
    successes: success ? 1 : 0,
    failures: success ? 0 : 1,
    lastError: error,
  }];
}
