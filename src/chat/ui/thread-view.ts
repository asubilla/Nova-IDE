import type { ChatMessage } from '../chat-types.js';
import { ChatMessageType } from '../chat-types.js';

export interface Thread {
  id: string;
  parentMessageId: string;
  sessionId: string;
  title?: string;
  replyCount: number;
  lastReplyAt: Date;
  createdAt: Date;
  isCollapsed: boolean;
}

export interface ThreadRenderOptions {
  maxDepth?: number;
  showTimestamp?: boolean;
  showAvatar?: boolean;
  showReplyCount?: boolean;
  compact?: boolean;
  onReply?: (threadId: string) => void;
  onCollapse?: (threadId: string) => void;
  onExpand?: (threadId: string) => void;
  onMessageClick?: (messageId: string) => void;
}

export interface ThreadConfig {
  maxNestDepth?: number;
  defaultCollapsed?: boolean;
  showThreadPreview?: boolean;
  previewMessageCount?: number;
  allowNestedThreads?: boolean;
}

const DEFAULT_CONFIG: ThreadConfig = {
  maxNestDepth: 5,
  defaultCollapsed: false,
  showThreadPreview: true,
  previewMessageCount: 3,
  allowNestedThreads: true,
};

export class ThreadView {
  private config: ThreadConfig;
  private threads = new Map<string, Thread>();
  private threadMessages = new Map<string, ChatMessage[]>();
  private collapsedThreads = new Set<string>();

