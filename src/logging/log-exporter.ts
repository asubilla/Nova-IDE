import * as fs from 'fs';
import { SystemLogger, LogEntry, LogFilter, LogLevel, LogCategory } from './system-logger';
import { LogFormatter } from './log-formatter';

export type ExportFormat = 'json' | 'csv' | 'html' | 'text' | 'markdown' | 'syslog';

export interface ExportOptions {
  includeData?: boolean;
  includeStack?: boolean;
  minLevel?: LogLevel;
  maxEntries?: number;
  startDate?: number;
  endDate?: number;
  categories?: LogCategory[];
  prettyPrint?: boolean;
}

interface FeatureUsage {
  feature: string;
  count: number;
  lastUsed: number;
  firstUsed: number;
  actions: Map<string, number>;
  timeline: Array<{ timestamp: number; action: string; data?: Record<string, unknown> }>;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4,
};

export class LogExporter {
  private formatter: LogFormatter;
  private streamingStreams: Map<string, fs.WriteStream> = new Map();

  constructor(private readonly logger: SystemLogger) {
    this.formatter = new LogFormatter();
  }

  exportJSON(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    const formatted = logs.map(l => {
      const entry: Record<string, unknown> = {
        id: l.id,
        timestamp: new Date(l.timestamp).toISOString(),
        level: l.level,
        category: l.category,
        message: l.message,
      };
      if (options?.includeData !== false && l.data) entry.data = l.data;
      if (options?.includeStack !== false && l.stack) entry.stack = l.stack;
      if (l.duration !== undefined) entry.duration = l.duration;
      if (l.userId) entry.userId = l.userId;
      if (l.sessionId) entry.sessionId = l.sessionId;
      if (l.taskId) entry.taskId = l.taskId;
      if (l.agentId) entry.agentId = l.agentId;
      return entry;
    });
    return JSON.stringify(formatted, null, options?.prettyPrint !== false ? 2 : undefined);
  }

