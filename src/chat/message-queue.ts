import {
  ChatMessage,
  ChatMessageType,
} from './chat-types';

export type MessageQueueStatus = 'queued' | 'sending' | 'sent' | 'failed';

export type MessagePriority = 'normal' | 'high';

export interface QueuedMessage {
  id: string;
  message: ChatMessage;
  status: MessageQueueStatus;
  priority: MessagePriority;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

export type OnlineCallback = () => void;

const MAX_QUEUE_SIZE = 100;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const STORAGE_KEY = 'nova-chat-message-queue';

export class MessageQueue {
  private queue = new Map<string, QueuedMessage>();
  private onlineCallbacks: OnlineCallback[] = [];
  private isOnline = true;
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.loadFromStorage();
    this.setupConnectivityListener();
  }

  enqueue(
    sessionId: string,
    senderId: string,
    senderType: ChatMessage['senderType'],
    content: string,
    type: ChatMessageType,
    priority: MessagePriority = 'normal',
    replyTo?: string,
  ): QueuedMessage | null {
    if (this.queue.size >= MAX_QUEUE_SIZE) {
      return null;
    }

    const now = new Date();
    const message: ChatMessage = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      senderId,
      senderType,
      content,
      type,
      replyTo,
      createdAt: now,
      updatedAt: now,
      readBy: [],
      reactions: [],
    };

    const entry: QueuedMessage = {
      id: message.id,
      message,
      status: 'queued',
      priority,
      attempts: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    };

    this.queue.set(entry.id, entry);
    this.saveToStorage();
    return entry;
  }

  dequeue(messageId: string): QueuedMessage | undefined {
    const entry = this.queue.get(messageId);
    if (!entry) return undefined;
    this.clearRetryTimer(messageId);
    this.queue.delete(messageId);
    this.saveToStorage();
    return entry;
  }

  async processQueue(): Promise<{ sent: string[]; failed: string[] }> {
    const sent: string[] = [];
    const failed: string[] = [];

    const sorted = Array.from(this.queue.values()).sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    for (const entry of sorted) {
      if (entry.status === 'sent') continue;
      if (entry.status === 'sending') continue;

      entry.status = 'sending';
      entry.attempts++;
      entry.updatedAt = new Date();

      try {
        await this.sendMessage(entry);
        entry.status = 'sent';
        sent.push(entry.id);
        this.queue.delete(entry.id);
      } catch (err) {
        entry.error = err instanceof Error ? err.message : String(err);
        if (entry.attempts >= entry.maxAttempts) {
          entry.status = 'failed';
          failed.push(entry.id);
        } else {
          entry.status = 'queued';
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, entry.attempts - 1);
          entry.nextRetryAt = new Date(Date.now() + delay);
          this.scheduleRetry(entry.id, delay);
        }
      }

      entry.updatedAt = new Date();
    }

    this.saveToStorage();
    return { sent, failed };
  }

  getQueue(userId?: string): QueuedMessage[] {
    const entries = Array.from(this.queue.values());
    if (userId) {
      return entries.filter((e) => e.message.senderId === userId);
    }
    return entries;
  }

  retryMessage(messageId: string): QueuedMessage | undefined {
    const entry = this.queue.get(messageId);
    if (!entry || entry.status !== 'failed') return undefined;

    entry.status = 'queued';
    entry.attempts = 0;
    entry.error = undefined;
    entry.nextRetryAt = undefined;
    entry.updatedAt = new Date();

    this.saveToStorage();
    return entry;
  }

  clearQueue(userId: string): number {
    let count = 0;
    for (const [id, entry] of this.queue) {
      if (entry.message.senderId === userId) {
        this.clearRetryTimer(id);
        this.queue.delete(id);
        count++;
      }
    }
    this.saveToStorage();
    return count;
  }

  getStatus(messageId: string): MessageQueueStatus | undefined {
    return this.queue.get(messageId)?.status;
  }

  onOnline(callback: OnlineCallback): void {
    this.onlineCallbacks.push(callback);
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  renderQueueIndicator(queue: QueuedMessage[]): string {
    const count = queue.filter((e) => e.status === 'queued' || e.status === 'sending').length;
    if (count === 0) return '';

    const failedCount = queue.filter((e) => e.status === 'failed').length;
    let html = `<span class="queue-indicator" title="${count} message(s) queued">`;
    html += `<span class="queue-count">${count}</span>`;
    if (failedCount > 0) {
      html += ` <span class="queue-failed">${failedCount} failed</span>`;
    }
    html += '</span>';
    return html;
  }

  destroy(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  private async sendMessage(entry: QueuedMessage): Promise<void> {
    // Simulate sending - in real implementation this would call the network layer
    if (!this.isOnline) {
      throw new Error('Offline: cannot send message');
    }
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private scheduleRetry(messageId: string, delayMs: number): void {
    this.clearRetryTimer(messageId);
    const timer = setTimeout(() => {
      this.retryTimers.delete(messageId);
      const entry = this.queue.get(messageId);
      if (entry && entry.status === 'queued') {
        this.processQueue();
      }
    }, delayMs);
    this.retryTimers.set(messageId, timer);
  }

  private clearRetryTimer(messageId: string): void {
    const timer = this.retryTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(messageId);
    }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.queue.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: [string, QueuedMessage][] = JSON.parse(raw);
      for (const [id, entry] of data) {
        entry.createdAt = new Date(entry.createdAt);
        entry.updatedAt = new Date(entry.updatedAt);
        if (entry.nextRetryAt) entry.nextRetryAt = new Date(entry.nextRetryAt);
        entry.message.createdAt = new Date(entry.message.createdAt);
        entry.message.updatedAt = new Date(entry.message.updatedAt);
        this.queue.set(id, entry);
      }
    } catch {
      // Corrupt data
    }
  }

  private setupConnectivityListener(): void {
    if (typeof window === 'undefined') return;

    const setOnline = (): void => {
      this.isOnline = true;
      for (const cb of this.onlineCallbacks) cb();
      this.processQueue();
    };

    const setOffline = (): void => {
      this.isOnline = false;
    };

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    this.isOnline = navigator.onLine;
  }
}
