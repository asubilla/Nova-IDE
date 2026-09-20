// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentDisplayStatus =
  | 'queued'
  | 'loading'
  | 'processing'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type AgentDisplayType =
  | 'code-reviewer'
  | 'bug-fixer'
  | 'test-writer'
  | 'doc-generator'
  | 'security-scanner'
  | 'refactorer'
  | 'feature-coder'
  | 'custom';

export type AgentStatus = AgentDisplayStatus;
export type AgentType = AgentDisplayType;

export interface AgentInfo {
  id: string;
  name: string;
  type: AgentDisplayType;
  status: AgentDisplayStatus;
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  queuedAt?: Date;
  queuePosition?: number;
  queueTotal?: number;
  error?: AgentError;
  retryAttempt?: number;
  retryMaxRetries?: number;
  retryNextRetryIn?: number;
  dependencies?: AgentDependency[];
  toolsUsed?: ToolUsage[];
  filesModified?: FileChange[];
  children?: string[];
  childCount?: number;
  logs?: LogEntry[];
  timeoutMs?: number;
}

export interface AgentError {
  message: string;
  code?: string;
  stack?: string;
  details?: Record<string, unknown>;
}

export interface AgentDependency {
  agentId: string;
  name: string;
  status: AgentDisplayStatus;
}

export interface ToolUsage {
  name: string;
  status: 'success' | 'error' | 'running';
  duration?: number;
}

export interface FileChange {
  path: string;
  type: 'create' | 'edit' | 'delete';
  additions?: number;
  deletions?: number;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface AgentStatusUIOptions {
  refreshIntervalMs?: number;
  showTimeline?: boolean;
  showDependencies?: boolean;
  showToolUsage?: boolean;
  showDiffPreview?: boolean;
}

type StatusChangeCallback = (agentId: string, action: string) => void;

// ─── Status Configuration ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<AgentDisplayStatus, { icon: string; color: string; label: string }> = {
  queued: { icon: '\uD83D\uDFE1', color: '#EAB308', label: 'Queued' },
  loading: { icon: '\uD83D\uDD35', color: '#3B82F6', label: 'Loading...' },
  processing: { icon: '\uD83D\uDFE2', color: '#22C55E', label: 'Working' },
  running: { icon: '\uD83D\uDFE2', color: '#22C55E', label: 'Running' },
  paused: { icon: '\u23F8\uFE0F', color: '#9CA3AF', label: 'Paused' },
  retrying: { icon: '\uD83D\uDFE0', color: '#F97316', label: 'Retrying' },
  waiting: { icon: '\u23F3', color: '#F59E0B', label: 'Waiting' },
  completed: { icon: '\u2705', color: '#22C55E', label: 'Completed' },
  failed: { icon: '\u274C', color: '#EF4444', label: 'Failed' },
  cancelled: { icon: '\u26D4', color: '#EF4444', label: 'Cancelled' },
  timeout: { icon: '\u23F0', color: '#F59E0B', label: 'Timed out' },
};

const AGENT_TYPE_ICONS: Record<AgentDisplayType, string> = {
  'code-reviewer': '\uD83D\uDD0D',
  'bug-fixer': '\uD83D\uDC1B',
  'test-writer': '\uD83E\uDDEA',
  'doc-generator': '\uD83D\uDCC4',
  'security-scanner': '\uD83D\uDD12',
  'refactorer': '\uD83D\uDD27',
  'feature-coder': '\u2728',
  'custom': '\uD83E\uDDE9',
};

// ─── AgentStatusUI ──────────────────────────────────────────────────────────

export class AgentStatusUI {
  private container: HTMLElement;
  private options: Required<AgentStatusUIOptions>;
  private panelEl: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private agents: Map<string, AgentInfo> = new Map();
  private selectedAgentId: string | null = null;
  private statusChangeCallbacks: StatusChangeCallback[] = [];