  exportCSV(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    const header = 'id,timestamp,level,category,message,duration,agentId,sessionId,taskId,userId';
    const rows = logs.map(l => {
      const f = this.formatter;
      return [
        f.escapeCSV(l.id),
        f.escapeCSV(new Date(l.timestamp).toISOString()),
        l.level,
        l.category,
        f.escapeCSV(l.message),
        l.duration ?? '',
        f.escapeCSV(l.agentId ?? ''),
        f.escapeCSV(l.sessionId ?? ''),
        f.escapeCSV(l.taskId ?? ''),
        f.escapeCSV(l.userId ?? ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  exportHTML(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    const stats = this.logger.getStats();
    const levelCounts: Record<string, number> = {};
    const catCounts: Record<string, number> = {};
    for (const l of logs) {
      levelCounts[l.level] = (levelCounts[l.level] || 0) + 1;
      catCounts[l.category] = (catCounts[l.category] || 0) + 1;
    }

    const rows = logs.map(l => {
      const ts = this.formatter.formatTimestamp(l.timestamp, 'iso');
      const icon = this.formatter.icon(l.level);
      const dataCell = (options?.includeData !== false && l.data)
        ? `<td class="expandable" onclick="this.classList.toggle('expanded')"><pre>${this.formatter.escapeHTML(JSON.stringify(l.data, null, 2))}</pre></td>`
        : '';
      return `<tr class="log-row level-${l.level}" data-level="${l.level}" data-category="${l.category}">
  <td class="ts">${ts}</td>
  <td class="level level-${l.level}">${icon} ${l.level.toUpperCase()}</td>
  <td class="cat">${l.category}</td>
  <td class="msg">${this.formatter.escapeHTML(l.message)}</td>
  ${dataCell}
</tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Log Export — ${new Date().toISOString()}</title>
<style>
  :root {
    --bg: #0d1117; --fg: #c9d1d9; --border: #30363d;
    --bg-hover: #161b22; --bg-row: #0d1117;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cascadia Code', 'Fira Code', monospace; background: var(--bg); color: var(--fg); padding: 20px; }
  h1 { margin-bottom: 10px; color: #58a6ff; }
  .controls { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .controls input, .controls select { background: var(--bg); color: var(--fg); border: 1px solid var(--border); padding: 6px 10px; border-radius: 4px; font-family: inherit; }
  .controls input { flex: 1; min-width: 200px; }
  .controls select { min-width: 120px; }
  .stats { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; }
  .stats span { background: #161b22; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border); position: sticky; top: 0; background: var(--bg); cursor: pointer; user-select: none; }
  thead th:hover { color: #58a6ff; }
  tbody tr { border-bottom: 1px solid var(--border); }
  tbody tr:hover { background: var(--bg-hover); }
  td { padding: 6px 10px; vertical-align: top; }
  td.ts { white-space: nowrap; color: var(--border); }
  td.level { white-space: nowrap; font-weight: bold; }
  td.msg { word-break: break-word; }
  td.expandable pre { display: none; background: #161b22; padding: 8px; border-radius: 4px; margin-top: 4px; font-size: 12px; overflow-x: auto; }
  td.expandable.expanded pre { display: block; }
  .level-debug { color: #58a6ff; }
  .level-info { color: #3fb950; }
  .level-warn { color: #d29922; }
  .level-error { color: #f85149; }
  .level-trace { color: #8b949e; }
  .cat { color: #8b949e; }
  .hidden { display: none; }
</style>
</head>
<body>
<h1>Log Export Report</h1>
<div class="stats">
  <span>Total: ${logs.length}</span>
  <span>Errors: ${levelCounts['error'] || 0}</span>
  <span>Warnings: ${levelCounts['warn'] || 0}</span>
  <span>Range: ${logs.length > 0 ? this.formatter.formatTimestamp(logs[0].timestamp, 'iso') + ' → ' + this.formatter.formatTimestamp(logs[logs.length - 1].timestamp, 'iso') : 'N/A'}</span>
</div>
<div class="controls">
  <input type="text" id="search" placeholder="Search logs..." oninput="filterLogs()">
  <select id="levelFilter" onchange="filterLogs()">
    <option value="">All Levels</option>
    <option value="trace">Trace</option>
    <option value="debug">Debug</option>
    <option value="info">Info</option>
    <option value="warn">Warn</option>
    <option value="error">Error</option>
  </select>
  <select id="catFilter" onchange="filterLogs()">
    <option value="">All Categories</option>
    ${[...new Set(logs.map(l => l.category))].map(c => `<option value="${c}">${c}</option>`).join('\n    ')}
  </select>
</div>
<table>
<thead>
<tr>
  <th onclick="sortTable(0)">Timestamp</th>
  <th onclick="sortTable(1)">Level</th>
  <th onclick="sortTable(2)">Category</th>
  <th>Message</th>
  ${options?.includeData !== false ? '<th>Data</th>' : ''}
</tr>
</thead>
<tbody id="logBody">
${rows}
</tbody>
</table>
<script>
function filterLogs() {
  const q = document.getElementById('search').value.toLowerCase();
  const lvl = document.getElementById('levelFilter').value;
  const cat = document.getElementById('catFilter').value;
  document.querySelectorAll('.log-row').forEach(r => {
    const matchLevel = !lvl || r.dataset.level === lvl;
    const matchCat = !cat || r.dataset.category === cat;
    const matchSearch = !q || r.textContent.toLowerCase().includes(q);
    r.classList.toggle('hidden', !(matchLevel && matchCat && matchSearch));
  });
}
let sortDir = 1;
function sortTable(col) {
  const tbody = document.getElementById('logBody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const av = a.children[col]?.textContent || '';
    const bv = b.children[col]?.textContent || '';
    return av.localeCompare(bv) * sortDir;
  });
  sortDir *= -1;
  rows.forEach(r => tbody.appendChild(r));
}
</script>
</body>
</html>`;
  }

  exportText(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    return logs.map(l => this.formatter.formatText(l, {
      includeTimestamp: true,
      includeLevel: true,
      includeCategory: true,
      includeData: options?.includeData !== false,
      includeStack: options?.includeStack !== false,
    })).join('\n');
  }

  exportMarkdown(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    const lines: string[] = [
      '# Log Export',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Entries:** ${logs.length}`,
      '',
      '---',
      '',
    ];
    for (const log of logs) {
      const icon = this.formatter.icon(log.level);
      const ts = this.formatter.formatTimestamp(log.timestamp, 'iso');
      lines.push(`### ${icon} ${log.level.toUpperCase()} \`${log.category}\` — ${ts}`);
      lines.push('');
      lines.push(log.message);
      if (options?.includeData !== false && log.data) {
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(log.data, null, 2));
        lines.push('```');
      }
      if (options?.includeStack !== false && log.stack) {
        lines.push('');
        lines.push('> ' + log.stack.split('\n').join('\n> '));
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    return lines.join('\n');
  }

  exportSyslog(filter?: LogFilter, options?: ExportOptions): string {
    const logs = this.resolveLogs(filter, options);
    return logs.map(l => this.formatter.formatSyslog(l)).join('\n');
  }

  async exportToClipboard(format: ExportFormat, filter?: LogFilter, options?: ExportOptions): Promise<void> {
    const content = this.getContentForFormat(format, filter, options);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(content);
    } else if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(content);
    }
  }

  downloadLog(format: ExportFormat, filename?: string, filter?: LogFilter, options?: ExportOptions): void {
    const content = this.getContentForFormat(format, filter, options);
    const ext = format === 'markdown' ? 'md' : format;
    const name = filename ?? `logs-${Date.now()}.${ext}`;
    if (typeof document !== 'undefined') {
      const blob = new Blob([content], { type: this.getMimeType(format) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  async sendToWebhook(url: string, filter?: LogFilter, options?: ExportOptions): Promise<void> {
    const logs = this.resolveLogs(filter, options);
    const payload = logs.map(l => ({
      id: l.id,
      timestamp: new Date(l.timestamp).toISOString(),
      level: l.level,
      category: l.category,
      message: l.message,
      data: l.data,
      stack: l.stack,
      duration: l.duration,
    }));
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: payload, exportedAt: new Date().toISOString() }),
    });
  }

  async saveToFile(path: string, format: ExportFormat, filter?: LogFilter, options?: ExportOptions): Promise<void> {
    const content = this.getContentForFormat(format, filter, options);
    await fs.promises.writeFile(path, content, 'utf-8');
  }

  streamToFile(path: string): () => void {
    const stream = fs.createWriteStream(path, { flags: 'a' });
    this.streamingStreams.set(path, stream);
    const unsub = this.logger.subscribe((entry) => {
      if (stream.writable) {
        stream.write(this.formatter.formatJSON(entry) + '\n');
      }
    });
    return () => {
      unsub();
      stream.end();
      this.streamingStreams.delete(path);
    };
  }

  async getFileSize(path: string): Promise<number> {
    const stat = await fs.promises.stat(path);
    return stat.size;
  }

  private resolveLogs(filter?: LogFilter, options?: ExportOptions): LogEntry[] {
    let logs = this.logger.getLogs(filter);
    if (options?.minLevel) {
      const min = LEVEL_PRIORITY[options.minLevel];
      logs = logs.filter(l => LEVEL_PRIORITY[l.level] >= min);
    }
    if (options?.startDate) {
      logs = logs.filter(l => l.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      logs = logs.filter(l => l.timestamp <= options.endDate!);
    }
    if (options?.categories && options.categories.length > 0) {
      const cats = new Set(options.categories);
      logs = logs.filter(l => cats.has(l.category));
    }
    if (options?.maxEntries && logs.length > options.maxEntries) {
      logs = logs.slice(-options.maxEntries);
    }
    return logs;
  }

  private getContentForFormat(format: ExportFormat, filter?: LogFilter, options?: ExportOptions): string {
    switch (format) {
      case 'json': return this.exportJSON(filter, options);
      case 'csv': return this.exportCSV(filter, options);
      case 'html': return this.exportHTML(filter, options);
      case 'text': return this.exportText(filter, options);
      case 'markdown': return this.exportMarkdown(filter, options);
      case 'syslog': return this.exportSyslog(filter, options);
    }
  }

  private getMimeType(format: ExportFormat): string {
    const map: Record<ExportFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      html: 'text/html',
      text: 'text/plain',
      markdown: 'text/markdown',
      syslog: 'text/plain',
    };
    return map[format] ?? 'text/plain';
  }
}
