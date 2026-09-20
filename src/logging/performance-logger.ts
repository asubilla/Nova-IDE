import { SystemLogger, type LogEntry } from './system-logger';

export interface TimelineEntry {
  timestamp: number;
  event: string;
  duration?: number;
  data?: Record<string, unknown>;
}

export interface PerformanceReport {
  requestStats: {
    total: number;
    avgDuration: number;
    slowRequests: number;
  };
  websocketStats: {
    totalEvents: number;
    avgDuration: number;
  };
  databaseStats: {
    total: number;
    avgDuration: number;
    failureCount: number;
  };
  buildStats: {
    totalBuilds: number;
    avgDuration: number;
    successRate: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  eventLoopDelay: number;
}

export class PerformanceLogger {
  private requestDurations: number[] = [];
  private wsDurations: number[] = [];
  private dbDurations: number[] = [];
  private dbFailures = 0;
  private buildDurations: number[] = [];
  private buildSuccesses = 0;
  private latestMemory: NodeJS.MemoryUsage | null = null;
  private latestCpuUsage: NodeJS.CpuUsage | null = null;
  private eventLoopDelay = 0;

  constructor(private readonly systemLogger: SystemLogger) {}

  logRequest(method: string, path: string, statusCode: number, duration: number): LogEntry {
    this.requestDurations.push(duration);
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const entry = this.systemLogger[level]('performance', `HTTP ${method} ${path} ${statusCode} (${duration}ms)`, {
      method,
      path,
      statusCode,
      duration,
    });
    entry.duration = duration;
    return entry;
  }

  logWebSocket(event: string, duration?: number): LogEntry {
    if (duration !== undefined) this.wsDurations.push(duration);
    const entry = this.systemLogger.info('performance', `WebSocket event: ${event}${duration !== undefined ? ` (${duration}ms)` : ''}`, {
      event,
      duration,
    });
    if (duration !== undefined) entry.duration = duration;
    return entry;
  }

  logDatabase(operation: string, table: string, duration: number, success: boolean): LogEntry {
    this.dbDurations.push(duration);
    if (!success) this.dbFailures++;
    const level = success ? 'info' : 'error';
    const entry = this.systemLogger[level]('performance', `DB ${operation} on ${table} (${duration}ms) ${success ? 'ok' : 'FAILED'}`, {
      operation,
      table,
      duration,
      success,
    });
    entry.duration = duration;
    return entry;
  }

  logCompilation(duration: number, errors: number, warnings: number): LogEntry {
    const level = errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'info';
    const entry = this.systemLogger[level]('performance', `TypeScript compilation: ${duration}ms, ${errors} errors, ${warnings} warnings`, {
      duration,
      errors,
      warnings,
    });
    entry.duration = duration;
    return entry;
  }

  logBuild(command: string, duration: number, success: boolean): LogEntry {
    this.buildDurations.push(duration);
    if (success) this.buildSuccesses++;
    const level = success ? 'info' : 'error';
    const entry = this.systemLogger[level]('performance', `Build "${command}" ${success ? 'succeeded' : 'failed'} (${duration}ms)`, {
      command,
      duration,
      success,
    });
    entry.duration = duration;
    return entry;
  }

  logMemoryUsage(): LogEntry {
    const usage = process.memoryUsage();
    this.latestMemory = usage;
    return this.systemLogger.info('performance', 'Memory snapshot', {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
    });
  }

  logCPUUsage(): LogEntry {
    const usage = process.cpuUsage();
    this.latestCpuUsage = usage;
    return this.systemLogger.info('performance', 'CPU usage snapshot', {
      user: usage.user,
      system: usage.system,
    });
  }

  logEventLoopDelay(delay: number): LogEntry {
    this.eventLoopDelay = delay;
    const level = delay > 100 ? 'error' : delay > 50 ? 'warn' : 'info';
    return this.systemLogger[level]('performance', `Event loop delay: ${delay}ms`, {
      delay,
    });
  }

  getPerformanceReport(): PerformanceReport {
    const mem = this.latestMemory ?? process.memoryUsage();
    return {
      requestStats: {
        total: this.requestDurations.length,
        avgDuration: this.requestDurations.length > 0
          ? this.requestDurations.reduce((a, b) => a + b, 0) / this.requestDurations.length
          : 0,
        slowRequests: this.requestDurations.filter((d) => d > 1000).length,
      },
      websocketStats: {
        totalEvents: this.wsDurations.length,
        avgDuration: this.wsDurations.length > 0
          ? this.wsDurations.reduce((a, b) => a + b, 0) / this.wsDurations.length
          : 0,
      },
      databaseStats: {
        total: this.dbDurations.length,
        avgDuration: this.dbDurations.length > 0
          ? this.dbDurations.reduce((a, b) => a + b, 0) / this.dbDurations.length
          : 0,
        failureCount: this.dbFailures,
      },
      buildStats: {
        totalBuilds: this.buildDurations.length,
        avgDuration: this.buildDurations.length > 0
          ? this.buildDurations.reduce((a, b) => a + b, 0) / this.buildDurations.length
          : 0,
        successRate: this.buildDurations.length > 0
          ? this.buildSuccesses / this.buildDurations.length
          : 0,
      },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      eventLoopDelay: this.eventLoopDelay,
    };
  }

  getSlowOperations(thresholdMs: number): LogEntry[] {
    return this.systemLogger.getLogs({ category: 'performance', minDuration: thresholdMs });
  }

  getPerformanceTimeline(): TimelineEntry[] {
    return this.systemLogger.getLogs({ category: 'performance' }).map((e) => ({
      timestamp: e.timestamp,
      event: e.message,
      duration: e.duration,
      data: e.data,
    }));
  }
}
