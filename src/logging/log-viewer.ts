import { SystemLogger, LogEntry, LogFilter, LogLevel, LogCategory, LogStats } from './system-logger';
import { LogFormatter } from './log-formatter';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const INVERT = '\x1b[7m';
const UNDERLINE = '\x1b[4m';
const BG_RED = '\x1b[41m';
const BG_YELLOW = '\x1b[43m';
const FG_GREEN = '\x1b[32m';
const FG_CYAN = '\x1b[36m';
const FG_GRAY = '\x1b[90m';

const LEVEL_FORMAT: Record<LogLevel, { icon: string; color: string; bg: string }> = {
  debug: { icon: '⚙', color: FG_CYAN, bg: '' },
  info: { icon: '✓', color: FG_GREEN, bg: '' },
  warn: { icon: '⚠', color: BG_YELLOW, bg: '' },
  error: { icon: '✗', color: BG_RED, bg: '' },
  trace: { icon: 'ℹ', color: FG_GRAY, bg: '' },
};

const CATEGORY_ICONS: Record<LogCategory, string> = {
  system: '▣',
  agent: '◈',
  session: '◎',
  task: '◆',
  chat: '◇',
  extension: '◉',
  mcp: '◊',
  lsp: '◈',
  plugin: '⬡',
  template: '△',
  security: '🔒',
  performance: '⚡',
  api: '⇄',
  websocket: '↯',
  database: '▦',
};

export interface ViewerOptions {
  followInterval?: number;
  pageSize?: number;
  showHeaders?: boolean;
  colorize?: boolean;
}

export class LogViewer {
  private formatter: LogFormatter;
  private followTimer: ReturnType<typeof setInterval> | null = null;
  private lastFollowIndex: number = 0;
  private highlightPattern: RegExp | null = null;

  constructor(private readonly logger: SystemLogger, private options: ViewerOptions = {}) {
    this.formatter = new LogFormatter();
    this.options = {
      followInterval: 500,
      pageSize: 50,
      showHeaders: true,
      colorize: true,
      ...options,
    };
  }

  tail(count?: number): string[] {
    const n = count ?? this.options.pageSize!;
    const logs = this.logger.getRecentLogs(n);
    return this.renderPretty(logs);
  }

  follow(callback?: (output: string) => void): () => void {
    this.lastFollowIndex = this.logger.getLogs().length;
    this.followTimer = setInterval(() => {
      const all = this.logger.getLogs();
      if (all.length > this.lastFollowIndex) {
        const newLogs = all.slice(this.lastFollowIndex);
        this.lastFollowIndex = all.length;
        const output = this.renderPretty(newLogs).join('\n');
        if (callback) {
          callback(output);
        } else {
          process.stdout.write(output + '\n');
        }
      }
    }, this.options.followInterval);
    return () => this.stopFollow();
  }

  stopFollow(): void {
    if (this.followTimer !== null) {
      clearInterval(this.followTimer);
      this.followTimer = null;
    }
  }

  filter(filter: LogFilter): string[] {
    const logs = this.logger.getLogs(filter);
    return this.renderPretty(logs);
  }

  search(query: string): string[] {
    const logs = this.logger.searchLogs(query);
    this.highlightPattern = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    const output = this.renderPretty(logs);
    this.highlightPattern = null;
    return output;
  }

  clear(): void {
    process.stdout.write('\x1Bc');
  }

  export(format: 'json' | 'csv' | 'text' | 'pretty' | 'compact' | 'markdown' | 'syslog', filter?: LogFilter): string {
    const logs = this.logger.getLogs(filter);
    switch (format) {
      case 'json':
        return JSON.stringify(logs.map(l => this.formatter.formatJSON(l)), null, 2);
      case 'csv':
        return this.toCSV(logs);
      case 'pretty':
        return this.renderPretty(logs).join('\n');
      case 'compact':
        return logs.map(l => this.formatter.formatCompact(l)).join('\n');
      case 'markdown':
        return this.renderMarkdown(logs);
      case 'syslog':
        return logs.map(l => this.formatter.formatSyslog(l)).join('\n');
      case 'text':
      default:
        return this.renderPretty(logs).join('\n');
    }
  }

  renderTable(logs: LogEntry[]): string {
    if (logs.length === 0) return '(no logs)';
    const header = `${'Timestamp'.padEnd(24)} ${'Level'.padEnd(6)} ${'Category'.padEnd(14)} Message`;
    const sep = '─'.repeat(80);
    const rows = logs.map(l => {
      const ts = this.formatter.formatTimestamp(l.timestamp, 'iso');
      const lvl = l.level.toUpperCase().padEnd(6);
      const cat = l.category.padEnd(14);
      const msg = this.formatter.truncate(l.message, 60);
      return `${ts} ${lvl} ${cat} ${msg}`;
    });
    return [sep, header, sep, ...rows, sep].join('\n');
  }

  renderPretty(logs: LogEntry[]): string[] {
    return logs.map(l => {
      const ts = this.options.colorize
        ? `${DIM}${this.formatter.formatTimestamp(l.timestamp, 'locale')}${RESET}`
        : this.formatter.formatTimestamp(l.timestamp, 'locale');
      const lf = LEVEL_FORMAT[l.level];
      const icon = lf.icon;
      const catIcon = CATEGORY_ICONS[l.category] ?? '?';
      const levelStr = this.options.colorize
        ? `${BOLD}${lf.color}${icon} ${l.level.toUpperCase().padEnd(5)}${RESET}`
        : `${icon} ${l.level.toUpperCase().padEnd(5)}`;
      const catStr = this.options.colorize
        ? `${DIM}${catIcon} ${l.category}${RESET}`
        : `${catIcon} ${l.category}`;
      const idStr = this.options.colorize
        ? `${DIM}#${l.id.slice(0, 8)}${RESET}`
        : `#${l.id.slice(0, 8)}`;
      let msg = l.message;
      if (this.highlightPattern) {
        msg = msg.replace(this.highlightPattern, `${INVERT}$1${RESET}`);
      }
      return `${ts} ${levelStr} ${catStr} ${idStr} ${msg}`;
    });
  }

