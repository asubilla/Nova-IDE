import { EventEmitter } from 'events';
import { DiffEngine, DiffResult, DiffStats, DiffLineType, DiffLine } from '../diff-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LiveDiffPanelConfig {
  container: HTMLElement;
  refreshIntervalMs?: number;
  onRevertFile?: (filePath: string) => void;
  onRevertAll?: () => void;
}

export interface FileChangeEntry {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldContent?: string;
  newContent: string;
  expanded: boolean;
}

export interface LiveDiffPanelState {
  taskId: string | null;
  files: Map<string, FileChangeEntry>;
  isWatching: boolean;
  lastUpdated: Date | null;
}

// ─── LiveDiffPanel ──────────────────────────────────────────────────────────

export class LiveDiffPanel extends EventEmitter {
  private config: Required<LiveDiffPanelConfig>;
  private container: HTMLElement;
  private panelEl: HTMLElement | null = null;
  private diffEngine: DiffEngine;
  private state: LiveDiffPanelState;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private fileTreeEl: HTMLElement | null = null;
  private diffContentEl: HTMLElement | null = null;
  private statsEl: HTMLElement | null = null;

  constructor(config: LiveDiffPanelConfig) {
    super();
    this.config = {
      refreshIntervalMs: 2000,
      onRevertFile: () => {},
      onRevertAll: () => {},
      ...config,
    };
    this.container = config.container;
    this.diffEngine = new DiffEngine();
    this.state = {
      taskId: null,
      files: new Map(),
      isWatching: false,
      lastUpdated: null,
    };
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(taskId: string): HTMLElement {
    this.state.taskId = taskId;
    this.state.files.clear();

    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'live-diff-panel';
      this.container.appendChild(this.panelEl);
    }

    this.panelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'live-diff-panel__header';

    const title = document.createElement('h3');
    title.className = 'live-diff-panel__title';
    title.textContent = 'Live Diff';
    header.appendChild(title);

    const watchIndicator = document.createElement('span');
    watchIndicator.className = 'live-diff-panel__watch-indicator';
    watchIndicator.textContent = this.state.isWatching ? 'Watching' : 'Paused';
    header.appendChild(watchIndicator);

    const revertAllBtn = document.createElement('button');
    revertAllBtn.className = 'live-diff-panel__btn live-diff-panel__btn--revert-all';
    revertAllBtn.textContent = 'Revert All';
    revertAllBtn.addEventListener('click', () => this.revertAll());
    header.appendChild(revertAllBtn);

    this.panelEl.appendChild(header);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'live-diff-panel__stats';
    this.panelEl.appendChild(this.statsEl);

    this.fileTreeEl = document.createElement('div');
    this.fileTreeEl.className = 'live-diff-panel__file-tree';
    this.panelEl.appendChild(this.fileTreeEl);

    this.diffContentEl = document.createElement('div');
    this.diffContentEl.className = 'live-diff-panel__diff-content';
    this.panelEl.appendChild(this.diffContentEl);

    this.renderEmptyState();

    return this.panelEl;
  }

  // ─── Start Watching ─────────────────────────────────────────────────────

  startWatching(taskId: string): void {
    this.state.taskId = taskId;
    this.state.isWatching = true;

    this.stopWatching();
    this.refreshTimer = setInterval(() => {
      this.emit('refresh', taskId);
    }, this.config.refreshIntervalMs);

    this.emit('watch:started', taskId);
  }

  // ─── Stop Watching ──────────────────────────────────────────────────────

  stopWatching(): void {
    this.state.isWatching = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.emit('watch:stopped');
  }

  // ─── Update Diff ────────────────────────────────────────────────────────

  updateDiff(diff: DiffResult): void {
    this.state.lastUpdated = new Date();

    this.updateStats(diff.stats);
    if (this.diffContentEl) {
      this.diffContentEl.innerHTML = '';
      const diffEl = this.renderInlineDiff(diff);
      this.diffContentEl.appendChild(diffEl);
    }
  }

  // ─── Add File Change ────────────────────────────────────────────────────

  addFileChange(entry: FileChangeEntry): void {
    this.state.files.set(entry.filePath, entry);
    this.updateFileTree();
    this.renderFileContent(entry);
  }

