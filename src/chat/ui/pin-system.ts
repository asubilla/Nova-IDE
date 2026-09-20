import type { ChatMessage } from '../chat-types.js';

export interface PinnedMessage {
  messageId: string;
  sessionId: string;
  pinnedBy: string;
  pinnedAt: Date;
  note?: string;
}

export interface PinSystemConfig {
  maxPinsPerSession?: number;
  onJumpToMessage?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
}

export interface PinRenderOptions {
  showNote?: boolean;
  showPinnedBy?: boolean;
  showPinnedAt?: boolean;
  compact?: boolean;
}

const DEFAULT_CONFIG: PinSystemConfig = {
  maxPinsPerSession: 10,
};

export class PinSystem {
  private config: PinSystemConfig;
  private pins = new Map<string, PinnedMessage[]>();
  private callbacks: {
    onJumpToMessage?: (messageId: string) => void;
    onUnpin?: (messageId: string) => void;
  };

  constructor(config?: PinSystemConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = {
      onJumpToMessage: config?.onJumpToMessage,
      onUnpin: config?.onUnpin,
    };
  }

  pinMessage(messageId: string, sessionId: string, userId: string, note?: string): { success: boolean; error?: string } {
    const sessionPins = this.pins.get(sessionId) ?? [];

    if (sessionPins.length >= (this.config.maxPinsPerSession ?? 10)) {
      return { success: false, error: `Maximum of ${this.config.maxPinsPerSession} pins per session reached` };
    }

    const existing = sessionPins.find(p => p.messageId === messageId);
    if (existing) {
      return { success: false, error: 'Message is already pinned' };
    }

    const pin: PinnedMessage = {
      messageId,
      sessionId,
      pinnedBy: userId,
      pinnedAt: new Date(),
      note,
    };

    sessionPins.push(pin);
    this.pins.set(sessionId, sessionPins);

    return { success: true };
  }

  unpinMessage(messageId: string, sessionId: string): { success: boolean; error?: string } {
    const sessionPins = this.pins.get(sessionId) ?? [];
    const idx = sessionPins.findIndex(p => p.messageId === messageId);

    if (idx === -1) {
      return { success: false, error: 'Message is not pinned' };
    }

    sessionPins.splice(idx, 1);
    this.pins.set(sessionId, sessionPins);

    return { success: true };
  }

  getPinnedMessages(sessionId: string): PinnedMessage[] {
    return this.pins.get(sessionId) ?? [];
  }

  isMessagePinned(messageId: string, sessionId: string): boolean {
    const sessionPins = this.pins.get(sessionId) ?? [];
    return sessionPins.some(p => p.messageId === messageId);
  }

  getPinCount(sessionId: string): number {
    return (this.pins.get(sessionId) ?? []).length;
  }

  renderPinnedMessages(
    pins: PinnedMessage[],
    messages: Map<string, ChatMessage>,
    options?: PinRenderOptions,
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pinned-messages-section';
    container.style.cssText = 'background:var(--chat-surface);border-bottom:1px solid var(--chat-border);';

    if (pins.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pinned-messages-empty';
      empty.style.cssText = 'padding:12px 16px;font-size:13px;color:var(--chat-text-muted);text-align:center;';
      empty.textContent = 'No pinned messages';
      container.appendChild(empty);
      return container;
    }

    const header = document.createElement('div');
    header.className = 'pinned-messages-header';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--chat-border);';

    const title = document.createElement('span');
    title.className = 'pinned-messages-title';
    title.textContent = `Pinned Messages (${pins.length})`;
    title.style.cssText = 'font-weight:600;font-size:13px;color:var(--chat-text);';

    header.appendChild(title);
    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'pinned-messages-list';
    list.style.cssText = 'max-height:300px;overflow-y:auto;';

    for (const pin of pins) {
      const msg = messages.get(pin.messageId);
      const pinEl = this.renderPinItem(pin, msg, options);
      list.appendChild(pinEl);
    }

    container.appendChild(list);

