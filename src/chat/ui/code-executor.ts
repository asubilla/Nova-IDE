import type { SupportedLanguage } from './code-highlighter.js';

export type ExecutionStatus = 'success' | 'error' | 'timeout' | 'memory-exceeded';

export interface ExecutionResult {
  status: ExecutionStatus;
  output: string;
  error?: string;
  executionTimeMs: number;
  language: SupportedLanguage;
  timestamp: Date;
  memoryUsageBytes?: number;
  lineErrors?: Array<{ line: number; message: string }>;
}

export interface ExecutionConfig {
  timeoutMs?: number;
  maxMemoryBytes?: number;
  maxOutputLength?: number;
}

export interface ExecutionHistoryEntry {
  id: string;
  code: string;
  language: SupportedLanguage;
  result: ExecutionResult;
}

const DEFAULT_EXECUTION_CONFIG: Required<ExecutionConfig> = {
  timeoutMs: 10000,
  maxMemoryBytes: 64 * 1024 * 1024,
  maxOutputLength: 1024 * 1024,
};

let executionCounter = 0;

export class CodeExecutor {
  private config: Required<ExecutionConfig>;
  private history: ExecutionHistoryEntry[] = [];
  private maxHistorySize: number;
  private activeExecutions: Map<string, AbortController> = new Map();