  constructor(container: HTMLElement, options: AgentStatusUIOptions = {}) {
    this.container = container;
    this.options = {
      refreshIntervalMs: options.refreshIntervalMs ?? 1000,
      showTimeline: options.showTimeline ?? true,
      showDependencies: options.showDependencies ?? true,
      showToolUsage: options.showToolUsage ?? true,
      showDiffPreview: options.showDiffPreview ?? true,
    };
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(): HTMLElement {
    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'agent-status-ui';
      this.container.appendChild(this.panelEl);
    }

    this.panelEl.innerHTML = '';
    this.panelEl.setAttribute('role', 'region');
    this.panelEl.setAttribute('aria-label', 'Agent Status');

    const agents = Array.from(this.agents.values());

    if (agents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-status-ui__empty';
      empty.textContent = 'No agents running';
      this.panelEl.appendChild(empty);
      return this.panelEl;
    }

    for (const agent of agents) {
      const card = this.renderAgentCard(agent);
      this.panelEl.appendChild(card);
    }

    return this.panelEl;
  }

  // ─── Agent Card ────────────────────────────────────────────────────────

  renderAgentCard(agent: AgentInfo): HTMLElement {
    const card = document.createElement('div');
    card.className = `agent-status-ui__card agent-status-ui__card--${agent.status}`;
    card.dataset.agentId = agent.id;

    if (agent.id === this.selectedAgentId) {
      card.classList.add('agent-status-ui__card--selected');
    }

    const header = document.createElement('div');
    header.className = 'agent-status-ui__card-header';

    const nameSection = document.createElement('div');
    nameSection.className = 'agent-status-ui__card-name';
    nameSection.appendChild(this.renderAgentName(agent.name));
    nameSection.appendChild(this.renderAgentType(agent.type));
    header.appendChild(nameSection);

    const statusBadge = this.renderStatusBadge(agent.status, agent.retryAttempt, agent.retryMaxRetries);
    header.appendChild(statusBadge);

    card.appendChild(header);

    if (agent.status === 'running' || agent.status === 'processing' || agent.status === 'loading') {
      if (agent.progress !== undefined) {
        const progress = this.renderProgressBar(agent.progress);
        card.appendChild(progress);
      }
    }

    if (agent.status === 'retrying' && agent.retryAttempt !== undefined && agent.retryMaxRetries !== undefined) {
      const retryInfo = this.renderRetryInfo(agent.retryAttempt, agent.retryMaxRetries, agent.retryNextRetryIn);
      card.appendChild(retryInfo);
    }

    if (agent.status === 'failed' && agent.error) {
      const errorSummary = this.renderErrorSummary(agent.error);
      card.appendChild(errorSummary);
    }

    const meta = document.createElement('div');
    meta.className = 'agent-status-ui__card-meta';

    if (agent.startTime) {
      const duration = this.renderDuration(agent.startTime, agent.endTime);
      meta.appendChild(duration);
    }

    if (agent.toolsUsed && agent.toolsUsed.length > 0) {
      const tools = document.createElement('span');
      tools.className = 'agent-status-ui__meta-item';
      tools.textContent = `Tools: ${agent.toolsUsed.length}`;
      meta.appendChild(tools);
    }

    if (agent.filesModified && agent.filesModified.length > 0) {
      const files = document.createElement('span');
      files.className = 'agent-status-ui__meta-item';
      files.textContent = `Files: ${agent.filesModified.length}`;
      meta.appendChild(files);
    }

    card.appendChild(meta);

    if (this.options.showDependencies && agent.dependencies && agent.dependencies.length > 0) {
      const deps = this.renderDependencies(agent.dependencies);
      card.appendChild(deps);
    }

    if (this.options.showToolUsage && agent.toolsUsed && agent.toolsUsed.length > 0) {
      const tools = this.renderToolUsage(agent.toolsUsed);
      card.appendChild(tools);
    }

    if (agent.filesModified && agent.filesModified.length > 0) {
      const filesSection = document.createElement('div');
      filesSection.className = 'agent-status-ui__card-files';

      const filesTitle = document.createElement('div');
      filesTitle.className = 'agent-status-ui__section-title';
      filesTitle.textContent = 'Modified Files';
      filesSection.appendChild(filesTitle);

      for (const file of agent.filesModified) {
        const fileEl = document.createElement('div');
        fileEl.className = `agent-status-ui__file-item agent-status-ui__file-item--${file.type}`;

        const fileIcon = document.createElement('span');
        fileIcon.className = 'agent-status-ui__file-icon';
        fileIcon.textContent = file.type === 'create' ? '\uD83D\uDCC1' : file.type === 'edit' ? '\u270F\uFE0F' : '\uD83D\uDDD1\uFE0F';
        fileEl.appendChild(fileIcon);

        const filePath = document.createElement('span');
        filePath.className = 'agent-status-ui__file-path';
        filePath.textContent = file.path;
        fileEl.appendChild(filePath);

        if (file.additions !== undefined || file.deletions !== undefined) {
          const changes = document.createElement('span');
          changes.className = 'agent-status-ui__file-changes';
          const parts: string[] = [];
          if (file.additions !== undefined) parts.push(`+${file.additions}`);
          if (file.deletions !== undefined) parts.push(`-${file.deletions}`);
          changes.textContent = parts.join(', ');
          fileEl.appendChild(changes);
        }

        filesSection.appendChild(fileEl);
      }

      card.appendChild(filesSection);
    }

    if (this.options.showTimeline && agent.startTime) {
      const timeline = this.renderTimeline(agent);
      card.appendChild(timeline);
    }

    if (agent.status === 'queued' && agent.queuePosition !== undefined && agent.queueTotal !== undefined) {
      const queuePos = this.renderQueuePosition(agent.queuePosition, agent.queueTotal);
      card.appendChild(queuePos);
    }

    if (agent.childCount !== undefined && agent.childCount > 0) {
      const subIndicator = this.renderSubAgentIndicator(true, agent.childCount);
      card.appendChild(subIndicator);
    }

    const actions = this.renderActions(agent);
    card.appendChild(actions);

    return card;
  }

