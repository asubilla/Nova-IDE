import { MetricsCollector, MetricsSnapshot } from './metrics-collector';
import { HealthChecker, HealthReport, HealthStatus } from './health-checker';
import { AlertManager, Alert, AlertSeverity } from './alert-manager';
import { EventEmitter } from 'events';

export interface DashboardConfig {
  refreshInterval: number;
  maxLogEntries: number;
  chartWidth: number;
  chartHeight: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const DEFAULT_CONFIG: DashboardConfig = {
  refreshInterval: 5000,
  maxLogEntries: 100,
  chartWidth: 60,
  chartHeight: 10,
};

export class ProductionDashboard extends EventEmitter {
  private container: HTMLElement | null;
  private metrics: MetricsCollector;
  private healthChecker: HealthChecker;
  private alertManager: AlertManager;
  private config: DashboardConfig;
  private refreshTimer?: NodeJS.Timeout;
  private logs: LogEntry[] = [];
  private metricHistory: Map<string, number[]> = new Map();
  private maxHistorySize: number = 60;

  constructor(
    container: HTMLElement | null,
    metrics: MetricsCollector,
    healthChecker: HealthChecker,
    alertManager: AlertManager,
    config?: Partial<DashboardConfig>
  ) {
    super();
    this.container = container;
    this.metrics = metrics;
    this.healthChecker = healthChecker;
    this.alertManager = alertManager;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.metrics.on('counter', (name: string, value: number) => {
      this.trackMetric(name, value);
    });

    this.metrics.on('gauge', (name: string, value: number) => {
      this.trackMetric(name, value);
    });

    this.healthChecker.on('healthCheck', (report: HealthReport) => {
      this.addLog('info', `Health check: ${report.status}`);
    });

    this.alertManager.on('alertFired', (alert: Alert) => {
      this.addLog('error', `Alert fired: ${alert.message}`);
    });
  }

  private trackMetric(name: string, value: number): void {
    if (!this.metricHistory.has(name)) {
      this.metricHistory.set(name, []);
    }
    const history = this.metricHistory.get(name)!;
    history.push(value);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  private addLog(level: 'info' | 'warn' | 'error', message: string): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
    if (this.logs.length > this.config.maxLogEntries) {
      this.logs.shift();
    }
  }

  render(): string {
    const sections: string[] = [];

    sections.push(this.renderHeader());
    sections.push(this.renderMetricsPanel());
    sections.push(this.renderHealthPanel());
    sections.push(this.renderAlertsPanel());
    sections.push(this.renderChartsPanel());
    sections.push(this.renderAgentPanel());
    sections.push(this.renderSystemPanel());
    sections.push(this.renderLogPanel());

    const output = sections.join('\n\n');

    if (this.container) {
      this.container.innerHTML = this.toHTML(output);
    }

    return output;
  }

  update(): string {
    return this.render();
  }

