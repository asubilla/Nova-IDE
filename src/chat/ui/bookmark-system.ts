import type { ChatMessage } from '../chat-types.js';

export interface Bookmark {
  id: string;
  messageId: string;
  userId: string;
  sessionId?: string;
  note?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BookmarkConfig {
  onJumpToMessage?: (messageId: string) => void;
  onRemoveBookmark?: (bookmarkId: string) => void;
  onEditBookmark?: (bookmarkId: string) => void;
}

export interface BookmarkRenderOptions {
  showNote?: boolean;
  showTags?: boolean;
  showTimestamp?: boolean;
  compact?: boolean;
  groupBySession?: boolean;
  filterTag?: string;
  sortBy?: 'date' | 'session' | 'tag';
}

export type ExportFormat = 'json' | 'markdown' | 'csv';

const DEFAULT_CONFIG: BookmarkConfig = {};

export class BookmarkSystem {
  private bookmarks = new Map<string, Bookmark>();
  private callbacks: BookmarkConfig;
  private nextId = 1;

  constructor(config?: BookmarkConfig) {
    this.callbacks = { ...DEFAULT_CONFIG, ...config };
  }

  addBookmark(
    messageId: string,
    userId: string,
    options?: { note?: string; tags?: string[]; sessionId?: string },
  ): Bookmark {
    const existing = this.findByMessageAndUser(messageId, userId);
    if (existing) {
      if (options?.note) existing.note = options.note;
      if (options?.tags) existing.tags = options.tags;
      existing.updatedAt = new Date();
      return existing;
    }

    const bookmark: Bookmark = {
      id: `bm-${this.nextId++}`,
      messageId,
      userId,
      sessionId: options?.sessionId,
      note: options?.note,
      tags: options?.tags ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.bookmarks.set(bookmark.id, bookmark);
    return bookmark;
  }

  removeBookmark(bookmarkId: string): boolean {
    return this.bookmarks.delete(bookmarkId);
  }

  removeBookmarkByMessage(messageId: string, userId: string): boolean {
    const bookmark = this.findByMessageAndUser(messageId, userId);
    if (bookmark) {
      return this.bookmarks.delete(bookmark.id);
    }
    return false;
  }

  updateBookmark(bookmarkId: string, updates: { note?: string; tags?: string[] }): boolean {
    const bookmark = this.bookmarks.get(bookmarkId);
    if (!bookmark) return false;

    if (updates.note !== undefined) bookmark.note = updates.note;
    if (updates.tags !== undefined) bookmark.tags = updates.tags;
    bookmark.updatedAt = new Date();

    return true;
  }

  getBookmarks(userId: string, sessionId?: string): Bookmark[] {
    return Array.from(this.bookmarks.values()).filter(b => {
      if (b.userId !== userId) return false;
      if (sessionId && b.sessionId !== sessionId) return false;
      return true;
    });
  }

  getBookmarkById(bookmarkId: string): Bookmark | undefined {
    return this.bookmarks.get(bookmarkId);
  }

  isBookmarked(messageId: string, userId: string): boolean {
    return this.findByMessageAndUser(messageId, userId) !== undefined;
  }

  getBookmarkCount(userId: string, sessionId?: string): number {
    return this.getBookmarks(userId, sessionId).length;
  }

  getAllTags(userId: string): string[] {
    const tags = new Set<string>();
    for (const bookmark of this.bookmarks.values()) {
      if (bookmark.userId === userId) {
        bookmark.tags.forEach(t => tags.add(t));
      }
    }
    return Array.from(tags).sort();
  }

  renderBookmarks(
    bookmarks: Bookmark[],
    messages: Map<string, ChatMessage>,
    options?: BookmarkRenderOptions,
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'bookmarks-section';

    let filtered = [...bookmarks];
    if (options?.filterTag) {
      filtered = filtered.filter(b => b.tags.includes(options.filterTag!));
    }

    if (options?.sortBy === 'tag') {
      filtered.sort((a, b) => {
        const tagA = a.tags[0] ?? '';
        const tagB = b.tags[0] ?? '';
        return tagA.localeCompare(tagB);
      });
    } else if (options?.sortBy === 'session') {
      filtered.sort((a, b) => (a.sessionId ?? '').localeCompare(b.sessionId ?? ''));
    } else {
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-empty';
      empty.style.cssText = 'padding:24px;text-align:center;color:var(--chat-text-muted);font-size:14px;';
      empty.textContent = 'No bookmarks yet';
      container.appendChild(empty);
      return container;
    }

    if (options?.groupBySession) {
      const grouped = this.groupBySession(filtered);
      for (const [sessionId, sessionBookmarks] of grouped) {
        const group = this.renderBookmarkGroup(sessionId, sessionBookmarks, messages, options);
        container.appendChild(group);
      }
    } else {
      const list = document.createElement('div');
      list.className = 'bookmarks-list';

      for (const bookmark of filtered) {
        const msg = messages.get(bookmark.messageId);
        const item = this.renderBookmarkItem(bookmark, msg, options);
        list.appendChild(item);
      }

      container.appendChild(list);
    }

    return container;
  }

  renderBookmarkBadge(): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'bookmark-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:4px;background:var(--chat-bookmark-bg, rgba(139,92,246,0.15));color:var(--chat-bookmark-color, #8b5cf6);font-weight:500;';
    badge.innerHTML = `<span style="font-size:12px;">🔖</span> Bookmarked`;
    return badge;
  }

