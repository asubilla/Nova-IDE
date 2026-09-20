import { SystemLogger, type LogEntry } from './system-logger';

export interface MiddlewareRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  ip?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

export interface MiddlewareResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RequestLogEntry {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  ip?: string;
  userId?: string;
}

export interface RequestStats {
  totalRequests: number;
  totalErrors: number;
  avgDuration: number;
  slowRequestCount: number;
  byMethod: Record<string, number>;
  byStatusCode: Record<string, number>;
  slowestRequests: RequestLogEntry[];
}

export class MiddlewareLogger {
  private requestTimers: Map<string, number> = new Map();
  private requestLogs: RequestLogEntry[] = [];
  private readonly maxLogs = 5000;

  constructor(private readonly systemLogger: SystemLogger) {}

  logRequest(req: MiddlewareRequest, res: MiddlewareResponse, next?: () => void): LogEntry {
    const requestId = req.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.requestTimers.set(requestId, Date.now());

    const entry = this.systemLogger.info('api', `${req.method} ${req.url}`, {
      requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userId: req.userId,
      sessionId: req.sessionId,
      query: req.query,
      body: req.body,
      statusCode: res.statusCode,
    });

    if (next) next();
    return entry;
  }

  logResponse(req: MiddlewareRequest, res: MiddlewareResponse, duration: number): LogEntry {
    const requestId = req.requestId ?? 'unknown';
    this.requestTimers.delete(requestId);

    const logEntry: RequestLogEntry = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      timestamp: Date.now(),
      ip: req.ip,
      userId: req.userId,
    };
    this.requestLogs.push(logEntry);
    if (this.requestLogs.length > this.maxLogs) {
      this.requestLogs = this.requestLogs.slice(this.requestLogs.length - this.maxLogs);
    }

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    return this.systemLogger.log(level, 'api', `${req.method} ${req.url} ${res.statusCode} (${duration}ms)`, {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userId: req.userId,
    });
  }

  logError(req: MiddlewareRequest, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    const requestId = req.requestId ?? 'unknown';

    this.requestTimers.delete(requestId);

    return this.systemLogger.error('api', `Request error: ${req.method} ${req.url} - ${errorMsg}`, {
      requestId,
      method: req.method,
      url: req.url,
      error: errorMsg,
      stack,
      ip: req.ip,
      userId: req.userId,
    });
  }

  logAuth(req: MiddlewareRequest, authenticated: boolean): LogEntry {
    const level = authenticated ? 'debug' : 'warn';
    return this.systemLogger.log(level, 'security', `Auth check: ${req.method} ${req.url} - ${authenticated ? 'passed' : 'failed'}`, {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      authenticated,
      ip: req.ip,
      userId: req.userId,
    });
  }

  logRateLimit(req: MiddlewareRequest, limited: boolean): LogEntry {
    return this.systemLogger.log(limited ? 'warn' : 'debug', 'security', `Rate limit: ${req.method} ${req.url} - ${limited ? 'limited' : 'allowed'}`, {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      limited,
      ip: req.ip,
      userId: req.userId,
    });
  }

  getSlowRequests(thresholdMs: number): RequestLogEntry[] {
    return this.requestLogs.filter((r) => r.duration >= thresholdMs);
  }

  getRequestStats(): RequestStats {
    const byMethod: Record<string, number> = {};
    const byStatusCode: Record<string, number> = {};
    let totalDuration = 0;
    let totalErrors = 0;

    for (const entry of this.requestLogs) {
      byMethod[entry.method] = (byMethod[entry.method] ?? 0) + 1;
      const codeStr = String(entry.statusCode);
      byStatusCode[codeStr] = (byStatusCode[codeStr] ?? 0) + 1;
      totalDuration += entry.duration;
      if (entry.statusCode >= 400) totalErrors++;
    }

    const sorted = [...this.requestLogs].sort((a, b) => b.duration - a.duration);

    return {
      totalRequests: this.requestLogs.length,
      totalErrors,
      avgDuration: this.requestLogs.length > 0 ? totalDuration / this.requestLogs.length : 0,
      slowRequestCount: this.requestLogs.filter((r) => r.duration >= 1000).length,
      byMethod,
      byStatusCode,
      slowestRequests: sorted.slice(0, 10),
    };
  }

  middleware(): (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void) => void {
    return (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void) => {
      const requestId = req.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      req.requestId = requestId;
      this.requestTimers.set(requestId, Date.now());

      this.systemLogger.debug('api', `Incoming: ${req.method} ${req.url}`, {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });

      next();
    };
  }
}
