import { type LogEntry, type LogFilter, type LogLevel, type LogCategory } from './system-logger';

export type StreamFilter = LogFilter;

export interface StreamStats {
  subscriberCount: number;
  bufferSize: number;
  isPaused: boolean;
  isConnected: boolean;
  totalEntriesStreamed: number;
  uptime: number;
}

export type SubscribeCallback = (entry: LogEntry) => void;
export type ConnectCallback = () => void;
export type DisconnectCallback = () => void;

export class LiveLogStream {
  private subscribers: Set<SubscribeCallback> = new Set();
  private onConnectCallbacks: Set<ConnectCallback> = new Set();
  private onDisconnectCallbacks: Set<DisconnectCallback> = new Set();
  private buffer: LogEntry[] = [];
  private maxBufferSize: number = 1000;
  private activeFilter: StreamFilter | null = null;
  private paused: boolean = false;
  private connected: boolean = true;
  private totalStreamed: number = 0;
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  subscribe(callback: SubscribeCallback): () => void {
    if (!this.connected) return () => {};

    this.subscribers.add(callback);
    this.onConnectCallbacks.forEach((cb) => {
      try { cb(); } catch { /* ignore */ }
    });

    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback: SubscribeCallback): void {
    this.subscribers.delete(callback);
    this.onDisconnectCallbacks.forEach((cb) => {
      try { cb(); } catch { /* ignore */ }
    });
  }

  broadcast(entry: LogEntry): void {
    if (!this.connected || this.paused) return;

    if (this.activeFilter && !this.matchesFilter(entry, this.activeFilter)) {
      return;
    }

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxBufferSize);
    }

    this.totalStreamed++;

    for (const cb of this.subscribers) {
      try { cb(entry); } catch { /* subscriber error ignored */ }
    }
  }

  filter(filter: StreamFilter): void {
    this.activeFilter = filter;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  getBuffer(): readonly LogEntry[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer = [];
  }

  setBufferSize(size: number): void {
    this.maxBufferSize = size;
    if (this.buffer.length > size) {
      this.buffer = this.buffer.slice(this.buffer.length - size);
    }
  }

  onConnect(callback: ConnectCallback): () => void {
    this.onConnectCallbacks.add(callback);
    return () => this.onConnectCallbacks.delete(callback);
  }

  onDisconnect(callback: DisconnectCallback): () => void {
    this.onDisconnectCallbacks.add(callback);
    return () => this.onDisconnectCallbacks.delete(callback);
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStats(): StreamStats {
    return {
      subscriberCount: this.subscribers.size,
      bufferSize: this.buffer.length,
      isPaused: this.paused,
      isConnected: this.connected,
      totalEntriesStreamed: this.totalStreamed,
      uptime: Date.now() - this.startTime,
    };
  }

  destroy(): void {
    this.connected = false;
    this.subscribers.clear();
    this.onConnectCallbacks.clear();
    this.onDisconnectCallbacks.clear();
    this.buffer = [];
  }

  private matchesFilter(entry: LogEntry, filter: StreamFilter): boolean {
    if (filter.level !== undefined && entry.level !== filter.level) return false;
    if (filter.category !== undefined && entry.category !== filter.category) return false;
    if (filter.categoryIn !== undefined && !filter.categoryIn.includes(entry.category)) return false;
    if (filter.levelIn !== undefined && !filter.levelIn.includes(entry.level)) return false;
    if (filter.agentId !== undefined && entry.agentId !== filter.agentId) return false;
    if (filter.sessionId !== undefined && entry.sessionId !== filter.sessionId) return false;
    if (filter.taskId !== undefined && entry.taskId !== filter.taskId) return false;
    if (filter.userId !== undefined && entry.userId !== filter.userId) return false;
    if (filter.startTime !== undefined && entry.timestamp < filter.startTime) return false;
    if (filter.endTime !== undefined && entry.timestamp > filter.endTime) return false;
    if (filter.search !== undefined && !entry.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
    if (filter.minDuration !== undefined && (entry.duration === undefined || entry.duration < filter.minDuration)) return false;
    if (filter.maxDuration !== undefined && (entry.duration === undefined || entry.duration > filter.maxDuration)) return false;
    return true;
  }
}