  renderHeader(): string {
    const lines: string[] = [];
    const status = this.healthChecker.getOverallStatus();
    const statusIcon = status === 'healthy' ? '✓' : status === 'degraded' ? '!' : '✗';
    const activeAlerts = this.alertManager.getActiveAlerts();

    lines.push('╔═══════════════════════════════════════════════════════════════════════════╗');
    lines.push('║                  NOVA IDE - PRODUCTION MONITORING DASHBOARD              ║');
    lines.push('╚═══════════════════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`  Status: ${statusIcon} ${status.toUpperCase()}  |  Alerts: ${activeAlerts.length}  |  Uptime: ${this.formatUptime(this.healthChecker.getUptime())}`);
    lines.push(`  Time: ${new Date().toLocaleString()}`);

    return lines.join('\n');
  }

  renderMetricsPanel(): string {
    const snapshot = this.metrics.getMetrics();
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      METRICS PANEL                          │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    lines.push('');
    lines.push('  Requests:');
    lines.push(`    Total: ${(snapshot.counters['requests'] || 0).toLocaleString()}`);
    lines.push(`    Rate: ${this.calculateRate('requests')}/s`);
    lines.push('');

    lines.push('  Response Times:');
    const responseTimeEntry = snapshot.timers['responseTime'];
    if (responseTimeEntry) {
      lines.push(`    Avg: ${responseTimeEntry.avg?.toFixed(2) || 0}ms`);
      lines.push(`    Min: ${responseTimeEntry.min?.toFixed(2) || 0}ms`);
      lines.push(`    Max: ${responseTimeEntry.max?.toFixed(2) || 0}ms`);
      lines.push(`    Count: ${responseTimeEntry.count || 0}`);
    } else {
      lines.push('    No data');
    }
    lines.push('');

    lines.push('  Errors:');
    lines.push(`    Total: ${(snapshot.counters['errors'] || 0).toLocaleString()}`);
    lines.push(`    Rate: ${this.calculateRate('errors')}/s`);
    lines.push('');

    lines.push('  Active Connections:');
    lines.push(`    Count: ${(snapshot.gauges['activeConnections'] || 0).toLocaleString()}`);

    return lines.join('\n');
  }

  renderHealthPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      HEALTH PANEL                           │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    const statusColors: Record<HealthStatus, string> = {
      healthy: '✓',
      degraded: '!',
      unhealthy: '✗',
    };

    const overallStatus = this.healthChecker.getOverallStatus();
    lines.push('');
    lines.push(`  Overall Status: ${statusColors[overallStatus]} ${overallStatus.toUpperCase()}`);
    lines.push(`  Uptime: ${this.formatUptime(this.healthChecker.getUptime())}`);
    lines.push('');

    const report = this.healthChecker.getHistory().slice(-1)[0];
    if (report) {
      lines.push('  Checks:');
      for (const check of report.checks) {
        const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗';
        const duration = check.duration ? ` (${check.duration}ms)` : '';
        lines.push(`    ${icon} ${check.name}: ${check.message || check.status}${duration}`);
      }
    } else {
      lines.push('  No health checks run yet');
    }

    return lines.join('\n');
  }

  renderAlertsPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      ALERTS PANEL                           │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    const activeAlerts = this.alertManager.getActiveAlerts();

    lines.push('');
    lines.push(`  Active Alerts: ${activeAlerts.length}`);
    lines.push('');

    if (activeAlerts.length === 0) {
      lines.push('  No active alerts');
    } else {
      lines.push('  Severity Counts:');
      const severityCounts: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
      for (const alert of activeAlerts) {
        severityCounts[alert.severity]++;
      }
      lines.push(`    Critical: ${severityCounts.critical}`);
      lines.push(`    Warning: ${severityCounts.warning}`);
      lines.push(`    Info: ${severityCounts.info}`);
      lines.push('');

      lines.push('  Recent Alerts:');
      for (const alert of activeAlerts.slice(0, 5)) {
        const ack = alert.acknowledged ? ' [ACK]' : '';
        lines.push(`    [${alert.severity.toUpperCase()}] ${alert.message}${ack}`);
      }
    }

    return lines.join('\n');
  }

  renderChartsPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      CHARTS PANEL                           │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    lines.push('');
    lines.push('  Request Rate (last 60 samples):');
    lines.push(this.renderSparkChart('requests'));
    lines.push('');
    lines.push('  Error Rate (last 60 samples):');
    lines.push(this.renderSparkChart('errors'));
    lines.push('');
    lines.push('  Response Time (last 60 samples):');
    lines.push(this.renderSparkChart('responseTime'));