  // ─── Status Badge ──────────────────────────────────────────────────────

  renderStatusBadge(status: AgentDisplayStatus, retryAttempt?: number, retryMaxRetries?: number): HTMLElement {
    const badge = document.createElement('div');
    badge.className = `agent-status-ui__badge agent-status-ui__badge--${status}`;

    const config = STATUS_CONFIG[status];

    const icon = document.createElement('span');
    icon.className = 'agent-status-ui__badge-icon';
    if (status === 'loading') {
      icon.classList.add('agent-status-ui__badge-icon--pulsing');
    }
    if (status === 'running') {
      icon.classList.add('agent-status-ui__badge-icon--pulse');
    }
    icon.textContent = config.icon;
    badge.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'agent-status-ui__badge-label';
    label.textContent = config.label;
    badge.appendChild(label);

    if (status === 'retrying' && retryAttempt !== undefined && retryMaxRetries !== undefined) {
      const retryText = document.createElement('span');
      retryText.className = 'agent-status-ui__badge-retry';
      retryText.textContent = `(${retryAttempt}/${retryMaxRetries})`;
      badge.appendChild(retryText);
    }

    return badge;
  }

  // ─── Progress Bar ──────────────────────────────────────────────────────

  renderProgressBar(progress: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__progress';

    const track = document.createElement('div');
    track.className = 'agent-status-ui__progress-track';

    const fill = document.createElement('div');
    fill.className = 'agent-status-ui__progress-fill';
    const clampedProgress = Math.max(0, Math.min(100, progress));
    fill.style.width = `${clampedProgress}%`;

    if (clampedProgress >= 100) {
      fill.classList.add('agent-status-ui__progress-fill--complete');
    } else if (clampedProgress >= 70) {
      fill.classList.add('agent-status-ui__progress-fill--high');
    }

    if (clampedProgress > 0 && clampedProgress < 100) {
      fill.classList.add('agent-status-ui__progress-fill--animated');
    }

    track.appendChild(fill);
    wrapper.appendChild(track);

    const label = document.createElement('span');
    label.className = 'agent-status-ui__progress-label';
    label.textContent = `${Math.floor(clampedProgress)}%`;
    wrapper.appendChild(label);

    return wrapper;
  }

  // ─── Retry Info ────────────────────────────────────────────────────────