  constructor(config?: ThreadConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  renderThread(thread: Thread, messages: ChatMessage[], options?: ThreadRenderOptions): HTMLElement {
    const el = document.createElement('div');
    el.className = 'thread-view';
    el.dataset.threadId = thread.id;

    const isCollapsed = this.collapsedThreads.has(thread.id);
    const maxDepth = options?.maxDepth ?? this.config.maxNestDepth ?? 5;

    const header = this.renderThreadHeader(thread, messages, isCollapsed, options);
    el.appendChild(header);

    if (!isCollapsed) {
      const body = document.createElement('div');
      body.className = 'thread-body';

      const rootMessages = messages.filter(m => !m.replyTo || m.replyTo === thread.parentMessageId);
      for (const msg of rootMessages) {
        const msgEl = this.renderThreadMessage(msg, messages, 0, maxDepth, options);
        body.appendChild(msgEl);
      }

      el.appendChild(body);

      if (options?.onReply) {
        const replyBar = this.renderReplyBar(thread.id, options.onReply);
        el.appendChild(replyBar);
      }
    }

    return el;
  }

  createThread(parentMessage: ChatMessage, sessionId: string): Thread {
    const thread: Thread = {
      id: `thread-${parentMessage.id}-${Date.now()}`,
      parentMessageId: parentMessage.id,
      sessionId,
      title: this.generateThreadTitle(parentMessage),
      replyCount: 0,
      lastReplyAt: new Date(),
      createdAt: new Date(),
      isCollapsed: this.config.defaultCollapsed ?? false,
    };

    this.threads.set(thread.id, thread);
    this.threadMessages.set(thread.id, [parentMessage]);

    return thread;
  }

  replyToThread(threadId: string, message: ChatMessage): boolean {
    const thread = this.threads.get(threadId);
    if (!thread) return false;

    const messages = this.threadMessages.get(threadId) ?? [];
    messages.push(message);
    this.threadMessages.set(threadId, messages);

    thread.replyCount++;
    thread.lastReplyAt = message.createdAt;

    return true;
  }

  collapseThread(threadId: string): void {
    this.collapsedThreads.add(threadId);
    const thread = this.threads.get(threadId);
    if (thread) thread.isCollapsed = true;
  }

  expandThread(threadId: string): void {
    this.collapsedThreads.delete(threadId);
    const thread = this.threads.get(threadId);
    if (thread) thread.isCollapsed = false;
  }

  toggleThread(threadId: string): void {
    if (this.collapsedThreads.has(threadId)) {
      this.expandThread(threadId);
    } else {
      this.collapseThread(threadId);
    }
  }

  renderThreadList(threads: Thread[], options?: ThreadRenderOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = 'thread-list';

    if (threads.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'thread-list-empty';
      empty.textContent = 'No threads yet';
      empty.style.cssText = 'padding:24px;text-align:center;color:var(--chat-text-muted);font-size:14px;';
      container.appendChild(empty);
      return container;
    }

    const sorted = [...threads].sort((a, b) => b.lastReplyAt.getTime() - a.lastReplyAt.getTime());

    for (const thread of sorted) {
      const threadEl = this.renderThreadListItem(thread, options);
      container.appendChild(threadEl);
    }

    return container;
  }

  getThreadDepth(messageId: string, messages: ChatMessage[]): number {
    let depth = 0;
    let currentId: string | undefined = messageId;

    while (currentId && depth < (this.config.maxNestDepth ?? 5)) {
      const msg = messages.find(m => m.id === currentId);
      if (!msg?.replyTo) break;
      currentId = msg.replyTo;
      depth++;
    }

    return depth;
  }

  getThread(threadId: string): Thread | undefined {
    return this.threads.get(threadId);
  }

  getThreadMessages(threadId: string): ChatMessage[] {
    return this.threadMessages.get(threadId) ?? [];
  }

  getAllThreads(sessionId?: string): Thread[] {
    const all = Array.from(this.threads.values());
    if (sessionId) {
      return all.filter(t => t.sessionId === sessionId);
    }
    return all;
  }

  exportThread(threadId: string, format: 'json' | 'markdown' = 'json'): string {
    const thread = this.threads.get(threadId);
    const messages = this.threadMessages.get(threadId);
    if (!thread || !messages) return '';

    if (format === 'json') {
      return JSON.stringify({ thread, messages }, null, 2);
    }

    const lines: string[] = [];
    lines.push(`# Thread: ${thread.title ?? 'Untitled'}`);
    lines.push(`Created: ${thread.createdAt.toISOString()}`);
    lines.push(`Replies: ${thread.replyCount}`);
    lines.push('');

    for (const msg of messages) {
      const indent = '  '.repeat(this.getThreadDepth(msg.id, messages));
      lines.push(`${indent}**${msg.senderId}** (${msg.createdAt.toLocaleString()}):`);
      lines.push(`${indent}${msg.content}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private renderThreadHeader(
    thread: Thread,
    messages: ChatMessage[],
    isCollapsed: boolean,
    options?: ThreadRenderOptions,
  ): HTMLElement {
    const header = document.createElement('div');
    header.className = 'thread-header';
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--chat-border);cursor:pointer;';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'thread-toggle-btn';
    toggleBtn.textContent = isCollapsed ? '▶' : '▼';
    toggleBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;color:var(--chat-text-muted);padding:2px 4px;';

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleThread(thread.id);
      options?.onCollapse?.(thread.id);
    });

    const title = document.createElement('span');
    title.className = 'thread-title';
    title.textContent = thread.title ?? `Thread (${thread.replyCount} replies)`;
    title.style.cssText = 'font-weight:500;font-size:14px;color:var(--chat-text);flex:1;';

    if (options?.showReplyCount !== false) {
      const count = document.createElement('span');
      count.className = 'thread-reply-count';
      count.textContent = `${thread.replyCount}`;
      count.style.cssText = 'font-size:12px;color:var(--chat-text-muted);background:var(--chat-surface-hover);padding:2px 8px;border-radius:10px;';
      header.appendChild(toggleBtn);
      header.appendChild(title);
      header.appendChild(count);
    } else {
      header.appendChild(toggleBtn);
      header.appendChild(title);
    }

    return header;
  }

  private renderThreadMessage(
    message: ChatMessage,
    allMessages: ChatMessage[],
    currentDepth: number,
    maxDepth: number,
    options?: ThreadRenderOptions,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'thread-message';
    el.dataset.messageId = message.id;
    el.style.cssText = `padding:8px 12px;margin-left:${currentDepth * 24}px;border-left:2px solid ${currentDepth === 0 ? 'var(--chat-primary)' : 'var(--chat-border)'};`;

    const headerRow = document.createElement('div');
    headerRow.className = 'thread-message-header';
    headerRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

    if (options?.showAvatar !== false) {
      const avatar = document.createElement('div');
      avatar.className = 'thread-message-avatar';
      avatar.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--chat-primary);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;flex-shrink:0;';
      avatar.textContent = message.senderId.substring(0, 2).toUpperCase();
      headerRow.appendChild(avatar);
    }

    const sender = document.createElement('span');
    sender.className = 'thread-message-sender';
    sender.textContent = message.senderId;
    sender.style.cssText = 'font-weight:600;font-size:13px;color:var(--chat-text);';

    if (options?.showTimestamp !== false) {
      const time = document.createElement('span');
      time.className = 'thread-message-time';
      time.textContent = this.formatTime(message.createdAt);
      time.style.cssText = 'font-size:12px;color:var(--chat-text-muted);';
      headerRow.appendChild(sender);
      headerRow.appendChild(time);
    } else {
      headerRow.appendChild(sender);
    }

    el.appendChild(headerRow);

    const content = document.createElement('div');
    content.className = 'thread-message-content';
    content.textContent = message.content;
    content.style.cssText = 'font-size:14px;line-height:1.5;color:var(--chat-text);';
    el.appendChild(content);

    if (currentDepth < maxDepth) {
      const childReplies = allMessages.filter(m => m.replyTo === message.id);
      for (const reply of childReplies) {
        const childEl = this.renderThreadMessage(reply, allMessages, currentDepth + 1, maxDepth, options);
        el.appendChild(childEl);
      }
    } else if (currentDepth >= maxDepth) {
      const moreIndicator = document.createElement('div');
      moreIndicator.className = 'thread-more-replies';
      moreIndicator.textContent = '... more replies';
      moreIndicator.style.cssText = 'font-size:12px;color:var(--chat-text-muted);padding:4px 12px;margin-left:' + (currentDepth * 24) + 'px;cursor:pointer;';
      el.appendChild(moreIndicator);
    }

    return el;
  }

  private renderThreadListItem(thread: Thread, options?: ThreadRenderOptions): HTMLElement {
    const item = document.createElement('div');
    item.className = 'thread-list-item';
    item.dataset.threadId = thread.id;
    item.style.cssText = 'padding:12px;border-bottom:1px solid var(--chat-border);cursor:pointer;transition:background 0.15s;';

    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--chat-surface-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });

    const title = document.createElement('div');
    title.className = 'thread-list-item-title';
    title.textContent = thread.title ?? 'Untitled Thread';
    title.style.cssText = 'font-weight:500;font-size:14px;color:var(--chat-text);margin-bottom:4px;';

    const meta = document.createElement('div');
    meta.className = 'thread-list-item-meta';
    meta.style.cssText = 'display:flex;gap:12px;font-size:12px;color:var(--chat-text-muted);';

    const replyCount = document.createElement('span');
    replyCount.textContent = `${thread.replyCount} replies`;

    const lastReply = document.createElement('span');
    lastReply.textContent = `Last reply: ${this.formatTime(thread.lastReplyAt)}`;

    meta.appendChild(replyCount);
    meta.appendChild(lastReply);

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => {
      options?.onExpand?.(thread.id);
    });

    return item;
  }

  private renderReplyBar(threadId: string, onReply: (threadId: string) => void): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'thread-reply-bar';
    bar.style.cssText = 'padding:8px 12px;border-top:1px solid var(--chat-border);';

    const btn = document.createElement('button');
    btn.className = 'thread-reply-btn';
    btn.textContent = 'Reply to thread';
    btn.style.cssText = 'background:var(--chat-primary);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;';

    btn.addEventListener('click', () => onReply(threadId));
    bar.appendChild(btn);

    return bar;
  }

  private generateThreadTitle(message: ChatMessage): string {
    const content = message.content;
    if (content.length <= 50) return content;
    return content.substring(0, 47) + '...';
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
