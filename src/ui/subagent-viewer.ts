import { EventEmitter } from 'events';
import { AgentStreamer, AgentActivity } from '../agent/agent-streamer';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SubAgentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type SubAgentType =
  | 'code-reviewer'
  | 'test-writer'
  | 'doc-generator'
  | 'refactorer'
  | 'debugger'
  | 'analyzer'
  | 'planner'
  | string;

export interface SubAgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  removed: string[];
  added: string[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ToolLogEntry {
  tool: string;
  args: Record<string, unknown>;
  duration: number;
  status: 'success' | 'error' | 'pending';
  result?: string;
  error?: string;
  timestamp: Date;
}

export interface CommandOutputEntry {
  command: string;
  output: string;
  exitCode: number;
  duration: number;
  timestamp: Date;
}

export interface ErrorEntry {
  message: string;
  stack?: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface SubAgentData {
  id: string;
  name: string;
  type: SubAgentType;
  status: SubAgentStatus;
  progress: number;
  task: string;
  startedAt: Date;
  elapsed: number;
  currentStep?: string;
  config?: SubAgentConfig;
  activity: AgentActivity[];
  fileChanges: FileChangeItem[];
  toolLog: ToolLogEntry[];
  commandOutputs: CommandOutputEntry[];
  errors: ErrorEntry[];
  diffs: FileDiff[];
  children: ChildSubAgent[];
  outputSummary?: OutputSummary;
}

export interface FileChangeItem {
  path: string;
  type: 'create' | 'edit' | 'delete';
  additions: number;
  deletions: number;
  timestamp: Date;
}

export interface ChildSubAgent {
  id: string;
  name: string;
  status: SubAgentStatus;
  progress: number;
}

export interface OutputSummary {
  filesReviewed?: number;
  issuesFound?: number;
  suggestions?: number;
}

export interface SubAgentViewerConfig {
  maxActivityItems?: number;
  autoRefreshIntervalMs?: number;
  showDiff?: boolean;
}

// ─── SubAgentViewer ─────────────────────────────────────────────────────────

export class SubAgentViewer extends EventEmitter {
  private container: HTMLElement;
  private agentId: string | null = null;
  private panel: HTMLElement | null = null;
  private data: SubAgentData | null = null;
  private streamer: AgentStreamer | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeFn: (() => void) | null = null;
  private config: Required<SubAgentViewerConfig>;

  private static readonly DEFAULT_CONFIG: Required<SubAgentViewerConfig> = {
    maxActivityItems: 50,
    autoRefreshIntervalMs: 1000,
    showDiff: true,
  };

  constructor(container: HTMLElement, agentId?: string, config?: SubAgentViewerConfig) {
    super();
    this.container = container;
    this.config = { ...SubAgentViewer.DEFAULT_CONFIG, ...config };

    if (agentId) {
      this.open(agentId);
    }
  }

  open(agentId: string): void {
    this.agentId = agentId;
    this.render();
    this.subscribe();
    this.emit('open', agentId);
  }

  close(): void {
    this.unsubscribe();
    this.stopRefresh();
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    this.agentId = null;
    this.data = null;
    this.emit('close');
  }

  render(): HTMLElement {
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'subagent-viewer';
      this.panel.style.cssText = `
        position: fixed; top: 0; right: 0; bottom: 0;
        width: 520px; background: #1e1e1e; border-left: 1px solid #333;
        display: flex; flex-direction: column; z-index: 1000;
        font-family: 'Segoe UI', system-ui, sans-serif; color: #d4d4d4;
        box-shadow: -4px 0 20px rgba(0,0,0,0.4);
      `;
      this.container.appendChild(this.panel);
    }

    this.panel.innerHTML = '';

    if (this.data) {
      this.panel.appendChild(this.renderHeader(this.data));
      this.panel.appendChild(this.renderLiveStatus(this.data));
      this.panel.appendChild(this.renderProgressTimeline(this.data));
      this.panel.appendChild(this.renderActivityFeed(this.data));
      this.panel.appendChild(this.renderFileChanges(this.data));
      this.panel.appendChild(this.renderToolLog(this.data));
      this.panel.appendChild(this.renderCommandOutput(this.data));
      this.panel.appendChild(this.renderErrors(this.data));

      if (this.config.showDiff && this.data.diffs.length > 0) {
        this.panel.appendChild(this.renderDiffView(this.data));
      }

      this.panel.appendChild(this.renderCodePreview(this.data));

      if (this.data.children.length > 0) {
        this.panel.appendChild(this.renderSubAgents(this.data));
      }

      this.panel.appendChild(this.renderActions(this.data));
    } else {
      const loading = document.createElement('div');
      loading.className = 'subagent-viewer__loading';
      loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#888;';
      loading.textContent = 'Loading agent data...';
      this.panel.appendChild(loading);
    }

    return this.panel;
  }

  renderHeader(agent: SubAgentData): HTMLElement {
    const header = document.createElement('div');
    header.className = 'subagent-viewer__header';
    header.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-bottom: 1px solid #333; background: #252526;
    `;

    const backBtn = document.createElement('button');
    backBtn.className = 'subagent-viewer__back';
    backBtn.style.cssText = `
      background: none; border: none; color: #4fc1ff; cursor: pointer;
      font-size: 14px; padding: 4px 8px; border-radius: 4px;
    `;
    backBtn.textContent = '\u2190 Back';
    backBtn.addEventListener('click', () => this.close());
    header.appendChild(backBtn);

    const name = document.createElement('span');
    name.className = 'subagent-viewer__name';
    name.style.cssText = 'font-weight: 600; font-size: 14px; color: #e0e0e0; flex: 1;';
    name.textContent = agent.name;
    header.appendChild(name);

    const status = this.renderStatusBadge(agent.status);
    header.appendChild(status);

    if (agent.status === 'running') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'subagent-viewer__cancel';
      cancelBtn.style.cssText = `
        background: #5a1d1d; border: 1px solid #f44; color: #f66;
        padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
      `;
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => this.emit('cancel', agent.id));
      header.appendChild(cancelBtn);
    }

    return header;
  }

  renderLiveStatus(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__live-status';
    section.style.cssText = `
      padding: 12px 16px; border-bottom: 1px solid #333; background: #1e1e1e;
    `;

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = 'Live Status';
    section.appendChild(title);

    const rows = document.createElement('div');
    rows.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    const dotColor = this.getStatusColor(agent.status);
    const progressFilled = Math.floor(agent.progress / 5);
    const progressEmpty = 20 - progressFilled;

    const progressRow = this.createStatusRow(
      `\u25cf Progress: ${agent.progress}%`,
      `${'\u2588'.repeat(progressFilled)}${'\u2591'.repeat(progressEmpty)}`
    );
    progressRow.querySelector<HTMLElement>('.subagent-viewer__status-label')!.style.color = dotColor;
    rows.appendChild(progressRow);

    rows.appendChild(this.createStatusRow(
      `\u25cf Elapsed: ${this.formatElapsed(agent.elapsed)}`
    ));

    if (agent.currentStep) {
      rows.appendChild(this.createStatusRow(
        `\u25cf Current: ${agent.currentStep}`
      ));
    }

    section.appendChild(rows);
    return section;
  }

  renderProgressTimeline(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__progress-timeline';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = 'Progress Timeline';
    section.appendChild(title);

    const timeline = document.createElement('div');
    timeline.className = 'subagent-viewer__timeline';
    timeline.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const progressEntries = agent.activity.filter(a => a.type === 'progress');
    const maxEntries = Math.min(progressEntries.length, 10);
    const entries = progressEntries.slice(-maxEntries);

    for (const entry of entries) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px;';

      const time = document.createElement('span');
      time.style.cssText = 'color: #666; font-family: monospace; min-width: 60px;';
      time.textContent = this.formatTimestamp(entry.timestamp);
      row.appendChild(time);

      const bar = document.createElement('div');
      bar.style.cssText = 'flex: 1; height: 4px; background: #333; border-radius: 2px;';
      const fill = document.createElement('div');
      const pct = entry.data.current !== undefined && entry.data.total !== undefined
        ? Math.round((entry.data.current / entry.data.total) * 100)
        : agent.progress;
      fill.style.cssText = `width: ${pct}%; height: 100%; background: #4fc1ff; border-radius: 2px; transition: width 0.3s;`;
      bar.appendChild(fill);
      row.appendChild(bar);

      const label = document.createElement('span');
      label.style.cssText = 'color: #999; min-width: 36px; text-align: right;';
      label.textContent = `${pct}%`;
      row.appendChild(label);

      timeline.appendChild(row);
    }

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: #666; font-size: 12px;';
      empty.textContent = 'No progress data yet';
      timeline.appendChild(empty);
    }

    section.appendChild(timeline);
    return section;
  }

  renderActivityFeed(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__activity';
    section.style.cssText = `
      padding: 12px 16px; border-bottom: 1px solid #333;
      max-height: 200px; overflow-y: auto;
    `;

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = 'Activity Feed';
    section.appendChild(title);

    const feed = document.createElement('div');
    feed.className = 'subagent-viewer__feed';
    feed.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const items = agent.activity.slice(-this.config.maxActivityItems);

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'subagent-viewer__feed-item';
      row.style.cssText = `
        display: flex; align-items: flex-start; gap: 8px; font-size: 12px;
        padding: 3px 0; font-family: 'Cascadia Code', 'Fira Code', monospace;
      `;

      const time = document.createElement('span');
      time.style.cssText = 'color: #666; min-width: 60px; flex-shrink: 0;';
      time.textContent = this.formatTime(item.timestamp);
      row.appendChild(time);

      const icon = document.createElement('span');
      icon.style.cssText = `color: ${this.getActivityColor(item)}; flex-shrink: 0;`;
      icon.textContent = this.getActivityIcon(item);
      row.appendChild(icon);

      const msg = document.createElement('span');
      msg.style.cssText = 'color: #ccc; word-break: break-word;';
      msg.textContent = item.data.message;
      row.appendChild(msg);

      if (item.duration !== undefined) {
        const dur = document.createElement('span');
        dur.style.cssText = 'color: #666; margin-left: auto; flex-shrink: 0;';
        dur.textContent = `(${this.formatDuration(item.duration)})`;
        row.appendChild(dur);
      }

      feed.appendChild(row);
    }

    section.appendChild(feed);
    return section;
  }

  renderFileChanges(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__files';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = `Files Modified (${agent.fileChanges.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    for (const file of agent.fileChanges) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; font-size: 12px;
        padding: 3px 0; font-family: 'Cascadia Code', 'Fira Code', monospace;
      `;

      const icon = document.createElement('span');
      icon.style.cssText = `color: ${this.getFileIconColor(file.type)};`;
      icon.textContent = this.getFileIcon(file.type);
      row.appendChild(icon);

      const path = document.createElement('span');
      path.style.cssText = 'color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      path.textContent = file.path;
      path.title = file.path;
      row.appendChild(path);

      const stats = document.createElement('span');
      stats.style.cssText = 'color: #888; flex-shrink: 0;';
      stats.textContent = `(+${file.additions}, -${file.deletions})`;
      row.appendChild(stats);

      list.appendChild(row);
    }

    section.appendChild(list);
    return section;
  }

  renderToolLog(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__tools';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = `Tool Usage Log (${agent.toolLog.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    for (const entry of agent.toolLog) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; font-size: 12px;
        padding: 3px 0; font-family: 'Cascadia Code', 'Fira Code', monospace;
      `;

      const statusIcon = document.createElement('span');
      const statusColor = entry.status === 'success' ? '#4ec9b0' : entry.status === 'error' ? '#f44' : '#dcdcaa';
      statusIcon.style.cssText = `color: ${statusColor};`;
      statusIcon.textContent = entry.status === 'success' ? '\u2713' : entry.status === 'error' ? '\u2717' : '\u25cb';
      row.appendChild(statusIcon);

      const tool = document.createElement('span');
      tool.style.cssText = 'color: #dcdcaa; min-width: 80px;';
      tool.textContent = entry.tool;
      row.appendChild(tool);

      const duration = document.createElement('span');
      duration.style.cssText = 'color: #888; margin-left: auto;';
      duration.textContent = this.formatDuration(entry.duration);
      row.appendChild(duration);

      list.appendChild(row);
    }

    section.appendChild(list);
    return section;
  }

  renderCommandOutput(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__commands';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = `Command Outputs (${agent.commandOutputs.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    for (const entry of agent.commandOutputs) {
      const item = document.createElement('div');
      item.style.cssText = 'background: #1a1a1a; border-radius: 4px; padding: 8px; font-family: monospace;';

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 4px;';

      const cmdText = document.createElement('span');
      cmdText.style.cssText = 'color: #569cd6; font-size: 12px;';
      cmdText.textContent = `$ ${entry.command}`;
      header.appendChild(cmdText);

      const exitBadge = document.createElement('span');
      const exitColor = entry.exitCode === 0 ? '#4ec9b0' : '#f44';
      exitBadge.style.cssText = `color: ${exitColor}; font-size: 11px; margin-left: auto;`;
      exitBadge.textContent = `exit ${entry.exitCode}`;
      header.appendChild(exitBadge);

      item.appendChild(header);

      if (entry.output) {
        const output = document.createElement('pre');
        output.style.cssText = `
          color: #999; font-size: 11px; margin: 0; overflow-x: auto;
          max-height: 80px; overflow-y: auto; white-space: pre-wrap;
        `;
        output.textContent = entry.output.length > 300
          ? entry.output.slice(0, 300) + '\n... (truncated)'
          : entry.output;
        item.appendChild(output);
      }

      list.appendChild(item);
    }

    section.appendChild(list);
    return section;
  }

  renderErrors(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__errors';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = `Errors (${agent.errors.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const err of agent.errors) {
      const item = document.createElement('div');
      item.style.cssText = `
        background: ${err.recoverable ? '#2d2a1e' : '#2d1e1e'};
        border-left: 3px solid ${err.recoverable ? '#dcdcaa' : '#f44'};
        padding: 6px 10px; border-radius: 0 4px 4px 0;
      `;

      const msg = document.createElement('div');
      msg.style.cssText = 'font-size: 12px; color: #d4d4d4;';
      msg.textContent = err.message;
      item.appendChild(msg);

      if (err.stack) {
        const stack = document.createElement('pre');
        stack.style.cssText = 'font-size: 10px; color: #888; margin: 4px 0 0; max-height: 40px; overflow: hidden;';
        stack.textContent = err.stack.slice(0, 200);
        item.appendChild(stack);
      }

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size: 10px; color: #666; margin-top: 4px;';
      meta.textContent = `${err.recoverable ? 'Recoverable' : 'Fatal'} \u2022 ${this.formatTime(err.timestamp)}`;
      item.appendChild(meta);

      list.appendChild(item);
    }

    section.appendChild(list);
    return section;
  }

  renderDiffView(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__diff';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = 'Diff View';
    section.appendChild(title);

    for (const diff of agent.diffs) {
      const fileHeader = document.createElement('div');
      fileHeader.style.cssText = 'color: #4fc1ff; font-size: 12px; margin: 8px 0 4px; font-family: monospace;';
      fileHeader.textContent = diff.path;
      section.appendChild(fileHeader);

      const diffBlock = document.createElement('div');
      diffBlock.style.cssText = `
        background: #1a1a1a; border-radius: 4px; padding: 8px;
        font-family: 'Cascadia Code', monospace; font-size: 12px;
        overflow-x: auto; line-height: 1.5;
      `;

      for (const hunk of diff.hunks) {
        const headerEl = document.createElement('div');
        headerEl.style.cssText = 'color: #888; margin: 4px 0;';
        headerEl.textContent = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
        diffBlock.appendChild(headerEl);

        for (const line of hunk.removed) {
          const el = document.createElement('div');
          el.style.cssText = 'color: #f44; background: rgba(255,0,0,0.1);';
          el.textContent = `- ${line}`;
          diffBlock.appendChild(el);
        }

        for (const line of hunk.added) {
          const el = document.createElement('div');
          el.style.cssText = 'color: #4ec9b0; background: rgba(0,255,0,0.1);';
          el.textContent = `+ ${line}`;
          diffBlock.appendChild(el);
        }
      }

      section.appendChild(diffBlock);
    }

    return section;
  }

  renderCodePreview(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__code-preview';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = 'Code Preview';
    section.appendChild(title);

    const preview = document.createElement('div');
    preview.style.cssText = `
      background: #1a1a1a; border-radius: 4px; padding: 8px;
      font-family: 'Cascadia Code', monospace; font-size: 12px;
      max-height: 150px; overflow: auto; color: #d4d4d4; white-space: pre;
    `;
    preview.textContent = agent.diffs.length > 0
      ? this.extractPreviewFromDiffs(agent.diffs)
      : 'No code changes to preview';
    section.appendChild(preview);

    return section;
  }

  renderSubAgents(agent: SubAgentData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'subagent-viewer__sub-agents';
    section.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #333;';

    const title = document.createElement('div');
    title.className = 'subagent-viewer__section-title';
    title.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px;';
    title.textContent = `Sub-Agents (${agent.children.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const child of agent.children) {
      const row = document.createElement('div');
      row.className = 'subagent-viewer__child';
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; font-size: 12px;
        padding: 4px 8px; border-radius: 4px; cursor: pointer;
        background: #252526; border: 1px solid #333;
      `;
      row.addEventListener('mouseenter', () => { row.style.borderColor = '#4fc1ff'; });
      row.addEventListener('mouseleave', () => { row.style.borderColor = '#333'; });
      row.addEventListener('click', () => this.emit('navigate', child.id));

      const arrow = document.createElement('span');
      arrow.style.cssText = 'color: #4fc1ff;';
      arrow.textContent = '\u25b6\u2500\u2500';
      row.appendChild(arrow);

      const name = document.createElement('span');
      name.style.cssText = 'color: #d4d4d4; flex: 1;';
      name.textContent = child.name;
      row.appendChild(name);

      const status = this.renderStatusBadge(child.status);
      row.appendChild(status);

      if (child.status === 'running') {
        const pct = document.createElement('span');
        pct.style.cssText = 'color: #888; font-size: 11px;';
        pct.textContent = `${child.progress}%`;
        row.appendChild(pct);
      }

      list.appendChild(row);
    }

    section.appendChild(list);
    return section;
  }

  renderActions(agent: SubAgentData): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'subagent-viewer__actions';
    bar.style.cssText = `
      display: flex; gap: 8px; padding: 12px 16px; background: #252526;
      border-top: 1px solid #333; flex-wrap: wrap;
    `;

    if (agent.status === 'failed') {
      bar.appendChild(this.createActionButton('Retry', '#4fc1ff', () => this.emit('retry', agent.id)));
    }

    bar.appendChild(this.createActionButton('View Logs', '#888', () => this.emit('viewLogs', agent.id)));
    bar.appendChild(this.createActionButton('Export', '#888', () => this.emit('export', agent.id)));
    bar.appendChild(this.createActionButton('Open in Editor', '#888', () => this.emit('openInEditor', agent.id)));

    return bar;
  }

  refresh(): void {
    this.emit('refresh', this.agentId);
  }

  subscribe(): void {
    if (!this.agentId) return;

    if (this.streamer) {
      this.unsubscribeFn = this.streamer.onActivity((activity) => {
        this.handleLiveUpdate(activity);
      });
    }

    this.startRefresh();
    this.emit('subscribe', this.agentId);
  }

  unsubscribe(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    this.stopRefresh();
    this.emit('unsubscribe', this.agentId);
  }

  setData(data: SubAgentData): void {
    this.data = data;
    if (this.panel) {
      this.render();
    }
  }

  setStreamer(streamer: AgentStreamer): void {
    if (this.streamer) {
      this.unsubscribe();
    }
    this.streamer = streamer;
    if (this.agentId) {
      this.subscribe();
    }
  }

  private handleLiveUpdate(activity: AgentActivity): void {
    if (!this.data) return;

    this.data.activity.push(activity);

    if (activity.type === 'progress' && activity.data.current !== undefined && activity.data.total !== undefined) {
      this.data.progress = Math.round((activity.data.current / activity.data.total) * 100);
    }

    if (activity.type === 'error') {
      this.data.errors.push({
        message: activity.data.message,
        stack: activity.data.context,
        timestamp: activity.timestamp,
        recoverable: false,
      });
    }

    this.render();
    this.emit('update', activity);
  }

  private startRefresh(): void {
    this.stopRefresh();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, this.config.autoRefreshIntervalMs);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private renderStatusBadge(status: SubAgentStatus): HTMLElement {
    const badge = document.createElement('span');
    const color = this.getStatusColor(status);
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 10px; font-size: 11px;
      background: ${color}22; color: ${color}; border: 1px solid ${color}44;
    `;

    const dot = document.createElement('span');
    dot.style.cssText = `width: 6px; height: 6px; border-radius: 50%; background: ${color};`;
    if (status === 'running') {
      dot.style.animation = 'pulse 1.5s infinite';
    }
    badge.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    badge.appendChild(label);

    return badge;
  }

  private createStatusRow(label: string, value?: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px;';

    const labelEl = document.createElement('span');
    labelEl.className = 'subagent-viewer__status-label';
    labelEl.style.cssText = 'color: #4ec9b0;';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    if (value) {
      const valueEl = document.createElement('span');
      valueEl.style.cssText = 'color: #888; font-family: monospace;';
      valueEl.textContent = value;
      row.appendChild(valueEl);
    }

    return row;
  }

  private createActionButton(label: string, color: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: ${color}22; border: 1px solid ${color}44; color: ${color};
      padding: 6px 14px; border-radius: 4px; cursor: pointer;
      font-size: 12px; transition: background 0.15s;
    `;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => { btn.style.background = `${color}33`; });
    btn.addEventListener('mouseleave', () => { btn.style.background = `${color}22`; });
    return btn;
  }

  private getStatusColor(status: SubAgentStatus): string {
    switch (status) {
      case 'running': return '#4ec9b0';
      case 'completed': return '#4fc1ff';
      case 'failed': return '#f44';
      case 'cancelled': return '#888';
      case 'queued': return '#dcdcaa';
    }
  }

  private getActivityIcon(activity: AgentActivity): string {
    switch (activity.type) {
      case 'read': return '\u2713';
      case 'edit': return '\u270f';
      case 'create': return '\u2795';
      case 'delete': return '\u2796';
      case 'search': return '\u2315';
      case 'tool': return '\u2699';
      case 'command': return '\u2328';
      case 'error': return '\u26a0';
      case 'progress': return '\u25cf';
      default: return '\u25cf';
    }
  }

  private getActivityColor(activity: AgentActivity): string {
    switch (activity.status) {
      case 'success': return '#4ec9b0';
      case 'error': return '#f44';
      case 'pending': return '#dcdcaa';
      case 'running': return '#4fc1ff';
    }
  }

  private getFileIcon(type: string): string {
    switch (type) {
      case 'create': return '\u2795';
      case 'edit': return '\u270f';
      case 'delete': return '\u2796';
      default: return '\u25cf';
    }
  }

  private getFileIconColor(type: string): string {
    switch (type) {
      case 'create': return '#4ec9b0';
      case 'edit': return '#4fc1ff';
      case 'delete': return '#f44';
      default: return '#888';
    }
  }

  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  private formatTimestamp(date: Date): string {
    return date.toTimeString().slice(0, 8);
  }

  private formatTime(date: Date): string {
    return date.toTimeString().slice(0, 8);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private extractPreviewFromDiffs(diffs: FileDiff[]): string {
    const lines: string[] = [];
    for (const diff of diffs) {
      lines.push(`// ${diff.path}`);
      for (const hunk of diff.hunks) {
        for (const line of hunk.added.slice(0, 5)) {
          lines.push(`+ ${line}`);
        }
      }
      if (lines.length > 20) break;
    }
    return lines.join('\n');
  }
}
