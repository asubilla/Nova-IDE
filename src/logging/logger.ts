export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  agentId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  outputs: ('console' | 'file' | 'remote')[];
  filePath?: string;
  maxFileSizeMB?: number;
  maxFiles?: number;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };

export class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(context?: string, config?: Partial<LoggerConfig>) {
    this.config = {
      level: 'info', format: 'json', outputs: ['console'],
      maxFileSizeMB: 10, maxFiles: 5, ...config,
    };
    if (this.config.outputs.includes('file')) {
      this.flushInterval = setInterval(() => this.flush(), 5000);
    }
  }

  debug(message: string, metadata?: Record<string, any>): void { this.log('debug', message, metadata); }
  info(message: string, metadata?: Record<string, any>): void { this.log('info', message, metadata); }
  warn(message: string, metadata?: Record<string, any>): void { this.log('warn', message, metadata); }
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('error', message, { ...metadata, error: error?.message, stack: error?.stack });
  }
  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('fatal', message, { ...metadata, error: error?.message, stack: error?.stack });
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(), level, message, context: metadata?.context,
      correlationId: metadata?.correlationId, agentId: metadata?.agentId,
      sessionId: metadata?.sessionId, metadata, stack: metadata?.stack,
    };
    if (this.config.outputs.includes('console')) this.writeConsole(entry);
    if (this.config.outputs.includes('file')) this.buffer.push(entry);
  }

  private writeConsole(entry: LogEntry): void {
    const colors: Record<string, string> = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', fatal: '\x1b[35m' };
    const reset = '\x1b[0m';
    const prefix = `${colors[entry.level]}[${entry.level.toUpperCase()}]${reset}`;
    const ctx = entry.context ? ` [${entry.context}]` : '';
    const corr = entry.correlationId ? ` (${entry.correlationId})` : '';
    console.log(`${prefix}${ctx}${corr} ${entry.message}`);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);
    for (const entry of entries) {
      const line = this.config.format === 'json' ? JSON.stringify(entry) : this.formatText(entry);
      // In production, write to file using fs.appendFileSync or a stream
    }
  }

  private formatText(entry: LogEntry): string {
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.context || ''} ${entry.message}`;
  }

  child(context: string): Logger {
    return new Logger(context, this.config);
  }

  setCorrelationId(correlationId: string): Logger {
    const child = this.child(this.config.level);
    return child;
  }

  destroy(): void {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flush();
  }
}

export function createLogger(context?: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(context, config);
}

export const defaultLogger = createLogger('system', { level: (process.env.LOG_LEVEL as LogLevel) || 'info' });
