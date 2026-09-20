import type {
  ChatMessage,
  ChatSession,
  ChatPresence,
  ChatTypingIndicator,
  MessageSearchResult,
  ChatAttachment,
} from '../chat-types.js';
import { ChatMessageType, ChatSessionType } from '../chat-types.js';
import { MessageRenderer } from './message-renderer.js';
import { ChatSidebar } from './chat-sidebar.js';

export interface ChatWindowConfig {
  currentUserId: string;
  baseUrl?: string;
  onSend?: (content: string, replyTo?: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onTyping?: (isTyping: boolean) => void;
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
}

export class ChatWindow {
  private container: HTMLElement;
  private config: ChatWindowConfig;
  private renderer: MessageRenderer;
  private sidebar: ChatSidebar;
  private currentSession: ChatSession | null = null;
  private messages: ChatMessage[] = [];
  private replyToId: string | null = null;
  private isTyping = false;
  private typingUsers = new Map<string, boolean>();
  protected rootEl: HTMLElement | null = null;
  protected messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private replyPreviewEl: HTMLElement | null = null;
  private typingEl: HTMLElement | null = null;
  private searchResultsEl: HTMLElement | null = null;

  constructor(container: HTMLElement, config: ChatWindowConfig) {
    this.container = container;
    this.config = config;
    this.renderer = new MessageRenderer({
      currentUserId: config.currentUserId,
      baseUrl: config.baseUrl,
    });
    this.sidebar = new ChatSidebar({
      onSessionSelect: (id) => this.config.onSessionSelect?.(id),
      onNewChat: () => this.config.onNewChat?.(),
    });
  }

  render(sessions: ChatSession[] = []): void {
    this.container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'chat-container';
    root.innerHTML = `
      <div class="chat-sidebar-container"></div>
      <div class="chat-main">
        <div class="chat-main-header">
          <button class="chat-menu-btn" title="Toggle sidebar">☰</button>
          <div class="chat-main-header-avatar" id="chat-header-avatar"></div>
          <div class="chat-main-header-info">
            <div class="chat-main-header-name" id="chat-header-name">Select a conversation</div>
            <div class="chat-main-header-status" id="chat-header-status"></div>
          </div>
          <div class="chat-main-header-actions">
            <button id="chat-search-btn" title="Search">🔍</button>
          </div>
        </div>
        <div class="chat-search-results" id="chat-search-results" style="display:none"></div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty-state">
            <div class="chat-empty-state-icon">💬</div>
            <div class="chat-empty-state-text">Select a conversation to start messaging</div>
          </div>
        </div>
        <div class="typing-indicator" id="chat-typing" style="display:none">
          <div class="typing-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
          <span class="typing-text"></span>
        </div>
        <div class="chat-input-area" id="chat-input-area" style="display:none">
          <div class="chat-reply-preview" id="chat-reply-preview" style="display:none">
            <div class="chat-reply-preview-text">
              <span class="chat-reply-preview-sender"></span>
              <span class="chat-reply-preview-content"></span>
            </div>
            <button class="chat-reply-preview-close" id="chat-reply-close">×</button>
          </div>
          <div class="chat-input-wrapper">
            <div class="chat-input-actions">
              <button id="chat-attach-btn" title="Attach file">📎</button>
            </div>
            <textarea class="chat-input" id="chat-input" placeholder="Type a message..." rows="1"></textarea>
            <button class="chat-send-btn" id="chat-send-btn">Send</button>
          </div>
        </div>
      </div>
    `;

    const sidebarContainer = root.querySelector('.chat-sidebar-container') as HTMLElement;
    sidebarContainer.appendChild(this.sidebar.render(sessions));

    this.rootEl = root;
    this.messagesEl = root.querySelector('#chat-messages') as HTMLElement;
    this.inputEl = root.querySelector('#chat-input') as HTMLTextAreaElement;
    this.replyPreviewEl = root.querySelector('#chat-reply-preview') as HTMLElement;
    this.typingEl = root.querySelector('#chat-typing') as HTMLElement;
    this.searchResultsEl = root.querySelector('#chat-search-results') as HTMLElement;

    this.bindEvents(root);
    this.container.appendChild(root);
  }

  setSession(session: ChatSession): void {
    this.currentSession = session;
    this.messages = [];
    this.replyToId = null;
    this.hideReplyPreview();
    this.clearTyping();

    const headerName = this.rootEl?.querySelector('#chat-header-name') as HTMLElement;
    const headerStatus = this.rootEl?.querySelector('#chat-header-status') as HTMLElement;
    const headerAvatar = this.rootEl?.querySelector('#chat-header-avatar') as HTMLElement;
    const inputArea = this.rootEl?.querySelector('#chat-input-area') as HTMLElement;

    if (headerName) headerName.textContent = session.title || 'New Chat';
    if (headerStatus) headerStatus.textContent = this.getSessionTypeLabel(session.type);
    if (headerAvatar) {
      headerAvatar.textContent = this.getInitials(session.title || 'N');
    }
    if (inputArea) inputArea.style.display = '';

    this.clearMessages();
    this.sidebar.setActiveSession(session.id);
  }

