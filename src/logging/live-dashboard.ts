import { SystemLogger, type LogEntry, type LogLevel, type LogCategory } from './system-logger';
import { LiveLogStream } from './live-log-stream';
import { PerformanceLogger, type PerformanceReport } from './performance-logger';

export interface DashboardConfig {
  refreshIntervalMs: number;
  showHeader: boolean;
  showMetrics: boolean;
  showAgents: boolean;
  showSessions: boolean;
  showChat: boolean;
  showExtensions: boolean;
  showSecurity: boolean;
  showPerformance: boolean;
  showLogs: boolean;
  showAlerts: boolean;
  showStatusBar: boolean;
  logCount: number;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const CATEGORY_COLORS: Record<LogCategory, string> = {
  system: '\x1b[37m',
  agent: '\x1b[35m',
  session: '\x1b[34m',
  task: '\x1b[33m',
  chat: '\x1b[36m',
  extension: '\x1b[32m',
  mcp: '\x1b[35m',
  lsp: '\x1b[34m',
  plugin: '\x1b[33m',
  template: '\x1b[36m',
  security: '\x1b[31m',
  performance: '\x1b[32m',
  api: '\x1b[34m',
  websocket: '\x1b[35m',
  database: '\x1b[33m',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CLEAR_SCREEN = '\x1b[2J';
const HOME = '\x1b[H';

export class LiveDashboard {
  private systemLogger: SystemLogger;
  private stream: LiveLogStream;
  private performanceLogger?: PerformanceLogger;
  private config: DashboardConfig;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private started: boolean = false;
  private startTime: number;
  private alertBuffer: LogEntry[] = [];
  private maxAlerts: number = 50;
  private renderCount: number = 0;

  constructor(
    systemLogger: SystemLogger,
    stream: LiveLogStream,
    performanceLogger?: PerformanceLogger,
    config?: Partial<DashboardConfig>,
  ) {
    this.systemLogger = systemLogger;
    this.stream = stream;
    this.performanceLogger = performanceLogger;
    this.startTime = Date.now();
    this.config = {
      refreshIntervalMs: 1000,
      showHeader: true,
      showMetrics: true,
      showAgents: true,
      showSessions: true,
      showChat: true,
      showExtensions: true,
      showSecurity: true,
      showPerformance: true,
      showLogs: true,
      showAlerts: true,
      showStatusBar: true,
      logCount: 15,
      ...config,
    };

    this.stream.subscribe((entry) => {
      if (entry.level === 'error' || entry.level === 'warn') {
        this.alertBuffer.push(entry);
        if (this.alertBuffer.length > this.maxAlerts) {
          this.alertBuffer = this.alertBuffer.slice(this.alertBuffer.length - this.maxAlerts);
        }
      }
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.startTime = Date.now();
    process.stdout.write(CLEAR_SCREEN + HOME);
    this.render();
    this.refreshTimer = setInterval(() => {
      this.update();
    }, this.config.refreshIntervalMs);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    process.stdout.write(CLEAR_SCREEN + HOME);
  }

  render(): void {
    const lines: string[] = [];

    if (this.config.showHeader) {
      lines.push(this.renderHeader());
    }

    if (this.config.showMetrics || this.config.showPerformance) {
      lines.push(this.renderMetricsPanel());
    }

    if (this.config.showAgents) {
      lines.push(this.renderAgentPanel());
    }

    if (this.config.showSessions) {
      lines.push(this.renderSessionPanel());
    }

    if (this.config.showChat) {
      lines.push(this.renderChatPanel());
    }

    if (this.config.showExtensions) {
      lines.push(this.renderExtensionPanel());
    }

    if (this.config.showSecurity) {
      lines.push(this.renderSecurityPanel());
    }

    if (this.config.showPerformance) {
      lines.push(this.renderPerformancePanel());
    }

    if (this.config.showLogs) {
      lines.push(this.renderRecentLogs(this.config.logCount));
    }

    if (this.config.showAlerts) {
      lines.push(this.renderAlerts());
    }

    if (this.config.showStatusBar) {
      lines.push(this.renderStatusBar());
    }

    const output = lines.join('\n');
    process.stdout.write(CLEAR_SCREEN + HOME + output);
  }

  update(): void {
    this.renderCount++;
    this.render();
  }

  renderHeader(): string {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeStr = this.formatDuration(uptimeMs);
    const isConnected = this.stream.isConnected();
    const statusColor = isConnected ? '\x1b[32m' : '\x1b[31m';
    const statusText = isConnected ? 'CONNECTED' : 'DISCONNECTED';
    const timestamp = new Date().toLocaleTimeString();
    const title = `${BOLD}${RESET}${BOLD} NOVA SUB-AGENT IDE - LIVE DASHBOARD ${RESET}`;
    const status = `  ${statusColor}${statusText}${RESET}  |  Uptime: ${uptimeStr}  |  ${timestamp}  |  Render #${this.renderCount}`;

    const separator = '═'.repeat(80);
    return `${BOLD}\x1b[36m╔${separator}╗${RESET}\n${title}\n${status}\n${BOLD}\x1b[36m╚${separator}╝${RESET}`;
  }

  renderMetricsPanel(): string {
    const stats = this.systemLogger.getStats();
    const requestsPerSec = this.getRequestRate();
    const errorRate = stats.total > 0
      ? ((stats.byLevel.error / stats.total) * 100).toFixed(2)
      : '0.00';
    const avgDuration = stats.avgDuration.toFixed(1);

    const header = `\n${BOLD}\x1b[33m┌─── METRICS PANEL ───────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Requests/s: ${BOLD}${requestsPerSec}${RESET}  |  Errors: ${errorRate}%  |  Avg Latency: ${avgDuration}ms  |  Total: ${stats.total}`,
      `│  ${DIM}Level Distribution:${RESET} Trace:${stats.byLevel.trace} Debug:${stats.byLevel.debug} Info:${stats.byLevel.info} Warn:${stats.byLevel.warn} Error:${stats.byLevel.error}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[33m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderAgentPanel(): string {
    const agentLogs = this.systemLogger.getLogsByCategory('agent');
    const activeAgents = new Set<string>();
    let completedAgents = 0;
    let failedAgents = 0;
    let inProgressAgents = 0;

    for (const entry of agentLogs) {
      if (entry.data && typeof entry.data === 'object') {
        const agentId = (entry.data as Record<string, unknown>).agentId;
        if (typeof agentId === 'string') {
          if (entry.message.includes('spawned') || entry.message.includes('started')) {
            activeAgents.add(agentId);
          }
          if (entry.message.includes('completed')) {
            activeAgents.delete(agentId);
            completedAgents++;
          }
          if (entry.message.includes('error')) {
            activeAgents.delete(agentId);
            failedAgents++;
          }
          if (entry.message.includes('progress')) {
            inProgressAgents++;
          }
        }
      }
    }

    const header = `\n${BOLD}\x1b[35m┌─── AGENT PANEL ─────────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Active: ${BOLD}${activeAgents.size}${RESET}  |  Completed: ${completedAgents}  |  Failed: ${failedAgents}  |  Progress Events: ${inProgressAgents}`,
      `│  ${DIM}Active Agents:${RESET} ${activeAgents.size > 0 ? Array.from(activeAgents).slice(0, 5).join(', ') : 'None'}${activeAgents.size > 5 ? ` (+${activeAgents.size - 5} more)` : ''}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[35m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderSessionPanel(): string {
    const sessionLogs = this.systemLogger.getLogsByCategory('session');
    const activeSessions = new Set<string>();
    let completedSessions = 0;
    let checkpoints = 0;
    let reverts = 0;

    for (const entry of sessionLogs) {
      if (entry.data && typeof entry.data === 'object') {
        const sessionId = (entry.data as Record<string, unknown>).sessionId;
        if (typeof sessionId === 'string') {
          if (entry.message.includes('created') || entry.message.includes('started')) {
            activeSessions.add(sessionId);
          }
          if (entry.message.includes('ended')) {
            activeSessions.delete(sessionId);
            completedSessions++;
          }
        }
      }
      if (entry.message.includes('Checkpoint')) checkpoints++;
      if (entry.message.includes('reverted')) reverts++;
    }

    const header = `\n${BOLD}\x1b[34m┌─── SESSION PANEL ───────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Active: ${BOLD}${activeSessions.size}${RESET}  |  Completed: ${completedSessions}  |  Checkpoints: ${checkpoints}  |  Reverts: ${reverts}`,
      `│  ${DIM}Active Sessions:${RESET} ${activeSessions.size > 0 ? Array.from(activeSessions).slice(0, 5).join(', ') : 'None'}${activeSessions.size > 5 ? ` (+${activeSessions.size - 5} more)` : ''}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[34m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderChatPanel(): string {
    const chatLogs = this.systemLogger.getLogsByCategory('chat');
    let messages = 0;
    let replies = 0;
    let edits = 0;
    let codeExecutions = 0;
    let searches = 0;

    for (const entry of chatLogs) {
      if (entry.message.startsWith('Message sent:')) messages++;
      else if (entry.message.startsWith('Reply sent:')) replies++;
      else if (entry.message.startsWith('Message edited:')) edits++;
      else if (entry.message.startsWith('Code executed:')) codeExecutions++;
      else if (entry.message.startsWith('Search:')) searches++;
    }

    const header = `\n${BOLD}\x1b[36m┌─── CHAT PANEL ──────────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Messages: ${BOLD}${messages}${RESET}  |  Replies: ${replies}  |  Edits: ${edits}  |  Code Exec: ${codeExecutions}  |  Searches: ${searches}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[36m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderExtensionPanel(): string {
    const extLogs = this.systemLogger.getLogsByCategory('extension');
    const mcpLogs = this.systemLogger.getLogsByCategory('mcp');
    const lspLogs = this.systemLogger.getLogsByCategory('lsp');

    let extensionsLoaded = 0;
    let mcpConnections = 0;
    let lspConnections = 0;
    let mcpErrors = 0;
    let lspErrors = 0;

    for (const entry of extLogs) {
      if (entry.message.includes('loaded')) extensionsLoaded++;
      if (entry.message.includes('error')) mcpErrors++;
    }
    for (const entry of mcpLogs) {
      if (entry.message.includes('connected')) mcpConnections++;
      if (entry.message.includes('error')) mcpErrors++;
    }
    for (const entry of lspLogs) {
      if (entry.message.includes('connected')) lspConnections++;
      if (entry.message.includes('error')) lspErrors++;
    }

    const header = `\n${BOLD}\x1b[32m┌─── EXTENSION PANEL ─────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Extensions: ${BOLD}${extensionsLoaded}${RESET}  |  MCP Conns: ${mcpConnections}  |  LSP Conns: ${lspConnections}  |  Errors: ${mcpErrors + lspErrors}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[32m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderSecurityPanel(): string {
    const secLogs = this.systemLogger.getLogsByCategory('security');
    let warnings = 0;
    let errors = 0;
    let events = secLogs.length;

    for (const entry of secLogs) {
      if (entry.level === 'warn') warnings++;
      if (entry.level === 'error') errors++;
    }

    const header = `\n${BOLD}\x1b[31m┌─── SECURITY PANEL ──────────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  Events: ${BOLD}${events}${RESET}  |  Warnings: ${warnings}  |  Errors: ${errors}`,
    ].join('\n');
    const footer = `${BOLD}\x1b[31m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderPerformancePanel(): string {
    const report = this.performanceLogger
      ? this.performanceLogger.getPerformanceReport()
      : this.getDefaultPerformanceReport();

    const memUsedMB = (report.memory.heapUsed / 1024 / 1024).toFixed(1);
    const memTotalMB = (report.memory.heapTotal / 1024 / 1024).toFixed(1);
    const rssMB = (report.memory.rss / 1024 / 1024).toFixed(1);
    const memPercent = report.memory.heapTotal > 0
      ? ((report.memory.heapUsed / report.memory.heapTotal) * 100).toFixed(1)
      : '0.0';

    const header = `\n${BOLD}\x1b[37m┌─── PERFORMANCE PANEL ───────────────────────────────────────────────────────┐${RESET}`;
    const content = [
      `│  CPU: ${BOLD}N/A${RESET}  |  Memory: ${memUsedMB}/${memTotalMB}MB (${memPercent}%)  |  RSS: ${rssMB}MB  |  Event Loop: ${report.eventLoopDelay}ms`,
      `│  Requests: ${report.requestStats.total} total, ${report.requestStats.slowRequests} slow  |  WS Events: ${report.websocketStats.totalEvents}  |  DB: ${report.databaseStats.total} ops`,
    ].join('\n');
    const footer = `${BOLD}\x1b[37m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${content}\n${footer}`;
  }

  renderRecentLogs(count: number): string {
    const recentLogs = this.systemLogger.getRecentLogs(count);

    const header = `\n${BOLD}\x1b[33m┌─── RECENT LOGS (last ${count}) ────────────────────────────────────────────────┐${RESET}`;
    const logLines = recentLogs.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const levelColor = LEVEL_COLORS[entry.level];
      const catColor = CATEGORY_COLORS[entry.category];
      const levelTag = `${levelColor}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
      const catTag = `${catColor}[${entry.category}]${RESET}`;
      const msg = entry.message.length > 55 ? entry.message.substring(0, 52) + '...' : entry.message;
      const durationStr = entry.duration !== undefined ? ` ${DIM}(${entry.duration}ms)${RESET}` : '';
      return `│  ${DIM}${time}${RESET} ${levelTag} ${catTag} ${msg}${durationStr}`;
    });

    while (logLines.length < count) {
      logLines.push(`│  ${DIM}${''.padEnd(80)}${RESET}`);
    }

    const footer = `${BOLD}\x1b[33m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${logLines.join('\n')}\n${footer}`;
  }

  renderAlerts(): string {
    const recentAlerts = this.alertBuffer.slice(-10);

    const header = `\n${BOLD}\x1b[31m┌─── ACTIVE ALERTS ───────────────────────────────────────────────────────────┐${RESET}`;
    const alertLines = recentAlerts.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const levelIcon = entry.level === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[33m⚠\x1b[0m';
      const msg = entry.message.length > 65 ? entry.message.substring(0, 62) + '...' : entry.message;
      return `│  ${levelIcon} ${DIM}${time}${RESET} ${msg}`;
    });

    if (alertLines.length === 0) {
      alertLines.push(`│  ${DIM}No active alerts${RESET}`);
    }

    while (alertLines.length < 5) {
      alertLines.push(`│  ${DIM}${''.padEnd(80)}${RESET}`);
    }

    const footer = `${BOLD}\x1b[31m└──────────────────────────────────────────────────────────────────────────────┘${RESET}`;

    return `${header}\n${alertLines.join('\n')}\n${footer}`;
  }

  renderStatusBar(): string {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeStr = this.formatDuration(uptimeMs);
    const stats = this.systemLogger.getStats();
    const streamStats = this.stream.getStats();
    const timestamp = new Date().toLocaleTimeString();

    const left = `Nova IDE v1.0.0`;
    const center = `Logs: ${stats.total} | Subs: ${streamStats.subscriberCount} | Buffer: ${streamStats.bufferSize}`;
    const right = `Up: ${uptimeStr} | ${timestamp}`;
    const pad = 80 - left.length - center.length - right.length;
    const paddedCenter = pad > 0 ? ' '.repeat(pad / 2) + center + ' '.repeat(Math.ceil(pad / 2)) : center;

    return `\n${BOLD}\x1b[44m\x1b[37m ${left}${RESET}${BOLD}\x1b[44m\x1b[37m${paddedCenter}${RESET}${BOLD}\x1b[44m\x1b[37m ${right} ${RESET}`;
  }

  private getRequestRate(): string {
    const logs = this.systemLogger.getLogsByCategory('performance');
    const recentRequests = logs.filter(
      (e) => e.message.startsWith('HTTP ') && Date.now() - e.timestamp < 60_000,
    );
    return (recentRequests.length / 60).toFixed(1);
  }

  private getDefaultPerformanceReport(): PerformanceReport {
    const mem = process.memoryUsage();
    return {
      requestStats: { total: 0, avgDuration: 0, slowRequests: 0 },
      websocketStats: { totalEvents: 0, avgDuration: 0 },
      databaseStats: { total: 0, avgDuration: 0, failureCount: 0 },
      buildStats: { totalBuilds: 0, avgDuration: 0, successRate: 0 },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      eventLoopDelay: 0,
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
