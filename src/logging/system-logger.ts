import { randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

export type LogCategory =
  | 'system'
  | 'agent'
  | 'session'
  | 'task'
  | 'chat'
  | 'extension'
  | 'mcp'
  | 'lsp'
  | 'plugin'
  | 'template'
  | 'security'
  | 'performance'
  | 'api'
  | 'websocket'
  | 'database';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  stack?: string;
  duration?: number;
  userId?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
}

export interface LogFilter {
  level?: LogLevel;
  category?: LogCategory;
  categoryIn?: LogCategory[];
  levelIn?: LogLevel[];
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  userId?: string;
  startTime?: number;
  endTime?: number;
  search?: string;
  minDuration?: number;
  maxDuration?: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byCategory: Record<LogCategory, number>;
  oldestEntry: number | null;
  newestEntry: number | null;
  avgDuration: number;
}

export interface LogExportEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  stack?: string;
  duration?: number;
  userId?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const ALL_CATEGORIES: LogCategory[] = [
  'system', 'agent', 'session', 'task', 'chat', 'extension',
  'mcp', 'lsp', 'plugin', 'template', 'security', 'performance',
  'api', 'websocket', 'database',
];

const ALL_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

export class ChildLogger {
  constructor(
    private readonly parent: SystemLogger,
    private readonly category: LogCategory,
  ) {}

  log(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.log(level, this.category, message, data);
  }

  info(message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.info(this.category, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.warn(this.category, message, data);
  }

  error(message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.error(this.category, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.debug(this.category, message, data);
  }

  trace(message: string, data?: Record<string, unknown>): LogEntry {
    return this.parent.trace(this.category, message, data);
  }
}

export class SystemLogger {
  private entries: LogEntry[] = [];
  private readonly maxSize: number;
  private levelPriority: Record<LogLevel, number> = { ...LOG_LEVEL_PRIORITY };
  private subscribers: Set<(entry: LogEntry) => void> = new Set();

  constructor(maxSize: number = 10_000) {
    this.maxSize = maxSize;
  }

  log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(this.entries.length - this.maxSize);
    }
    this.notifySubscribers(entry);
    return entry;
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    return this.log('info', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    return this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    return this.log('error', category, message, data);
  }

  debug(category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    return this.log('debug', category, message, data);
  }

  trace(category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
    return this.log('trace', category, message, data);
  }

  child(category: LogCategory): ChildLogger {
    return new ChildLogger(this, category);
  }

  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getLogs(filter?: LogFilter): LogEntry[] {
    if (!filter) return [...this.entries];
    return this.entries.filter((e) => this.matchesFilter(e, filter));
  }

  getRecentLogs(count: number): LogEntry[] {
    return this.entries.slice(Math.max(0, this.entries.length - count));
  }

  getLogsByCategory(category: LogCategory): LogEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  getLogsByTimeRange(start: number, end: number): LogEntry[] {
    return this.entries.filter((e) => e.timestamp >= start && e.timestamp <= end);
  }

  searchLogs(query: string): LogEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter(
      (e) =>
        e.message.toLowerCase().includes(lower) ||
        (e.data && JSON.stringify(e.data).toLowerCase().includes(lower)),
    );
  }

  exportLogs(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(
        this.entries.map((e) => ({
          ...e,
          timestamp: new Date(e.timestamp).toISOString(),
        })),
        null,
        2,
      );
    }
    const header = 'id,timestamp,level,category,message,duration,agentId,sessionId,taskId,userId\n';
    const rows = this.entries
      .map(
        (e) =>
          `"${e.id}","${new Date(e.timestamp).toISOString()}","${e.level}","${e.category}",` +
          `"${e.message.replace(/"/g, '""')}",${e.duration ?? ''},"${e.agentId ?? ''}",` +
          `"${e.sessionId ?? ''}","${e.taskId ?? ''}","${e.userId ?? ''}"`,
      )
      .join('\n');
    return header + rows;
  }

  clearOldLogs(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp > cutoff);
    return before - this.entries.length;
  }

  getStats(): LogStats {
    const byLevel = Object.fromEntries(ALL_LEVELS.map((l) => [l, 0])) as Record<LogLevel, number>;
    const byCategory = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<LogCategory, number>;
    let totalDuration = 0;
    let durationCount = 0;
    for (const e of this.entries) {
      byLevel[e.level]++;
      byCategory[e.category]++;
      if (e.duration !== undefined) {
        totalDuration += e.duration;
        durationCount++;
      }
    }
    return {
      total: this.entries.length,
      byLevel,
      byCategory,
      oldestEntry: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
      avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }

  private matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
    if (filter.level !== undefined && entry.level !== filter.level) return false;
    if (filter.category !== undefined && entry.category !== filter.category) return false;
    if (filter.categoryIn !== undefined && !filter.categoryIn.includes(entry.category)) return false;
    if (filter.levelIn !== undefined && !filter.levelIn.includes(entry.level)) return false;
    if (filter.agentId !== undefined && entry.agentId !== filter.agentId) return false;
    if (filter.sessionId !== undefined && entry.sessionId !== filter.sessionId) return false;
    if (filter.taskId !== undefined && entry.taskId !== filter.taskId) return false;
    if (filter.userId !== undefined && entry.userId !== filter.userId) return false;
    if (filter.startTime !== undefined && entry.timestamp < filter.startTime) return false;
    if (filter.endTime !== undefined && entry.timestamp > filter.endTime) return false;
    if (filter.search !== undefined && !entry.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
    if (filter.minDuration !== undefined && (entry.duration === undefined || entry.duration < filter.minDuration)) return false;
    if (filter.maxDuration !== undefined && (entry.duration === undefined || entry.duration > filter.maxDuration)) return false;
    return true;
  }

  private notifySubscribers(entry: LogEntry): void {
    for (const cb of this.subscribers) {
      try { cb(entry); } catch { /* subscriber error ignored */ }
    }
  }
}

export const defaultSystemLogger = new SystemLogger();
