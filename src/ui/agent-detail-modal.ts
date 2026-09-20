import { EventEmitter } from 'events';
import { AgentStreamer, AgentActivity } from '../agent/agent-streamer';
import { SubAgentData, SubAgentStatus, SubAgentType, FileChangeItem, ToolLogEntry, CommandOutputEntry, ErrorEntry, FileDiff, ChildSubAgent, OutputSummary } from './subagent-viewer';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ModalTab = 'overview' | 'logs' | 'timeline' | 'files' | 'tools' | 'errors' | 'sub-agents';

export interface ModalConfig {
  overlayOpacity?: number;
  maxLogs?: number;
  maxTimelineItems?: number;
}

export interface AgentFullData extends SubAgentData {
  task: string;
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// ─── AgentDetailModal ───────────────────────────────────────────────────────

export class AgentDetailModal extends EventEmitter {
  private overlay: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private agentId: string | null = null;
  private data: AgentFullData | null = null;
  private streamer: AgentStreamer | null = null;
  private activeTab: ModalTab = 'overview';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeFn: (() => void) | null = null;
  private config: Required<ModalConfig>;

  private static readonly DEFAULT_CONFIG: Required<ModalConfig> = {
    overlayOpacity: 0.6,
    maxLogs: 100,
    maxTimelineItems: 50,
  };

  constructor(config?: ModalConfig) {
    super();
    this.config = { ...AgentDetailModal.DEFAULT_CONFIG, ...config };
  }

  open(agentId: string): void {
    this.agentId = agentId;
    this.activeTab = 'overview';
    this.renderOverlay();
    this.subscribe();
    this.emit('open', agentId);
  }

