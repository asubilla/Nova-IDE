import type { ChatSession, ChatPresence } from '../chat-types.js';
import { ChatSessionStatus } from '../chat-types.js';

export interface ChatSidebarConfig {
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
  onSearch?: (query: string) => void;
}

export class ChatSidebar {
  private container: HTMLElement | null = null;
  private config: ChatSidebarConfig;
  private activeSessionId: string | null = null;
  private presenceMap = new Map<string, ChatPresence>();

  constructor(config: ChatSidebarConfig = {}) {
    this.config = config;
  }

  render(sessions: ChatSession[]): HTMLElement {
    const el = document.createElement('div');
    el.className = 'chat-sidebar';
    el.innerHTML = `
      <div class="chat-sidebar-header">
        <div class="chat-sidebar-title">
          <span>Messages</span>
          <button class="chat-sidebar-toggle" title="Toggle sidebar">☰</button>
        </div>
        <div class="chat-search">
          <span class="chat-search-icon">🔍</span>
          <input type="text" class="chat-search-input" placeholder="Search conversations..." />
        </div>
        <button class="chat-new-chat-btn">+ New Chat</button>
      </div>
      <div class="chat-session-list"></div>
    `;

    const searchInput = el.querySelector('.chat-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.config.onSearch?.(searchInput.value);
    });

    const newChatBtn = el.querySelector('.chat-new-chat-btn') as HTMLButtonElement;
    newChatBtn?.addEventListener('click', () => {
      this.config.onNewChat?.();
    });

    const sessionList = el.querySelector('.chat-session-list') as HTMLElement;
    this.renderSessionList(sessionList, sessions);

    this.container = el;
    return el;
  }

  addSession(session: ChatSession): void {
    const list = this.container?.querySelector('.chat-session-list');
    if (!list) return;
    const item = this.createSessionItem(session);
    list.prepend(item);
  }

  removeSession(sessionId: string): void {
    const item = this.container?.querySelector(`[data-session-id="${sessionId}"]`);
    item?.remove();
  }

  updateSession(session: ChatSession): void {
    const item = this.container?.querySelector(`[data-session-id="${session.id}"]`) as HTMLElement;
    if (!item) return;
    const preview = item.querySelector('.chat-session-preview');
    if (preview && session.title) {
      preview.textContent = session.title;
    }
    const time = item.querySelector('.chat-session-time');
    if (time) {
      time.textContent = this.formatTime(session.updatedAt);
    }
  }

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId;
    const items = this.container?.querySelectorAll('.chat-session-item');
    items?.forEach((item) => {
      const el = item as HTMLElement;
      if (el.dataset.sessionId === sessionId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  renderSearchBar(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'chat-search';
    el.innerHTML = `
      <span class="chat-search-icon">🔍</span>
      <input type="text" class="chat-search-input" placeholder="Search conversations..." />
    `;
    const input = el.querySelector('input') as HTMLInputElement;
    input.addEventListener('input', () => {
      this.config.onSearch?.(input.value);
    });
    return el;
  }

  renderNewChatButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'chat-new-chat-btn';
    btn.textContent = '+ New Chat';
    btn.addEventListener('click', () => {
      this.config.onNewChat?.();
    });
    return btn;
  }

  renderUserPresence(userId: string, status: 'online' | 'offline' | 'away'): void {
    this.presenceMap.set(userId, { userId, status, lastSeen: new Date() });
    const dot = this.container?.querySelector(
      `[data-user-presence="${userId}"]`
    ) as HTMLElement;
    if (dot) {
      dot.className = `user-presence ${status}`;
    }
  }

  updateUnreadCount(sessionId: string, count: number): void {
    const item = this.container?.querySelector(`[data-session-id="${sessionId}"]`);
    if (!item) return;
    const existing = item.querySelector('.chat-session-unread') as HTMLElement;
    if (count > 0) {
      if (existing) {
        existing.textContent = String(count);
      } else {
        const badge = document.createElement('span');
        badge.className = 'chat-session-unread';
        badge.textContent = String(count);
        const meta = item.querySelector('.chat-session-meta');
        meta?.appendChild(badge);
      }
    } else {
      existing?.remove();
    }
  }

  private renderSessionList(container: HTMLElement, sessions: ChatSession[]): void {
    container.innerHTML = '';
    const sorted = [...sessions]
      .filter((s) => s.status === ChatSessionStatus.Active)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    for (const session of sorted) {
      container.appendChild(this.createSessionItem(session));
    }
  }

  private createSessionItem(session: ChatSession): HTMLElement {
    const el = document.createElement('div');
    el.className = 'chat-session-item';
    el.dataset.sessionId = session.id;
    if (session.id === this.activeSessionId) {
      el.classList.add('active');
    }

    const initials = this.getInitials(session.title || session.id);
    const presence = this.presenceMap.get(session.participants[0]);
    const statusClass = presence?.status || 'offline';

    el.innerHTML = `
      <div class="chat-session-avatar">
        ${initials}
        <span class="user-presence ${statusClass}" data-user-presence="${session.participants[0] || ''}"></span>
      </div>
      <div class="chat-session-info">
        <div class="chat-session-name">${this.escapeHtml(session.title || 'New Chat')}</div>
        <div class="chat-session-preview">${this.escapeHtml(session.title || '')}</div>
      </div>
      <div class="chat-session-meta">
        <span class="chat-session-time">${this.formatTime(session.updatedAt)}</span>
      </div>
    `;

    el.addEventListener('click', () => {
      this.config.onSessionSelect?.(session.id);
    });

    return el;
  }

  private getInitials(text: string): string {
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  }

  private formatTime(date: Date): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  destroy(): void {
    this.container = null;
  }
}
