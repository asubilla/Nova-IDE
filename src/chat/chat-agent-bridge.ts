import { EventEmitter } from 'events';
import { ChatService } from './chat-service';
import { ChatWebSocket, WSEventType } from './chat-websocket';
import {
  ChatMessage,
  ChatSession,
  ChatSessionType,
  ChatMessageType,
} from './chat-types';
import { defaultLogger } from '../logging/logger';

// ─── External System Interfaces (to be implemented by other agents) ───

export interface TemplateMatch {
  templateId: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMessage {
  agentId: string;
  content: string;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentError {
  agentId: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface DynamicTemplateLoader {
  findTemplate(content: string, context?: Record<string, unknown>): Promise<TemplateMatch | null>;
}

export interface AgentMessageBus {
  send(agentId: string, message: AgentMessage): Promise<void>;
  subscribe(agentId: string, handler: (message: AgentMessage) => void): void;
  unsubscribe(agentId: string): void;
}

export interface AIModelRouter {
  selectModel(content: string, context?: Record<string, unknown>): Promise<string>;
}

export interface StreamingChunk {
  content: string;
  done: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentBridgeConfig {
  templateLoader?: DynamicTemplateLoader;
  messageBus?: AgentMessageBus;
  modelRouter?: AIModelRouter;
  defaultAgentId?: string;
  responseTimeoutMs?: number;
  maxRetries?: number;
}

export class ChatAgentBridge extends EventEmitter {
  private chatService: ChatService;
  private chatWebSocket: ChatWebSocket | null = null;
  private templateLoader: DynamicTemplateLoader | null = null;
  private messageBus: AgentMessageBus | null = null;
  private modelRouter: AIModelRouter | null = null;
  private logger: typeof defaultLogger;
  private config: Required<AgentBridgeConfig>;

  private pendingResponses = new Map<string, {
    agentId: string;
    sessionId: string;
    userId: string;
    timeout?: NodeJS.Timeout;
  }>();

  constructor(chatService: ChatService, config?: AgentBridgeConfig) {
    super();
    this.chatService = chatService;
    this.logger = defaultLogger.child('ChatAgentBridge');

    this.config = {
      templateLoader: null as any,
      messageBus: null as any,
      modelRouter: null as any,
      defaultAgentId: 'nova-default',
      responseTimeoutMs: 30000,
      maxRetries: 2,
      ...config,
    };

    this.templateLoader = this.config.templateLoader;
    this.messageBus = this.config.messageBus;
    this.modelRouter = this.config.modelRouter;

    this.setupMessageBusListener();
    this.setupChatServiceListener();
  }

  setWebSocket(chatWebSocket: ChatWebSocket): void {
    this.chatWebSocket = chatWebSocket;
  }

  // ─── Message Processing ─────────────────────────────────────────

  async handleAgentMessage(message: ChatMessage, session: ChatSession): Promise<void> {
    this.logger.info(`Processing message for agent routing`, {
      messageId: message.id,
      sessionId: session.id,
      senderId: message.senderId,
    });

    if (session.type !== ChatSessionType.UserAgent) {
      this.logger.debug(`Session ${session.id} is not a user-agent session, skipping agent routing`);
      return;
    }

    if (message.senderType === 'agent' || message.senderType === 'system') {
      this.logger.debug(`Message from ${message.senderType}, skipping agent routing`);
      return;
    }

    try {
      const agentId = await this.resolveAgent(message, session);
      await this.routeToAgent(agentId, message, session);
    } catch (err: any) {
      this.logger.error(`Failed to process agent message`, err, {
        messageId: message.id,
        sessionId: session.id,
      });
      await this.handleAgentError(err, session.id, message.senderId);
    }
  }

  private async resolveAgent(message: ChatMessage, session: ChatSession): Promise<string> {
    if (this.templateLoader) {
      try {
        const match = await this.templateLoader.findTemplate(message.content, {
          sessionId: session.id,
          participants: session.participants,
          metadata: session.metadata,
        });

        if (match) {
          this.logger.debug(`Template matched: ${match.templateId} (confidence: ${match.confidence})`);
          return match.metadata?.agentId as string ?? this.config.defaultAgentId;
        }
      } catch (err: any) {
        this.logger.warn(`Template matching failed, using default agent`, err);
      }
    }

    if (session.metadata?.agentId) {
      return session.metadata.agentId as string;
    }

    return this.config.defaultAgentId;
  }

  private async routeToAgent(agentId: string, message: ChatMessage, session: ChatSession): Promise<void> {
    const agentMessage: AgentMessage = {
      agentId,
      content: message.content,
      sessionId: session.id,
      timestamp: message.createdAt,
      metadata: {
        messageId: message.id,
        senderId: message.senderId,
        sessionType: session.type,
        modelId: this.modelRouter
          ? await this.modelRouter.selectModel(message.content, { sessionId: session.id })
          : undefined,
      },
    };

    if (this.messageBus) {
      this.registerPendingResponse(agentId, session.id, message.senderId);
      await this.messageBus.send(agentId, agentMessage);
    } else {
      this.logger.warn(`No message bus configured, simulating agent response for ${agentId}`);
      await this.simulateAgentResponse(agentId, message, session);
    }
  }

  private registerPendingResponse(agentId: string, sessionId: string, userId: string): void {
    const pendingKey = `${agentId}:${sessionId}`;
    const existing = this.pendingResponses.get(pendingKey);
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(() => {
      this.pendingResponses.delete(pendingKey);
      this.handleAgentError(
        { agentId, code: 'TIMEOUT', message: 'Agent response timed out', retryable: true },
        sessionId,
        userId,
      );
    }, this.config.responseTimeoutMs);

    this.pendingResponses.set(pendingKey, { agentId, sessionId, userId, timeout });
  }

  // ─── Response Streaming ─────────────────────────────────────────

  streamResponse(agentId: string, sessionId: string, chunk: StreamingChunk): void {
    this.logger.debug(`Streaming response chunk`, {
      agentId,
      sessionId,
      done: chunk.done,
      contentLength: chunk.content.length,
    });

    if (!this.chatWebSocket) {
      this.logger.warn(`No WebSocket available for streaming, buffering response`);
      return;
    }

    const responseMessage: Partial<ChatMessage> & { content: string } = {
      content: chunk.content,
    };

    if (chunk.done) {
      this.finalizeAgentResponse(agentId, sessionId, chunk.content);
    } else {
      this.chatWebSocket.broadcastToSession(sessionId, 'agent:streaming' as WSEventType, {
        agentId,
        sessionId,
        content: chunk.content,
        done: false,
        metadata: chunk.metadata,
      });
    }
  }

  private finalizeAgentResponse(agentId: string, sessionId: string, fullContent: string): void {
    const pendingKey = `${agentId}:${sessionId}`;
    const pending = this.pendingResponses.get(pendingKey);

    if (pending?.timeout) {
      clearTimeout(pending.timeout);
    }
    this.pendingResponses.delete(pendingKey);

    try {
      const message = this.chatService.sendMessage({
        sessionId,
        senderId: agentId,
        senderType: 'agent',
        content: fullContent,
        type: ChatMessageType.AgentResponse,
      });

      this.emit('agent:response', { agentId, sessionId, message });
      this.logger.info(`Agent ${agentId} responded in session ${sessionId}`, {
        messageId: message.id,
        contentLength: fullContent.length,
      });
    } catch (err: any) {
      this.logger.error(`Failed to save agent response`, err, { agentId, sessionId });
    }
  }

  // ─── Error Handling ─────────────────────────────────────────────

  async handleAgentError(error: AgentError | Error, sessionId: string, userId?: string): Promise<void> {
    const agentError: AgentError = 'code' in error
      ? error
      : { agentId: 'unknown', code: 'UNKNOWN', message: error.message, retryable: false };

    this.logger.error(`Agent error in session ${sessionId}`, undefined, {
      agentId: agentError.agentId,
      code: agentError.code,
      message: agentError.message,
      retryable: agentError.retryable,
    });

    const errorMessage = `Agent Error: ${agentError.message}`;
    try {
      const message = this.chatService.sendMessage({
        sessionId,
        senderId: 'system',
        senderType: 'system',
        content: errorMessage,
        type: ChatMessageType.System,
      });

      this.emit('agent:error', { error: agentError, sessionId, message });

      if (userId && this.chatWebSocket) {
        this.chatWebSocket.sendToUser(userId, 'agent:error' as WSEventType, {
          agentId: agentError.agentId,
          code: agentError.code,
          message: agentError.message,
          retryable: agentError.retryable,
          sessionId,
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to send error message to chat`, err, { sessionId });
    }
  }

  // ─── Simulation (fallback when no message bus) ──────────────────

  private async simulateAgentResponse(agentId: string, message: ChatMessage, session: ChatSession): Promise<void> {
    const responseContent = this.generateSimulatedResponse(message.content, agentId);

    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1500));

    this.finalizeAgentResponse(agentId, session.id, responseContent);
  }

  private generateSimulatedResponse(userMessage: string, agentId: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      return `Hello! I'm ${agentId}. How can I help you today?`;
    }

    if (lowerMessage.includes('help')) {
      return `I'm here to help! Please describe what you need assistance with, and I'll do my best to support you.`;
    }

    if (lowerMessage.includes('thank')) {
      return `You're welcome! Let me know if you need anything else.`;
    }

    if (lowerMessage.includes('?')) {
      return `That's a great question. Let me think about that and provide you with a thoughtful response.`;
    }

    return `I received your message. As ${agentId}, I'm processing your request and will provide a more detailed response when the full agent system is connected.`;
  }

  // ─── Setup ──────────────────────────────────────────────────────

  private setupMessageBusListener(): void {
    if (!this.messageBus) return;

    this.messageBus.subscribe('nova-response', (message: AgentMessage) => {
      const pendingKey = `${message.agentId}:${message.sessionId}`;
      const pending = this.pendingResponses.get(pendingKey);

      if (pending) {
        this.finalizeAgentResponse(message.agentId, message.sessionId, message.content);
      }
    });
  }

  private setupChatServiceListener(): void {
    this.chatService.on('message:sent', async (message: ChatMessage) => {
      const session = this.chatService.getSession(message.sessionId);
      if (!session) return;

      if (session.type === ChatSessionType.UserAgent && message.senderType === 'user') {
        await this.handleAgentMessage(message, session);
      }
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  destroy(): void {
    for (const [, pending] of this.pendingResponses) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingResponses.clear();

    if (this.messageBus) {
      this.messageBus.unsubscribe('nova-response');
    }

    this.removeAllListeners();
  }
}
