import { SystemLogger, type LogEntry } from './system-logger';

export interface WebSocketClientInfo {
  clientId: string;
  ip: string;
  connectedAt: number;
  channels: Set<string>;
  messageCount: number;
}

export interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  totalDisconnections: number;
  totalErrors: number;
  totalBroadcasts: number;
  avgMessagesPerClient: number;
  topChannels: { channel: string; subscriberCount: number }[];
}

export class WebSocketLogger {
  private clients: Map<string, WebSocketClientInfo> = new Map();
  private totalConnections = 0;
  private totalDisconnections = 0;
  private totalMessages = 0;
  private totalErrors = 0;
  private totalBroadcasts = 0;
  private channelSubscribers: Map<string, Set<string>> = new Map();

  constructor(private readonly systemLogger: SystemLogger) {}

  logConnect(clientId: string, ip: string): LogEntry {
    this.totalConnections++;
    this.clients.set(clientId, {
      clientId,
      ip,
      connectedAt: Date.now(),
      channels: new Set(),
      messageCount: 0,
    });

    return this.systemLogger.info('websocket', `Client connected: ${clientId}`, {
      clientId,
      ip,
      totalConnections: this.totalConnections,
      activeConnections: this.clients.size,
    });
  }

  logDisconnect(clientId: string, reason: string): LogEntry {
    const client = this.clients.get(clientId);
    const duration = client ? Date.now() - client.connectedAt : undefined;

    if (client) {
      for (const channel of client.channels) {
        const subs = this.channelSubscribers.get(channel);
        if (subs) {
          subs.delete(clientId);
          if (subs.size === 0) this.channelSubscribers.delete(channel);
        }
      }
    }

    this.clients.delete(clientId);
    this.totalDisconnections++;

    return this.systemLogger.info('websocket', `Client disconnected: ${clientId} (${reason})`, {
      clientId,
      reason,
      duration,
      messageCount: client?.messageCount ?? 0,
      activeConnections: this.clients.size,
    });
  }

  logMessage(clientId: string, type: string, size: number): LogEntry {
    const client = this.clients.get(clientId);
    if (client) client.messageCount++;
    this.totalMessages++;

    return this.systemLogger.debug('websocket', `Message: ${type} from ${clientId} (${size} bytes)`, {
      clientId,
      type,
      size,
      totalMessages: this.totalMessages,
    });
  }

  logError(clientId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    this.totalErrors++;

    return this.systemLogger.error('websocket', `WebSocket error: ${clientId} - ${errorMsg}`, {
      clientId,
      error: errorMsg,
      stack,
      totalErrors: this.totalErrors,
    });
  }

  logBroadcast(channel: string, recipientCount: number): LogEntry {
    this.totalBroadcasts++;

    return this.systemLogger.debug('websocket', `Broadcast to ${channel}: ${recipientCount} recipients`, {
      channel,
      recipientCount,
      totalBroadcasts: this.totalBroadcasts,
    });
  }

  logSubscription(clientId: string, channel: string): LogEntry {
    const client = this.clients.get(clientId);
    if (client) client.channels.add(channel);

    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(clientId);

    return this.systemLogger.debug('websocket', `Subscription: ${clientId} -> ${channel}`, {
      clientId,
      channel,
      channelSubscriberCount: this.channelSubscribers.get(channel)!.size,
    });
  }

  getStats(): WebSocketStats {
    const topChannels = [...this.channelSubscribers.entries()]
      .map(([channel, subs]) => ({ channel, subscriberCount: subs.size }))
      .sort((a, b) => b.subscriberCount - a.subscriberCount)
      .slice(0, 10);

    let totalMsgs = 0;
    for (const client of this.clients.values()) {
      totalMsgs += client.messageCount;
    }

    return {
      totalConnections: this.totalConnections,
      activeConnections: this.clients.size,
      totalMessages: this.totalMessages,
      totalDisconnections: this.totalDisconnections,
      totalErrors: this.totalErrors,
      totalBroadcasts: this.totalBroadcasts,
      avgMessagesPerClient: this.totalConnections > 0 ? totalMsgs / this.totalConnections : 0,
      topChannels,
    };
  }
}
