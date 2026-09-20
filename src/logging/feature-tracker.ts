import { SystemLogger, LogLevel } from './system-logger';

export interface FeatureUsage {
  feature: string;
  count: number;
  lastUsed: number;
  firstUsed: number;
  actions: Map<string, number>;
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  timestamp: number;
  action: string;
  data?: Record<string, unknown>;
}

type ExportFormat = 'json' | 'csv' | 'html' | 'markdown' | 'text';

const LEVEL_ICONS: Record<string, string> = {
  chat: '💬', agent: '◈', session: '◎', task: '◆',
  editor: '✎', file: '📄', terminal: '⌨', git: '⎇',
  extension: '◉', mcp: '◊', lsp: '◈', plugin: '⬡',
  template: '△', security: '🔒', debug: '⚡', search: '⌕',
  settings: '⚙', preview: '👁', diff: '⇄', checkpoint: '⟲',
  backup: '📦', export: '↗',
};

export class FeatureTracker {
  private usage: Map<string, FeatureUsage> = new Map();

  constructor(private readonly logger: SystemLogger) {}

  track(feature: string, action: string, data?: Record<string, unknown>): void {
    const now = Date.now();
    let entry = this.usage.get(feature);
    if (!entry) {
      entry = {
        feature,
        count: 0,
        lastUsed: now,
        firstUsed: now,
        actions: new Map(),
        timeline: [],
      };
      this.usage.set(feature, entry);
    }
    entry.count++;
    entry.lastUsed = now;
    entry.actions.set(action, (entry.actions.get(action) ?? 0) + 1);
    entry.timeline.push({ timestamp: now, action, data });
    this.logger.info('system', `Feature used: ${feature}.${action}`, { feature, action, ...data });
  }

  getFeatureUsage(feature: string): FeatureUsage | undefined {
    return this.usage.get(feature);
  }

  getAllUsage(): Map<string, FeatureUsage> {
    return new Map(this.usage);
  }

