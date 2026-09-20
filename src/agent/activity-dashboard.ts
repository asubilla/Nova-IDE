import { AgentStreamer, AgentActivity, ActivityType, ActivityData, ActivityTimelineEntry } from './agent-streamer';
import { ToolTracker, ToolStats } from './tool-tracker';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DashboardConfig {
  container: HTMLElement;
  streamer: AgentStreamer;
  tracker?: ToolTracker;
  refreshIntervalMs?: number;
  maxFeedItems?: number;
  autoScroll?: boolean;
}

export interface FileChangeEntry {
  path: string;
  type: 'create' | 'edit' | 'delete';
  timestamp: Date;
  details?: string;
}

export interface CommandLogEntry {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

export interface SummaryData {
  totalActivities: number;
  fileChanges: number;
  commandsRun: number;
  toolsUsed: number;
  errors: number;
  warnings: number;
  elapsed: string;
}

// ─── ActivityDashboard ──────────────────────────────────────────────────────

export class ActivityDashboard {
  private container: HTMLElement;
  private streamer: AgentStreamer;
  private tracker: ToolTracker | undefined;
  private dashboardEl: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private config: {
    container: HTMLElement;
    streamer: AgentStreamer;
    refreshIntervalMs: number;
    maxFeedItems: number;
    autoScroll: boolean;
  };
  private fileChanges: FileChangeEntry[] = [];
  private commandLogs: CommandLogEntry[] = [];
  private errorActivities: AgentActivity[] = [];
  private currentFilter: ActivityType | 'all' = 'all';
  private searchQuery = '';

