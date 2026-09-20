import { AgentInfo, AgentDisplayStatus } from './agent-status-ui';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentQueueUIOptions {
  refreshIntervalMs?: number;
  maxVisible?: number;
  showProgress?: boolean;
  autoRefresh?: boolean;
}

type QueueActionCallback = (agentId: string, action: string) => void;

// ─── Queue Status Config ────────────────────────────────────────────────────

const STATUS_ICONS: Record<AgentDisplayStatus, string> = {
  queued: '\uD83D\uDFE1',
  loading: '\uD83D\uDD35',
  processing: '\uD83D\uDFE2',
  running: '\uD83D\uDFE2',
  paused: '\u23F8\uFE0F',
  retrying: '\uD83D\uDFE0',
  waiting: '\u23F3',
  completed: '\u2705',
  failed: '\u274C',
  cancelled: '\u26D4',
  timeout: '\u23F0',
};

// ─── AgentQueueUI ───────────────────────────────────────────────────────────

export class AgentQueueUI {
  private container: HTMLElement;
  private options: Required<AgentQueueUIOptions>;
  private panelEl: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private agents: AgentInfo[] = [];
  private filterStatus: AgentDisplayStatus | 'all' = 'all';
  private sortField: 'name' | 'status' | 'startTime' | 'progress' = 'status';
  private highlightedAgentId: string | null = null;
  private actionCallbacks: QueueActionCallback[] = [];

  constructor(container: HTMLElement, options: AgentQueueUIOptions = {}) {
    this.container = container;
    this.options = {
      refreshIntervalMs: options.refreshIntervalMs ?? 2000,
      maxVisible: options.maxVisible ?? 20,
      showProgress: options.showProgress ?? true,
      autoRefresh: options.autoRefresh ?? true,
    };
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(): HTMLElement {
    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'agent-queue-ui';
      this.container.appendChild(this.panelEl);
    }

    this.panelEl.innerHTML = '';
    this.panelEl.setAttribute('role', 'region');
    this.panelEl.setAttribute('aria-label', 'Agent Queue');

    const header = this.renderQueueHeader();
    this.panelEl.appendChild(header);

    const stats = this.renderQueueStats();
    this.panelEl.appendChild(stats);

    const list = document.createElement('div');
    list.className = 'agent-queue-ui__list';

    const filtered = this.getFilteredAgents();
    const sorted = this.getSortedAgents(filtered);
    const visible = sorted.slice(0, this.options.maxVisible);

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-queue-ui__empty';
      empty.textContent = 'No agents in queue';
      list.appendChild(empty);
    } else {
      visible.forEach((agent, index) => {
        const item = this.renderQueueItem(agent, index + 1);
        list.appendChild(item);
      });
    }

