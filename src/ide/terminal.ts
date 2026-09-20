import { spawn, ChildProcess, execSync } from "child_process";
import * as os from "os";

export interface TerminalOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  encoding?: BufferEncoding;
}

export interface TerminalOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type OutputCallback = (data: string, stream: "stdout" | "stderr") => void;

const DEFAULT_SHELLS: Record<string, string> = {
  win32: "powershell.exe",
  linux: "/bin/bash",
  darwin: "/bin/zsh",
};

export class Terminal {
  private cwd: string;
  private history: string[] = [];
  private output: string = "";
  private currentProcess: ChildProcess | null = null;
  private options: TerminalOptions;

  constructor(options: TerminalOptions = {}) {
    this.options = options;
    this.cwd = options.cwd || process.cwd();
    this.loadHistory();
  }

  execute(command: string): Promise<TerminalOutput> {
    return new Promise((resolve, reject) => {
      this.addHistory(command);

      const shell = this.options.shell || DEFAULT_SHELLS[os.platform()] || "sh";
      const args = os.platform() === "win32" ? ["-NoProfile", "-Command", command] : ["-c", command];

      const child = spawn(shell, args, {
        cwd: this.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.currentProcess = child;

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString(this.options.encoding || "utf-8");
        stdout += text;
        this.output += text;
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString(this.options.encoding || "utf-8");
        stderr += text;
        this.output += text;
      });

      child.on("close", (code) => {
        this.currentProcess = null;
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      child.on("error", (err) => {
        this.currentProcess = null;
        reject(err);
      });
    });
  }

  executeAsync(command: string, callback: OutputCallback): Promise<number> {
    return new Promise((resolve, reject) => {
      this.addHistory(command);

      const shell = this.options.shell || DEFAULT_SHELLS[os.platform()] || "sh";
      const args = os.platform() === "win32" ? ["-NoProfile", "-Command", command] : ["-c", command];

      const child = spawn(shell, args, {
        cwd: this.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.currentProcess = child;

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString(this.options.encoding || "utf-8");
        this.output += text;
        callback(text, "stdout");
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString(this.options.encoding || "utf-8");
        this.output += text;
        callback(text, "stderr");
      });

      child.on("close", (code) => {
        this.currentProcess = null;
        resolve(code ?? 1);
      });

      child.on("error", (err) => {
        this.currentProcess = null;
        reject(err);
      });
    });
  }

  getOutput(): string {
    return this.output;
  }

  clear(): void {
    this.output = "";
  }

  setWorkingDirectory(dirPath: string): void {
    this.cwd = dirPath;
  }

  getWorkingDirectory(): string {
    return this.cwd;
  }

  getHistory(): string[] {
    return [...this.history];
  }

  addHistory(command: string): void {
    if (command.trim() && this.history[this.history.length - 1] !== command) {
      this.history.push(command);
      if (this.history.length > 1000) {
        this.history = this.history.slice(-1000);
      }
      this.saveHistory();
    }
  }

  resize(rows: number, cols: number): void {
    if (this.currentProcess?.stdin && typeof (this.currentProcess.stdin as any).setRawMode === "function") {
      try {
        this.currentProcess.stdout?.emit("resize", { rows, cols });
      } catch {
        // Resize not supported
      }
    }
  }

  kill(): void {
    if (this.currentProcess) {
      if (os.platform() === "win32") {
        execSync(`taskkill /pid ${this.currentProcess.pid} /T /F`, { stdio: "ignore" });
      } else {
        this.currentProcess.kill("SIGTERM");
        setTimeout(() => {
          if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill("SIGKILL");
          }
        }, 2000);
      }
      this.currentProcess = null;
    }
  }

  isRunning(): boolean {
    return this.currentProcess !== null && !this.currentProcess.killed;
  }

  private loadHistory(): void {
    try {
      const historyPath = this.getHistoryPath();
      if (require("fs").existsSync(historyPath)) {
        const data = require("fs").readFileSync(historyPath, "utf-8");
        this.history = JSON.parse(data);
      }
    } catch {
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      const historyPath = this.getHistoryPath();
      const dir = require("path").dirname(historyPath);
      if (!require("fs").existsSync(dir)) {
        require("fs").mkdirSync(dir, { recursive: true });
      }
      require("fs").writeFileSync(historyPath, JSON.stringify(this.history, null, 2));
    } catch {
      // Silently fail
    }
  }

  private getHistoryPath(): string {
    const homeDir = os.homedir();
    return require("path").join(homeDir, ".nova", "terminal-history.json");
  }
}