  addMessage(message: ChatMessage): void {
    if (message.deletedAt) return;
    this.messages.push(message);
    const el = this.createMessageElement(message);
    if (this.messagesEl) {
      this.messagesEl.appendChild(el);
      this.scrollToBottom();
    }
  }

  updateMessage(message: ChatMessage): void {
    const idx = this.messages.findIndex((m) => m.id === message.id);
    if (idx !== -1) this.messages[idx] = message;
    const el = this.messagesEl?.querySelector(`[data-message-id="${message.id}"]`);
    if (el) {
      const newEl = this.createMessageElement(message);
      el.replaceWith(newEl);
    }
  }

  removeMessage(messageId: string): void {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    const el = this.messagesEl?.querySelector(`[data-message-id="${messageId}"]`);
    el?.remove();
  }

  showTyping(userId: string, isTyping: boolean): void {
    if (isTyping) {
      this.typingUsers.set(userId, true);
    } else {
      this.typingUsers.delete(userId);
    }
    this.updateTypingIndicator();
  }

  updatePresence(userId: string, status: 'online' | 'offline' | 'away'): void {
    this.sidebar.renderUserPresence(userId, status);
    const headerStatus = this.rootEl?.querySelector('#chat-header-status') as HTMLElement;
    if (headerStatus && this.currentSession?.participants.includes(userId)) {
      headerStatus.textContent = status === 'online' ? 'Online' : status === 'away' ? 'Away' : 'Offline';
    }
  }

  addReaction(messageId: string, emoji: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return;
    const existing = msg.reactions.find(
      (r) => r.emoji === emoji && r.userId === this.config.currentUserId
    );
    if (!existing) {
      msg.reactions.push({
        emoji,
        userId: this.config.currentUserId,
        createdAt: new Date(),
      });
    }
    this.refreshMessageReactions(messageId);
  }

  removeReaction(messageId: string, emoji: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.reactions = msg.reactions.filter(
      (r) => !(r.emoji === emoji && r.userId === this.config.currentUserId)
    );
    this.refreshMessageReactions(messageId);
  }

  scrollToBottom(): void {
    if (this.messagesEl) {
      requestAnimationFrame(() => {
        this.messagesEl!.scrollTop = this.messagesEl!.scrollHeight;
      });
    }
  }

  showSearch(query: string, results: MessageSearchResult[]): void {
    if (!this.searchResultsEl) return;
    if (!query.trim() || results.length === 0) {
      this.searchResultsEl.style.display = 'none';
      return;
    }
    this.searchResultsEl.style.display = '';
    this.searchResultsEl.innerHTML = `
      <div class="chat-search-results-header">
        <span class="chat-search-results-title">${results.length} result${results.length !== 1 ? 's' : ''}</span>
        <button class="chat-search-results-close" id="chat-search-close">×</button>
      </div>
      ${results
        .map(
          (r) => `
        <div class="chat-search-result-item" data-message-id="${r.message.id}">
          <div class="chat-search-result-snippet">${r.snippet}</div>
          ${r.sessionTitle ? `<div class="chat-search-result-session">${this.escapeHtml(r.sessionTitle)}</div>` : ''}
        </div>
      `
        )
        .join('')}
    `;
    const closeBtn = this.searchResultsEl.querySelector('#chat-search-close');
    closeBtn?.addEventListener('click', () => {
      this.searchResultsEl!.style.display = 'none';
    });
  }

  setSessions(sessions: ChatSession[]): void {
    const sidebarContainer = this.rootEl?.querySelector('.chat-sidebar-container');
    if (sidebarContainer) {
      sidebarContainer.innerHTML = '';
      sidebarContainer.appendChild(this.sidebar.render(sessions));
    }
  }

  addSession(session: ChatSession): void {
    this.sidebar.addSession(session);
  }

  removeSession(sessionId: string): void {
    this.sidebar.removeSession(sessionId);
  }

  updateSession(session: ChatSession): void {
    this.sidebar.updateSession(session);
  }

  updateSessionUnread(sessionId: string, count: number): void {
    this.sidebar.updateUnreadCount(sessionId, count);
  }

  destroy(): void {
    this.sidebar.destroy();
    this.container.innerHTML = '';
    this.rootEl = null;
  }