    this.panelEl.appendChild(list);

    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }

    return this.panelEl;
  }

  // ─── Queue Header ──────────────────────────────────────────────────────

  renderQueueHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'agent-queue-ui__header';

    const total = this.agents.length;
    const running = this.agents.filter((a) => a.status === 'running' || a.status === 'processing').length;
    const queued = this.agents.filter((a) => a.status === 'queued').length;
    const completed = this.agents.filter((a) => a.status === 'completed').length;
    const failed = this.agents.filter((a) => a.status === 'failed').length;

    const title = document.createElement('div');
    title.className = 'agent-queue-ui__title';
    title.textContent = `Agent Queue (${total} total, ${running} running, ${queued} queued)`;
    header.appendChild(title);

    const badges = document.createElement('div');
    badges.className = 'agent-queue-ui__badges';

    if (completed > 0) {
      badges.appendChild(this.renderCountBadge(`${completed} done`, 'completed'));
    }
    if (failed > 0) {
      badges.appendChild(this.renderCountBadge(`${failed} failed`, 'failed'));
    }

    header.appendChild(badges);

    const filters = document.createElement('div');
    filters.className = 'agent-queue-ui__filters';

    const filterOptions: Array<{ label: string; value: AgentDisplayStatus | 'all' }> = [
      { label: 'All', value: 'all' },
      { label: 'Running', value: 'running' },
      { label: 'Queued', value: 'queued' },
      { label: 'Completed', value: 'completed' },
      { label: 'Failed', value: 'failed' },
    ];

    for (const option of filterOptions) {
      const btn = document.createElement('button');
      btn.className = `agent-queue-ui__filter-btn ${this.filterStatus === option.value ? 'agent-queue-ui__filter-btn--active' : ''}`;
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        this.filterStatus = option.value;
        this.render();
      });
      filters.appendChild(btn);
    }

    header.appendChild(filters);

    const sortSelect = document.createElement('select');
    sortSelect.className = 'agent-queue-ui__sort-select';
    type SortField = 'name' | 'status' | 'startTime' | 'progress';
    const sortOptions: Array<{ label: string; value: SortField }> = [
      { label: 'Status', value: 'status' },
      { label: 'Name', value: 'name' },
      { label: 'Start Time', value: 'startTime' },
      { label: 'Progress', value: 'progress' },
    ];
    for (const option of sortOptions) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = `Sort: ${option.label}`;
      opt.selected = this.sortField === option.value;
      sortSelect.appendChild(opt);
    }
    sortSelect.addEventListener('change', () => {
      this.sortField = sortSelect.value as SortField;
      this.render();
    });
    header.appendChild(sortSelect);

    return header;
  }

  // ─── Queue Item ────────────────────────────────────────────────────────

  renderQueueItem(agent: AgentInfo, position: number): HTMLElement {
    const item = document.createElement('div');
    item.className = `agent-queue-ui__item agent-queue-ui__item--${agent.status}`;
    item.dataset.agentId = agent.id;

    if (agent.id === this.highlightedAgentId) {
      item.classList.add('agent-queue-ui__item--highlighted');
    }

    const posEl = document.createElement('span');
    posEl.className = 'agent-queue-ui__item-position';
    posEl.textContent = `${position}.`;
    item.appendChild(posEl);

    const icon = document.createElement('span');
    icon.className = 'agent-queue-ui__item-icon';
    icon.textContent = STATUS_ICONS[agent.status];
    if (agent.status === 'loading') {
      icon.classList.add('agent-queue-ui__item-icon--pulsing');
    }
    if (agent.status === 'running') {
      icon.classList.add('agent-queue-ui__item-icon--pulse');
    }
    item.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'agent-queue-ui__item-info';

    const name = document.createElement('span');
    name.className = 'agent-queue-ui__item-name';
    name.textContent = agent.name;
    info.appendChild(name);

    const type = document.createElement('span');
    type.className = 'agent-queue-ui__item-type';
    type.textContent = agent.type;
    info.appendChild(type);

    item.appendChild(info);

    const statusBadge = document.createElement('span');
    statusBadge.className = `agent-queue-ui__item-status agent-queue-ui__item-status--${agent.status}`;
    statusBadge.textContent = agent.status.toUpperCase();
    item.appendChild(statusBadge);

    if (this.options.showProgress && agent.progress !== undefined) {
      const progress = document.createElement('span');
      progress.className = 'agent-queue-ui__item-progress';
      progress.textContent = `${Math.floor(agent.progress)}%`;
      item.appendChild(progress);
    } else if (agent.status === 'queued' || agent.status === 'loading') {
      const placeholder = document.createElement('span');
      placeholder.className = 'agent-queue-ui__item-progress agent-queue-ui__item-progress--placeholder';
      placeholder.textContent = '---';
      item.appendChild(placeholder);
    }

    const actions = document.createElement('div');
    actions.className = 'agent-queue-ui__item-actions';

    if (agent.status === 'running' || agent.status === 'processing') {
      actions.appendChild(this.renderItemAction('Pause', 'pause', agent.id));
      actions.appendChild(this.renderItemAction('Cancel', 'cancel', agent.id));
    }
    if (agent.status === 'paused') {
      actions.appendChild(this.renderItemAction('Resume', 'resume', agent.id));
    }
    if (agent.status === 'queued') {
      actions.appendChild(this.renderItemAction('Cancel', 'cancel', agent.id));
    }
    if (agent.status === 'failed' || agent.status === 'cancelled' || agent.status === 'timeout') {
      actions.appendChild(this.renderItemAction('Retry', 'retry', agent.id));
    }

    item.appendChild(actions);

    item.addEventListener('click', () => {
      this.emitAction(agent.id, 'select');
    });

    return item;
  }

  // ─── Queue Stats ───────────────────────────────────────────────────────

  renderQueueStats(): HTMLElement {
    const stats = document.createElement('div');
    stats.className = 'agent-queue-ui__stats';

    const statusCounts = new Map<AgentDisplayStatus, number>();
    for (const agent of this.agents) {
      statusCounts.set(agent.status, (statusCounts.get(agent.status) ?? 0) + 1);
    }

    const total = this.agents.length;
    const avgProgress = total > 0
      ? this.agents.reduce((sum, a) => sum + (a.progress ?? 0), 0) / total
      : 0;

    const statItems = [
      { label: 'Total', value: total, color: 'blue' },
      { label: 'Running', value: statusCounts.get('running') ?? 0, color: 'green' },
      { label: 'Queued', value: statusCounts.get('queued') ?? 0, color: 'yellow' },
      { label: 'Completed', value: statusCounts.get('completed') ?? 0, color: 'green' },
      { label: 'Failed', value: statusCounts.get('failed') ?? 0, color: 'red' },
      { label: 'Avg Progress', value: `${Math.floor(avgProgress)}%`, color: 'gray', isText: true },
    ];

    for (const item of statItems) {
      const cell = document.createElement('div');
      cell.className = `agent-queue-ui__stat-cell agent-queue-ui__stat-cell--${item.color}`;

      const value = document.createElement('span');
      value.className = 'agent-queue-ui__stat-value';
      value.textContent = item.isText ? item.value : String(item.value);
      cell.appendChild(value);

      const label = document.createElement('span');
      label.className = 'agent-queue-ui__stat-label';
      label.textContent = item.label;
      cell.appendChild(label);

      stats.appendChild(cell);
    }

    return stats;
  }

  // ─── Update ────────────────────────────────────────────────────────────

  update(agents?: AgentInfo[]): void {
    if (agents) {
      this.agents = agents;
    }
    this.render();
  }

  // ─── Highlight Agent ───────────────────────────────────────────────────

  highlightAgent(agentId: string): void {
    this.highlightedAgentId = agentId;
    this.render();

    setTimeout(() => {
      if (this.highlightedAgentId === agentId) {
        this.highlightedAgentId = null;
        this.render();
      }
    }, 3000);
  }

  // ─── Filter by Status ──────────────────────────────────────────────────

  filterByStatus(status: AgentDisplayStatus | 'all'): void {
    this.filterStatus = status;
    this.render();
  }

  // ─── Sort ──────────────────────────────────────────────────────────────

  sortBy(field: 'name' | 'status' | 'startTime' | 'progress'): void {
    this.sortField = field;
    this.render();
  }

  // ─── Auto Refresh ──────────────────────────────────────────────────────

  autoRefresh(intervalMs: number): void {
    this.options.refreshIntervalMs = intervalMs;
    this.options.autoRefresh = intervalMs > 0;
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  // ─── Action Handler ────────────────────────────────────────────────────

  onAction(callback: QueueActionCallback): { dispose: () => void } {
    this.actionCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.actionCallbacks.indexOf(callback);
        if (idx !== -1) this.actionCallbacks.splice(idx, 1);
      },
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private renderCountBadge(text: string, type: string): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `agent-queue-ui__count-badge agent-queue-ui__count-badge--${type}`;
    badge.textContent = text;
    return badge;
  }

  private renderItemAction(label: string, action: string, agentId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `agent-queue-ui__item-action agent-queue-ui__item-action--${action}`;
    btn.textContent = label;
    btn.title = `${label} agent`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emitAction(agentId, action);
    });
    return btn;
  }

  private emitAction(agentId: string, action: string): void {
    for (const cb of this.actionCallbacks) {
      cb(agentId, action);
    }
  }

  private getFilteredAgents(): AgentInfo[] {
    if (this.filterStatus === 'all') {
      return [...this.agents];
    }
    return this.agents.filter((a) => a.status === this.filterStatus);
  }

  private getSortedAgents(agents: AgentInfo[]): AgentInfo[] {
    const statusOrder: Record<AgentDisplayStatus, number> = {
      running: 0,
      processing: 1,
      loading: 2,
      queued: 3,
      paused: 4,
      retrying: 5,
      waiting: 6,
      completed: 7,
      failed: 8,
      cancelled: 9,
      timeout: 10,
    };

    return [...agents].sort((a, b) => {
      switch (this.sortField) {
        case 'status':
          return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'startTime':
          return (b.startTime?.getTime() ?? 0) - (a.startTime?.getTime() ?? 0);
        case 'progress':
          return (b.progress ?? 0) - (a.progress ?? 0);
        default:
          return 0;
      }
    });
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.render();
    }, this.options.refreshIntervalMs);
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
    this.agents = [];
    this.actionCallbacks = [];
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