  renderBookmarkButton(messageId: string, isBookmarked: boolean): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'bookmark-btn';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;font-size:16px;color:var(--chat-text-muted);transition:color 0.15s;';

    btn.textContent = isBookmarked ? '🔖' : '🏷️';
    btn.title = isBookmarked ? 'Remove bookmark' : 'Add bookmark';

    btn.addEventListener('mouseenter', () => {
      btn.style.color = 'var(--chat-text)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'var(--chat-text-muted)';
    });

    return btn;
  }

  renderTagFilter(tags: string[], activeTag?: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'bookmark-tag-filter';
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 16px;border-bottom:1px solid var(--chat-border);';

    const allBtn = document.createElement('button');
    allBtn.className = `bookmark-tag-btn ${!activeTag ? 'active' : ''}`;
    allBtn.textContent = 'All';
    allBtn.style.cssText = this.getTagButtonStyle(!activeTag);
    allBtn.addEventListener('click', () => {
      container.querySelectorAll('.bookmark-tag-btn').forEach((b: Element) => {
        (b as HTMLElement).style.cssText = this.getTagButtonStyle(false);
      });
      allBtn.style.cssText = this.getTagButtonStyle(true);
    });
    container.appendChild(allBtn);

    for (const tag of tags) {
      const btn = document.createElement('button');
      btn.className = `bookmark-tag-btn ${activeTag === tag ? 'active' : ''}`;
      btn.textContent = tag;
      btn.style.cssText = this.getTagButtonStyle(activeTag === tag);
      container.appendChild(btn);
    }

    return container;
  }