    return container;
  }

  renderPinBadge(): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'pin-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:4px;background:var(--chat-pin-bg, rgba(245,158,11,0.15));color:var(--chat-pin-color, #f59e0b);font-weight:500;';
    badge.innerHTML = `<span style="font-size:12px;">📌</span> Pinned`;
    return badge;
  }

  renderUnpinButton(messageId: string, sessionId: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'unpin-btn';
    btn.textContent = 'Unpin';
    btn.style.cssText = 'font-size:12px;padding:4px 8px;border:1px solid var(--chat-border);border-radius:4px;background:none;color:var(--chat-text-muted);cursor:pointer;transition:all 0.15s;';

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--chat-danger, #ef4444)';
      btn.style.color = 'white';
      btn.style.borderColor = 'var(--chat-danger, #ef4444)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'none';
      btn.style.color = 'var(--chat-text-muted)';
      btn.style.borderColor = 'var(--chat-border)';
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onUnpin?.(messageId);
    });

    return btn;
  }

  renderPinButton(messageId: string, isPinned: boolean): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'pin-btn';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;font-size:16px;color:var(--chat-text-muted);transition:color 0.15s;';

    btn.textContent = isPinned ? '📌' : '📍';
    btn.title = isPinned ? 'Unpin message' : 'Pin message';

    btn.addEventListener('mouseenter', () => {
      btn.style.color = 'var(--chat-text)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'var(--chat-text-muted)';
    });

    return btn;
  }

  private renderPinItem(
    pin: PinnedMessage,
    message: ChatMessage | undefined,
    options?: PinRenderOptions,
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = 'pinned-message-item';
    item.dataset.messageId = pin.messageId;
    item.style.cssText = 'padding:10px 16px;border-bottom:1px solid var(--chat-border);cursor:pointer;transition:background 0.15s;display:flex;gap:10px;align-items:flex-start;';

    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--chat-surface-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });

    item.addEventListener('click', () => {
      this.callbacks.onJumpToMessage?.(pin.messageId);
    });

    const icon = document.createElement('div');
    icon.className = 'pinned-message-icon';
    icon.textContent = '📌';
    icon.style.cssText = 'font-size:16px;flex-shrink:0;margin-top:2px;';

    const content = document.createElement('div');
    content.className = 'pinned-message-content';
    content.style.cssText = 'flex:1;min-width:0;';

    if (message) {
      const sender = document.createElement('div');
      sender.className = 'pinned-message-sender';
      sender.textContent = message.senderId;
      sender.style.cssText = 'font-weight:600;font-size:13px;color:var(--chat-text);margin-bottom:2px;';
      content.appendChild(sender);

      const text = document.createElement('div');
      text.className = 'pinned-message-text';
      text.textContent = this.truncate(message.content, options?.compact ? 80 : 150);
      text.style.cssText = 'font-size:13px;color:var(--chat-text-secondary, var(--chat-text-muted));line-height:1.4;';
      content.appendChild(text);
    }

    if (pin.note && options?.showNote !== false) {
      const note = document.createElement('div');
      note.className = 'pinned-message-note';
      note.textContent = pin.note;
      note.style.cssText = 'font-size:12px;color:var(--chat-text-muted);font-style:italic;margin-top:4px;';
      content.appendChild(note);
    }

    if (options?.showPinnedAt !== false) {
      const meta = document.createElement('div');
      meta.className = 'pinned-message-meta';
      meta.style.cssText = 'font-size:11px;color:var(--chat-text-muted);margin-top:4px;display:flex;gap:8px;';

      const pinnedAt = document.createElement('span');
      pinnedAt.textContent = this.formatTime(pin.pinnedAt);
      meta.appendChild(pinnedAt);

      if (options?.showPinnedBy !== false) {
        const pinnedBy = document.createElement('span');
        pinnedBy.textContent = `by ${pin.pinnedBy}`;
        meta.appendChild(pinnedBy);
      }

      content.appendChild(meta);
    }

    item.appendChild(icon);
    item.appendChild(content);

    return item;
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
