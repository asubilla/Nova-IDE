import { EventEmitter } from 'events';
import { ChatService } from './chat-service';
import { ChatWebSocket, WSEventType } from './chat-websocket';
import { ChatAgentBridge } from './chat-agent-bridge';
import { ChatMessage, ChatSession, ChatSessionType } from './chat-types';
import { defaultLogger } from '../logging/logger';

export interface Orchestrator {
  registerSubsystem?(name: string, subsystem: unknown): void;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  emit?(event: string, ...args: unknown[]): void;
}

export interface MessageBus {
  send(agentId: string, message: unknown): Promise<void>;
  subscribe(agentId: string, handler: (message: unknown) => void): void;
  unsubscribe(agentId: string): void;
}

export interface KnowledgeBase {
  store(key: string, value: unknown, metadata?: Record<string, unknown>): void;
  retrieve(key: string): unknown;
  search(query: string): unknown[];
}

export interface LearningSystem {
  recordInteraction(data: Record<string, unknown>): void;
  getInsights(query: string): unknown[];
}

export interface HealthChecker {
  registerCheck(name: string, check: () => Promise<{ healthy: boolean; message?: string }>): void;
}

export interface MetricsCollector {
  increment(name: string, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}

export interface ChatMetrics {
  messagesSent: number;
  sessionsCreated: number;
  activeSessions: number;
  activeConnections: number;
  averageResponseTimeMs: number;
  errors: number;
}

export class ChatIntegration extends EventEmitter {
  private chatService: ChatService;
  private chatWebSocket: ChatWebSocket | null = null;
  private chatAgentBridge: ChatAgentBridge | null = null;
  private logger: typeof defaultLogger;
  private metrics: ChatMetrics = {
    messagesSent: 0,
    sessionsCreated: 0,
    activeSessions: 0,
    activeConnections: 0,
    averageResponseTimeMs: 0,
    errors: 0,
  };

  private orchestrator: Orchestrator | null = null;
  private messageBus: MessageBus | null = null;
  private knowledgeBase: KnowledgeBase | null = null;
  private learningSystem: LearningSystem | null = null;
  private healthChecker: HealthChecker | null = null;
  private metricsCollector: MetricsCollector | null = null;

  private responseTimes: number[] = [];

  constructor(chatService: ChatService) {
    super();
    this.chatService = chatService;
    this.logger = defaultLogger.child('ChatIntegration');
  }

  setWebSocket(webSocket: ChatWebSocket): void {
    this.chatWebSocket = webSocket;
  }

  setAgentBridge(bridge: ChatAgentBridge): void {
    this.chatAgentBridge = bridge;
  }

  // ─── System Integrations ───────────────────────────────────────

  integrateWithOrchestrator(orchestrator: Orchestrator): void {
    this.orchestrator = orchestrator;
    if (orchestrator.registerSubsystem) {
      orchestrator.registerSubsystem('chat', this);
    }
    if (orchestrator.on) {
      orchestrator.on('session:start', (data) => {
        this.logger.info('Orchestrator session started', data as Record<string, unknown>);
      });
    }
    this.logger.info('Integrated with orchestrator');
  }

  integrateWithMessageBus(bus: MessageBus): void {
    this.messageBus = bus;
    bus.subscribe('chat-broadcast', (message) => {
      this.handleIncomingAgentMessage(message);
    });
    this.logger.info('Integrated with message bus');
  }

  integrateWithKnowledgeBase(kb: KnowledgeBase): void {
    this.knowledgeBase = kb;
    this.setupKnowledgeBaseListeners();
    this.logger.info('Integrated with knowledge base');
  }

  integrateWithLearningSystem(learning: LearningSystem): void {
    this.learningSystem = learning;
    this.setupLearningListeners();
    this.logger.info('Integrated with learning system');
  }

  integrateWithHealthChecker(health: HealthChecker): void {
    this.healthChecker = health;
    health.registerCheck('chat-service', async () => ({
      healthy: true,
      message: 'Chat service operational',
    }));
    health.registerCheck('chat-websocket', async () => ({
      healthy: this.chatWebSocket !== null,
      message: this.chatWebSocket ? 'WebSocket connected' : 'WebSocket not initialized',
    }));
    health.registerCheck('chat-metrics', async () => ({
      healthy: this.metrics.errors < 100,
      message: `${this.metrics.errors} errors recorded`,
    }));
    this.logger.info('Integrated with health checker');
  }

  integrateWithMetrics(metrics: MetricsCollector): void {
    this.metricsCollector = metrics;
    this.setupMetricsListeners();
    this.logger.info('Integrated with metrics collector');
  }