  updateFileContent(filePath: string, oldContent: string, newContent: string): void {
    const existing = this.state.files.get(filePath);
    const status = existing?.status ?? (oldContent ? 'modified' : 'added');

    this.state.files.set(filePath, {
      filePath,
      status,
      oldContent,
      newContent,
      expanded: existing?.expanded ?? false,
    });

    this.updateFileTree();

    if (existing?.expanded) {
      this.renderFileContent(this.state.files.get(filePath)!);
    }
  }

  // ─── File Tree ──────────────────────────────────────────────────────────

  renderFileTree(files: FileChangeEntry[]): HTMLElement {
    const tree = document.createElement('div');
    tree.className = 'live-diff-panel__file-tree-list';

    if (files.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'live-diff-panel__file-tree-empty';
      empty.textContent = 'No file changes';
      tree.appendChild(empty);
      return tree;
    }

    for (const file of files) {
      const item = document.createElement('div');
      item.className = `live-diff-panel__file-item live-diff-panel__file-item--${file.status}`;
      item.dataset.path = file.filePath;

      const icon = document.createElement('span');
      icon.className = 'live-diff-panel__file-icon';
      icon.textContent = this.getFileIcon(file.status);
      item.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'live-diff-panel__file-name';
      name.textContent = this.getFileName(file.filePath);
      name.title = file.filePath;
      item.appendChild(name);

      const statusBadge = document.createElement('span');
      statusBadge.className = `live-diff-panel__file-status live-diff-panel__file-status--${file.status}`;
      statusBadge.textContent = file.status.charAt(0).toUpperCase();
      item.appendChild(statusBadge);

      const revertBtn = document.createElement('button');
      revertBtn.className = 'live-diff-panel__file-revert-btn';
      revertBtn.textContent = '↩';
      revertBtn.title = 'Revert this file';
      revertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.revertFile(file.filePath);
      });
      item.appendChild(revertBtn);

      item.addEventListener('click', () => {
        this.toggleFile(file.filePath);
      });