  renderCompact(logs: LogEntry[]): string[] {
    return logs.map(l => {
      const ts = this.formatter.formatTimestamp(l.timestamp, 'iso');
      const icon = LEVEL_FORMAT[l.level].icon;
      return `${ts} ${icon} ${l.category[0]} ${l.message}`;
    });
  }

  renderJSON(logs: LogEntry[]): string {
    return JSON.stringify(
      logs.map(l => ({
        id: l.id,
        ts: this.formatter.formatTimestamp(l.timestamp, 'iso'),
        lvl: l.level,
        cat: l.category,
        msg: l.message,
        ...(l.data && { d: l.data }),
        ...(l.duration !== undefined && { dur: l.duration }),
      })),
      null,
      2,
    );
  }

  renderStats(): string {
    const stats = this.logger.getStats();
    const lines: string[] = [
      '',
      `${BOLD}╔══════════════════════════════════════╗`,
      `║        LOG STATISTICS DASHBOARD      ║`,
      `╚══════════════════════════════════════╝${RESET}`,
      '',
      `${BOLD}Total entries:${RESET} ${stats.total}`,
    ];
    if (stats.oldestEntry) {
      lines.push(`${BOLD}Oldest:${RESET} ${this.formatter.formatTimestamp(stats.oldestEntry, 'iso')}`);
      lines.push(`${BOLD}Newest:${RESET} ${this.formatter.formatTimestamp(stats.newestEntry!, 'iso')}`);
    }
    lines.push(`${BOLD}Avg duration:${RESET} ${stats.avgDuration.toFixed(2)}ms`);
    lines.push('');
    lines.push(`${BOLD}By Level:${RESET}`);
    const maxLevel = Math.max(...Object.values(stats.byLevel));
    for (const [level, count] of Object.entries(stats.byLevel) as [LogLevel, number][]) {
      const bar = '█'.repeat(maxLevel > 0 ? Math.round((count / maxLevel) * 20) : 0);
      lines.push(`  ${LEVEL_FORMAT[level].icon} ${level.padEnd(5)} ${FG_GRAY}${bar}${RESET} ${count}`);
    }
    lines.push('');
    lines.push(`${BOLD}By Category:${RESET}`);
    const maxCat = Math.max(...Object.values(stats.byCategory));
    for (const [cat, count] of Object.entries(stats.byCategory) as [LogCategory, number][]) {
      if (count === 0) continue;
      const bar = '█'.repeat(maxCat > 0 ? Math.round((count / maxCat) * 20) : 0);
      lines.push(`  ${CATEGORY_ICONS[cat]} ${cat.padEnd(14)} ${FG_GRAY}${bar}${RESET} ${count}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  renderTimeline(logs: LogEntry[]): string {
    if (logs.length === 0) return '(no logs)';
    const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
    const start = sorted[0].timestamp;
    const end = sorted[sorted.length - 1].timestamp;
    const totalMs = end - start || 1;
    const maxWidth = 60;
    const lines: string[] = [
      '',
      `${BOLD}Timeline:${RESET} ${this.formatter.formatTimestamp(start, 'iso')} → ${this.formatter.formatTimestamp(end, 'iso')}`,
      '',
    ];
    for (const log of sorted) {
      const offset = log.timestamp - start;
      const pos = Math.round((offset / totalMs) * maxWidth);
      const pad = ' '.repeat(Math.max(0, pos));
      const icon = LEVEL_FORMAT[log.level].icon;
      const cat = log.category[0].toUpperCase();
      lines.push(`${pad}${icon}${cat} ${this.formatter.truncate(log.message, 50)}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  private toCSV(logs: LogEntry[]): string {
    const header = 'id,timestamp,level,category,message,duration,agentId,sessionId,taskId';
    const rows = logs.map(l => {
      const f = this.formatter;
      return [
        f.escapeCSV(l.id),
        f.escapeCSV(this.formatter.formatTimestamp(l.timestamp, 'iso')),
        l.level,
        l.category,
        f.escapeCSV(l.message),
        l.duration ?? '',
        f.escapeCSV(l.agentId ?? ''),
        f.escapeCSV(l.sessionId ?? ''),
        f.escapeCSV(l.taskId ?? ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  private renderMarkdown(logs: LogEntry[]): string {
    const lines: string[] = [
      '# Log Export',
      '',
      `Exported at: ${new Date().toISOString()}`,
      `Total entries: ${logs.length}`,
      '',
      '## Log Entries',
      '',
    ];
    for (const log of logs) {
      const icon = this.formatter.icon(log.level);
      const ts = this.formatter.formatTimestamp(log.timestamp, 'iso');
      lines.push(`### ${icon} ${log.level.toUpperCase()} — ${ts}`);
      lines.push(`- **Category:** ${log.category}`);
      lines.push(`- **ID:** \`${log.id}\``);
      lines.push(`- **Message:** ${log.message}`);
      if (log.data) {
        lines.push('- **Data:**');
        lines.push('```json');
        lines.push(JSON.stringify(log.data, null, 2));
        lines.push('```');
      }
      if (log.stack) {
        lines.push('- **Stack:**');
        lines.push('```');
        lines.push(log.stack);
        lines.push('```');
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