  close(): void {
    this.unsubscribe();
    this.stopRefresh();
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        this.content = null;
      }, 200);
    }
    this.agentId = null;
    this.data = null;
    this.emit('close');
  }

  render(agent: AgentFullData): HTMLElement {
    this.data = agent;

    if (!this.overlay) {
      this.renderOverlay();
    } else {
      this.updateContent();
    }

    return this.overlay!;
  }

  renderOverview(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.className = 'agent-detail__overview';
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = 'Overview';
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;';

    const fields = [
      { label: 'Type', value: agent.type, color: '#4fc1ff' },
      { label: 'Status', value: agent.status, color: this.getStatusColor(agent.status) },
      { label: 'Progress', value: `${agent.progress}%`, color: '#4ec9b0' },
      { label: 'Started', value: this.formatTime(agent.startedAt), color: '#d4d4d4' },
      { label: 'Duration', value: this.formatElapsed(agent.elapsed), color: '#d4d4d4' },
      { label: 'Task', value: agent.task, color: '#d4d4d4', span: 2 },
    ];

    for (const field of fields) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        background: #252526; border-radius: 6px; padding: 12px;
        ${field.span === 2 ? 'grid-column: span 2;' : ''}
      `;

      const label = document.createElement('div');
      label.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 4px;';
      label.textContent = field.label;
      cell.appendChild(label);

      const value = document.createElement('div');
      value.style.cssText = `font-size: 14px; color: ${field.color}; font-weight: 500; word-break: break-word;`;
      value.textContent = field.value;
      cell.appendChild(value);

      grid.appendChild(cell);
    }

    section.appendChild(grid);

    if (agent.config) {
      const configSection = document.createElement('div');
      configSection.style.cssText = 'background: #252526; border-radius: 6px; padding: 12px; margin-bottom: 16px;';

      const configTitle = document.createElement('div');
      configTitle.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px;';
      configTitle.textContent = 'Agent Config';
      configSection.appendChild(configTitle);

      const configItems = document.createElement('div');
      configItems.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

      if (agent.config.model) {
        configItems.appendChild(this.createConfigItem('Model', agent.config.model));
      }
      if (agent.config.temperature !== undefined) {
        configItems.appendChild(this.createConfigItem('Temperature', String(agent.config.temperature)));
      }
      if (agent.config.maxTokens !== undefined) {
        configItems.appendChild(this.createConfigItem('Max Tokens', String(agent.config.maxTokens)));
      }

      configSection.appendChild(configItems);
      section.appendChild(configSection);
    }

    if (agent.outputSummary) {
      const summarySection = document.createElement('div');
      summarySection.style.cssText = 'background: #252526; border-radius: 6px; padding: 12px; margin-bottom: 16px;';

      const summaryTitle = document.createElement('div');
      summaryTitle.style.cssText = 'font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px;';
      summaryTitle.textContent = 'Output Summary';
      summarySection.appendChild(summaryTitle);

      const summaryItems = document.createElement('div');
      summaryItems.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

      if (agent.outputSummary.filesReviewed !== undefined) {
        summaryItems.appendChild(this.createConfigItem('Files Reviewed', String(agent.outputSummary.filesReviewed)));
      }
      if (agent.outputSummary.issuesFound !== undefined) {
        summaryItems.appendChild(this.createConfigItem('Issues Found', String(agent.outputSummary.issuesFound)));
      }
      if (agent.outputSummary.suggestions !== undefined) {
        summaryItems.appendChild(this.createConfigItem('Suggestions', String(agent.outputSummary.suggestions)));
      }

      summarySection.appendChild(summaryItems);
      section.appendChild(summarySection);
    }

    const actions = this.renderActions(agent);
    section.appendChild(actions);

    return section;
  }

  renderLogs(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = 'Logs';
    section.appendChild(title);

    const logContainer = document.createElement('div');
    logContainer.className = 'agent-detail__logs';
    logContainer.style.cssText = `
      background: #1a1a1a; border-radius: 6px; padding: 12px;
      font-family: 'Cascadia Code', monospace; font-size: 12px;
      max-height: 500px; overflow-y: auto; line-height: 1.6;
    `;

    const logs = agent.activity.slice(-this.config.maxLogs);

    for (const log of logs) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 8px; padding: 2px 0;';

      const time = document.createElement('span');
      time.style.cssText = 'color: #666; min-width: 70px; flex-shrink: 0;';
      time.textContent = this.formatTime(log.timestamp);
      row.appendChild(time);

      const icon = document.createElement('span');
      icon.style.cssText = `color: ${this.getActivityColor(log)}; flex-shrink: 0;`;
      icon.textContent = this.getActivityIcon(log);
      row.appendChild(icon);

      const msg = document.createElement('span');
      msg.style.cssText = 'color: #d4d4d4;';
      msg.textContent = log.data.message;
      row.appendChild(msg);

      logContainer.appendChild(row);
    }

    if (logs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: #666; text-align: center; padding: 20px;';
      empty.textContent = 'No logs available';
      logContainer.appendChild(empty);
    }

    section.appendChild(logContainer);
    return section;
  }

  renderTimeline(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = 'Timeline';
    section.appendChild(title);

    const timeline = document.createElement('div');
    timeline.className = 'agent-detail__timeline';
    timeline.style.cssText = 'display: flex; flex-direction: column; gap: 0;';

    const entries = agent.activity.slice(-this.config.maxTimelineItems);
    let lastDate = '';

    for (const entry of entries) {
      const dateStr = entry.timestamp.toDateString();
      if (dateStr !== lastDate) {
        const dateHeader = document.createElement('div');
        dateHeader.style.cssText = `
          font-size: 11px; color: #888; padding: 8px 0 4px;
          border-bottom: 1px solid #333; margin-bottom: 4px;
        `;
        dateHeader.textContent = dateStr;
        timeline.appendChild(dateHeader);
        lastDate = dateStr;
      }

      const row = document.createElement('div');
      row.className = 'agent-detail__timeline-item';
      row.style.cssText = `
        display: flex; align-items: flex-start; gap: 12px;
        padding: 6px 0; position: relative;
      `;

      const timeCol = document.createElement('div');
      timeCol.style.cssText = 'min-width: 70px; flex-shrink: 0;';
      const timeText = document.createElement('div');
      timeText.style.cssText = 'font-size: 12px; color: #888; font-family: monospace;';
      timeText.textContent = this.formatTime(entry.timestamp);
      timeCol.appendChild(timeText);
      row.appendChild(timeCol);

      const dotCol = document.createElement('div');
      dotCol.style.cssText = `
        width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
        background: ${this.getActivityColor(entry)}; margin-top: 3px;
        box-shadow: 0 0 6px ${this.getActivityColor(entry)}44;
      `;
      row.appendChild(dotCol);

      const lineCol = document.createElement('div');
      lineCol.style.cssText = `
        position: absolute; left: 75px; top: 18px; bottom: -6px;
        width: 1px; background: #333;
      `;
      row.appendChild(lineCol);

      const contentCol = document.createElement('div');
      contentCol.style.cssText = 'flex: 1;';

      const msg = document.createElement('div');
      msg.style.cssText = 'font-size: 13px; color: #d4d4d4;';
      msg.textContent = entry.data.message;
      contentCol.appendChild(msg);

      if (entry.duration !== undefined) {
        const dur = document.createElement('div');
        dur.style.cssText = 'font-size: 11px; color: #666; margin-top: 2px;';
        dur.textContent = `Duration: ${this.formatDuration(entry.duration)}`;
        contentCol.appendChild(dur);
      }

      row.appendChild(contentCol);
      timeline.appendChild(row);
    }

    section.appendChild(timeline);
    return section;
  }

  renderFiles(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = `Files (${agent.fileChanges.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-detail__files';
    list.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const file of agent.fileChanges) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 12px;
        padding: 8px 12px; background: #252526; border-radius: 6px;
        cursor: pointer; transition: background 0.15s;
      `;
      row.addEventListener('mouseenter', () => { row.style.background = '#2a2a2a'; });
      row.addEventListener('mouseleave', () => { row.style.background = '#252526'; });
      row.addEventListener('click', () => this.emit('openFile', file.path));

      const icon = document.createElement('span');
      icon.style.cssText = `color: ${this.getFileColor(file.type)}; font-size: 14px;`;
      icon.textContent = this.getFileIcon(file.type);
      row.appendChild(icon);

      const path = document.createElement('span');
      path.style.cssText = 'color: #d4d4d4; flex: 1; font-family: monospace; font-size: 13px;';
      path.textContent = file.path;
      row.appendChild(path);

      const stats = document.createElement('span');
      stats.style.cssText = 'font-size: 12px; font-family: monospace;';
      const addSpan = document.createElement('span');
      addSpan.style.cssText = 'color: #4ec9b0;';
      addSpan.textContent = `+${file.additions}`;
      stats.appendChild(addSpan);
      const sep = document.createElement('span');
      sep.style.cssText = 'color: #666;';
      sep.textContent = ' ';
      stats.appendChild(sep);
      const delSpan = document.createElement('span');
      delSpan.style.cssText = 'color: #f44;';
      delSpan.textContent = `-${file.deletions}`;
      stats.appendChild(delSpan);
      row.appendChild(stats);

      list.appendChild(row);
    }

    if (agent.fileChanges.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: #666; text-align: center; padding: 20px;';
      empty.textContent = 'No files modified';
      list.appendChild(empty);
    }

    section.appendChild(list);
    return section;
  }

  renderTools(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = `Tools (${agent.toolLog.length})`;
    section.appendChild(title);

    const table = document.createElement('div');
    table.className = 'agent-detail__tools';
    table.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const header = document.createElement('div');
    header.style.cssText = `
      display: grid; grid-template-columns: 32px 1fr 80px 80px 80px;
      gap: 8px; padding: 8px 12px; font-size: 11px;
      text-transform: uppercase; color: #888;
    `;
    header.innerHTML = '<span></span><span>Tool</span><span>Duration</span><span>Status</span><span>Time</span>';
    table.appendChild(header);

    for (const entry of agent.toolLog) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid; grid-template-columns: 32px 1fr 80px 80px 80px;
        gap: 8px; padding: 8px 12px; background: #252526;
        border-radius: 4px; align-items: center;
      `;

      const statusIcon = document.createElement('span');
      const statusColor = entry.status === 'success' ? '#4ec9b0' : entry.status === 'error' ? '#f44' : '#dcdcaa';
      statusIcon.style.cssText = `color: ${statusColor}; font-size: 14px; text-align: center;`;
      statusIcon.textContent = entry.status === 'success' ? '\u2713' : entry.status === 'error' ? '\u2717' : '\u25cb';
      row.appendChild(statusIcon);

      const tool = document.createElement('span');
      tool.style.cssText = 'color: #dcdcaa; font-family: monospace; font-size: 13px;';
      tool.textContent = entry.tool;
      row.appendChild(tool);

      const dur = document.createElement('span');
      dur.style.cssText = 'color: #888; font-size: 12px;';
      dur.textContent = this.formatDuration(entry.duration);
      row.appendChild(dur);

      const status = document.createElement('span');
      status.style.cssText = `color: ${statusColor}; font-size: 12px;`;
      status.textContent = entry.status;
      row.appendChild(status);

      const time = document.createElement('span');
      time.style.cssText = 'color: #666; font-size: 12px;';
      time.textContent = this.formatTime(entry.timestamp);
      row.appendChild(time);

      table.appendChild(row);
    }

    section.appendChild(table);
    return section;
  }

  renderErrors(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = `Errors (${agent.errors.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-detail__errors';
    list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    for (const err of agent.errors) {
      const card = document.createElement('div');
      card.style.cssText = `
        background: ${err.recoverable ? '#2d2a1e' : '#2d1e1e'};
        border-left: 4px solid ${err.recoverable ? '#dcdcaa' : '#f44'};
        border-radius: 0 6px 6px 0; padding: 12px;
      `;

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

      const icon = document.createElement('span');
      icon.style.cssText = `color: ${err.recoverable ? '#dcdcaa' : '#f44'};`;
      icon.textContent = err.recoverable ? '\u26a0' : '\u2717';
      header.appendChild(icon);

      const severity = document.createElement('span');
      severity.style.cssText = `
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
        color: ${err.recoverable ? '#dcdcaa' : '#f44'};
      `;
      severity.textContent = err.recoverable ? 'Recoverable' : 'Fatal';
      header.appendChild(severity);

      const time = document.createElement('span');
      time.style.cssText = 'color: #666; font-size: 11px; margin-left: auto;';
      time.textContent = this.formatTime(err.timestamp);
      header.appendChild(time);

      card.appendChild(header);

      const msg = document.createElement('div');
      msg.style.cssText = 'color: #d4d4d4; font-size: 13px; margin-bottom: 4px;';
      msg.textContent = err.message;
      card.appendChild(msg);

      if (err.stack) {
        const stack = document.createElement('pre');
        stack.style.cssText = `
          font-size: 11px; color: #888; background: #1a1a1a;
          padding: 8px; border-radius: 4px; overflow-x: auto;
          max-height: 80px; overflow-y: auto; margin: 0;
        `;
        stack.textContent = err.stack;
        card.appendChild(stack);
      }

      list.appendChild(card);
    }

    if (agent.errors.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: #4ec9b0; text-align: center; padding: 20px; background: #1e2e1e; border-radius: 6px;';
      empty.textContent = 'No errors encountered';
      list.appendChild(empty);
    }

    section.appendChild(list);
    return section;
  }

  renderSubAgents(agent: AgentFullData): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 20px;';

    const title = document.createElement('h3');
    title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px; font-size: 16px;';
    title.textContent = `Sub-Agents (${agent.children.length})`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-detail__sub-agents';
    list.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    for (const child of agent.children) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 12px;
        padding: 10px 12px; background: #252526; border-radius: 6px;
        border: 1px solid #333; cursor: pointer; transition: all 0.15s;
      `;
      row.addEventListener('mouseenter', () => { row.style.borderColor = '#4fc1ff'; });
      row.addEventListener('mouseleave', () => { row.style.borderColor = '#333'; });
      row.addEventListener('click', () => this.emit('navigateChild', child.id));

      const arrow = document.createElement('span');
      arrow.style.cssText = 'color: #4fc1ff; font-size: 12px;';
      arrow.textContent = '\u25b6\u2500\u2500';
      row.appendChild(arrow);

      const name = document.createElement('span');
      name.style.cssText = 'color: #d4d4d4; flex: 1; font-size: 14px;';
      name.textContent = child.name;
      row.appendChild(name);

      const badge = this.createStatusBadge(child.status);
      row.appendChild(badge);

      if (child.status === 'running') {
        const pct = document.createElement('span');
        pct.style.cssText = 'color: #888; font-size: 12px;';
        pct.textContent = `${child.progress}%`;
        row.appendChild(pct);

        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width: 60px; height: 4px; background: #333; border-radius: 2px;';
        const fill = document.createElement('div');
        fill.style.cssText = `width: ${child.progress}%; height: 100%; background: #4fc1ff; border-radius: 2px;`;
        progressBar.appendChild(fill);
        row.appendChild(progressBar);
      }

      list.appendChild(row);
    }

    section.appendChild(list);
    return section;
  }

  renderActions(agent: AgentFullData): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'agent-detail__actions';
    bar.style.cssText = `
      display: flex; gap: 8px; padding: 16px 0 0; flex-wrap: wrap;
    `;

    if (agent.status === 'failed') {
      bar.appendChild(this.createActionButton('Retry', '#4fc1ff', () => this.emit('retry', agent.id)));
    }

    if (agent.status === 'running') {
      bar.appendChild(this.createActionButton('Cancel', '#f44', () => this.emit('cancel', agent.id)));
    }

    bar.appendChild(this.createActionButton('View Full Logs', '#888', () => this.emit('viewFullLogs', agent.id)));
    bar.appendChild(this.createActionButton('Export Results', '#888', () => this.emit('export', agent.id)));

    return bar;
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

  refresh(): void {
    this.emit('refresh', this.agentId);
  }

  setData(data: AgentFullData): void {
    this.data = data;
    this.updateContent();
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

  setActiveTab(tab: ModalTab): void {
    this.activeTab = tab;
    this.updateContent();
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

    this.updateContent();
    this.emit('update', activity);
  }

  private renderOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'agent-detail-overlay';
    this.overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,${this.config.overlayOpacity});
      display: flex; align-items: center; justify-content: center;
      z-index: 2000; opacity: 0; transition: opacity 0.2s;
    `;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.content = document.createElement('div');
    this.content.className = 'agent-detail-content';
    this.content.style.cssText = `
      background: #1e1e1e; border-radius: 8px; width: 90vw; max-width: 900px;
      max-height: 85vh; display: flex; flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); border: 1px solid #333;
      overflow: hidden;
    `;
    this.overlay.appendChild(this.content);

    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => {
      if (this.overlay) this.overlay.style.opacity = '1';
    });

    this.updateContent();
  }

  private updateContent(): void {
    if (!this.content) return;
    this.content.innerHTML = '';

    if (this.data) {
      this.content.appendChild(this.renderModalHeader(this.data));
      this.content.appendChild(this.renderTabs());
      this.content.appendChild(this.renderTabContent());
    } else {
      const loading = document.createElement('div');
      loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:400px;color:#888;';
      loading.textContent = 'Loading agent data...';
      this.content.appendChild(loading);
    }
  }

  private renderModalHeader(agent: AgentFullData): HTMLElement {
    const header = document.createElement('div');
    header.className = 'agent-detail__header';
    header.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; border-bottom: 1px solid #333; background: #252526;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: none; border: none; color: #888; cursor: pointer;
      font-size: 18px; padding: 4px 8px; border-radius: 4px;
    `;
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    const name = document.createElement('span');
    name.style.cssText = 'font-size: 16px; font-weight: 600; color: #e0e0e0; flex: 1;';
    name.textContent = `${agent.name} - Agent Details`;
    header.appendChild(name);

    const badge = this.createStatusBadge(agent.status);
    header.appendChild(badge);

    return header;
  }

  private renderTabs(): HTMLElement {
    const tabContainer = document.createElement('div');
    tabContainer.className = 'agent-detail__tabs';
    tabContainer.style.cssText = `
      display: flex; gap: 0; border-bottom: 1px solid #333; background: #252526;
      padding: 0 12px; overflow-x: auto;
    `;

    const tabs: ModalTab[] = ['overview', 'logs', 'timeline', 'files', 'tools', 'errors', 'sub-agents'];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      const isActive = this.activeTab === tab;
      btn.style.cssText = `
        background: none; border: none; border-bottom: 2px solid ${isActive ? '#4fc1ff' : 'transparent'};
        color: ${isActive ? '#4fc1ff' : '#888'}; padding: 10px 14px;
        cursor: pointer; font-size: 13px; white-space: nowrap;
        transition: all 0.15s;
      `;
      btn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ');
      btn.addEventListener('click', () => {
        this.activeTab = tab;
        this.updateContent();
      });
      btn.addEventListener('mouseenter', () => {
        if (!isActive) btn.style.color = '#ccc';
      });
      btn.addEventListener('mouseleave', () => {
        if (!isActive) btn.style.color = '#888';
      });
      tabContainer.appendChild(btn);
    }

    return tabContainer;
  }

  private renderTabContent(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'agent-detail__tab-content';
    container.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

    if (!this.data) return container;

    switch (this.activeTab) {
      case 'overview':
        container.appendChild(this.renderOverview(this.data));
        break;
      case 'logs':
        container.appendChild(this.renderLogs(this.data));
        break;
      case 'timeline':
        container.appendChild(this.renderTimeline(this.data));
        break;
      case 'files':
        container.appendChild(this.renderFiles(this.data));
        break;
      case 'tools':
        container.appendChild(this.renderTools(this.data));
        break;
      case 'errors':
        container.appendChild(this.renderErrors(this.data));
        break;
      case 'sub-agents':
        container.appendChild(this.renderSubAgents(this.data));
        break;
    }

    return container;
  }

  private createStatusBadge(status: SubAgentStatus): HTMLElement {
    const badge = document.createElement('span');
    const color = this.getStatusColor(status);
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 10px; font-size: 11px;
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

  private createConfigItem(label: string, value: string): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; font-size: 13px;';

    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'color: #888;';
    labelEl.textContent = label;
    item.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'color: #d4d4d4; font-family: monospace;';
    valueEl.textContent = value;
    item.appendChild(valueEl);

    return item;
  }

  private createActionButton(label: string, color: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: ${color}22; border: 1px solid ${color}44; color: ${color};
      padding: 8px 16px; border-radius: 4px; cursor: pointer;
      font-size: 13px; transition: background 0.15s;
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
      case 'result': return '\u2705';
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

  private getFileColor(type: string): string {
    switch (type) {
      case 'create': return '#4ec9b0';
      case 'edit': return '#4fc1ff';
      case 'delete': return '#f44';
      default: return '#888';
    }
  }

  private formatTime(date: Date): string {
    return date.toTimeString().slice(0, 8);
  }

  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private startRefresh(): void {
    this.stopRefresh();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, 1000);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