  getMostUsedFeatures(limit?: number): FeatureUsage[] {
    const sorted = Array.from(this.usage.values()).sort((a, b) => b.count - a.count);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getLeastUsedFeatures(): FeatureUsage[] {
    return Array.from(this.usage.values()).sort((a, b) => a.count - b.count);
  }

  getFeatureTimeline(feature: string): TimelineEntry[] {
    return this.usage.get(feature)?.timeline ?? [];
  }

  exportUsageReport(format: ExportFormat): string {
    const entries = this.getMostUsedFeatures();
    switch (format) {
      case 'json': return this.toJSON(entries);
      case 'csv': return this.toCSV(entries);
      case 'html': return this.toHTML(entries);
      case 'markdown': return this.toMarkdown(entries);
      case 'text':
      default: return this.toText(entries);
    }
  }

  renderUsageDashboard(): string {
    const entries = this.getMostUsedFeatures();
    const total = entries.reduce((s, e) => s + e.count, 0);
    const maxCount = entries.length > 0 ? entries[0].count : 1;
    const maxBar = 30;
    const lines: string[] = [
      '',
      '\x1b[1m╔══════════════════════════════════════════════════╗',
      '║           FEATURE USAGE DASHBOARD                ║',
      '╚══════════════════════════════════════════════════╝\x1b[0m',
      '',
      `\x1b[1mTotal features tracked:\x1b[0m ${this.usage.size}`,
      `\x1b[1mTotal actions:\x1b[0m ${total}`,
      '',
      '\x1b[1mTop Features:\x1b[0m',
      '',
    ];
    for (const entry of entries) {
      const barLen = Math.round((entry.count / maxCount) * maxBar);
      const bar = '█'.repeat(barLen);
      const icon = LEVEL_ICONS[entry.feature] ?? '•';
      const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0.0';
      lines.push(
        `  ${icon} \x1b[1m${entry.feature.padEnd(12)}\x1b[0m \x1b[36m${bar.padEnd(maxBar)}\x1b[0m ${String(entry.count).padStart(6)} (${pct}%)`,
      );
      const topActions = Array.from(entry.actions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      for (const [action, count] of topActions) {
        lines.push(`     \x1b[2m↳ ${action}: ${count}\x1b[0m`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }

  private toJSON(entries: FeatureUsage[]): string {
    const data = entries.map(e => ({
      feature: e.feature,
      count: e.count,
      firstUsed: new Date(e.firstUsed).toISOString(),
      lastUsed: new Date(e.lastUsed).toISOString(),
      actions: Object.fromEntries(e.actions),
      recentTimeline: e.timeline.slice(-10).map(t => ({
        timestamp: new Date(t.timestamp).toISOString(),
        action: t.action,
        data: t.data,
      })),
    }));
    return JSON.stringify(data, null, 2);
  }

  private toCSV(entries: FeatureUsage[]): string {
    const header = 'feature,count,firstUsed,lastUsed,topActions';
    const rows = entries.map(e => {
      const top = Array.from(e.actions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([a, c]) => `${a}(${c})`)
        .join(';');
      return `${e.feature},${e.count},${new Date(e.firstUsed).toISOString()},${new Date(e.lastUsed).toISOString()},"${top}"`;
    });
    return [header, ...rows].join('\n');
  }

  private toHTML(entries: FeatureUsage[]): string {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const maxCount = entries.length > 0 ? entries[0].count : 1;
    const rows = entries.map(e => {
      const pct = total > 0 ? ((e.count / total) * 100).toFixed(1) : '0';
      const barWidth = Math.round((e.count / maxCount) * 200);
      const top = Array.from(e.actions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const actionList = top.map(([a, c]) => `<span class="action">${a} <small>(${c})</small></span>`).join(' ');
      return `<tr>
  <td>${LEVEL_ICONS[e.feature] ?? ''} ${e.feature}</td>
  <td>${e.count}</td>
  <td><div class="bar" style="width:${barWidth}px"></div></td>
  <td>${pct}%</td>
  <td>${actionList}</td>
  <td>${new Date(e.lastUsed).toISOString()}</td>
</tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Feature Usage Report</title>
<style>
  body { font-family: 'Cascadia Code', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { color: #58a6ff; margin-bottom: 8px; }
  .summary { margin-bottom: 16px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #30363d; }
  th { color: #58a6ff; }
  .bar { height: 12px; background: linear-gradient(90deg, #238636, #3fb950); border-radius: 3px; }
  .action { background: #161b22; padding: 2px 6px; border-radius: 3px; margin-right: 4px; font-size: 12px; }
</style>
</head>
<body>
<h1>Feature Usage Report</h1>
<p class="summary">Generated: ${new Date().toISOString()} | Features: ${this.usage.size} | Total actions: ${total}</p>
<table>
<thead><tr><th>Feature</th><th>Count</th><th>Usage</th><th>%</th><th>Top Actions</th><th>Last Used</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
  }

  private toMarkdown(entries: FeatureUsage[]): string {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const lines: string[] = [
      '# Feature Usage Report',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Features tracked:** ${this.usage.size}`,
      `**Total actions:** ${total}`,
      '',
      '| Feature | Count | % | Top Actions | Last Used |',
      '|---------|-------|---|-------------|-----------|',
    ];
    for (const e of entries) {
      const pct = total > 0 ? ((e.count / total) * 100).toFixed(1) : '0';
      const top = Array.from(e.actions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, c]) => `${a}(${c})`).join(', ');
      lines.push(`| ${e.feature} | ${e.count} | ${pct}% | ${top} | ${new Date(e.lastUsed).toISOString()} |`);
    }
    lines.push('');
    return lines.join('\n');
  }

  private toText(entries: FeatureUsage[]): string {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const maxCount = entries.length > 0 ? entries[0].count : 1;
    const lines: string[] = [
      '═══ FEATURE USAGE REPORT ═══',
      `Generated: ${new Date().toISOString()}`,
      `Features: ${this.usage.size} | Actions: ${total}`,
      '',
    ];
    for (const e of entries) {
      const barLen = Math.round((e.count / maxCount) * 25);
      const bar = '█'.repeat(barLen);
      const icon = LEVEL_ICONS[e.feature] ?? '•';
      lines.push(`${icon} ${e.feature.padEnd(12)} ${bar.padEnd(25)} ${String(e.count).padStart(6)}`);
      const top = Array.from(e.actions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [a, c] of top) {
        lines.push(`   ↳ ${a}: ${c}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }
}
