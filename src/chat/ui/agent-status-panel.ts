import { ChatTask, ChatTaskStatus, ChatTaskLog } from '../chat-task-manager';
import { DiffResult, DiffLineType } from '../diff-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentStatusPanelConfig {
  container: HTMLElement;
  onTaskCancel?: (taskId: string) => void;
  onTaskPause?: (taskId: string) => void;
  onTaskResume?: (taskId: string) => void;
  onTaskRerun?: (taskId: string) => void;
  onTaskDiff?: (taskId: string) => void;
  onTaskPreview?: (taskId: string) => void;
  onRevertFile?: (filePath: string) => void;
  refreshIntervalMs?: number;
}

export interface AgentStatus {
  id: string;
  type: string;
  status: 'online' | 'busy' | 'offline';
  currentTaskId?: string;
}

export interface QueueInfo {
  count: number;
  tasks: ChatTask[];
}

// ─── AgentStatusPanel ───────────────────────────────────────────────────────

export class AgentStatusPanel {
  private config: Required<AgentStatusPanelConfig>;
  private container: HTMLElement;
  private panelEl: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private currentTasks: ChatTask[] = [];
  private agents: AgentStatus[] = [];

  constructor(config: AgentStatusPanelConfig) {
    this.config = {
      onTaskCancel: () => {},
      onTaskPause: () => {},
      onTaskResume: () => {},
      onTaskRerun: () => {},
      onTaskDiff: () => {},
      onTaskPreview: () => {},
      onRevertFile: () => {},
      refreshIntervalMs: 5000,
      ...config,
    };
    this.container = this.config.container;
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(tasks: ChatTask[]): HTMLElement {
    this.currentTasks = tasks;

    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'agent-status-panel';
      this.container.appendChild(this.panelEl);
    }

    this.panelEl.innerHTML = '';

    const header = this.renderHeader(tasks);
    this.panelEl.appendChild(header);

    const taskList = document.createElement('div');
    taskList.className = 'agent-status-panel__task-list';

    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-status-panel__empty';
      empty.textContent = 'No active tasks';
      taskList.appendChild(empty);
    } else {
      for (const task of tasks) {
        const card = this.renderTaskCard(task);
        taskList.appendChild(card);
      }
    }

    this.panelEl.appendChild(taskList);

    if (this.config.refreshIntervalMs > 0) {
      this.startAutoRefresh();
    }

