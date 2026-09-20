import { LogEntry, LogLevel } from './system-logger';

export type TimestampFormat = 'iso' | 'locale' | 'utc' | 'unix' | 'relative';

export interface FormatOptions {
  timestampFormat?: TimestampFormat;
  includeTimestamp?: boolean;
  includeLevel?: boolean;
  includeCategory?: boolean;
  includeData?: boolean;
  includeStack?: boolean;
  maxMessageLength?: number;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  trace: '\x1b[90m',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: ' INFO',
  warn: ' WARN',
  error: 'ERROR',
  trace: 'TRACE',
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '⚙',
  info: '✓',
  warn: '⚠',
  error: '✗',
  trace: 'ℹ',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export class LogFormatter {
  private defaultOptions: FormatOptions = {
    timestampFormat: 'iso',
    includeTimestamp: true,
    includeLevel: true,
    includeCategory: true,
    includeData: false,
    includeStack: false,
    maxMessageLength: 500,
  };

  format(entry: LogEntry, format: 'json' | 'text' | 'pretty' | 'compact' | 'html' | 'markdown' | 'syslog', options?: FormatOptions): string {
    const opts = { ...this.defaultOptions, ...options };
    switch (format) {
      case 'json': return this.formatJSON(entry);
      case 'text': return this.formatText(entry, opts);
      case 'pretty': return this.formatPretty(entry, opts);
      case 'compact': return this.formatCompact(entry);
      case 'html': return this.formatHTML(entry);
      case 'markdown': return this.formatMarkdown(entry);
      case 'syslog': return this.formatSyslog(entry);
    }
  }

  formatJSON(entry: LogEntry): string {
    return JSON.stringify({
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      ...(entry.data !== undefined && { data: entry.data }),
      ...(entry.stack !== undefined && { stack: entry.stack }),
      ...(entry.duration !== undefined && { duration: entry.duration }),
      ...(entry.userId !== undefined && { userId: entry.userId }),
      ...(entry.sessionId !== undefined && { sessionId: entry.sessionId }),
      ...(entry.taskId !== undefined && { taskId: entry.taskId }),
      ...(entry.agentId !== undefined && { agentId: entry.agentId }),
    });
  }

  formatText(entry: LogEntry, options?: FormatOptions): string {
    const opts = { ...this.defaultOptions, ...options };
    const parts: string[] = [];
    if (opts.includeTimestamp) {
      parts.push(this.formatTimestamp(entry.timestamp, opts.timestampFormat ?? 'iso'));
    }
    if (opts.includeLevel) {
      parts.push(`[${LEVEL_LABELS[entry.level]}]`);
    }
    if (opts.includeCategory) {
      parts.push(`[${entry.category}]`);
    }
    let msg = entry.message;
    if (opts.maxMessageLength && msg.length > opts.maxMessageLength) {
      msg = msg.slice(0, opts.maxMessageLength) + '…';
    }
    parts.push(msg);
    if (opts.includeData && entry.data) {
      parts.push(JSON.stringify(entry.data));
    }
    if (opts.includeStack && entry.stack) {
      parts.push('\n' + entry.stack);
    }
    return parts.join(' ');
  }

  formatPretty(entry: LogEntry, options?: FormatOptions): string {
    const opts = { ...this.defaultOptions, ...options };
    const parts: string[] = [];
    const ts = this.formatTimestamp(entry.timestamp, opts.timestampFormat ?? 'locale');
    parts.push(`${DIM}${ts}${RESET}`);
    parts.push(`${LEVEL_COLORS[entry.level]}${BOLD}${this.icon(entry.level)} ${LEVEL_LABELS[entry.level]}${RESET}`);
    parts.push(`${BOLD}[${entry.category}]${RESET}`);
    let msg = entry.message;
    if (opts.maxMessageLength && msg.length > opts.maxMessageLength) {
      msg = msg.slice(0, opts.maxMessageLength) + '…';
    }
    parts.push(msg);
    if (opts.includeData && entry.data) {
      parts.push(`\n  ${DIM}Data:${RESET} ${JSON.stringify(entry.data, null, 2)}`);
    }
    if (opts.includeStack && entry.stack) {
      const stackLines = entry.stack.split('\n').map(l => `  ${DIM}${l}${RESET}`);
      parts.push(stackLines.join('\n'));
    }
    return parts.join(' ');
  }

  formatCompact(entry: LogEntry): string {
    const ts = this.formatTimestamp(entry.timestamp, 'iso');
    return `${ts} ${this.icon(entry.level)} ${entry.category} ${entry.message}`;
  }

  formatHTML(entry: LogEntry): string {
    const ts = this.escapeHTML(this.formatTimestamp(entry.timestamp, 'iso'));
    const level = entry.level.toUpperCase();
    const cat = this.escapeHTML(entry.category);
    const msg = this.escapeHTML(entry.message);
    const dataHtml = entry.data
      ? `<div class="log-data"><pre>${this.escapeHTML(JSON.stringify(entry.data, null, 2))}</pre></div>`
      : '';
    return `<span class="log-entry log-${entry.level}"><span class="log-time">${ts}</span> <span class="log-level">[${level}]</span> <span class="log-category">[${cat}]</span> ${msg}${dataHtml}</span>`;
  }

  formatMarkdown(entry: LogEntry): string {
    const ts = this.formatTimestamp(entry.timestamp, 'iso');
    const icon = this.icon(entry.level);
    const level = entry.level.toUpperCase();
    let md = `**${icon} ${level}** \`[${entry.category}]\` — ${entry.message}`;
    if (entry.data) {
      md += `\n\`\`\`json\n${JSON.stringify(entry.data, null, 2)}\n\`\`\``;
    }
    if (entry.stack) {
      md += `\n> Stack trace:\n> ${entry.stack.split('\n').join('\n> ')}`;
    }
    return md;
  }

  formatSyslog(entry: LogEntry): string {
    const ts = this.formatTimestamp(entry.timestamp, 'iso');
    const priority = this.syslogPriority(entry.level);
    return `<${priority}>${ts} ${entry.category} ${entry.id} — ${entry.message}`;
  }

  formatTimestamp(date: number, format?: TimestampFormat): string {
    const d = new Date(date);
    switch (format ?? 'iso') {
      case 'iso': return d.toISOString();
      case 'utc': return d.toUTCString();
      case 'unix': return `${Math.floor(date / 1000)}`;
      case 'relative': return this.relativeTime(date);
      case 'locale':
      default: return d.toLocaleString();
    }
  }

  colorize(text: string, level: LogLevel): string {
    return `${LEVEL_COLORS[level]}${text}${RESET}`;
  }

  icon(level: LogLevel): string {
    return LEVEL_ICONS[level];
  }

  truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }

  escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeCSV(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 1000) return 'just now';
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  private syslogPriority(level: LogLevel): number {
    const map: Record<LogLevel, number> = { debug: 7, info: 6, warn: 4, error: 3, trace: 7 };
    return map[level] ?? 6;
  }
}
