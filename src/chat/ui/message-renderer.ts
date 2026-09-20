import type {
  ChatMessage,
  ChatAttachment,
  ChatReaction,
  ChatReadReceipt,
} from '../chat-types.js';
import { ChatMessageType } from '../chat-types.js';

export interface MessageRendererConfig {
  currentUserId: string;
  baseUrl?: string;
}

export class MessageRenderer {
  private config: MessageRendererConfig;

  constructor(config: MessageRendererConfig) {
    this.config = config;
  }

  renderTextMessage(content: string): string {
    const sanitized = this.sanitizeHtml(content);
    const withLinks = this.detectLinks(sanitized);
    return `<div class="chat-markdown">${withLinks}</div>`;
  }

  renderCodeMessage(content: string, language?: string): string {
    const langLabel = language || 'code';
    const escaped = this.escapeHtml(content);
    return `
      <div class="chat-code-block">
        <div class="chat-code-header">
          <span class="chat-code-language">${this.escapeHtml(langLabel)}</span>
          <button class="chat-code-copy" data-code="${this.escapeAttr(content)}">Copy</button>
        </div>
        <div class="chat-code-content"><code>${escaped}</code></div>
      </div>`;
  }

  renderImageMessage(attachment: ChatAttachment): string {
    const src = this.config.baseUrl
      ? `${this.config.baseUrl}/${attachment.url}`
      : attachment.url;
    return `
      <div class="chat-attachment">
        <img
          class="chat-attachment-image"
          src="${this.escapeAttr(src)}"
          alt="${this.escapeAttr(attachment.fileName)}"
          loading="lazy"
        />
      </div>`;
  }

  renderFileMessage(attachment: ChatAttachment): string {
    const icon = this.getFileIcon(attachment.fileType);
    const size = this.formatFileSize(attachment.fileSize);
    return `
      <div class="chat-attachment">
        <a class="chat-attachment-file" href="${this.escapeAttr(attachment.url)}" target="_blank" rel="noopener">
          <span class="chat-attachment-file-icon">${icon}</span>
          <div class="chat-attachment-file-info">
            <div class="chat-attachment-file-name">${this.escapeHtml(attachment.fileName)}</div>
            <div class="chat-attachment-file-size">${size}</div>
          </div>
        </a>
      </div>`;
  }

  renderSystemMessage(content: string): string {
    return `<div class="chat-message system"><div class="chat-message-bubble">${this.sanitizeHtml(content)}</div></div>`;
  }

  renderAgentResponse(content: string): string {
    return `<div class="chat-message agent"><div class="chat-message-bubble">${this.renderMarkdown(content)}</div></div>`;
  }

  renderReplyMessage(message: ChatMessage, originalMessage?: ChatMessage): string {
    const sender = originalMessage ? this.escapeHtml(originalMessage.senderId) : 'Unknown';
    const preview = originalMessage
      ? this.escapeHtml(this.truncate(originalMessage.content, 80))
      : 'Original message not found';
    return `
      <div class="chat-message-reply" data-reply-to="${this.escapeAttr(message.replyTo || '')}">
        <div class="chat-message-reply-sender">${sender}</div>
        <div class="chat-message-reply-content">${preview}</div>
      </div>`;
  }

  renderReactions(reactions: ChatReaction[]): string {
    if (!reactions || reactions.length === 0) return '';
    const grouped = this.groupReactions(reactions);
    return `<div class="chat-message-reactions">${
      grouped
        .map(
          (r) =>
            `<span class="chat-reaction${r.includesSelf ? ' active' : ''}" data-emoji="${this.escapeAttr(r.emoji)}">
              <span>${r.emoji}</span>
              <span class="chat-reaction-count">${r.count}</span>
            </span>`
        )
        .join('')
    }</div>`;
  }

  renderTimestamp(date: Date): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) {
      return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  renderReadReceipt(readBy: ChatReadReceipt[]): string {
    if (!readBy || readBy.length === 0) {
      return '<span class="chat-message-read-receipt unread" title="Sent">✓</span>';
    }
    const others = readBy.filter((r) => r.userId !== this.config.currentUserId);
    if (others.length === 0) {
      return '<span class="chat-message-read-receipt unread" title="Sent">✓</span>';
    }
    return `<span class="chat-message-read-receipt" title="Read by ${others.length}">✓✓</span>`;
  }

  renderMarkdown(text: string): string {
    let result = this.sanitizeHtml(text);

    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    result = result.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    result = result.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    return result;
  }

  sanitizeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  detectLinks(text: string): string {
    return text.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
  }

  isEmoji(text: string): boolean {
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\s*(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    return emojiRegex.test(text.trim());
  }

  private escapeHtml(input: string): string {
    return this.sanitizeHtml(input);
  }

  private escapeAttr(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  private getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎬';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('sheet') || fileType.includes('excel')) return '📊';
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return '📽️';
    if (fileType.includes('zip') || fileType.includes('compressed') || fileType.includes('archive')) return '📦';
    if (fileType.includes('json') || fileType.includes('xml') || fileType.includes('text')) return '📋';
    return '📁';
  }

  private groupReactions(reactions: ChatReaction[]): Array<{
    emoji: string;
    count: number;
    includesSelf: boolean;
  }> {
    const map = new Map<string, { count: number; includesSelf: boolean }>();
    for (const r of reactions) {
      const existing = map.get(r.emoji) || { count: 0, includesSelf: false };
      existing.count++;
      if (r.userId === this.config.currentUserId) {
        existing.includesSelf = true;
      }
      map.set(r.emoji, existing);
    }
    return Array.from(map.entries()).map(([emoji, data]) => ({
      emoji,
      ...data,
    }));
  }
}