      tree.appendChild(item);
    }

    return tree;
  }

  private updateFileTree(): void {
    if (!this.fileTreeEl) return;

    const files = Array.from(this.state.files.values());
    this.fileTreeEl.innerHTML = '';
    this.fileTreeEl.appendChild(this.renderFileTree(files));
  }

  // ─── Diff Stats ─────────────────────────────────────────────────────────

  renderDiffStats(stats: DiffStats): HTMLElement {
    const el = document.createElement('div');
    el.className = 'live-diff-panel__stats-grid';

    const items = [
      { label: 'Total', value: stats.totalLines.toString(), cls: 'total' },
      { label: 'Added', value: `+${stats.addedLines}`, cls: 'added' },
      { label: 'Removed', value: `-${stats.removedLines}`, cls: 'removed' },
      { label: 'Modified', value: `~${stats.modifiedLines}`, cls: 'modified' },
      { label: 'Unchanged', value: stats.unchangedLines.toString(), cls: 'unchanged' },
    ];

    for (const item of items) {
      const stat = document.createElement('div');
      stat.className = `live-diff-panel__stat live-diff-panel__stat--${item.cls}`;

      const value = document.createElement('span');
      value.className = 'live-diff-panel__stat-value';
      value.textContent = item.value;
      stat.appendChild(value);

      const label = document.createElement('span');
      label.className = 'live-diff-panel__stat-label';
      label.textContent = item.label;
      stat.appendChild(label);

      el.appendChild(stat);
    }

    return el;
  }

  private updateStats(stats: DiffStats): void {
    if (!this.statsEl) return;
    this.statsEl.innerHTML = '';
    this.statsEl.appendChild(this.renderDiffStats(stats));
  }

  // ─── Toggle File ────────────────────────────────────────────────────────

  toggleFile(filePath: string): void {
    const entry = this.state.files.get(filePath);
    if (!entry) return;

    entry.expanded = !entry.expanded;
    this.state.files.set(filePath, entry);

    if (entry.expanded) {
      this.renderFileContent(entry);
    } else {
      this.collapseFileContent(filePath);
    }
  }

  // ─── Revert File ────────────────────────────────────────────────────────

  revertFile(filePath: string): void {
    this.config.onRevertFile(filePath);
    this.state.files.delete(filePath);
    this.updateFileTree();
    this.emit('file:reverted', filePath);
  }

  // ─── Revert All ─────────────────────────────────────────────────────────

  revertAll(): void {
    this.config.onRevertAll();
    this.state.files.clear();
    this.updateFileTree();
    this.renderEmptyState();
    this.emit('all:reverted');
  }

  // ─── Private: Render Helpers ────────────────────────────────────────────

  private renderFileContent(entry: FileChangeEntry): void {
    if (!this.diffContentEl) return;

    this.diffContentEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'live-diff-panel__file-header';

    const filePath = document.createElement('span');
    filePath.className = 'live-diff-panel__file-path';
    filePath.textContent = entry.filePath;
    header.appendChild(filePath);

    this.diffContentEl.appendChild(header);

    if (entry.oldContent !== undefined && entry.newContent !== undefined) {
      const diff = this.diffEngine.computeDiff(entry.oldContent, entry.newContent);
      const diffEl = this.renderInlineDiff(diff);
      this.diffContentEl.appendChild(diffEl);
    } else if (entry.status === 'added') {
      const addedBlock = document.createElement('div');
      addedBlock.className = 'live-diff-panel__added-block';

      const lines = entry.newContent.split('\n');
      for (const line of lines) {
        const lineEl = document.createElement('div');
        lineEl.className = 'live-diff-panel__diff-line live-diff-panel__diff-line--added';

        const prefix = document.createElement('span');
        prefix.className = 'live-diff-panel__diff-prefix';
        prefix.textContent = '+';
        lineEl.appendChild(prefix);

        const content = document.createElement('span');
        content.className = 'live-diff-panel__diff-text';
        content.textContent = line;
        lineEl.appendChild(content);

        addedBlock.appendChild(lineEl);
      }

      this.diffContentEl.appendChild(addedBlock);
    }
  }

  private collapseFileContent(filePath: string): void {
    if (!this.diffContentEl) return;

    const children = this.diffContentEl.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i] as HTMLElement;
      if (child.dataset?.path === filePath) {
        this.diffContentEl.removeChild(child);
      }
    }
  }

  private renderInlineDiff(diff: DiffResult): HTMLElement {
    const container = document.createElement('div');
    container.className = 'live-diff-panel__inline-diff';

    for (const hunk of diff.hunks) {
      const hunkEl = document.createElement('div');
      hunkEl.className = 'live-diff-panel__hunk';

      const hunkHeader = document.createElement('div');
      hunkHeader.className = 'live-diff-panel__hunk-header';
      hunkHeader.textContent = hunk.header;
      hunkEl.appendChild(hunkHeader);

      for (const line of hunk.lines) {
        const lineEl = document.createElement('div');
        lineEl.className = `live-diff-panel__diff-line live-diff-panel__diff-line--${line.type}`;

        const prefix = document.createElement('span');
        prefix.className = 'live-diff-panel__diff-prefix';
        prefix.textContent = this.getDiffPrefix(line.type);
        lineEl.appendChild(prefix);

        if (line.oldLineNum !== null) {
          const oldNum = document.createElement('span');
          oldNum.className = 'live-diff-panel__line-num live-diff-panel__line-num--old';
          oldNum.textContent = String(line.oldLineNum);
          lineEl.appendChild(oldNum);
        }

        if (line.newLineNum !== null) {
          const newNum = document.createElement('span');
          newNum.className = 'live-diff-panel__line-num live-diff-panel__line-num--new';
          newNum.textContent = String(line.newLineNum);
          lineEl.appendChild(newNum);
        }

        const content = document.createElement('span');
        content.className = 'live-diff-panel__diff-text';
        content.textContent = line.content;
        lineEl.appendChild(content);

        hunkEl.appendChild(lineEl);
      }

      container.appendChild(hunkEl);
    }

    return container;
  }

  private renderEmptyState(): void {
    if (!this.diffContentEl) return;

    this.diffContentEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'live-diff-panel__empty';
    empty.textContent = 'No changes to display';
    this.diffContentEl.appendChild(empty);
  }

  // ─── Private: Helpers ───────────────────────────────────────────────────

  private getDiffPrefix(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added: return '+';
      case DiffLineType.Removed: return '-';
      case DiffLineType.Modified: return '~';
      default: return ' ';
    }
  }

  private getFileIcon(status: FileChangeEntry['status']): string {
    switch (status) {
      case 'added': return '+';
      case 'modified': return '~';
      case 'deleted': return '−';
      case 'renamed': return '→';
    }
  }

  private getFileName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.stopWatching();
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    this.state.files.clear();
    this.removeAllListeners();
  }
}