  constructor(config?: ExecutionConfig & { maxHistorySize?: number }) {
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config };
    this.maxHistorySize = config?.maxHistorySize ?? 100;
  }

  async execute(
    code: string,
    language: SupportedLanguage,
    timeout?: number
  ): Promise<ExecutionResult> {
    const effectiveTimeout = timeout ?? this.config.timeoutMs;
    const id = `exec-${++executionCounter}`;
    const controller = new AbortController();
    this.activeExecutions.set(id, controller);

    const startTime = performance.now();

    try {
      let result: ExecutionResult;

      switch (language) {
        case 'javascript':
          result = await this.executeJavaScript(code, effectiveTimeout);
          break;
        case 'python':
          result = await this.executePython(code, effectiveTimeout);
          break;
        case 'bash':
          result = await this.executeBash(code, effectiveTimeout);
          break;
        case 'typescript':
          result = await this.executeJavaScript(code, effectiveTimeout);
          break;
        default:
          result = {
            status: 'error',
            output: '',
            error: `Execution not supported for language: ${language}`,
            executionTimeMs: performance.now() - startTime,
            language,
            timestamp: new Date(),
          };
          break;
      }

      result.executionTimeMs = performance.now() - startTime;

      this.addToHistory({
        id,
        code,
        language,
        result,
      });

      return result;
    } catch (error) {
      const elapsed = performance.now() - startTime;
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      const isMemory =
        error instanceof Error && error.message.includes('memory');

      const result: ExecutionResult = {
        status: isTimeout ? 'timeout' : isMemory ? 'memory-exceeded' : 'error',
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: elapsed,
        language,
        timestamp: new Date(),
      };

      this.addToHistory({
        id,
        code,
        language,
        result,
      });

      return result;
    } finally {
      this.activeExecutions.delete(id);
    }
  }

  async executeJavaScript(code: string, timeoutMs?: number): Promise<ExecutionResult> {
    const effectiveTimeout = timeoutMs ?? this.config.timeoutMs;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.setAttribute('sandbox', 'allow-scripts');

      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            status: 'timeout',
            output: '',
            error: `Execution timed out after ${effectiveTimeout}ms`,
            executionTimeMs: performance.now() - startTime,
            language: 'javascript',
            timestamp: new Date(),
          });
        }
      }, effectiveTimeout);

      const cleanup = () => {
        clearTimeout(timer);
        try {
          document.body.removeChild(iframe);
        } catch {
          /* already removed */
        }
      };

      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      if (!win) {
        resolved = true;
        cleanup();
        resolve({
          status: 'error',
          output: '',
          error: 'Failed to create execution sandbox',
          executionTimeMs: performance.now() - startTime,
          language: 'javascript',
          timestamp: new Date(),
        });
        return;
      }

      const capturedOutput: string[] = [];
      const sandbox = win as unknown as { console: { log: Function; error: Function; warn: Function }; eval: (code: string) => unknown };

      const wrapConsole = (target: typeof sandbox.console, prefix: string) => {
        const origLog = target.log;
        const origError = target.error;
        const origWarn = target.warn;

        (target as Record<string, unknown>).log = (...args: unknown[]) => {
          capturedOutput.push(
            args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')
          );
          origLog.apply(target, args as unknown[]);
        };
        (target as Record<string, unknown>).error = (...args: unknown[]) => {
          capturedOutput.push(
            `Error: ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')}`
          );
          origError.apply(target, args as unknown[]);
        };
        (target as Record<string, unknown>).warn = (...args: unknown[]) => {
          capturedOutput.push(
            `Warning: ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')}`
          );
          origWarn.apply(target, args as unknown[]);
        };
      };

      wrapConsole(sandbox.console, '');

      try {
        const result = sandbox.eval(code);

        if (result !== undefined) {
          capturedOutput.push(`=> ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`);
        }

        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            status: 'success',
            output: capturedOutput.join('\n'),
            executionTimeMs: performance.now() - startTime,
            language: 'javascript',
            timestamp: new Date(),
          });
        }
      } catch (e) {
        if (!resolved) {
          resolved = true;
          cleanup();
          const errorMsg = (e as Error).message;
          const lineMatch = errorMsg.match(/(\d+):(\d+)/);
          resolve({
            status: 'error',
            output: capturedOutput.join('\n'),
            error: errorMsg,
            executionTimeMs: performance.now() - startTime,
            language: 'javascript',
            timestamp: new Date(),
            lineErrors: lineMatch
              ? [{ line: parseInt(lineMatch[1], 10), message: errorMsg }]
              : [],
          });
        }
      }
    });
  }

  async executePython(code: string, timeoutMs?: number): Promise<ExecutionResult> {
    const effectiveTimeout = timeoutMs ?? this.config.timeoutMs;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          status: 'timeout',
          output: '',
          error: `Python execution timed out after ${effectiveTimeout}ms`,
          executionTimeMs: performance.now() - startTime,
          language: 'python',
          timestamp: new Date(),
        });
      }, effectiveTimeout);

      setTimeout(() => {
        clearTimeout(timer);

        const lines = code.split('\n');
        const output: string[] = [];
        const errors: Array<{ line: number; message: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.startsWith('#') || line === '') continue;

          if (line.startsWith('print(')) {
            const match = line.match(/print\((.+)\)/);
            if (match) {
              let content = match[1].trim();
              content = content.replace(/^["']|["']$/g, '');
              output.push(content);
            }
          } else if (line.match(/^[\w_]+\s*=/)) {
            continue;
          } else if (line.startsWith('def ') || line.startsWith('class ')) {
            continue;
          } else if (line.startsWith('import ') || line.startsWith('from ')) {
            continue;
          } else if (line.includes('print')) {
            const match = line.match(/print\((.+)\)/);
            if (match) {
              let content = match[1].trim();
              content = content.replace(/^["']|["']$/g, '');
              output.push(content);
            }
          } else if (line.match(/^\w+\(/)) {
            continue;
          } else if (line.startsWith('if ') || line.startsWith('for ') || line.startsWith('while ')) {
            continue;
          } else if (!line.startsWith('    ') && !line.startsWith('\t') && !line.endsWith(':')) {
            if (!line.startsWith('elif') && !line.startsWith('else') && !line.startsWith('except')) {
              errors.push({ line: i + 1, message: `SyntaxError: invalid syntax` });
            }
          }
        }

        resolve({
          status: errors.length > 0 ? 'error' : 'success',
          output: output.join('\n'),
          error: errors.length > 0 ? errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n') : undefined,
          executionTimeMs: performance.now() - startTime,
          language: 'python',
          timestamp: new Date(),
          lineErrors: errors.length > 0 ? errors : undefined,
        });
      }, 50);
    });
  }

  async executeBash(code: string, timeoutMs?: number): Promise<ExecutionResult> {
    const effectiveTimeout = timeoutMs ?? this.config.timeoutMs;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          status: 'timeout',
          output: '',
          error: `Bash execution timed out after ${effectiveTimeout}ms`,
          executionTimeMs: performance.now() - startTime,
          language: 'bash',
          timestamp: new Date(),
        });
      }, effectiveTimeout);

      setTimeout(() => {
        clearTimeout(timer);

        const lines = code.split('\n');
        const output: string[] = [];
        const errors: Array<{ line: number; message: string }> = [];
        const env: Record<string, string> = {};

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.startsWith('#') || line === '') continue;

          if (line.startsWith('echo ')) {
            let content = line.substring(5).trim();
            content = content.replace(/^["']|["']$/g, '');
            for (const [key, val] of Object.entries(env)) {
              content = content.replace(new RegExp(`\\$\\{?${key}\\}?`, 'g'), val);
            }
            output.push(content);
          } else if (line.startsWith('export ')) {
            const match = line.match(/export\s+(\w+)=(.+)/);
            if (match) {
              env[match[1]] = match[2].replace(/^["']|["']$/g, '');
            }
          } else if (line.startsWith('pwd')) {
            output.push('/workspace');
          } else if (line.startsWith('whoami')) {
            output.push('user');
          } else if (line.startsWith('date')) {
            output.push(new Date().toISOString());
          } else if (line.startsWith('uname')) {
            output.push('Nova-OS 1.0.0 x86_64');
          } else if (line.match(/^\w+=/)) {
            const match = line.match(/^(\w+)=(.+)/);
            if (match) {
              env[match[1]] = match[2].replace(/^["']|["']$/g, '');
            }
          } else if (line.startsWith('cat ') || line.startsWith('ls ') || line.startsWith('grep ') || line.startsWith('find ') || line.startsWith('mkdir ') || line.startsWith('rm ') || line.startsWith('cp ') || line.startsWith('mv ')) {
            errors.push({
              line: i + 1,
              message: `Command not available in sandbox: ${line.split(' ')[0]}`,
            });
          } else if (line.startsWith('curl ') || line.startsWith('wget ')) {
            errors.push({ line: i + 1, message: 'Network access is not allowed in sandbox' });
          } else if (line.startsWith('sudo ')) {
            errors.push({ line: i + 1, message: 'Root access is not allowed in sandbox' });
          } else if (line.match(/^(npm|pip|docker|git|node|python|ruby|java|gcc|make)\s/)) {
            output.push(`[sandbox] Simulated output for: ${line.split(' ')[0]}`);
          } else {
            errors.push({ line: i + 1, message: `Unknown command: ${line.split(' ')[0]}` });
          }
        }

        resolve({
          status: errors.length > 0 ? 'error' : 'success',
          output: output.join('\n'),
          error: errors.length > 0 ? errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n') : undefined,
          executionTimeMs: performance.now() - startTime,
          language: 'bash',
          timestamp: new Date(),
          lineErrors: errors.length > 0 ? errors : undefined,
        });
      }, 50);
    });
  }

  getExecutionHistory(): ExecutionHistoryEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  cancelExecution(id: string): boolean {
    const controller = this.activeExecutions.get(id);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(id);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [id, controller] of this.activeExecutions) {
      controller.abort();
    }
    this.activeExecutions.clear();
  }

  private addToHistory(entry: ExecutionHistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
}