    return this.panelEl;
  }

  private renderHeader(tasks: ChatTask[]): HTMLElement {
    const header = document.createElement('div');
    header.className = 'agent-status-panel__header';

    const title = document.createElement('h3');
    title.className = 'agent-status-panel__title';
    title.textContent = 'Agent Tasks';
    header.appendChild(title);

    const badges = document.createElement('div');
    badges.className = 'agent-status-panel__badges';

    const runningCount = tasks.filter((t) => t.status === 'running').length;
    const queuedCount = tasks.filter((t) => t.status === 'queued').length;
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;

    if (runningCount > 0) {
      badges.appendChild(this.renderBadge(`${runningCount} running`, 'running'));
    }
    if (queuedCount > 0) {
      badges.appendChild(this.renderBadge(this.renderQueueBadge(queuedCount), 'queued'));
    }
    if (completedCount > 0) {
      badges.appendChild(this.renderBadge(`${completedCount} done`, 'completed'));
    }
    if (failedCount > 0) {
      badges.appendChild(this.renderBadge(`${failedCount} failed`, 'failed'));
    }

    header.appendChild(badges);
    return header;
  }

  // ─── Task Card ──────────────────────────────────────────────────────────

  renderTaskCard(task: ChatTask): HTMLElement {
    const card = document.createElement('div');
    card.className = `agent-status-panel__task-card agent-status-panel__task-card--${task.status}`;
    card.dataset.taskId = task.id;

    const topRow = document.createElement('div');
    topRow.className = 'agent-status-panel__task-top';

    const statusIcon = this.renderStatusIcon(task.status);
    topRow.appendChild(statusIcon);

    const taskInfo = document.createElement('div');
    taskInfo.className = 'agent-status-panel__task-info';

    const taskType = document.createElement('span');
    taskType.className = 'agent-status-panel__task-type';
    taskType.textContent = task.config.agentType;
    taskInfo.appendChild(taskType);

    const taskDesc = document.createElement('span');
    taskDesc.className = 'agent-status-panel__task-desc';
    taskDesc.textContent = this.truncate(task.config.description, 60);
    taskDesc.title = task.config.description;
    taskInfo.appendChild(taskDesc);

    topRow.appendChild(taskInfo);

    const actions = document.createElement('div');
    actions.className = 'agent-status-panel__task-actions';

    if (task.status === 'running' || task.status === 'paused') {
      actions.appendChild(this.renderCancelButton(task.id));
    }
    if (task.status === 'running') {
      actions.appendChild(this.renderPauseButton(task.id));
    }
    if (task.status === 'paused') {
      actions.appendChild(this.renderResumeButton(task.id));
    }
    if (task.status === 'completed' || task.status === 'failed') {
      actions.appendChild(this.renderRerunButton(task.id));
    }
    if (task.filesChanged.length > 0) {
      actions.appendChild(this.renderDiffButton(task.id));
    }
    if (task.previewUrl) {
      actions.appendChild(this.renderPreviewButton(task.id));
    }

    topRow.appendChild(actions);
    card.appendChild(topRow);

    if (task.status === 'running' || task.status === 'paused') {
      const progress = this.renderProgressBar(task.progress);
      card.appendChild(progress);
    }

    if (task.status === 'completed' && task.filesChanged.length > 0) {
      const filesSummary = document.createElement('div');
      filesSummary.className = 'agent-status-panel__files-summary';
      filesSummary.textContent = `${task.filesChanged.length} file(s) changed`;
      card.appendChild(filesSummary);
    }

    if (task.status === 'failed' && task.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'agent-status-panel__error';
      errorEl.textContent = task.error;
      card.appendChild(errorEl);
    }

    const timeInfo = document.createElement('div');
    timeInfo.className = 'agent-status-panel__time';
    timeInfo.textContent = this.formatTimeRange(task.startedAt, task.endedAt);
    card.appendChild(timeInfo);

    return card;
  }

  // ─── Progress Bar ───────────────────────────────────────────────────────

  renderProgressBar(progress: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-status-panel__progress';

    const bar = document.createElement('div');
    bar.className = 'agent-status-panel__progress-bar';
    bar.style.width = `${Math.max(1, Math.min(100, progress))}%`;

    if (progress >= 100) {
      bar.classList.add('agent-status-panel__progress-bar--complete');
    } else if (progress >= 70) {
      bar.classList.add('agent-status-panel__progress-bar--high');
    }

    const label = document.createElement('span');
    label.className = 'agent-status-panel__progress-label';
    label.textContent = `${Math.floor(progress)}%`;

    wrapper.appendChild(bar);
    wrapper.appendChild(label);

    return wrapper;
  }

  // ─── Diff View ──────────────────────────────────────────────────────────

  renderDiffView(taskId: string, diff?: DiffResult): HTMLElement {
    const container = document.createElement('div');
    container.className = 'agent-status-panel__diff-view';

    if (!diff) {
      const noDiff = document.createElement('div');
      noDiff.className = 'agent-status-panel__diff-empty';
      noDiff.textContent = 'No diff available';
      container.appendChild(noDiff);
      return container;
    }

    const stats = this.renderDiffStats(diff.stats);
    container.appendChild(stats);

    const diffContent = document.createElement('div');
    diffContent.className = 'agent-status-panel__diff-content';

    for (const hunk of diff.hunks) {
      const hunkEl = document.createElement('div');
      hunkEl.className = 'agent-status-panel__diff-hunk';

      const hunkHeader = document.createElement('div');
      hunkHeader.className = 'agent-status-panel__diff-hunk-header';
      hunkHeader.textContent = hunk.header;
      hunkEl.appendChild(hunkHeader);

      for (const line of hunk.lines) {
        const lineEl = document.createElement('div');
        lineEl.className = `agent-status-panel__diff-line agent-status-panel__diff-line--${line.type}`;

        const prefix = document.createElement('span');
        prefix.className = 'agent-status-panel__diff-prefix';
        prefix.textContent = this.getDiffPrefix(line.type);
        lineEl.appendChild(prefix);

        const content = document.createElement('span');
        content.className = 'agent-status-panel__diff-content-text';
        content.textContent = line.content;
        lineEl.appendChild(content);

        hunkEl.appendChild(lineEl);
      }

      diffContent.appendChild(hunkEl);
    }

    container.appendChild(diffContent);
    return container;
  }

  // ─── Diff Stats ─────────────────────────────────────────────────────────

  renderDiffStats(stats: DiffResult['stats']): HTMLElement {
    const el = document.createElement('div');
    el.className = 'agent-status-panel__diff-stats';

    const added = document.createElement('span');
    added.className = 'agent-status-panel__diff-stat agent-status-panel__diff-stat--added';
    added.textContent = `+${stats.addedLines}`;
    el.appendChild(added);

    const removed = document.createElement('span');
    removed.className = 'agent-status-panel__diff-stat agent-status-panel__diff-stat--removed';
    removed.textContent = `-${stats.removedLines}`;
    el.appendChild(removed);

    const modified = document.createElement('span');
    modified.className = 'agent-status-panel__diff-stat agent-status-panel__diff-stat--modified';
    modified.textContent = `~${stats.modifiedLines}`;
    el.appendChild(modified);

    return el;
  }

  // ─── Preview Button ─────────────────────────────────────────────────────

  renderPreviewButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--preview';
    btn.textContent = 'Preview';
    btn.title = 'Open live preview';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskPreview(taskId);
    });
    return btn;
  }

  // ─── Cancel Button ──────────────────────────────────────────────────────

  renderCancelButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--cancel';
    btn.textContent = 'Cancel';
    btn.title = 'Cancel task';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskCancel(taskId);
    });
    return btn;
  }

  // ─── Queue Badge ────────────────────────────────────────────────────────

  renderQueueBadge(count: number): string {
    return `${count} queued`;
  }

  // ─── Agent Status ───────────────────────────────────────────────────────

  renderAgentStatus(agent: AgentStatus): HTMLElement {
    const el = document.createElement('div');
    el.className = `agent-status-panel__agent agent-status-panel__agent--${agent.status}`;

    const dot = document.createElement('span');
    dot.className = 'agent-status-panel__agent-dot';
    el.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'agent-status-panel__agent-label';
    label.textContent = agent.type;
    el.appendChild(label);

    if (agent.currentTaskId) {
      const taskBadge = document.createElement('span');
      taskBadge.className = 'agent-status-panel__agent-task-badge';
      taskBadge.textContent = 'working';
      el.appendChild(taskBadge);
    }

    return el;
  }

  // ─── Update Tasks ───────────────────────────────────────────────────────

  updateTasks(tasks: ChatTask[]): void {
    this.currentTasks = tasks;
    if (this.panelEl) {
      this.render(tasks);
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private renderStatusIcon(status: ChatTaskStatus): HTMLElement {
    const icon = document.createElement('span');
    icon.className = `agent-status-panel__status-icon agent-status-panel__status-icon--${status}`;

    const icons: Record<ChatTaskStatus, string> = {
      pending: '○',
      queued: '◻',
      running: '◉',
      paused: '❙❙',
      completed: '✓',
      failed: '✕',
      cancelled: '⊘',
    };

    icon.textContent = icons[status];
    return icon;
  }

  private renderBadge(text: string, type: string): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `agent-status-panel__badge agent-status-panel__badge--${type}`;
    badge.textContent = text;
    return badge;
  }

  private renderPauseButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--pause';
    btn.textContent = 'Pause';
    btn.title = 'Pause task';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskPause(taskId);
    });
    return btn;
  }

  private renderResumeButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--resume';
    btn.textContent = 'Resume';
    btn.title = 'Resume task';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskResume(taskId);
    });
    return btn;
  }

  private renderRerunButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--rerun';
    btn.textContent = 'Rerun';
    btn.title = 'Rerun task';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskRerun(taskId);
    });
    return btn;
  }

  private renderDiffButton(taskId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'agent-status-panel__btn agent-status-panel__btn--diff';
    btn.textContent = 'Diff';
    btn.title = 'View changes';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTaskDiff(taskId);
    });
    return btn;
  }

  private getDiffPrefix(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added: return '+';
      case DiffLineType.Removed: return '-';
      case DiffLineType.Modified: return '~';
      default: return ' ';
    }
  }

  private truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  }

  private formatTimeRange(start: Date, end?: Date): string {
    const elapsed = (end ?? new Date()).getTime() - start.getTime();
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) return `${seconds}s elapsed`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    return `${minutes}m ${remainingSec}s elapsed`;
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (this.panelEl) {
        this.render(this.currentTasks);
      }
    }, this.config.refreshIntervalMs);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.stopAutoRefresh();
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
