import { EventEmitter } from 'events';
import type { AgentCoordinationMessage, AgentType } from '../core/types';

export type CoordinationMessageType = AgentCoordinationMessage['type'];

export interface CoordinationBusOptions {
  defaultTimeoutMs: number;
  maxQueueSize: number;
  maxRetries: number;
  deadLetterMaxSize: number;
}

export interface PendingRequest {
  correlationId: string;
  fromAgentId: string;
  toAgentId: string;
  type: CoordinationMessageType;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: Date;
}

export interface DeliveryRecord {
  message: AgentCoordinationMessage;
  delivered: boolean;
  deliveredAt?: Date;
  attempts: number;
  error?: string;
}

const DEFAULT_OPTIONS: CoordinationBusOptions = {
  defaultTimeoutMs: 30000,
  maxQueueSize: 10000,
  maxRetries: 3,
  deadLetterMaxSize: 1000,
};

export class CoordinationBus extends EventEmitter {
  private options: CoordinationBusOptions;
  private agentSubscriptions: Map<string, Set<string>> = new Map();
  private sessionSubscriptions: Map<string, Set<string>> = new Map();
  private typeSubscriptions: Map<CoordinationMessageType, Set<string>> = new Map();
  private messageQueue: AgentCoordinationMessage[] = [];
  private deadLetterQueue: DeliveryRecord[] = [];
  private deliveryHistory: Map<string, DeliveryRecord[]> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private correlationCounter = 0;

  constructor(options?: Partial<CoordinationBusOptions>) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  generateCorrelationId(): string {
    return `corr-${Date.now()}-${++this.correlationCounter}`;
  }

  subscribe(agentId: string, types?: CoordinationMessageType[]): () => void {
    const key = agentId;
    if (!this.agentSubscriptions.has(key)) {
      this.agentSubscriptions.set(key, new Set());
    }
    if (types) {
      for (const type of types) {
        const typeKey = `${agentId}:${type}`;
        if (!this.typeSubscriptions.has(type)) {
          this.typeSubscriptions.set(type, new Set());
        }
        this.typeSubscriptions.get(type)!.add(typeKey);
      }
    } else {
      this.agentSubscriptions.get(key)!.add('*');
    }

    this.flushQueueForAgent(agentId);

    return () => {
      this.agentSubscriptions.get(key)?.delete('*');
      if (types) {
        for (const type of types) {
          this.typeSubscriptions.get(type)?.delete(`${agentId}:${type}`);
        }
      }
    };
  }

  subscribeSession(sessionId: string, agentId: string): () => void {
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
    }
    this.sessionSubscriptions.get(sessionId)!.add(agentId);