  // ─── Auto-Routing ─────────────────────────────────────────────

  autoRouteMessage(message: ChatMessage, session: ChatSession): void {
    if (session.type !== ChatSessionType.UserAgent) return;
    if (message.senderType !== 'user') return;

    if (this.messageBus) {
      this.messageBus.send('router', {
        type: 'message:routed',
        messageId: message.id,
        sessionId: session.id,
        senderId: message.senderId,
        content: message.content,
        timestamp: message.createdAt.toISOString(),
      }).catch((err) => {
        this.logger.error('Failed to route message via bus', err as Error);
      });
    }

    this.metricsCollector?.increment('chat.messages.routed');
  }

  // ─── Knowledge Base Storage ────────────────────────────────────

  storeChatDecision(message: ChatMessage, session: ChatSession, decision: string): void {
    if (!this.knowledgeBase) return;

    this.knowledgeBase.store(
      `chat:decision:${message.id}`,
      {
        sessionId: session.id,
        senderId: message.senderId,
        content: message.content,
        decision,
        timestamp: message.createdAt.toISOString(),
      },
      {
        tags: ['chat', 'decision', session.type],
        sessionId: session.id,
      },
    );
  }

  // ─── Learning from Interactions ────────────────────────────────

  recordChatInteraction(message: ChatMessage, session: ChatSession): void {
    if (!this.learningSystem) return;

    this.learningSystem.recordInteraction({
      type: 'chat_message',
      messageId: message.id,
      sessionId: session.id,
      senderId: message.senderId,
      senderType: message.senderType,
      contentType: message.type,
      contentLength: message.content.length,
      hasReply: !!message.replyTo,
      reactionCount: message.reactions.length,
      timestamp: message.createdAt.toISOString(),
    });
  }

  // ─── Metrics ───────────────────────────────────────────────────

  trackMessageSent(message: ChatMessage): void {
    this.metrics.messagesSent++;
    this.metricsCollector?.increment('chat.messages.sent', {
      senderType: message.senderType,
      contentType: message.type,
    });
  }

  trackSessionCreated(session: ChatSession): void {
    this.metrics.sessionsCreated++;
    this.metricsCollector?.increment('chat.sessions.created', {
      sessionType: session.type,
    });
  }

  trackResponseTime(durationMs: number): void {
    this.responseTimes.push(durationMs);
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-500);
    }
    this.metrics.averageResponseTimeMs =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    this.metricsCollector?.timing('chat.response.time', durationMs);
  }

  getMetrics(): ChatMetrics {
    return {
      ...this.metrics,
      activeSessions: this.chatWebSocket
        ? this.chatWebSocket.getSessionClients('').length
        : 0,
      activeConnections: this.chatWebSocket
        ? this.chatWebSocket.getConnectedUserIds().length
        : 0,
    };
  }

  // ─── Private Setup ─────────────────────────────────────────────

  private setupKnowledgeBaseListeners(): void {
    this.chatService.on('message:sent', (message: ChatMessage) => {
      const session = this.chatService.getSession(message.sessionId);
      if (session) {
        this.recordChatInteraction(message, session);
        this.autoRouteMessage(message, session);
      }
    });
  }

  private setupLearningListeners(): void {
    this.chatService.on('message:edited', (message: ChatMessage) => {
      this.learningSystem?.recordInteraction({
        type: 'message_edited',
        messageId: message.id,
        sessionId: message.sessionId,
        timestamp: new Date().toISOString(),
      });
    });

    this.chatService.on('message:deleted', (message: ChatMessage) => {
      this.learningSystem?.recordInteraction({
        type: 'message_deleted',
        messageId: message.id,
        sessionId: message.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupMetricsListeners(): void {
    this.chatService.on('message:sent', (message: ChatMessage) => {
      this.trackMessageSent(message);
    });

    this.chatService.on('typing:started', () => {
      this.metricsCollector?.increment('chat.typing.started');
    });

    this.chatService.on('reaction:added', () => {
      this.metricsCollector?.increment('chat.reactions.added');
    });
  }

  private handleIncomingAgentMessage(message: unknown): void {
    const msg = message as { type?: string; data?: Record<string, unknown> };
    if (msg?.type === 'agent:response' && msg.data) {
      const sessionId = msg.data.sessionId as string;
      const content = msg.data.content as string;
      if (sessionId && content) {
        this.chatService.sendMessage({
          sessionId,
          senderId: (msg.data.agentId as string) ?? 'system',
          senderType: 'agent',
          content,
        });
      }
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  destroy(): void {
    this.responseTimes = [];
    this.removeAllListeners();
  }
}
