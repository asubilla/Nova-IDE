import { EventEmitter } from 'events';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest';

export interface TestFile {
  path: string;
  framework: TestFramework;
  name: string;
}

export interface TestResult {
  id: string;
  name: string;
  file: string;
  framework: TestFramework;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  stack?: string;
  assertionCount?: number;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  duration: number;
  coverage?: CoverageResult;
}

export interface CoverageResult {
  lines: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

export interface RunOptions {
  testPattern?: string;
  timeout?: number;
  parallel?: boolean;
  maxWorkers?: number;
  bail?: boolean;
  coverage?: boolean;
  verbose?: boolean;
  env?: Record<string, string>;
}

export interface WatchCallback {
  (event: 'started', file: string): void;
  (event: 'completed', result: TestResult): void;
  (event: 'error', error: Error): void;
}

export class TestRunner extends EventEmitter {
  private testProcess: ChildProcess | null = null;
  private watchMode = false;
  private lastResults: TestResult[] = [];
  private lastSummary: TestSummary | null = null;
  private lastCoverage: CoverageResult | null = null;
  private detectedFramework: TestFramework | null = null;

  constructor() {
    super();
  }

  async discoverTests(projectPath: string): Promise<TestFile[]> {
    const resolved = path.resolve(projectPath);
    const files: TestFile[] = [];
    const patterns: Array<{ pattern: RegExp; framework: TestFramework }> = [
      { pattern: /\.test\.(ts|tsx|js|jsx)$/, framework: 'jest' },
      { pattern: /\.spec\.(ts|tsx|js|jsx)$/, framework: 'jest' },
      { pattern: /\.test\.(ts|tsx|js|jsx)$/, framework: 'vitest' },
      { pattern: /\.spec\.(ts|tsx|js|jsx)$/, framework: 'vitest' },
      { pattern: /\.test\.py$/, framework: 'pytest' },
      { pattern: /test_.*\.py$/, framework: 'pytest' },
    ];

    const detected = this.detectFramework(resolved);

    const walk = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            for (const { pattern, framework } of patterns) {
              if (pattern.test(entry.name) && (!detected || framework === detected)) {
                files.push({
                  path: fullPath,
                  framework,
                  name: path.relative(resolved, fullPath),
                });
                break;
              }
            }
          }
        }
      } catch {
        // skip unreadable directories
      }
    };

    walk(resolved);
    return files;
  }

  async runTests(testFiles?: string[], options?: RunOptions): Promise<TestSummary> {
    const opts: RunOptions = { timeout: 30000, parallel: false, bail: false, coverage: false, verbose: true, ...options };
    const framework = this.detectedFramework ?? 'jest';
    this.lastResults = [];
    this.lastCoverage = null;

    const startTime = Date.now();

    return new Promise<TestSummary>((resolve, reject) => {
      const args = this.buildArgs(framework, testFiles, opts);
      const executable = this.getExecutable(framework);
      const cwd = process.cwd();

      this.testProcess = spawn(executable, args, {
        cwd,
        env: { ...process.env, ...opts.env, FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      this.testProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      this.testProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      this.testProcess.on('error', (err) => {
        this.testProcess = null;
        reject(err);
      });

      this.testProcess.on('exit', (code) => {
        this.testProcess = null;
        const duration = Date.now() - startTime;

        const results = this.parseOutput(framework, stdout, stderr);
        this.lastResults = results;

        const summary = this.buildSummary(results, duration);
        this.lastSummary = summary;

        if (opts.coverage && stdout) {
          this.lastCoverage = this.parseCoverage(framework, stdout);
          summary.coverage = this.lastCoverage ?? undefined;
        }

        this.emit('testsComplete', summary);
        resolve(summary);
      });

      if (opts.timeout && opts.timeout > 0) {
        setTimeout(() => {
          if (this.testProcess) {
            this.testProcess.kill('SIGTERM');
            this.testProcess = null;
            reject(new Error(`Test run timed out after ${opts.timeout}ms`));
          }
        }, opts.timeout);
      }
    });
  }

  async runSingleTest(testFile: string, testName: string): Promise<TestResult> {
    const resolved = path.resolve(testFile);
    const framework = this.detectedFramework ?? 'jest';
    const startTime = Date.now();

    return new Promise<TestResult>((resolve, reject) => {
      const args = this.buildSingleTestArgs(framework, resolved, testName);
      const executable = this.getExecutable(framework);

      this.testProcess = spawn(executable, args, {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      this.testProcess.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      this.testProcess.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
      this.testProcess.on('error', (err) => { this.testProcess = null; reject(err); });
      this.testProcess.on('exit', () => {
        this.testProcess = null;
        const duration = Date.now() - startTime;
        const result: TestResult = {
          id: this.generateId(),
          name: testName,
          file: resolved,
          framework,
          status: this.parseSingleTestStatus(framework, stdout, stderr),
          duration,
          error: this.parseSingleTestError(framework, stdout, stderr),
        };
        this.emit('testComplete', result);
        resolve(result);
      });
    });
  }

  async getTestResults(): Promise<TestResult[]> {
    return [...this.lastResults];
  }

  getTestSummary(): TestSummary | null {
    return this.lastSummary;
  }

  watchTests(callback: (event: string, data: unknown) => void): void {
    this.watchMode = true;
    const framework = this.detectedFramework ?? 'jest';
    const args = this.buildWatchArgs(framework);

    this.testProcess = spawn(this.getExecutable(framework), args, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.testProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Tests:')) {
        callback('testsComplete', this.parseOutput(framework, output, ''));
      } else {
        callback('output', output);
      }
    });

    this.testProcess.stderr?.on('data', (data: Buffer) => {
      callback('stderr', data.toString());
    });

    this.testProcess.on('error', (err) => {
      callback('error', err);
    });

    this.testProcess.on('exit', (code) => {
      callback('exit', { code });
    });
  }

  async getCoverage(): Promise<CoverageResult | null> {
    return this.lastCoverage;
  }

  supportedFrameworks(): TestFramework[] {
    return ['jest', 'vitest', 'mocha', 'pytest'];
  }

  stop(): void {
    if (this.testProcess) {
      this.testProcess.kill('SIGTERM');
      this.testProcess = null;
    }
    this.watchMode = false;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private detectFramework(projectPath: string): TestFramework | null {
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
        if (allDeps.vitest) return 'vitest';
        if (allDeps.jest || allDeps['@jest/core'] || allDeps['ts-jest']) return 'jest';
        if (allDeps.mocha) return 'mocha';
      }
    } catch {
      // ignore
    }
    const pytestCfg = ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini'];
    for (const file of pytestCfg) {
      if (fs.existsSync(path.join(projectPath, file))) return 'pytest';
    }
    return null;
  }

  private getExecutable(framework: TestFramework): string {
    switch (framework) {
      case 'jest': return 'npx';
      case 'vitest': return 'npx';
      case 'mocha': return 'npx';
      case 'pytest': return 'python';
    }
  }

  private buildArgs(framework: TestFramework, testFiles?: string[], options?: RunOptions): string[] {
    const args: string[] = [];
    switch (framework) {
      case 'jest':
        args.push('jest', '--no-cache');
        if (testFiles && testFiles.length > 0) args.push(...testFiles);
        if (options?.bail) args.push('--bail');
        if (options?.verbose) args.push('--verbose');
        if (options?.coverage) args.push('--coverage');
        if (options?.maxWorkers) args.push(`--maxWorkers=${options.maxWorkers}`);
        if (options?.testPattern) args.push('--testPathPattern', options.testPattern);
        break;
      case 'vitest':
        args.push('vitest', 'run');
        if (testFiles && testFiles.length > 0) args.push(...testFiles);
        if (options?.bail) args.push('--bail');
        if (options?.coverage) args.push('--coverage');
        break;
      case 'mocha':
        args.push('mocha');
        if (testFiles && testFiles.length > 0) args.push(...testFiles);
        if (options?.timeout) args.push(`--timeout`, String(options.timeout));
        break;
      case 'pytest':
        args.push('-m', 'pytest');
        if (testFiles && testFiles.length > 0) args.push(...testFiles);
        if (options?.verbose) args.push('-v');
        if (options?.bail) args.push('-x');
        if (options?.testPattern) args.push('-k', options.testPattern);
        break;
    }
    return args;
  }

  private buildSingleTestArgs(framework: TestFramework, testFile: string, testName: string): string[] {
    switch (framework) {
      case 'jest':
        return ['jest', '--no-cache', '--verbose', testFile, '-t', testName];
      case 'vitest':
        return ['vitest', 'run', '--reporter=verbose', testFile, '-t', testName];
      case 'mocha':
        return ['mocha', '--timeout', '10000', testFile, '--grep', testName];
      case 'pytest':
        return ['-m', 'pytest', '-v', testFile, '-k', testName];
    }
  }

  private buildWatchArgs(framework: TestFramework): string[] {
    switch (framework) {
      case 'jest': return ['jest', '--watch', '--no-cache'];
      case 'vitest': return ['vitest', '--watch'];
      case 'mocha': return ['mocha', '--watch'];
      case 'pytest': return ['-m', 'pytest', '--timeout', '10', '-x'];
    }
  }

  private parseOutput(framework: TestFramework, stdout: string, stderr: string): TestResult[] {
    const results: TestResult[] = [];
    const combined = stdout + stderr;

    switch (framework) {
      case 'jest':
      case 'vitest':
        for (const line of combined.split('\n')) {
          if (line.includes('✓') || line.includes(' PASS ') || line.includes(' √ ')) {
            const match = line.match(/[✓√]\s+(.+)/);
            if (match) {
              results.push({
                id: this.generateId(),
                name: match[1].trim(),
                file: '',
                framework,
                status: 'passed',
                duration: 0,
              });
            }
          } else if (line.includes('✗') || line.includes(' FAIL ') || line.includes(' × ')) {
            const match = line.match(/[✗×]\s+(.+)/);
            if (match) {
              results.push({
                id: this.generateId(),
                name: match[1].trim(),
                file: '',
                framework,
                status: 'failed',
                duration: 0,
              });
            }
          } else if (line.includes('- ') || line.includes(' ○ ')) {
            const match = line.match(/[-○]\s+(.+)/);
            if (match) {
              results.push({
                id: this.generateId(),
                name: match[1].trim(),
                file: '',
                framework,
                status: 'skipped',
                duration: 0,
              });
            }
          }
        }
        break;
      case 'mocha':
        for (const line of combined.split('\n')) {
          if (line.includes('  ✓')) {
            results.push({
              id: this.generateId(),
              name: line.replace(/\s+✓\s+/, '').trim(),
              file: '',
              framework,
              status: 'passed',
              duration: 0,
            });
          } else if (line.includes('  ✗')) {
            results.push({
              id: this.generateId(),
              name: line.replace(/\s+✗\s+/, '').trim(),
              file: '',
              framework,
              status: 'failed',
              duration: 0,
            });
          }
        }
        break;
      case 'pytest':
        for (const line of combined.split('\n')) {
          if (line.includes(' PASSED')) {
            results.push({
              id: this.generateId(),
              name: line.split('::').pop()?.split(' ')[0] ?? 'unknown',
              file: '',
              framework,
              status: 'passed',
              duration: 0,
            });
          } else if (line.includes(' FAILED')) {
            results.push({
              id: this.generateId(),
              name: line.split('::').pop()?.split(' ')[0] ?? 'unknown',
              file: '',
              framework,
              status: 'failed',
              duration: 0,
            });
          } else if (line.includes(' SKIPPED')) {
            results.push({
              id: this.generateId(),
              name: line.split('::').pop()?.split(' ')[0] ?? 'unknown',
              file: '',
              framework,
              status: 'skipped',
              duration: 0,
            });
          }
        }
        break;
    }

    return results;
  }

  private parseSingleTestStatus(framework: TestFramework, stdout: string, stderr: string): 'passed' | 'failed' | 'skipped' {
    const combined = stdout + stderr;
    if (combined.includes('FAIL') || combined.includes('failed') || combined.includes('Error')) return 'failed';
    if (combined.includes('PASS') || combined.includes('passed')) return 'passed';
    return 'skipped';
  }

  private parseSingleTestError(framework: TestFramework, stdout: string, stderr: string): string | undefined {
    const combined = stdout + stderr;
    const errorMatch = combined.match(/Error[:\s]+(.+)/i);
    return errorMatch ? errorMatch[1].trim() : undefined;
  }

  private parseCoverage(framework: TestFramework, stdout: string): CoverageResult | null {
    const defaultResult: CoverageResult = {
      lines: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      statements: { total: 0, covered: 0, pct: 0 },
    };

    const pctMatch = stdout.match(/(?:Lines|Statements|Branches|Functions)\s*:\s*(\d+\.?\d*)%/);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      defaultResult.lines.pct = pct;
      defaultResult.functions.pct = pct;
      defaultResult.branches.pct = pct;
      defaultResult.statements.pct = pct;
    }

    const totalMatch = stdout.match(/All files\s*\|\s*(\d+\.?\d*)\s*\|\s*(\d+\.?\d*)\s*\|\s*(\d+\.?\d*)\s*\|\s*(\d+\.?\d*)/);
    if (totalMatch) {
      defaultResult.lines.pct = parseFloat(totalMatch[1]);
      defaultResult.branches.pct = parseFloat(totalMatch[2]);
      defaultResult.functions.pct = parseFloat(totalMatch[3]);
      defaultResult.statements.pct = parseFloat(totalMatch[4]);
    }

    return defaultResult;
  }

  private buildSummary(results: TestResult[], duration: number): TestSummary {
    return {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      pending: results.filter((r) => r.status === 'pending').length,
      duration,
    };
  }

  private generateId(): string {
    return `test-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
