import { SystemLogger, type LogEntry, type LogFilter, type LogStats } from './system-logger';
import { AgentLogger } from './agent-logger';
import { SessionLogger } from './session-logger';
import { ChatLogger } from './chat-logger';
import { ExtensionLogger } from './extension-logger';
import { PerformanceLogger } from './performance-logger';
import { MiddlewareLogger } from './middleware-logger';
import { WebSocketLogger } from './websocket-logger';
import { TemplateLogger } from './template-logger';
import { DiffLogger } from './diff-logger';

export interface SystemOverview {
  system: LogStats;
  agents: { totalAgentLogs: number };
  sessions: { totalSessionLogs: number };
  chat: { totalChatLogs: number };
  extensions: { totalExtensionLogs: number };
  performance: { totalPerformanceLogs: number };
  middleware: { totalRequests: number; totalErrors: number };
  websocket: { activeConnections: number; totalMessages: number };
  templates: { totalLoads: number; totalMatches: number; totalUses: number };
  diff: { totalDiffApplies: number; totalCheckpoints: number };
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  loggerCount: number;
  totalEntries: number;
  memoryUsage: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  issues: string[];
}

export class IndexLogger {
  private systemLogger!: SystemLogger;
  private agentLogger!: AgentLogger;
  private sessionLogger!: SessionLogger;
  private chatLogger!: ChatLogger;
  private extensionLogger!: ExtensionLogger;
  private performanceLogger!: PerformanceLogger;
  private middlewareLogger!: MiddlewareLogger;
  private websocketLogger!: WebSocketLogger;
  private templateLogger!: TemplateLogger;
  private diffLogger!: DiffLogger;

  private loggers: Map<string, unknown> = new Map();
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    this.systemLogger = new SystemLogger();
    this.agentLogger = new AgentLogger(this.systemLogger);
    this.sessionLogger = new SessionLogger(this.systemLogger);
    this.chatLogger = new ChatLogger(this.systemLogger);
    this.extensionLogger = new ExtensionLogger(this.systemLogger);
    this.performanceLogger = new PerformanceLogger(this.systemLogger);
    this.middlewareLogger = new MiddlewareLogger(this.systemLogger);
    this.websocketLogger = new WebSocketLogger(this.systemLogger);
    this.templateLogger = new TemplateLogger(this.systemLogger);
    this.diffLogger = new DiffLogger(this.systemLogger);

    this.loggers.set('system', this.systemLogger);
    this.loggers.set('agent', this.agentLogger);
    this.loggers.set('session', this.sessionLogger);
    this.loggers.set('chat', this.chatLogger);
    this.loggers.set('extension', this.extensionLogger);
    this.loggers.set('performance', this.performanceLogger);
    this.loggers.set('middleware', this.middlewareLogger);
    this.loggers.set('websocket', this.websocketLogger);
    this.loggers.set('template', this.templateLogger);
    this.loggers.set('diff', this.diffLogger);

    this.initialized = true;
  }

  getLogger(name: string): unknown | undefined {
    return this.loggers.get(name);
  }

  getSystemLogger(): SystemLogger {
    return this.systemLogger;
  }

  getAgentLogger(): AgentLogger {
    return this.agentLogger;
  }

  getSessionLogger(): SessionLogger {
    return this.sessionLogger;
  }

  getChatLogger(): ChatLogger {
    return this.chatLogger;
  }

  getExtensionLogger(): ExtensionLogger {
    return this.extensionLogger;
  }

  getPerformanceLogger(): PerformanceLogger {
    return this.performanceLogger;
  }

  getMiddlewareLogger(): MiddlewareLogger {
    return this.middlewareLogger;
  }

  getWebSocketLogger(): WebSocketLogger {
    return this.websocketLogger;
  }

  getTemplateLogger(): TemplateLogger {
    return this.templateLogger;
  }

  getDiffLogger(): DiffLogger {
    return this.diffLogger;
  }

  getAllLogs(filter?: LogFilter): LogEntry[] {
    return this.systemLogger.getLogs(filter);
  }

  searchAll(query: string): LogEntry[] {
    return this.systemLogger.searchLogs(query);
  }

  exportAll(format: 'json' | 'csv'): string {
    return this.systemLogger.exportLogs(format);
  }

  getSystemOverview(): SystemOverview {
    const mwStats = this.middlewareLogger.getRequestStats();
    const wsStats = this.websocketLogger.getStats();
    const tplStats = this.templateLogger.getTemplateStats();
    const diffStats = this.diffLogger.getVersionStats();
    const agentLogs = this.systemLogger.getLogs({ category: 'agent' });
    const sessionLogs = this.systemLogger.getLogs({ category: 'session' });
    const chatLogs = this.systemLogger.getLogs({ category: 'chat' });
    const extensionLogs = this.systemLogger.getLogs({ category: 'extension' });
    const perfLogs = this.systemLogger.getLogs({ category: 'performance' });

    return {
      system: this.systemLogger.getStats(),
      agents: { totalAgentLogs: agentLogs.length },
      sessions: { totalSessionLogs: sessionLogs.length },
      chat: { totalChatLogs: chatLogs.length },
      extensions: { totalExtensionLogs: extensionLogs.length },
      performance: { totalPerformanceLogs: perfLogs.length },
      middleware: { totalRequests: mwStats.totalRequests, totalErrors: mwStats.totalErrors },
      websocket: { activeConnections: wsStats.activeConnections, totalMessages: wsStats.totalMessages },
      templates: { totalLoads: tplStats.totalLoads, totalMatches: tplStats.totalMatches, totalUses: tplStats.totalUses },
      diff: { totalDiffApplies: diffStats.totalDiffApplies, totalCheckpoints: diffStats.totalCheckpoints },
    };
  }

  getHealthCheck(): HealthCheck {
    const stats = this.systemLogger.getStats();
    const issues: string[] = [];

    if (stats.total === 0) {
      issues.push('No log entries recorded');
    }
    if (stats.newestEntry && Date.now() - stats.newestEntry > 300_000) {
      issues.push('No recent log activity (5+ minutes)');
    }
    const mwStats = this.middlewareLogger.getRequestStats();
    if (mwStats.totalRequests > 0 && mwStats.totalErrors / mwStats.totalRequests > 0.1) {
      issues.push(`High error rate: ${((mwStats.totalErrors / mwStats.totalRequests) * 100).toFixed(1)}%`);
    }

    const memUsage = process.memoryUsage().heapUsed;
    if (memUsage > 500 * 1024 * 1024) {
      issues.push(`High memory usage: ${(memUsage / 1024 / 1024).toFixed(1)}MB`);
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.length >= 3) status = 'unhealthy';
    else if (issues.length > 0) status = 'degraded';

    return {
      status,
      loggerCount: this.loggers.size,
      totalEntries: stats.total,
      memoryUsage: memUsage,
      oldestEntry: stats.oldestEntry,
      newestEntry: stats.newestEntry,
      issues,
    };
  }

  flush(): void {
    this.systemLogger.clearOldLogs(0);
  }

  cleanup(): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return this.systemLogger.clearOldLogs(oneDay);
  }
}

export const indexLogger = new IndexLogger();