    return lines.join('\n');
  }

  private renderSparkChart(metricName: string): string {
    const history = this.metricHistory.get(metricName) || [];
    if (history.length === 0) {
      return '    No data available';
    }

    const max = Math.max(...history);
    const min = Math.min(...history);
    const range = max - min || 1;

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const chartWidth = Math.min(history.length, this.config.chartWidth);
    const sampled = history.slice(-chartWidth);

    let chart = '    ';
    for (const value of sampled) {
      const normalized = (value - min) / range;
      const charIndex = Math.floor(normalized * (chars.length - 1));
      chart += chars[charIndex];
    }

    chart += ` (${min.toFixed(1)}-${max.toFixed(1)})`;
    return chart;
  }

  renderAgentPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      AGENTS PANEL                           │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    const snapshot = this.metrics.getMetrics();
    const agentCount = snapshot.gauges['agentCount'] || 0;
    const activeConnections = snapshot.gauges['activeConnections'] || 0;
    const chatMessages = snapshot.counters['chatMessages'] || 0;

    lines.push('');
    lines.push(`  Active Agents: ${agentCount}`);
    lines.push(`  Active Connections: ${activeConnections}`);
    lines.push(`  Chat Messages: ${chatMessages.toLocaleString()}`);

    return lines.join('\n');
  }

  renderSystemPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      SYSTEM PANEL                           │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    const snapshot = this.metrics.getMetrics();
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    lines.push('');
    lines.push('  Memory:');
    lines.push(`    Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`    Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`    RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`    External: ${(mem.external / 1024 / 1024).toFixed(2)} MB`);
    lines.push('');
    lines.push('  CPU:');
    lines.push(`    Load Avg: ${(snapshot.gauges['system.cpu.loadavg'] || 0).toFixed(2)}`);
    lines.push(`    Cores: ${snapshot.gauges['system.cpu.cpus'] || 'N/A'}`);
    lines.push('');
    lines.push('  Process:');
    lines.push(`    PID: ${process.pid}`);
    lines.push(`    Uptime: ${this.formatUptime(uptime * 1000)}`);

    return lines.join('\n');
  }

  renderLogPanel(): string {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                      LOG PANEL                              │');
    lines.push('└─────────────────────────────────────────────────────────────┘');

    lines.push('');
    lines.push(`  Recent Logs (last 20):`);
    lines.push('');

    const recentLogs = this.logs.slice(-20);
    if (recentLogs.length === 0) {
      lines.push('    No logs');
    } else {
      for (const log of recentLogs) {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const icon = log.level === 'error' ? '✗' : log.level === 'warn' ? '!' : '·';
        lines.push(`    ${icon} [${time}] ${log.message}`);
      }
    }

    return lines.join('\n');
  }

  private calculateRate(metricName: string): string {
    const history = this.metricHistory.get(metricName) || [];
    if (history.length < 2) return '0';

    const recent = history.slice(-10);
    const timeSpan = this.config.refreshInterval / 1000;
    const rate = (recent[recent.length - 1] - recent[0]) / (recent.length - 1) / timeSpan;

    return rate.toFixed(2);
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private toHTML(text: string): string {
    return `
      <div style="font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto;">
        <pre style="margin: 0; white-space: pre;">${this.escapeHtml(text)}</pre>
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  exportDashboard(): string {
    const text = this.render();
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova IDE - Production Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
    }
    .dashboard {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding: 16px;
      background: #161b22;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .header h1 {
      font-size: 24px;
      color: #58a6ff;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #8b949e;
      font-size: 14px;
    }
    .section {
      margin-bottom: 16px;
      padding: 16px;
      background: #161b22;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .section h2 {
      font-size: 16px;
      color: #58a6ff;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #30363d;
    }
    pre {
      font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: auto;
    }
    .status-healthy { color: #3fb950; }
    .status-degraded { color: #d29922; }
    .status-unhealthy { color: #f85149; }
    .refresh-indicator {
      text-align: center;
      padding: 8px;
      color: #8b949e;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>Nova IDE Production Dashboard</h1>
      <div class="subtitle">Real-time monitoring and health checks</div>
    </div>
    <div id="content">
      <pre>${this.escapeHtml(text)}</pre>
    </div>
    <div class="refresh-indicator">
      Auto-refreshing every ${this.config.refreshInterval / 1000} seconds
    </div>
  </div>
  <script>
    setInterval(() => {
      location.reload();
    }, ${this.config.refreshInterval});
  </script>
</body>
</html>
    `;
  }

  startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      this.update();
      this.emit('refresh');
    }, this.config.refreshInterval);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  destroy(): void {
    this.stopAutoRefresh();
    this.removeAllListeners();
  }
}