    return () => {
      this.sessionSubscriptions.get(sessionId)?.delete(agentId);
    };
  }

  publish(message: AgentCoordinationMessage): void {
    if (!message.correlationId) {
      message = { ...message, correlationId: this.generateCorrelationId() };
    }
    if (!message.timestamp) {
      message = { ...message, timestamp: new Date() };
    }

    const record: DeliveryRecord = { message, delivered: false, attempts: 0 };
    const history = this.deliveryHistory.get(message.correlationId) || [];
    history.push(record);
    this.deliveryHistory.set(message.correlationId, history);

    const delivered = this.deliver(message);
    record.delivered = delivered;
    record.deliveredAt = delivered ? new Date() : undefined;
    record.attempts++;

    if (!delivered) {
      if (this.messageQueue.length >= this.options.maxQueueSize) {
        this.messageQueue.shift();
      }
      this.messageQueue.push(message);
    }

    this.emit('message', message);
    this.emit(`message:${message.type}`, message);
    this.emit(`agent:${message.toAgentId}`, message);
  }

  requestSync(
    fromAgentId: string,
    toAgentId: string,
    payload: any,
    timeoutMs?: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const correlationId = this.generateCorrelationId();
      const timeout = timeoutMs ?? this.options.defaultTimeoutMs;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Sync request timed out after ${timeout}ms: ${fromAgentId} -> ${toAgentId}`));
      }, timeout);

      const pending: PendingRequest = {
        correlationId,
        fromAgentId,
        toAgentId,
        type: 'sync-request',
        resolve: (value) => {
          clearTimeout(timer);
          this.pendingRequests.delete(correlationId);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          this.pendingRequests.delete(correlationId);
          reject(reason);
        },
        timer,
        createdAt: new Date(),
      };

      this.pendingRequests.set(correlationId, pending);

      this.publish({
        fromAgentId,
        toAgentId,
        type: 'sync-request',
        payload: { ...payload, requestCorrelationId: correlationId },
        timestamp: new Date(),
        correlationId,
      });
    });
  }

  respondSync(correlationId: string, fromAgentId: string, payload: any): boolean {
    const pending = this.pendingRequests.get(correlationId);
    if (!pending) return false;

    pending.resolve(payload);

    this.publish({
      fromAgentId,
      toAgentId: pending.fromAgentId,
      type: 'sync-request',
      payload,
      timestamp: new Date(),
      correlationId,
    });

    return true;
  }

  private deliver(message: AgentCoordinationMessage): boolean {
    const subscribers = this.agentSubscriptions.get(message.toAgentId);
    if (!subscribers || subscribers.size === 0) return false;

    if (subscribers.has('*') || subscribers.has(message.type)) {
      try {
        this.emit(`delivery:${message.toAgentId}`, message);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private flushQueueForAgent(agentId: string): void {
    const remaining: AgentCoordinationMessage[] = [];
    for (const msg of this.messageQueue) {
      if (msg.toAgentId === agentId) {
        this.deliver(msg);
      } else {
        remaining.push(msg);
      }
    }
    this.messageQueue = remaining;
  }

  addToDeadLetter(message: AgentCoordinationMessage, error: string): void {
    const record: DeliveryRecord = {
      message,
      delivered: false,
      attempts: this.options.maxRetries,
      error,
    };
    this.deadLetterQueue.push(record);
    if (this.deadLetterQueue.length > this.options.deadLetterMaxSize) {
      this.deadLetterQueue.shift();
    }
    this.emit('dead-letter', record);
  }

  retryDeadLetters(): number {
    const retried = this.deadLetterQueue.splice(0);
    let delivered = 0;
    for (const record of retried) {
      if (this.deliver(record.message)) {
        delivered++;
      } else {
        this.deadLetterQueue.push(record);
      }
    }
    return delivered;
  }

  getDeadLetters(): DeliveryRecord[] {
    return [...this.deadLetterQueue];
  }

  getDeliveryHistory(correlationId: string): DeliveryRecord[] {
    return this.deliveryHistory.get(correlationId) || [];
  }

  getPendingRequests(): PendingRequest[] {
    return [...this.pendingRequests.values()];
  }

  getQueuedMessages(): AgentCoordinationMessage[] {
    return [...this.messageQueue];
  }

  getSessionMessages(sessionId: string): AgentCoordinationMessage[] {
    const agents = this.sessionSubscriptions.get(sessionId);
    if (!agents) return [];
    const messages: AgentCoordinationMessage[] = [];
    for (const record of this.deliveryHistory.values()) {
      for (const r of record) {
        if (agents.has(r.message.fromAgentId) || agents.has(r.message.toAgentId)) {
          messages.push(r.message);
        }
      }
    }
    return messages;
  }

  clearSession(sessionId: string): void {
    this.sessionSubscriptions.delete(sessionId);
  }

  reset(): void {
    this.agentSubscriptions.clear();
    this.sessionSubscriptions.clear();
    this.typeSubscriptions.clear();
    this.messageQueue = [];
    this.deadLetterQueue = [];
    this.deliveryHistory.clear();
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bus reset'));
    }
    this.pendingRequests.clear();
    this.removeAllListeners();
  }
}