  constructor(container: HTMLElement, streamer: AgentStreamer, tracker?: ToolTracker) {
    this.container = container;
    this.streamer = streamer;
    this.tracker = tracker;
    this.config = {
      container,
      streamer,
      refreshIntervalMs: 500,
      maxFeedItems: 200,
      autoScroll: true,
    };

    this.setupStreamerListeners();
    this.setupTrackerListeners();
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(): HTMLElement {
    if (!this.dashboardEl) {
      this.dashboardEl = document.createElement('div');
      this.dashboardEl.className = 'activity-dashboard';
      this.container.appendChild(this.dashboardEl);
    }

    this.dashboardEl.innerHTML = '';

    const header = this.renderDashboardHeader();
    this.dashboardEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'activity-dashboard__body';

    const mainPanel = document.createElement('div');
    mainPanel.className = 'activity-dashboard__main';

    const progressBar = this.renderProgressBar(this.getCurrentProgress());
    mainPanel.appendChild(progressBar);

    const feedContainer = document.createElement('div');
    feedContainer.className = 'activity-dashboard__feed-container';
    const activities = this.getFilteredActivities();
    const feed = this.renderActivityFeed(activities);
    feedContainer.appendChild(feed);
    mainPanel.appendChild(feedContainer);

    body.appendChild(mainPanel);

    const sidePanel = document.createElement('div');
    sidePanel.className = 'activity-dashboard__side';

    const summaryPanel = this.renderSummaryPanel(this.getSummaryData());
    sidePanel.appendChild(summaryPanel);

    if (this.tracker) {
      const toolPanel = this.renderToolStatus(this.tracker.getToolStats());
      sidePanel.appendChild(toolPanel);
    }

    if (this.fileChanges.length > 0) {
      const filesPanel = this.renderFileChanges(this.fileChanges);
      sidePanel.appendChild(filesPanel);
    }

    if (this.commandLogs.length > 0) {
      const cmdPanel = this.renderCommandLog(this.commandLogs);
      sidePanel.appendChild(cmdPanel);
    }

    if (this.errorActivities.length > 0) {
      const errPanel = this.renderErrorPanel(this.errorActivities);
      sidePanel.appendChild(errPanel);
    }

    const timeline = this.streamer.getActivityTimeline();
    if (timeline.length > 0) {
      const timelinePanel = this.renderTimeline(timeline);
      sidePanel.appendChild(timelinePanel);
    }

    body.appendChild(sidePanel);
    this.dashboardEl.appendChild(body);

    this.startAutoRefresh();

    if (this.config.autoScroll) {
      this.autoScroll();
    }

    return this.dashboardEl;
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  update(): void {
    if (!this.dashboardEl) return;

    const progressBar = this.dashboardEl.querySelector('.activity-dashboard__progress');
    if (progressBar) {
      const newProgress = this.renderProgressBar(this.getCurrentProgress());
      progressBar.replaceWith(newProgress);
    }

    const feedContainer = this.dashboardEl.querySelector('.activity-dashboard__feed-container');
    if (feedContainer) {
      const activities = this.getFilteredActivities();
      const newFeed = this.renderActivityFeed(activities);
      feedContainer.innerHTML = '';
      feedContainer.appendChild(newFeed);
    }

    const summaryEl = this.dashboardEl.querySelector('.activity-dashboard__summary');
    if (summaryEl) {
      const newSummary = this.renderSummaryPanel(this.getSummaryData());
      summaryEl.replaceWith(newSummary);
    }

    const toolEl = this.dashboardEl.querySelector('.activity-dashboard__tools');
    if (toolEl && this.tracker) {
      const newToolPanel = this.renderToolStatus(this.tracker.getToolStats());
      toolEl.replaceWith(newToolPanel);
    }

    const filesEl = this.dashboardEl.querySelector('.activity-dashboard__files');
    if (filesEl && this.fileChanges.length > 0) {
      const newFilesPanel = this.renderFileChanges(this.fileChanges);
      filesEl.replaceWith(newFilesPanel);
    }

    const cmdEl = this.dashboardEl.querySelector('.activity-dashboard__commands');
    if (cmdEl && this.commandLogs.length > 0) {
      const newCmdPanel = this.renderCommandLog(this.commandLogs);
      cmdEl.replaceWith(newCmdPanel);
    }

    const errEl = this.dashboardEl.querySelector('.activity-dashboard__errors');
    if (errEl && this.errorActivities.length > 0) {
      const newErrPanel = this.renderErrorPanel(this.errorActivities);
      errEl.replaceWith(newErrPanel);
    }

    if (this.config.autoScroll) {
      this.autoScroll();
    }
  }

  // ─── Render Progress Bar ────────────────────────────────────────────────

  renderProgressBar(progress: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'activity-dashboard__progress';

    const barOuter = document.createElement('div');
    barOuter.className = 'activity-dashboard__progress-outer';

    const barInner = document.createElement('div');
    barInner.className = 'activity-dashboard__progress-inner';
    barInner.style.width = `${Math.max(1, Math.min(100, progress))}%`;

    if (progress >= 100) {
      barInner.classList.add('activity-dashboard__progress-inner--complete');
    } else if (progress >= 70) {
      barInner.classList.add('activity-dashboard__progress-inner--high');
    }

    const label = document.createElement('span');
    label.className = 'activity-dashboard__progress-label';
    label.textContent = `${Math.floor(progress)}%`;

    barOuter.appendChild(barInner);
    wrapper.appendChild(barOuter);
    wrapper.appendChild(label);

    return wrapper;
  }

  // ─── Render Activity Feed ──────────────────────────────────────────────

  renderActivityFeed(activities: AgentActivity[]): HTMLElement {
    const feed = document.createElement('div');
    feed.className = 'activity-dashboard__feed';

    if (activities.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'activity-dashboard__empty';
      empty.textContent = 'No activities yet';
      feed.appendChild(empty);
      return feed;
    }

    const maxItems = this.config.maxFeedItems;
    const items = activities.slice(-maxItems);

    for (const activity of items) {
      const item = this.renderActivityItem(activity);
      feed.appendChild(item);
    }

    return feed;
  }

  private renderActivityItem(activity: AgentActivity): HTMLElement {
    const item = document.createElement('div');
    item.className = `activity-dashboard__item activity-dashboard__item--${activity.type} activity-dashboard__item--${activity.status}`;

    const icon = document.createElement('span');
    icon.className = 'activity-dashboard__item-icon';
    icon.textContent = this.getTypeIcon(activity.type);
    item.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'activity-dashboard__item-content';

    const message = document.createElement('span');
    message.className = 'activity-dashboard__item-message';
    message.textContent = activity.data.message;
    content.appendChild(message);

    if (activity.duration !== undefined) {
      const duration = document.createElement('span');
      duration.className = 'activity-dashboard__item-duration';
      duration.textContent = ` (${activity.duration}ms)`;
      content.appendChild(duration);
    }

    item.appendChild(content);

    const time = document.createElement('span');
    time.className = 'activity-dashboard__item-time';
    time.textContent = this.formatRelativeTime(activity.timestamp);
    item.appendChild(time);

    return item;
  }

  // ─── Render Tool Status ────────────────────────────────────────────────

  renderToolStatus(stats: ToolStats[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__tools activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = 'Tool Usage';
    panel.appendChild(title);

    if (stats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'activity-dashboard__empty';
      empty.textContent = 'No tools used yet';
      panel.appendChild(empty);
      return panel;
    }

    const table = document.createElement('table');
    table.className = 'activity-dashboard__table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tool</th><th>Calls</th><th>OK</th><th>Err</th><th>Avg</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const s of stats) {
      const tr = document.createElement('tr');
      const successRate = s.totalCalls > 0
        ? Math.round((s.successCount / s.totalCalls) * 100)
        : 0;

      tr.innerHTML = `
        <td class="activity-dashboard__tool-name">${s.toolName}</td>
        <td>${s.totalCalls}</td>
        <td class="activity-dashboard__tool-success">${s.successCount} (${successRate}%)</td>
        <td class="activity-dashboard__tool-error">${s.errorCount}</td>
        <td>${this.formatDuration(s.avgDuration)}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    panel.appendChild(table);

    return panel;
  }

  // ─── Render File Changes ───────────────────────────────────────────────

  renderFileChanges(files: FileChangeEntry[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__files activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = `File Changes (${files.length})`;
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'activity-dashboard__file-list';

    for (const file of files) {
      const item = document.createElement('div');
      item.className = `activity-dashboard__file-item activity-dashboard__file-item--${file.type}`;

      const icon = document.createElement('span');
      icon.className = 'activity-dashboard__file-icon';
      icon.textContent = this.getFileTypeIcon(file.type);
      item.appendChild(icon);

      const path = document.createElement('span');
      path.className = 'activity-dashboard__file-path';
      path.textContent = file.path;
      path.title = file.path;
      item.appendChild(path);

      const badge = document.createElement('span');
      badge.className = `activity-dashboard__file-badge activity-dashboard__file-badge--${file.type}`;
      badge.textContent = file.type;
      item.appendChild(badge);

      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  // ─── Render Command Log ────────────────────────────────────────────────

  renderCommandLog(commands: CommandLogEntry[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__commands activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = `Commands (${commands.length})`;
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'activity-dashboard__command-list';

    for (const cmd of commands) {
      const item = document.createElement('div');
      item.className = `activity-dashboard__command-item activity-dashboard__command-item--${cmd.exitCode === 0 ? 'success' : 'error'}`;

      const header = document.createElement('div');
      header.className = 'activity-dashboard__command-header';

      const cmdText = document.createElement('code');
      cmdText.className = 'activity-dashboard__command-text';
      cmdText.textContent = `$ ${cmd.command}`;
      header.appendChild(cmdText);

      const exitBadge = document.createElement('span');
      exitBadge.className = `activity-dashboard__exit-code activity-dashboard__exit-code--${cmd.exitCode === 0 ? 'success' : 'error'}`;
      exitBadge.textContent = `exit ${cmd.exitCode}`;
      header.appendChild(exitBadge);

      item.appendChild(header);

      if (cmd.output) {
        const output = document.createElement('pre');
        output.className = 'activity-dashboard__command-output';
        output.textContent = cmd.output.length > 500
          ? cmd.output.slice(0, 500) + '\n... (truncated)'
          : cmd.output;
        item.appendChild(output);
      }

      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  // ─── Render Error Panel ────────────────────────────────────────────────

  renderErrorPanel(errors: AgentActivity[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__errors activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = `Errors (${errors.length})`;
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'activity-dashboard__error-list';

    for (const err of errors) {
      const item = document.createElement('div');
      item.className = 'activity-dashboard__error-item';

      const icon = document.createElement('span');
      icon.className = 'activity-dashboard__error-icon';
      icon.textContent = '\u26a0\ufe0f';
      item.appendChild(icon);

      const content = document.createElement('div');
      content.className = 'activity-dashboard__error-content';

      const message = document.createElement('span');
      message.className = 'activity-dashboard__error-message';
      message.textContent = err.data.message;
      content.appendChild(message);

      if (err.data.context) {
        const context = document.createElement('div');
        context.className = 'activity-dashboard__error-context';
        context.textContent = err.data.context;
        content.appendChild(context);
      }

      item.appendChild(content);

      const time = document.createElement('span');
      time.className = 'activity-dashboard__error-time';
      time.textContent = this.formatRelativeTime(err.timestamp);
      item.appendChild(time);

      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  // ─── Render Summary Panel ──────────────────────────────────────────────

  renderSummaryPanel(summary: SummaryData): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__summary activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = 'Summary';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'activity-dashboard__summary-grid';

    const items = [
      { label: 'Activities', value: summary.totalActivities, color: 'blue' },
      { label: 'Files Changed', value: summary.fileChanges, color: 'green' },
      { label: 'Commands', value: summary.commandsRun, color: 'purple' },
      { label: 'Tools Used', value: summary.toolsUsed, color: 'cyan' },
      { label: 'Errors', value: summary.errors, color: 'red' },
      { label: 'Warnings', value: summary.warnings, color: 'yellow' },
      { label: 'Elapsed', value: summary.elapsed, color: 'gray', isText: true },
    ];

    for (const item of items) {
      const cell = document.createElement('div');
      cell.className = `activity-dashboard__summary-cell activity-dashboard__summary-cell--${item.color}`;

      const valueEl = document.createElement('span');
      valueEl.className = 'activity-dashboard__summary-value';
      valueEl.textContent = item.isText ? item.value : String(item.value);
      cell.appendChild(valueEl);

      const labelEl = document.createElement('span');
      labelEl.className = 'activity-dashboard__summary-label';
      labelEl.textContent = item.label;
      cell.appendChild(labelEl);

      grid.appendChild(cell);
    }

    panel.appendChild(grid);
    return panel;
  }

  // ─── Render Timeline ───────────────────────────────────────────────────

  renderTimeline(timeline: ActivityTimelineEntry[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'activity-dashboard__timeline activity-dashboard__panel';

    const title = document.createElement('h4');
    title.className = 'activity-dashboard__panel-title';
    title.textContent = 'Timeline';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'activity-dashboard__timeline-list';

    for (const entry of timeline) {
      const item = document.createElement('div');
      item.className = `activity-dashboard__timeline-item activity-dashboard__timeline-item--${entry.activity.type}`;

      const time = document.createElement('span');
      time.className = 'activity-dashboard__timeline-time';
      time.textContent = entry.time;
      item.appendChild(time);

      const dot = document.createElement('span');
      dot.className = 'activity-dashboard__timeline-dot';
      item.appendChild(dot);

      const desc = document.createElement('span');
      desc.className = 'activity-dashboard__timeline-desc';
      desc.textContent = entry.activity.data.message;
      item.appendChild(desc);

      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  // ─── Auto Scroll ───────────────────────────────────────────────────────

  autoScroll(): void {
    const feed = this.dashboardEl?.querySelector('.activity-dashboard__feed');
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }

  // ─── Filter by Type ────────────────────────────────────────────────────

  filterByType(type: ActivityType | 'all'): void {
    this.currentFilter = type;
    this.update();
  }

  // ─── Search Activities ─────────────────────────────────────────────────

  searchActivities(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.update();
  }

  // ─── Private: Get Filtered Activities ──────────────────────────────────

  private getFilteredActivities(): AgentActivity[] {
    let activities = this.streamer.getActivities();

    if (this.currentFilter !== 'all') {
      activities = activities.filter((a) => a.type === this.currentFilter);
    }

    if (this.searchQuery) {
      activities = activities.filter((a) =>
        a.data.message.toLowerCase().includes(this.searchQuery) ||
        (a.data.path && a.data.path.toLowerCase().includes(this.searchQuery)) ||
        (a.data.toolName && a.data.toolName.toLowerCase().includes(this.searchQuery)),
      );
    }

    return activities;
  }

  // ─── Private: Get Current Progress ─────────────────────────────────────

  private getCurrentProgress(): number {
    const activities = this.streamer.getActivities();
    const progressActivities = activities.filter((a) => a.type === 'progress');
    if (progressActivities.length === 0) {
      const total = activities.length;
      if (total === 0) return 0;
      return Math.min(95, Math.round((total / 20) * 100));
    }
    const latest = progressActivities[progressActivities.length - 1];
    if (latest.data.current !== undefined && latest.data.total !== undefined) {
      return Math.round((latest.data.current / latest.data.total) * 100);
    }
    return Math.min(95, Math.round((progressActivities.length / 10) * 100));
  }

  // ─── Private: Get Summary Data ─────────────────────────────────────────

  private getSummaryData(): SummaryData {
    const activities = this.streamer.getActivities();
    const allFiles = this.streamer.getActivitiesByType('create')
      .concat(this.streamer.getActivitiesByType('edit'))
      .concat(this.streamer.getActivitiesByType('delete'));

    const commands = this.streamer.getActivitiesByType('command');
    const errors = this.streamer.getActivitiesByType('error');
    const warnings = this.streamer.getActivitiesByType('warning');

    const toolCount = this.tracker
      ? this.tracker.getToolStats().length
      : new Set(activities.filter((a) => a.type === 'tool').map((a) => a.data.toolName)).size;

    return {
      totalActivities: activities.length,
      fileChanges: allFiles.length,
      commandsRun: commands.length,
      toolsUsed: toolCount,
      errors: errors.length,
      warnings: warnings.length,
      elapsed: this.streamer.getElapsedFormatted(),
    };
  }

  // ─── Private: Streamer Listeners ───────────────────────────────────────

  private setupStreamerListeners(): void {
    this.streamer.on('activity', (activity: AgentActivity) => {
      this.handleActivity(activity);
    });
  }

  private handleActivity(activity: AgentActivity): void {
    switch (activity.type) {
      case 'create':
        this.fileChanges.push({
          path: activity.data.path ?? '',
          type: 'create',
          timestamp: activity.timestamp,
        });
        break;
      case 'edit':
        this.fileChanges.push({
          path: activity.data.path ?? '',
          type: 'edit',
          timestamp: activity.timestamp,
          details: activity.data.added !== undefined && activity.data.removed !== undefined
            ? `+${activity.data.added} -${activity.data.removed}`
            : undefined,
        });
        break;
      case 'delete':
        this.fileChanges.push({
          path: activity.data.path ?? '',
          type: 'delete',
          timestamp: activity.timestamp,
        });
        break;
      case 'command':
        this.commandLogs.push({
          command: activity.data.command ?? '',
          output: activity.data.output ?? '',
          exitCode: activity.data.exitCode ?? 0,
          timestamp: activity.timestamp,
        });
        break;
      case 'error':
        this.errorActivities.push(activity);
        break;
    }
  }

  // ─── Private: Tracker Listeners ────────────────────────────────────────

  private setupTrackerListeners(): void {
    if (!this.tracker) return;

    this.tracker.on('tool:start', () => {
      this.update();
    });
    this.tracker.on('tool:success', () => {
      this.update();
    });
    this.tracker.on('tool:error', () => {
      this.update();
    });
  }

  // ─── Private: Auto Refresh ─────────────────────────────────────────────

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.update();
    }, this.config.refreshIntervalMs);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────

  private renderDashboardHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'activity-dashboard__header';

    const title = document.createElement('h3');
    title.className = 'activity-dashboard__title';
    title.textContent = 'Agent Activity';
    header.appendChild(title);

    const filters = document.createElement('div');
    filters.className = 'activity-dashboard__filters';

    const allBtn = this.createFilterButton('All', 'all');
    allBtn.classList.add('activity-dashboard__filter-btn--active');
    filters.appendChild(allBtn);

    const types: ActivityType[] = ['explore', 'read', 'edit', 'create', 'delete', 'search', 'tool', 'command', 'progress', 'error', 'warning', 'result'];
    for (const type of types) {
      filters.appendChild(this.createFilterButton(type, type));
    }

    header.appendChild(filters);

    const search = document.createElement('input');
    search.className = 'activity-dashboard__search';
    search.type = 'text';
    search.placeholder = 'Search activities...';
    search.addEventListener('input', () => {
      this.searchActivities(search.value);
    });
    header.appendChild(search);

    return header;
  }

  private createFilterButton(label: string, type: ActivityType | 'all'): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'activity-dashboard__filter-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this.currentFilter = type;
      const allBtns = this.dashboardEl?.querySelectorAll('.activity-dashboard__filter-btn');
      allBtns?.forEach((b) => b.classList.remove('activity-dashboard__filter-btn--active'));
      btn.classList.add('activity-dashboard__filter-btn--active');
      this.update();
    });
    return btn;
  }

  private getTypeIcon(type: ActivityType): string {
    const icons: Record<ActivityType, string> = {
      explore: '\ud83d\udd0d',
      read: '\ud83d\udcc4',
      edit: '\u270f\ufe0f',
      create: '\u2795',
      delete: '\u2796',
      search: '\ud83d\udd0e',
      tool: '\ud83d\udd27',
      command: '\u2328\ufe0f',
      progress: '\ud83d\udcc8',
      error: '\u274c',
      warning: '\u26a0\ufe0f',
      result: '\u2705',
    };
    return icons[type] ?? '\u25cf';
  }

  private getFileTypeIcon(type: string): string {
    switch (type) {
      case 'create': return '\u2795';
      case 'edit': return '\u270f\ufe0f';
      case 'delete': return '\u2796';
      default: return '\u25cf';
    }
  }

  private formatRelativeTime(date: Date): string {
    const ms = Date.now() - date.getTime();
    if (ms < 1000) return 'now';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.stopAutoRefresh();
    this.fileChanges = [];
    this.commandLogs = [];
    this.errorActivities = [];
    if (this.dashboardEl) {
      this.dashboardEl.remove();
      this.dashboardEl = null;
    }
  }
}
