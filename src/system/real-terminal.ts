import { spawn, exec, ChildProcess, SpawnOptions } from 'child_process';
import * as os from 'os';

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  maxBuffer?: number;
}

export interface TerminalProcess {
  pid: number;
  command: string;
  startTime: Date;
}

export class RealTerminal {
  private cwd: string;
  private env: Record<string, string>;
  private history: string[] = [];
  private runningProcess: ChildProcess | null = null;
  private runningPid: number | null = null;
  private historyIndex: number = -1;
  private rows: number = 24;
  private cols: number = 80;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
    this.env = { ...process.env } as Record<string, string>;
  }

  async execute(command: string, options?: TerminalOptions): Promise<TerminalResult> {
    this.history.push(command);
    this.historyIndex = this.history.length;

    const execOptions: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeout: number;
      maxBuffer: number;
      encoding: BufferEncoding;
      shell: string;
    } = {
      cwd: options?.cwd || this.cwd,
      env: { ...this.env, ...options?.env },
      timeout: options?.timeout || 120000,
      maxBuffer: options?.maxBuffer || 1024 * 1024 * 10,
      encoding: 'utf-8',
      shell: this.getShell(),
    };

    return new Promise((resolve) => {
      exec(command, execOptions, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? error.code ?? 1 : 0,
          signal: error?.signal || null,
        });
      });
    });
  }

  executeStream(command: string, callback: (data: string, stream: 'stdout' | 'stderr') => void): ChildProcess {
    this.history.push(command);
    this.historyIndex = this.history.length;

    const child = spawn(command, [], {
      cwd: this.cwd,
      env: this.env as NodeJS.ProcessEnv,
      shell: this.getShell(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.runningProcess = child;
    this.runningPid = child.pid || null;

    child.stdout?.on('data', (data: Buffer) => {
      callback(data.toString(), 'stdout');
    });

    child.stderr?.on('data', (data: Buffer) => {
      callback(data.toString(), 'stderr');
    });

    child.on('close', () => {
      this.runningProcess = null;
      this.runningPid = null;
    });

    return child;
  }

  spawn(command: string, args: string[] = [], options?: SpawnOptions): ChildProcess {
    const child = spawn(command, args, {
      cwd: options?.cwd || this.cwd,
      env: { ...this.env, ...options?.env } as NodeJS.ProcessEnv,
      stdio: options?.stdio || 'pipe',
      shell: options?.shell !== undefined ? options.shell : this.getShell(),
    });

    this.runningProcess = child;
    this.runningPid = child.pid || null;

    child.on('close', () => {
      this.runningProcess = null;
      this.runningPid = null;
    });

    return child;
  }

  kill(pid?: number): boolean {
    const targetPid = pid || this.runningPid;
    if (!targetPid) return false;

    try {
      if (os.platform() === 'win32') {
        exec(`taskkill /PID ${targetPid} /T /F`, (error) => {
          if (error) console.error('Failed to kill process:', error.message);
        });
      } else {
        process.kill(targetPid, 'SIGTERM');
        setTimeout(() => {
          try {
            process.kill(targetPid, 'SIGKILL');
          } catch {
            // Process already dead
          }
        }, 5000);
      }
      return true;
    } catch {
      return false;
    }
  }

  getCwd(): string {
    return this.cwd;
  }

  setCwd(path: string): void {
    this.cwd = path;
  }

  getEnv(): Record<string, string> {
    return { ...this.env };
  }

  setEnv(key: string, value: string): void {
    this.env[key] = value;
  }

  getHistory(): string[] {
    return [...this.history];
  }

  getHistoryItem(index: number): string | null {
    if (index >= 0 && index < this.history.length) {
      return this.history[index];
    }
    return null;
  }

  clear(): void {
    this.history = [];
    this.historyIndex = -1;
  }

  resize(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
  }

  getDimensions(): { rows: number; cols: number } {
    return { rows: this.rows, cols: this.cols };
  }

  isRunning(): boolean {
    return this.runningProcess !== null && this.runningPid !== null;
  }

  getPid(): number | null {
    return this.runningPid;
  }

  sendSignal(signal: NodeJS.Signals): boolean {
    if (!this.runningPid) return false;

    try {
      process.kill(this.runningPid, signal);
      return true;
    } catch {
      return false;
    }
  }

  private getShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  async commandExists(command: string): Promise<boolean> {
    const platform = os.platform();
    const checkCommand = platform === 'win32' ? 'where' : 'which';

    try {
      const result = await this.execute(`${checkCommand} ${command}`);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getSystemInfo(): Promise<{
    platform: string;
    arch: string;
    hostname: string;
    shell: string;
    nodeVersion: string;
  }> {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      shell: this.getShell(),
      nodeVersion: process.version,
    };
  }

  stdinWrite(data: string): boolean {
    if (this.runningProcess && this.runningProcess.stdin) {
      return this.runningProcess.stdin.write(data);
    }
    return false;
  }

  stdinEnd(): void {
    if (this.runningProcess && this.runningProcess.stdin) {
      this.runningProcess.stdin.end();
    }
  }
}
