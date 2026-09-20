import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export enum ErrorCode {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  FILE_SYSTEM = 'FILE_SYSTEM',
  PROCESS = 'PROCESS',
  TIMEOUT = 'TIMEOUT',
  PERMISSION = 'PERMISSION',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  module?: string;
  operation?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorEntry {
  id: string;
  code: ErrorCode;
  message: string;
  stack?: string;
  context?: ErrorContext;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  handled: boolean;
}

export interface ErrorReport {
  id: string;
  code: ErrorCode;
  message: string;
  stack?: string;
  context?: ErrorContext;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  environment: {
    platform: string;
    nodeVersion: string;
    cwd: string;
    uptime: number;
  };
  history: ErrorEntry[];
}

const SEVERITY_MAP: Record<ErrorCode, 'low' | 'medium' | 'high' | 'critical'> = {
  [ErrorCode.VALIDATION]: 'medium',
  [ErrorCode.NETWORK]: 'high',
  [ErrorCode.FILE_SYSTEM]: 'medium',
  [ErrorCode.PROCESS]: 'high',
  [ErrorCode.TIMEOUT]: 'medium',
  [ErrorCode.PERMISSION]: 'critical',
  [ErrorCode.UNKNOWN]: 'medium',
};

export class GlobalErrorHandler extends EventEmitter {
  private errorHistory: ErrorEntry[] = [];
  private maxHistory: number = 5000;
  private errorCounts: Map<ErrorCode, number> = new Map();
  private startTime: number = Date.now();
  private logFilePath: string | null = null;

  constructor(logDir?: string) {
    super();
    if (logDir) {
      try {
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        this.logFilePath = path.join(logDir, `errors-${new Date().toISOString().slice(0, 10)}.log`);
      } catch {
        this.logFilePath = null;
      }
    }
    this.setupGlobalHandlers();
  }

  handleError(error: Error | string, context?: ErrorContext): ErrorEntry {
    const err = typeof error === 'string' ? new Error(error) : error;
    const code = this.classifyError(err);
    const severity = SEVERITY_MAP[code];

    const entry: ErrorEntry = {
      id: this.generateId(),
      code,
      message: err.message,
      stack: err.stack,
      context,
      timestamp: new Date(),
      severity,
      handled: true,
    };

    this.recordEntry(entry);
    this.logError(entry);
    this.emit('errorHandled', entry);
    return entry;
  }

  handleUncaughtException(error: Error): ErrorEntry {
    const entry: ErrorEntry = {
      id: this.generateId(),
      code: ErrorCode.UNKNOWN,
      message: error.message,
      stack: error.stack,
      context: { module: 'global', operation: 'uncaughtException' },
      timestamp: new Date(),
      severity: 'critical',
      handled: false,
    };

    this.recordEntry(entry);
    this.logError(entry);
    this.emit('uncaughtException', entry);
    return entry;
  }

  handleUnhandledRejection(reason: unknown): ErrorEntry {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    const entry: ErrorEntry = {
      id: this.generateId(),
      code: ErrorCode.UNKNOWN,
      message,
      stack,
      context: { module: 'global', operation: 'unhandledRejection' },
      timestamp: new Date(),
      severity: 'high',
      handled: false,
    };

    this.recordEntry(entry);
    this.logError(entry);
    this.emit('unhandledRejection', entry);
    return entry;
  }

  handlePromiseRejection<T>(promise: Promise<T>, handler?: (error: Error) => void): Promise<T> {
    return promise.catch((reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.handlePromiseError(err);
      if (handler) {
        handler(err);
      }
      throw err;
    });
  }

  private handlePromiseError(error: Error): ErrorEntry {
    const entry: ErrorEntry = {
      id: this.generateId(),
      code: this.classifyError(error),
      message: error.message,
      stack: error.stack,
      context: { module: 'promise', operation: 'rejected' },
      timestamp: new Date(),
      severity: 'high',
      handled: true,
    };

    this.recordEntry(entry);
    this.logError(entry);
    this.emit('promiseRejection', entry);
    return entry;
  }

  logError(entry: ErrorEntry): void {
    if (!this.logFilePath) return;
    try {
      const line = JSON.stringify({
        id: entry.id,
        code: entry.code,
        severity: entry.severity,
        message: entry.message,
        context: entry.context,
        timestamp: entry.timestamp.toISOString(),
      }) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf-8');
    } catch {
      // logging should never throw
    }
  }

  showErrorNotification(error: Error | ErrorEntry): string {
    const entry = 'code' in error ? error as ErrorEntry : this.handleError(error);
    return `[${entry.severity.toUpperCase()}] [${entry.code}] ${entry.message}`;
  }

  getErrorHistory(limit?: number): ErrorEntry[] {
    if (limit) return this.errorHistory.slice(-limit);
    return [...this.errorHistory];
  }

  clearErrorHistory(): void {
    this.errorHistory = [];
    this.errorCounts.clear();
    this.emit('historyCleared');
  }

  getErrorStats(): Record<string, unknown> {
    const total = this.errorHistory.length;
    const byCode: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byModule: Record<string, number> = {};

    for (const entry of this.errorHistory) {
      byCode[entry.code] = (byCode[entry.code] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      const mod = entry.context?.module ?? 'unknown';
      byModule[mod] = (byModule[mod] || 0) + 1;
    }

    return {
      total,
      handled: this.errorHistory.filter((e) => e.handled).length,
      unhandled: this.errorHistory.filter((e) => !e.handled).length,
      byCode,
      bySeverity,
      byModule,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  createErrorReport(error: Error | ErrorEntry): ErrorReport {
    const entry = 'code' in error ? error as ErrorEntry : this.handleError(error);
    return {
      id: entry.id,
      code: entry.code,
      message: entry.message,
      stack: entry.stack,
      context: entry.context,
      timestamp: entry.timestamp,
      severity: entry.severity,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        cwd: process.cwd(),
        uptime: Date.now() - this.startTime,
      },
      history: this.errorHistory.slice(-20),
    };
  }

  destroy(): void {
    if (this._boundUncaughtException) {
      process.removeListener('uncaughtException', this._boundUncaughtException);
    }
    if (this._boundRejection) {
      process.removeListener('unhandledRejection', this._boundRejection);
    }
  }

  private _boundUncaughtException: ((error: Error) => void) | null = null;
  private _boundRejection: ((reason: unknown) => void) | null = null;

  // ── Private ─────────────────────────────────────────────────────────

  private setupGlobalHandlers(): void {
    this._boundUncaughtException = this.handleUncaughtException.bind(this) as (error: Error) => void;
    this._boundRejection = this.handleUnhandledRejection.bind(this) as (reason: unknown) => void;
    process.on('uncaughtException', this._boundUncaughtException);
    process.on('unhandledRejection', this._boundRejection);
  }

  private classifyError(error: Error): ErrorCode {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name === 'validationerror' || msg.includes('validation') || msg.includes('invalid')) {
      return ErrorCode.VALIDATION;
    }
    if (name === 'econnrefused' || name === 'enotfound' || name === 'econnreset' || msg.includes('network') || msg.includes('fetch') || msg.includes('socket')) {
      return ErrorCode.NETWORK;
    }
    if (name === 'enoent' || name === 'eisdir' || name === 'enotdir' || name === 'eexist' || msg.includes('file') || msg.includes('directory') || msg.includes('path')) {
      return ErrorCode.FILE_SYSTEM;
    }
    if (name === 'sigkill' || name === 'sigterm' || msg.includes('process') || msg.includes('spawn') || msg.includes('exec')) {
      return ErrorCode.PROCESS;
    }
    if (name === 'etimedout' || name === 'esockettimedout' || msg.includes('timeout') || msg.includes('timed out')) {
      return ErrorCode.TIMEOUT;
    }
    if (name === 'eperm' || name === 'eacces' || msg.includes('permission') || msg.includes('access denied') || msg.includes('forbidden')) {
      return ErrorCode.PERMISSION;
    }
    return ErrorCode.UNKNOWN;
  }

  private recordEntry(entry: ErrorEntry): void {
    this.errorHistory.push(entry);
    if (this.errorHistory.length > this.maxHistory) {
      this.errorHistory.shift();
    }
    this.errorCounts.set(entry.code, (this.errorCounts.get(entry.code) || 0) + 1);
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `err-${timestamp}-${random}`;
  }
}

let _globalHandler: GlobalErrorHandler | null = null;

export function getGlobalErrorHandler(logDir?: string): GlobalErrorHandler {
  if (!_globalHandler) {
    _globalHandler = new GlobalErrorHandler(logDir);
  }
  return _globalHandler;
}
