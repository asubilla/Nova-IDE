import { EventEmitter } from 'events';

export interface AgentMessage {
  id: string;
  type: 'request' | 'response' | 'broadcast' | 'event' | 'heartbeat' | 'error';
  from: string;
  to: string | '*';
  topic: string;
  payload: any;
  metadata: { timestamp: Date; priority: number; ttl: number; correlationId?: string; replyTo?: string };
  status: 'pending' | 'delivered' | 'processed' | 'expired' | 'failed';
}

export interface MessageSubscription {
  id: string;
  agentId: string;
  topic: string;
  filter?: (msg: AgentMessage) => boolean;
  callback: (msg: AgentMessage) => void | Promise<void>;
  once: boolean;
}

export interface MessageQueue {
  agentId: string;
  messages: AgentMessage[];
  maxsize: number;
}

export class AgentMessageBus extends EventEmitter {
  private subscriptions: Map<string, MessageSubscription> = new Map();
  private queues: Map<string, MessageQueue> = new Map();
  private messageHistory: AgentMessage[] = [];
  private deadLetterQueue: AgentMessage[] = [];
  private maxHistory = 10000;
  private maxQueueSize = 1000;
  private heartbeatInterval: NodeJS.Timeout;
  private agentStatus: Map<string, { online: boolean; lastSeen: Date }> = new Map();

  constructor(private config?: { maxHistory?: number; maxQueueSize?: number; heartbeatMs?: number }) {
    super();
    this.maxHistory = config?.maxHistory || 10000;
    this.maxQueueSize = config?.maxQueueSize || 1000;
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), config?.heartbeatMs || 30000);
  }

  subscribe(agentId: string, topic: string, callback: (msg: AgentMessage) => void | Promise<void>, options?: { filter?: (msg: AgentMessage) => boolean; once?: boolean }): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.subscriptions.set(id, { id, agentId, topic, filter: options?.filter, callback, once: options?.once || false });
    return id;
  }

  unsubscribe(subscriptionId: string): boolean { return this.subscriptions.delete(subscriptionId); }

  publish(from: string, to: string | '*', topic: string, payload: any, options?: { priority?: number; ttl?: number; correlationId?: string; replyTo?: string }): AgentMessage {
    const message: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: to === '*' ? 'broadcast' : 'request',
      from, to, topic, payload,
      metadata: { timestamp: new Date(), priority: options?.priority || 0, ttl: options?.ttl || 300000, correlationId: options?.correlationId, replyTo: options?.replyTo },
      status: 'pending',
    };
    this.routeMessage(message);
    return message;
  }

  reply(originalMessage: AgentMessage, payload: any): AgentMessage {
    if (!originalMessage.metadata.replyTo) throw new Error('No replyTo on original message');
    return this.publish(originalMessage.to as string, originalMessage.metadata.replyTo, `${originalMessage.topic}.reply`, payload, { correlationId: originalMessage.metadata.correlationId });
  }

  broadcast(from: string, topic: string, payload: any): AgentMessage { return this.publish(from, '*', topic, payload); }

  private routeMessage(message: AgentMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistory) this.messageHistory.shift();

    if (message.to === '*') {
      this.handleBroadcast(message);
    } else {
      this.handleDirectMessage(message);
    }
    this.emit('message-sent', message);
  }

  private handleDirectMessage(message: AgentMessage): void {
    const matchingSubs = [...this.subscriptions.values()].filter(sub => sub.topic === message.topic && (sub.agentId === message.to || sub.agentId === '*'));
    if (matchingSubs.length === 0) {
      this.enqueueMessage(message.to as string, message);
    } else {
      for (const sub of matchingSubs) {
        if (sub.filter && !sub.filter(message)) continue;
        try { sub.callback(message); } catch (e) { this.emit('subscription-error', { subscriptionId: sub.id, error: e }); }
        if (sub.once) this.subscriptions.delete(sub.id);
      }
      message.status = 'delivered';
    }
  }

  private handleBroadcast(message: AgentMessage): void {
    const allSubs = [...this.subscriptions.values()].filter(sub => sub.topic === message.topic);
    for (const sub of allSubs) {
      if (sub.filter && !sub.filter(message)) continue;
      try { sub.callback(message); } catch (e) { this.emit('subscription-error', { subscriptionId: sub.id, error: e }); }
      if (sub.once) this.subscriptions.delete(sub.id);
    }
    message.status = 'delivered';
  }

  private enqueueMessage(agentId: string, message: AgentMessage): void {
    if (!this.queues.has(agentId)) this.queues.set(agentId, { agentId, messages: [], maxsize: this.maxQueueSize });
    const queue = this.queues.get(agentId)!;
    if (queue.messages.length >= queue.maxsize) this.deadLetterQueue.push(queue.messages.shift()!);
    queue.messages.push(message);
  }

  drainQueue(agentId: string): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) return [];
    const messages = [...queue.messages];
    queue.messages = [];
    return messages;
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [agentId, status] of this.agentStatus) {
      if (now - status.lastSeen.getTime() > 60000) { status.online = false; this.emit('agent-offline', { agentId }); }
    }
  }

  heartbeat(agentId: string): void { this.agentStatus.set(agentId, { online: true, lastSeen: new Date() }); }
  isAgentOnline(agentId: string): boolean { return this.agentStatus.get(agentId)?.online || false; }
  getOnlineAgents(): string[] { return [...this.agentStatus.entries()].filter(([, s]) => s.online).map(([id]) => id); }

  getMessageHistory(topic?: string, limit?: number): AgentMessage[] {
    let history = topic ? this.messageHistory.filter(m => m.topic === topic) : this.messageHistory;
    if (limit) history = history.slice(-limit);
    return history;
  }

  getDeadLetters(): AgentMessage[] { return [...this.deadLetterQueue]; }
  getQueueSize(agentId: string): number { return this.queues.get(agentId)?.messages.length || 0; }
  getStats(): { totalMessages: number; totalSubscriptions: number; queuedMessages: number; deadLetters: number; onlineAgents: number } {
    return {
      totalMessages: this.messageHistory.length, totalSubscriptions: this.subscriptions.size,
      queuedMessages: [...this.queues.values()].reduce((sum, q) => sum + q.messages.length, 0),
      deadLetters: this.deadLetterQueue.length, onlineAgents: this.getOnlineAgents().length,
    };
  }

  clearHistory(): void { this.messageHistory = []; this.deadLetterQueue = []; }
  destroy(): void { clearInterval(this.heartbeatInterval); this.subscriptions.clear(); this.queues.clear(); this.messageHistory = []; this.removeAllListeners(); }
}