  exportBookmarks(bookmarks: Bookmark[], format: ExportFormat = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(bookmarks, null, 2);

      case 'markdown': {
        const lines: string[] = ['# Bookmarks', ''];
        for (const bm of bookmarks) {
          lines.push(`## ${bm.messageId}`);
          if (bm.note) lines.push(`> ${bm.note}`);
          if (bm.tags.length > 0) lines.push(`**Tags:** ${bm.tags.join(', ')}`);
          lines.push(`**Created:** ${bm.createdAt.toISOString()}`);
          lines.push(`**Session:** ${bm.sessionId ?? 'N/A'}`);
          lines.push('');
        }
        return lines.join('\n');
      }

      case 'csv': {
        const header = 'ID,Message ID,User ID,Session ID,Note,Tags,Created,Updated';
        const rows = bookmarks.map(bm =>
          [
            bm.id,
            bm.messageId,
            bm.userId,
            bm.sessionId ?? '',
            `"${(bm.note ?? '').replace(/"/g, '""')}"`,
            bm.tags.join(';'),
            bm.createdAt.toISOString(),
            bm.updatedAt.toISOString(),
          ].join(','),
        );
        return [header, ...rows].join('\n');
      }

      default:
        return JSON.stringify(bookmarks, null, 2);
    }
  }

  private findByMessageAndUser(messageId: string, userId: string): Bookmark | undefined {
    for (const bookmark of this.bookmarks.values()) {
      if (bookmark.messageId === messageId && bookmark.userId === userId) {
        return bookmark;
      }
    }
    return undefined;
  }

  private groupBySession(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
    const grouped = new Map<string, Bookmark[]>();
    for (const bm of bookmarks) {
      const key = bm.sessionId ?? 'unassigned';
      const group = grouped.get(key) ?? [];
      group.push(bm);
      grouped.set(key, group);
    }
    return grouped;
  }

  private renderBookmarkGroup(
    sessionId: string,
    bookmarks: Bookmark[],
    messages: Map<string, ChatMessage>,
    options?: BookmarkRenderOptions,
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'bookmark-group';

    const header = document.createElement('div');
    header.className = 'bookmark-group-header';
    header.style.cssText = 'padding:8px 16px;font-weight:600;font-size:13px;color:var(--chat-text);background:var(--chat-surface-hover);border-bottom:1px solid var(--chat-border);';
    header.textContent = sessionId === 'unassigned' ? 'Other' : `Session: ${sessionId}`;
    group.appendChild(header);

    for (const bookmark of bookmarks) {
      const msg = messages.get(bookmark.messageId);
      const item = this.renderBookmarkItem(bookmark, msg, options);
      group.appendChild(item);
    }

    return group;
  }

  private renderBookmarkItem(
    bookmark: Bookmark,
    message: ChatMessage | undefined,
    options?: BookmarkRenderOptions,
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.bookmarkId = bookmark.id;
    item.style.cssText = 'padding:10px 16px;border-bottom:1px solid var(--chat-border);cursor:pointer;transition:background 0.15s;display:flex;gap:10px;align-items:flex-start;';

    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--chat-surface-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });

    item.addEventListener('click', () => {
      this.callbacks.onJumpToMessage?.(bookmark.messageId);
    });

    const icon = document.createElement('div');
    icon.className = 'bookmark-item-icon';
    icon.textContent = '🔖';
    icon.style.cssText = 'font-size:16px;flex-shrink:0;margin-top:2px;';

    const content = document.createElement('div');
    content.className = 'bookmark-item-content';
    content.style.cssText = 'flex:1;min-width:0;';

    if (message) {
      const sender = document.createElement('div');
      sender.className = 'bookmark-item-sender';
      sender.textContent = message.senderId;
      sender.style.cssText = 'font-weight:600;font-size:13px;color:var(--chat-text);margin-bottom:2px;';
      content.appendChild(sender);

      const text = document.createElement('div');
      text.className = 'bookmark-item-text';
      text.textContent = this.truncate(message.content, options?.compact ? 80 : 150);
      text.style.cssText = 'font-size:13px;color:var(--chat-text-secondary, var(--chat-text-muted));line-height:1.4;';
      content.appendChild(text);
    }

    if (bookmark.note && options?.showNote !== false) {
      const note = document.createElement('div');
      note.className = 'bookmark-item-note';
      note.textContent = bookmark.note;
      note.style.cssText = 'font-size:12px;color:var(--chat-text-muted);font-style:italic;margin-top:4px;';
      content.appendChild(note);
    }

    if (bookmark.tags.length > 0 && options?.showTags !== false) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'bookmark-item-tags';
      tagsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';

      for (const tag of bookmark.tags) {
        const tagEl = document.createElement('span');
        tagEl.className = 'bookmark-tag';
        tagEl.textContent = tag;
        tagEl.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:4px;background:var(--chat-tag-bg, rgba(139,92,246,0.1));color:var(--chat-tag-color, #8b5cf6);';
        tagsContainer.appendChild(tagEl);
      }

      content.appendChild(tagsContainer);
    }

    if (options?.showTimestamp !== false) {
      const meta = document.createElement('div');
      meta.className = 'bookmark-item-meta';
      meta.style.cssText = 'font-size:11px;color:var(--chat-text-muted);margin-top:4px;';
      meta.textContent = this.formatTime(bookmark.createdAt);
      content.appendChild(meta);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bookmark-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:18px;color:var(--chat-text-muted);padding:0 4px;flex-shrink:0;transition:color 0.15s;';

    removeBtn.addEventListener('mouseenter', () => {
      removeBtn.style.color = 'var(--chat-danger, #ef4444)';
    });
    removeBtn.addEventListener('mouseleave', () => {
      removeBtn.style.color = 'var(--chat-text-muted)';
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onRemoveBookmark?.(bookmark.id);
    });

    item.appendChild(icon);
    item.appendChild(content);
    item.appendChild(removeBtn);

    return item;
  }

  private getTagButtonStyle(active: boolean): string {
    return `font-size:12px;padding:4px 10px;border-radius:12px;border:1px solid ${active ? 'var(--chat-primary)' : 'var(--chat-border)'};background:${active ? 'var(--chat-primary)' : 'none'};color:${active ? 'white' : 'var(--chat-text-muted)'};cursor:pointer;transition:all 0.15s;`;
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  private formatTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