  renderRetryInfo(attempt: number, maxRetries: number, nextRetryIn?: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__retry-info';

    const attemptText = document.createElement('span');
    attemptText.className = 'agent-status-ui__retry-attempt';
    attemptText.textContent = `Retry ${attempt}/${maxRetries}`;
    wrapper.appendChild(attemptText);

    if (nextRetryIn !== undefined && nextRetryIn > 0) {
      const countdown = document.createElement('span');
      countdown.className = 'agent-status-ui__retry-countdown';
      countdown.textContent = `Next in ${nextRetryIn}s`;
      wrapper.appendChild(countdown);

      let remaining = nextRetryIn;
      const interval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          countdown.textContent = 'Retrying...';
        } else {
          countdown.textContent = `Next in ${remaining}s`;
        }
      }, 1000);
    }

    return wrapper;
  }

  // ─── Error Summary ─────────────────────────────────────────────────────

  renderErrorSummary(error: AgentError): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__error';

    const icon = document.createElement('span');
    icon.className = 'agent-status-ui__error-icon';
    icon.textContent = '\u26A0\uFE0F';
    wrapper.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'agent-status-ui__error-content';

    const message = document.createElement('div');
    message.className = 'agent-status-ui__error-message';
    message.textContent = error.message;
    content.appendChild(message);

    if (error.code) {
      const code = document.createElement('div');
      code.className = 'agent-status-ui__error-code';
      code.textContent = `Error code: ${error.code}`;
      content.appendChild(code);
    }

    wrapper.appendChild(content);

    if (error.details) {
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'agent-status-ui__error-details-btn';
      detailsBtn.textContent = 'Show details';
      detailsBtn.addEventListener('click', () => {
        const details = wrapper.querySelector('.agent-status-ui__error-details');
        if (details) {
          details.classList.toggle('agent-status-ui__error-details--visible');
          detailsBtn.textContent = details.classList.contains('agent-status-ui__error-details--visible')
            ? 'Hide details'
            : 'Show details';
        }
      });
      wrapper.appendChild(detailsBtn);

      const details = document.createElement('pre');
      details.className = 'agent-status-ui__error-details';
      details.textContent = JSON.stringify(error.details, null, 2);
      wrapper.appendChild(details);
    }

    return wrapper;
  }

  // ─── Duration ──────────────────────────────────────────────────────────

  renderDuration(startTime: Date, endTime?: Date): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'agent-status-ui__duration';

    const elapsed = (endTime ?? new Date()).getTime() - startTime.getTime();
    wrapper.textContent = this.formatDuration(elapsed);

    return wrapper;
  }

  // ─── Queue Position ────────────────────────────────────────────────────

  renderQueuePosition(position: number, total: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__queue-position';

    const text = document.createElement('span');
    text.className = 'agent-status-ui__queue-text';
    text.textContent = `Position ${position} of ${total} in queue`;
    wrapper.appendChild(text);

    const bar = document.createElement('div');
    bar.className = 'agent-status-ui__queue-bar';
    const progress = total > 0 ? ((total - position + 1) / total) * 100 : 0;
    bar.style.width = `${progress}%`;
    wrapper.appendChild(bar);

    return wrapper;
  }

  // ─── Agent Type ────────────────────────────────────────────────────────

  renderAgentType(type: AgentDisplayType): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `agent-status-ui__type-badge agent-status-ui__type-badge--${type}`;

    const icon = document.createElement('span');
    icon.className = 'agent-status-ui__type-icon';
    icon.textContent = AGENT_TYPE_ICONS[type];
    badge.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'agent-status-ui__type-label';
    label.textContent = type;
    badge.appendChild(label);

    return badge;
  }

  // ─── Agent Name ────────────────────────────────────────────────────────

  renderAgentName(name: string): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'agent-status-ui__name';
    wrapper.textContent = name;
    return wrapper;
  }

  // ─── Actions ───────────────────────────────────────────────────────────

  renderActions(agent: AgentInfo): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__actions';

    if (agent.status === 'running' || agent.status === 'processing' || agent.status === 'loading') {
      wrapper.appendChild(this.renderActionButton('Cancel', 'cancel', agent.id));
      wrapper.appendChild(this.renderActionButton('Pause', 'pause', agent.id));
    }

    if (agent.status === 'paused') {
      wrapper.appendChild(this.renderActionButton('Resume', 'resume', agent.id));
      wrapper.appendChild(this.renderActionButton('Cancel', 'cancel', agent.id));
    }

    if (agent.status === 'failed' || agent.status === 'cancelled' || agent.status === 'timeout') {
      wrapper.appendChild(this.renderActionButton('Retry', 'retry', agent.id));
    }

    if (agent.logs && agent.logs.length > 0) {
      wrapper.appendChild(this.renderActionButton('View Logs', 'logs', agent.id));
    }

    wrapper.appendChild(this.renderClickToOpen(agent.id));

    return wrapper;
  }

  // ─── Sub-Agent Indicator ───────────────────────────────────────────────

  renderSubAgentIndicator(hasChildren: boolean, count: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__sub-agent-indicator';

    if (hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'agent-status-ui__sub-agent-arrow';
      arrow.textContent = '\u25B6';
      wrapper.appendChild(arrow);

      const text = document.createElement('span');
      text.className = 'agent-status-ui__sub-agent-text';
      text.textContent = `${count} sub-agent${count !== 1 ? 's' : ''} active`;
      wrapper.appendChild(text);
    }

    return wrapper;
  }

  // ─── Click to Open ─────────────────────────────────────────────────────

  renderClickToOpen(agentId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-ui__open-btn';
    btn.title = 'Open agent details';

    const arrow = document.createElement('span');
    arrow.className = 'agent-status-ui__open-arrow';
    arrow.textContent = '\u25B6';
    btn.appendChild(arrow);

    const text = document.createElement('span');
    text.className = 'agent-status-ui__open-text';
    text.textContent = 'Open';
    btn.appendChild(text);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emitStatusChange(agentId, 'open');
    });

    return btn;
  }

  // ─── Timeline ──────────────────────────────────────────────────────────

  renderTimeline(agent: AgentInfo): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__timeline';

    const title = document.createElement('div');
    title.className = 'agent-status-ui__section-title';
    title.textContent = 'Timeline';
    wrapper.appendChild(title);

    const timeline = document.createElement('div');
    timeline.className = 'agent-status-ui__timeline-track';

    const startTime = agent.startTime?.getTime() ?? Date.now();
    const endTime = agent.endTime?.getTime() ?? Date.now();
    const duration = endTime - startTime;

    if (agent.queuedAt) {
      const queueTime = startTime - agent.queuedAt.getTime();
      const queueSegment = document.createElement('div');
      queueSegment.className = 'agent-status-ui__timeline-segment agent-status-ui__timeline-segment--queued';
      queueSegment.style.width = `${Math.min(20, (queueTime / Math.max(duration, 1)) * 100)}%`;
      queueSegment.title = `Queued: ${this.formatDuration(queueTime)}`;
      timeline.appendChild(queueSegment);
    }

    const runSegment = document.createElement('div');
    runSegment.className = `agent-status-ui__timeline-segment agent-status-ui__timeline-segment--${agent.status}`;
    runSegment.style.flex = '1';
    runSegment.title = `Running: ${this.formatDuration(duration)}`;
    timeline.appendChild(runSegment);

    wrapper.appendChild(timeline);

    const labels = document.createElement('div');
    labels.className = 'agent-status-ui__timeline-labels';

    const startLabel = document.createElement('span');
    startLabel.className = 'agent-status-ui__timeline-label';
    startLabel.textContent = agent.startTime ? this.formatTime(agent.startTime) : '--';
    labels.appendChild(startLabel);

    const endLabel = document.createElement('span');
    endLabel.className = 'agent-status-ui__timeline-label';
    endLabel.textContent = agent.endTime ? this.formatTime(agent.endTime) : 'now';
    labels.appendChild(endLabel);

    wrapper.appendChild(labels);

    return wrapper;
  }

  // ─── Dependencies ──────────────────────────────────────────────────────

  renderDependencies(deps: AgentDependency[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__dependencies';

    const title = document.createElement('div');
    title.className = 'agent-status-ui__section-title';
    title.textContent = 'Dependencies';
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-status-ui__dependency-list';

    for (const dep of deps) {
      const item = document.createElement('div');
      item.className = `agent-status-ui__dependency-item agent-status-ui__dependency-item--${dep.status}`;

      const statusIcon = document.createElement('span');
      statusIcon.className = 'agent-status-ui__dependency-status';
      const config = STATUS_CONFIG[dep.status];
      statusIcon.textContent = config.icon;
      item.appendChild(statusIcon);

      const name = document.createElement('span');
      name.className = 'agent-status-ui__dependency-name';
      name.textContent = dep.name;
      item.appendChild(name);

      list.appendChild(item);
    }

    wrapper.appendChild(list);
    return wrapper;
  }

  // ─── Tool Usage ────────────────────────────────────────────────────────

  renderToolUsage(tools: ToolUsage[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__tool-usage';

    const title = document.createElement('div');
    title.className = 'agent-status-ui__section-title';
    title.textContent = 'Tools Used';
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-status-ui__tool-list';

    for (const tool of tools) {
      const item = document.createElement('div');
      item.className = `agent-status-ui__tool-item agent-status-ui__tool-item--${tool.status}`;

      const name = document.createElement('span');
      name.className = 'agent-status-ui__tool-name';
      name.textContent = tool.name;
      item.appendChild(name);

      const statusIcon = document.createElement('span');
      statusIcon.className = 'agent-status-ui__tool-status';
      statusIcon.textContent = tool.status === 'success' ? '\u2713' : tool.status === 'error' ? '\u2717' : '\u25CB';
      item.appendChild(statusIcon);

      if (tool.duration !== undefined) {
        const duration = document.createElement('span');
        duration.className = 'agent-status-ui__tool-duration';
        duration.textContent = this.formatDuration(tool.duration);
        item.appendChild(duration);
      }

      list.appendChild(item);
    }

    wrapper.appendChild(list);
    return wrapper;
  }

  // ─── Diff Preview ──────────────────────────────────────────────────────

  renderDiffPreview(diff: DiffLine[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__diff-preview';

    const title = document.createElement('div');
    title.className = 'agent-status-ui__section-title';
    title.textContent = 'Changes';
    wrapper.appendChild(title);

    const content = document.createElement('div');
    content.className = 'agent-status-ui__diff-content';

    const maxLines = Math.min(diff.length, 10);
    const displayLines = diff.slice(0, maxLines);

    for (const line of displayLines) {
      const lineEl = document.createElement('div');
      lineEl.className = `agent-status-ui__diff-line agent-status-ui__diff-line--${line.type}`;

      const prefix = document.createElement('span');
      prefix.className = 'agent-status-ui__diff-prefix';
      prefix.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      lineEl.appendChild(prefix);

      const text = document.createElement('span');
      text.className = 'agent-status-ui__diff-text';
      text.textContent = line.content;
      lineEl.appendChild(text);

      content.appendChild(lineEl);
    }

    if (diff.length > maxLines) {
      const more = document.createElement('div');
      more.className = 'agent-status-ui__diff-more';
      more.textContent = `... and ${diff.length - maxLines} more lines`;
      content.appendChild(more);
    }

    wrapper.appendChild(content);
    return wrapper;
  }

  // ─── Log Preview ───────────────────────────────────────────────────────

  renderLogPreview(logs: LogEntry[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-ui__log-preview';

    const title = document.createElement('div');
    title.className = 'agent-status-ui__section-title';
    title.textContent = 'Recent Logs';
    wrapper.appendChild(title);

    const content = document.createElement('div');
    content.className = 'agent-status-ui__log-content';

    const maxEntries = Math.min(logs.length, 5);
    const recentLogs = logs.slice(-maxEntries);

    for (const log of recentLogs) {
      const entry = document.createElement('div');
      entry.className = `agent-status-ui__log-entry agent-status-ui__log-entry--${log.level}`;

      const time = document.createElement('span');
      time.className = 'agent-status-ui__log-time';
      time.textContent = this.formatTime(log.timestamp);
      entry.appendChild(time);

      const level = document.createElement('span');
      level.className = 'agent-status-ui__log-level';
      level.textContent = `[${log.level.toUpperCase()}]`;
      entry.appendChild(level);

      const message = document.createElement('span');
      message.className = 'agent-status-ui__log-message';
      message.textContent = log.message;
      entry.appendChild(message);

      content.appendChild(entry);
    }

    wrapper.appendChild(content);
    return wrapper;
  }

  // ─── Update Agents ─────────────────────────────────────────────────────

  updateAgents(agents: AgentInfo[]): void {
    this.agents.clear();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    this.render();
  }

  // ─── Select Agent ──────────────────────────────────────────────────────

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
    this.render();
  }

  // ─── Status Change Handler ─────────────────────────────────────────────

  onStatusChange(callback: StatusChangeCallback): { dispose: () => void } {
    this.statusChangeCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.statusChangeCallbacks.indexOf(callback);
        if (idx !== -1) this.statusChangeCallbacks.splice(idx, 1);
      },
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private renderActionButton(label: string, action: string, agentId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `agent-status-ui__action-btn agent-status-ui__action-btn--${action}`;
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emitStatusChange(agentId, action);
    });
    return btn;
  }

  private emitStatusChange(agentId: string, action: string): void {
    for (const cb of this.statusChangeCallbacks) {
      cb(agentId, action);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    return `${minutes}m ${remainSec}s`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.agents.clear();
    this.statusChangeCallbacks = [];
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
