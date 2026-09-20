export enum MentionType {
  User = 'user',
  Agent = 'agent',
  Channel = 'channel',
  Here = 'here',
}

export interface Mention {
  type: MentionType;
  id: string;
  displayName: string;
  start: number;
  end: number;
  raw: string;
}

export interface MentionSuggestion {
  id: string;
  displayName: string;
  type: MentionType;
  avatar?: string;
  status?: 'online' | 'offline' | 'away';
  subtitle?: string;
}

export interface MentionNotification {
  mention: Mention;
  messageId: string;
  sessionId: string;
  timestamp: Date;
  read: boolean;
}

export class MentionSystem {
  private mentionPattern = /@(\w+|here|channel)/g;
  private activeMention: { start: number; query: string } | null = null;
  private suggestions: MentionSuggestion[] = [];
  private notifications: MentionNotification[] = [];
  private onMentionClick?: (mention: Mention) => void;
  private onMentionSelect?: (mention: MentionSuggestion) => void;

  constructor(callbacks?: {
    onMentionClick?: (mention: Mention) => void;
    onMentionSelect?: (mention: MentionSuggestion) => void;
  }) {
    this.onMentionClick = callbacks?.onMentionClick;
    this.onMentionSelect = callbacks?.onMentionSelect;
  }

  detectMentions(text: string): Mention[] {
    const mentions: Mention[] = [];
    this.mentionPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = this.mentionPattern.exec(text)) !== null) {
      const raw = match[0];
      const value = match[1];
      let type = MentionType.User;
      let id = value;
      let displayName = value;

      if (value === 'here') {
        type = MentionType.Here;
        id = 'here';
        displayName = 'here';
      } else if (value === 'channel') {
        type = MentionType.Channel;
        id = 'channel';
        displayName = 'channel';
      }

      mentions.push({
        type,
        id,
        displayName,
        start: match.index,
        end: match.index + raw.length,
        raw,
      });
    }

    return mentions;
  }

  renderMention(userId: string, displayName: string, type: MentionType = MentionType.User): string {
    const cssClass = `mention mention-${type}`;
    const dataAttrs = `data-mention-id="${this.escapeAttr(userId)}" data-mention-type="${type}"`;
    return `<span class="${cssClass}" ${dataAttrs} contenteditable="false">@${this.escapeHtml(displayName)}</span>`;
  }

  getMentionSuggestions(query: string, users: MentionSuggestion[]): MentionSuggestion[] {
    const lowerQuery = query.toLowerCase();
    return users
      .filter(u => u.displayName.toLowerCase().includes(lowerQuery) || u.id.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aStart = a.displayName.toLowerCase().startsWith(lowerQuery);
        const bStart = b.displayName.toLowerCase().startsWith(lowerQuery);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 8);
  }

  parseMentions(text: string): { text: string; mentions: Mention[] } {
    const mentions = this.detectMentions(text);
    let cleanedText = text;

    for (const mention of [...mentions].reverse()) {
      cleanedText =
        cleanedText.substring(0, mention.start) +
        `@${mention.id}` +
        cleanedText.substring(mention.end);
    }

    return { text: cleanedText, mentions };
  }

  notifyMentioned(messageId: string, sessionId: string, mentionedUsers: Mention[]): MentionNotification[] {
    const notifications: MentionNotification[] = [];

    for (const mention of mentionedUsers) {
      const notification: MentionNotification = {
        mention,
        messageId,
        sessionId,
        timestamp: new Date(),
        read: false,
      };
      this.notifications.push(notification);
      notifications.push(notification);
    }

    return notifications;
  }

  getUnreadNotifications(userId?: string): MentionNotification[] {
    return this.notifications.filter(n => !n.read);
  }

  markNotificationRead(messageId: string): void {
    for (const n of this.notifications) {
      if (n.messageId === messageId) {
        n.read = true;
      }
    }
  }

  renderSuggestionsDropdown(suggestions: MentionSuggestion[], position: { top: number; left: number }): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'mention-suggestions-dropdown';
    dropdown.style.cssText = `position:absolute;top:${position.top}px;left:${position.left}px;z-index:1000;background:var(--chat-surface);border:1px solid var(--chat-border);border-radius:8px;box-shadow:var(--chat-shadow);max-height:240px;overflow-y:auto;min-width:200px;`;

    if (suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mention-suggestion-empty';
      empty.textContent = 'No results found';
      empty.style.cssText = 'padding:12px 16px;color:var(--chat-text-muted);text-align:center;font-size:13px;';
      dropdown.appendChild(empty);
      return dropdown;
    }

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'mention-suggestion-item';
      item.dataset.mentionId = suggestion.id;
      item.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;transition:background 0.15s;${index === 0 ? 'background:var(--chat-surface-hover);' : ''}`;

      const avatar = document.createElement('div');
      avatar.className = 'mention-suggestion-avatar';
      avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:var(--chat-primary);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:600;flex-shrink:0;';
      if (suggestion.avatar) {
        avatar.innerHTML = `<img src="${this.escapeAttr(suggestion.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        avatar.textContent = suggestion.displayName.substring(0, 2).toUpperCase();
      }

      const info = document.createElement('div');
      info.className = 'mention-suggestion-info';
      info.style.cssText = 'flex:1;min-width:0;';

      const name = document.createElement('div');
      name.className = 'mention-suggestion-name';
      name.textContent = suggestion.displayName;
      name.style.cssText = 'font-size:14px;font-weight:500;color:var(--chat-text);';

      const subtitle = document.createElement('div');
      subtitle.className = 'mention-suggestion-subtitle';
      subtitle.style.cssText = 'font-size:12px;color:var(--chat-text-muted);';

      if (suggestion.status) {
        const statusDot = document.createElement('span');
        statusDot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;background:${suggestion.status === 'online' ? '#22c55e' : suggestion.status === 'away' ? '#f59e0b' : '#94a3b8'};`;
        subtitle.appendChild(statusDot);
      }

      if (suggestion.subtitle) {
        subtitle.appendChild(document.createTextNode(suggestion.subtitle));
      }

      info.appendChild(name);
      info.appendChild(subtitle);

      const typeBadge = document.createElement('span');
      typeBadge.className = 'mention-suggestion-type';
      typeBadge.textContent = suggestion.type;
      typeBadge.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:4px;background:var(--chat-surface-hover);color:var(--chat-text-muted);text-transform:capitalize;';

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(typeBadge);

      item.addEventListener('mouseenter', () => {
        dropdown.querySelectorAll('.mention-suggestion-item').forEach(el => {
          (el as HTMLElement).style.background = '';
        });
        item.style.background = 'var(--chat-surface-hover)';
      });

      item.addEventListener('click', () => {
        this.onMentionSelect?.(suggestion);
        dropdown.remove();
      });

      dropdown.appendChild(item);
    });

    return dropdown;
  }

  highlightMentionsInElement(element: HTMLElement): void {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? '';
      if (!text.includes('@')) continue;

      const mentions = this.detectMentions(text);
      if (mentions.length === 0) continue;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      for (const mention of mentions) {
        if (mention.start > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, mention.start)));
        }

        const span = document.createElement('span');
        span.className = `mention mention-${mention.type}`;
        span.dataset.mentionId = mention.id;
        span.dataset.mentionType = mention.type;
        span.contentEditable = 'false';
        span.textContent = mention.raw;
        span.style.cssText = 'background:var(--chat-mention-bg, rgba(59,130,246,0.15));color:var(--chat-mention-color, #3b82f6);padding:1px 4px;border-radius:4px;cursor:pointer;font-weight:500;';

        span.addEventListener('click', () => {
          this.onMentionClick?.(mention);
        });

        fragment.appendChild(span);
        lastIndex = mention.end;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }

  handleInputEvent(inputEl: HTMLInputElement | HTMLTextAreaElement, users: MentionSuggestion[]): void {
    const cursorPos = inputEl.selectionStart ?? 0;
    const text = inputEl.value.substring(0, cursorPos);
    const atIndex = text.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || text[atIndex - 1] === ' ' || text[atIndex - 1] === '\n')) {
      const query = text.substring(atIndex + 1);
      if (query.length <= 20 && !/\s/.test(query)) {
        this.activeMention = { start: atIndex, query };
        this.suggestions = this.getMentionSuggestions(query, users);
        return;
      }
    }

    this.activeMention = null;
    this.suggestions = [];
  }

  completeMention(inputEl: HTMLInputElement | HTMLTextAreaElement, suggestion: MentionSuggestion): void {
    if (!this.activeMention) return;

    const before = inputEl.value.substring(0, this.activeMention.start);
    const cursorPos = inputEl.selectionStart ?? inputEl.value.length;
    const after = inputEl.value.substring(cursorPos);
    const mentionText = `@${suggestion.displayName} `;

    inputEl.value = before + mentionText + after;
    const newCursorPos = before.length + mentionText.length;
    inputEl.setSelectionRange(newCursorPos, newCursorPos);
    inputEl.focus();

    this.activeMention = null;
    this.suggestions = [];
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeAttr(input: string): string {
    return input.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