  private bindEvents(root: HTMLElement): void {
    const menuBtn = root.querySelector('.chat-menu-btn') as HTMLButtonElement;
    const sidebar = root.querySelector('.chat-sidebar') as HTMLElement;
    menuBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
    });

    const sendBtn = root.querySelector('#chat-send-btn') as HTMLButtonElement;
    const input = root.querySelector('#chat-input') as HTMLTextAreaElement;
    const replyClose = root.querySelector('#chat-reply-close') as HTMLButtonElement;
    const searchBtn = root.querySelector('#chat-search-btn') as HTMLButtonElement;

    sendBtn?.addEventListener('click', () => this.handleSend());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    input?.addEventListener('input', () => {
      this.autoResize(input);
      const hasText = input.value.trim().length > 0;
      if (hasText !== this.isTyping) {
        this.isTyping = hasText;
        this.config.onTyping?.(hasText);
      }
    });

    replyClose?.addEventListener('click', () => this.hideReplyPreview());

    searchBtn?.addEventListener('click', () => {
      const query = prompt('Search messages:');
      if (query) {
        this.config.onSessionSelect?.(this.currentSession?.id || '');
      }
    });

    this.messagesEl?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('chat-code-copy')) {
        const code = target.getAttribute('data-code') || '';
        navigator.clipboard?.writeText(code);
        target.textContent = 'Copied!';
        setTimeout(() => (target.textContent = 'Copy'), 1500);
      }
      const reactionEl = target.closest('.chat-reaction') as HTMLElement;
      if (reactionEl) {
        const emoji = reactionEl.dataset.emoji;
        const msgEl = reactionEl.closest('[data-message-id]') as HTMLElement;
        if (emoji && msgEl) {
          this.config.onReact?.(msgEl.dataset.messageId!, emoji);
        }
      }
      const replyEl = target.closest('.chat-message-reply') as HTMLElement;
      if (replyEl) {
        const replyTo = replyEl.dataset.replyTo;
        if (replyTo) {
          const original = this.messages.find((m) => m.id === replyTo);
          if (original) this.showReplyPreview(original);
        }
      }
    });

    this.messagesEl?.addEventListener('contextmenu', (e) => {
      const msgEl = (e.target as HTMLElement).closest('[data-message-id]') as HTMLElement;
      if (!msgEl) return;
      e.preventDefault();
      const messageId = msgEl.dataset.messageId!;
      const msg = this.messages.find((m) => m.id === messageId);
      if (!msg) return;

      const menu = document.createElement('div');
      menu.style.cssText = 'position:fixed;background:var(--chat-surface);border:1px solid var(--chat-border);border-radius:8px;padding:4px;z-index:1000;box-shadow:var(--chat-shadow);';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const items = [
        { label: 'Reply', action: () => this.showReplyPreview(msg) },
        ...(msg.senderId === this.config.currentUserId
          ? [{ label: 'Edit', action: () => this.config.onEdit?.(messageId, msg.content) }]
          : []),
        ...(msg.senderId === this.config.currentUserId
          ? [{ label: 'Delete', action: () => this.config.onDelete?.(messageId) }]
          : []),
      ];

      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = 'display:block;width:100%;padding:8px 16px;border:none;background:none;color:var(--chat-text);cursor:pointer;text-align:left;font-size:13px;border-radius:4px;';
        btn.addEventListener('mouseenter', () => (btn.style.background = 'var(--chat-surface-hover)'));
        btn.addEventListener('mouseleave', () => (btn.style.background = 'none'));
        btn.addEventListener('click', () => {
          item.action();
          menu.remove();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      const closeMenu = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    });

    this.messagesEl?.addEventListener('dblclick', (e) => {
      const msgEl = (e.target as HTMLElement).closest('[data-message-id]') as HTMLElement;
      if (!msgEl) return;
      const messageId = msgEl.dataset.messageId!;
      const msg = this.messages.find((m) => m.id === messageId);
      if (msg?.senderId === this.config.currentUserId) {
        this.config.onEdit?.(messageId, msg.content);
      }
    });
  }

  private handleSend(): void {
    const input = this.inputEl;
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    this.config.onSend?.(content, this.replyToId || undefined);
    input.value = '';
    this.autoResize(input);
    this.hideReplyPreview();
    this.isTyping = false;
    this.config.onTyping?.(false);
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const el = document.createElement('div');
    const isSent = message.senderId === this.config.currentUserId;
    const isSystem = message.senderType === 'system';
    const isAgent = message.senderType === 'agent';

    el.className = `chat-message ${isSent ? 'sent' : 'received'}${isSystem ? ' system' : ''}${isAgent ? ' agent' : ''}`;
    el.dataset.messageId = message.id;

    if (isSystem) {
      el.innerHTML = `<div class="chat-message-bubble">${this.renderer.renderSystemMessage(message.content)}</div>`;
      return el;
    }

    const initials = this.getInitials(message.senderId);
    let contentHtml = '';

    if (message.replyTo) {
      const original = this.messages.find((m) => m.id === message.replyTo);
      contentHtml += this.renderer.renderReplyMessage(message, original);
    }

    switch (message.type) {
      case ChatMessageType.Code: {
        const meta = (message as any).metadata as { language?: string } | undefined;
        contentHtml += `<div class="chat-message-bubble">${this.renderer.renderCodeMessage(message.content, meta?.language)}</div>`;
        break;
      }
      case ChatMessageType.Image: {
        const attachment = ((message as any).metadata as { attachment?: ChatAttachment })?.attachment;
        if (attachment) {
          contentHtml += `<div class="chat-message-bubble">${this.renderer.renderImageMessage(attachment)}</div>`;
        } else {
          contentHtml += `<div class="chat-message-bubble">${this.renderer.renderTextMessage(message.content)}</div>`;
        }
        break;
      }
      case ChatMessageType.File: {
        const attachment = ((message as any).metadata as { attachment?: ChatAttachment })?.attachment;
        if (attachment) {
          contentHtml += `<div class="chat-message-bubble">${this.renderer.renderFileMessage(attachment)}</div>`;
        } else {
          contentHtml += `<div class="chat-message-bubble">${this.renderer.renderTextMessage(message.content)}</div>`;
        }
        break;
      }
      case ChatMessageType.AgentResponse:
        contentHtml += `<div class="chat-message-bubble">${this.renderer.renderAgentResponse(message.content)}</div>`;
        break;
      default:
        contentHtml += `<div class="chat-message-bubble${message.editedAt ? ' edited' : ''}">${this.renderer.renderTextMessage(message.content)}</div>`;
    }

    if (message.reactions?.length) {
      contentHtml += this.renderer.renderReactions(message.reactions);
    }

    const timestamp = this.renderer.renderTimestamp(message.createdAt);
    const readReceipt = isSent ? this.renderer.renderReadReceipt(message.readBy) : '';

    el.innerHTML = `
      ${!isSent ? `<div class="chat-message-avatar">${initials}</div>` : ''}
      <div class="chat-message-content">
        ${contentHtml}
        <div class="chat-message-footer">
          <span class="chat-message-timestamp">${timestamp}</span>
          ${readReceipt}
        </div>
      </div>
    `;

    return el;
  }

  private refreshMessageReactions(messageId: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return;
    const el = this.messagesEl?.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;
    const reactionsContainer = el.querySelector('.chat-message-reactions');
    const html = this.renderer.renderReactions(msg.reactions);
    if (reactionsContainer) {
      reactionsContainer.outerHTML = html;
    } else {
      const content = el.querySelector('.chat-message-content');
      content?.insertAdjacentHTML('beforeend', html);
    }
  }

  private showReplyPreview(message: ChatMessage): void {
    if (!this.replyPreviewEl) return;
    this.replyToId = message.id;
    const sender = this.replyPreviewEl.querySelector('.chat-reply-preview-sender') as HTMLElement;
    const content = this.replyPreviewEl.querySelector('.chat-reply-preview-content') as HTMLElement;
    if (sender) sender.textContent = message.senderId;
    if (content) content.textContent = this.truncate(message.content, 60);
    this.replyPreviewEl.style.display = '';
    this.inputEl?.focus();
  }

  private hideReplyPreview(): void {
    this.replyToId = null;
    if (this.replyPreviewEl) this.replyPreviewEl.style.display = 'none';
  }

  private updateTypingIndicator(): void {
    if (!this.typingEl) return;
    if (this.typingUsers.size === 0) {
      this.typingEl.style.display = 'none';
      return;
    }
    this.typingEl.style.display = '';
    const names = Array.from(this.typingUsers.keys());
    const text = names.length === 1 ? `${names[0]} is typing...` : `${names.length} people typing...`;
    const textEl = this.typingEl.querySelector('.typing-text');
    if (textEl) textEl.textContent = text;
  }

  private clearTyping(): void {
    this.typingUsers.clear();
    this.updateTypingIndicator();
  }

  private clearMessages(): void {
    if (this.messagesEl) {
      this.messagesEl.innerHTML = '';
    }
  }

  private autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '…' : text;
  }

  private getInitials(text: string): string {
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  }

  private getSessionTypeLabel(type: ChatSessionType): string {
    switch (type) {
      case ChatSessionType.UserAgent:
        return 'Agent';
      case ChatSessionType.AgentAgent:
        return 'Agent to Agent';
      case ChatSessionType.Group:
        return 'Group';
      default:
        return '';
    }
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
