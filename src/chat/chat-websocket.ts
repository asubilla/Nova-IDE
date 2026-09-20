import { WebSocket } from 'ws';
import { ChatService, PaginationOptions } from './chat-service';
import {
  ChatMessage,
  ChatTypingIndicator,
  ChatSession,
  ChatMessageType,
} from './chat-types';
import { defaultLogger } from '../logging/logger';

export enum WSEventType {
  ChatSend = 'chat:send',
  ChatTyping = 'chat:typing',
  ChatRead = 'chat:read',
  ChatReaction = 'chat:reaction',
  ChatEdit = 'chat:edit',
  ChatDelete = 'chat:delete',
  ChatJoin = 'chat:join',
  ChatLeave = 'chat:leave',
  ChatPresence = 'chat:presence',

  MessageSent = 'message:sent',
  MessageEdited = 'message:edited',
  MessageDeleted = 'message:deleted',
  TypingStarted = 'typing:started',
  TypingStopped = 'typing:stopped',
  UserOnline = 'user:online',
  UserOffline = 'user:offline',
  ReactionAdded = 'reaction:added',
  ReactionRemoved = 'reaction:removed',
  Error = 'error',
  Connected = 'connected',
  PresenceChanged = 'presence:changed',
}

export interface WSPayload {
  type: WSEventType;
  data: Record<string, unknown>;
}

export interface ConnectedClient {
  userId: string;
  ws: WebSocket;
  sessionId?: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface ReconnectionState {
  userId: string;
  sessionId: string;
  lastMessageId?: string;
  timestamp: Date;
}

export class ChatWebSocket {
  private clients = new Map<string, ConnectedClient>();
  private sessionClients = new Map<string, Set<string>>();
  private chatService: ChatService;
  private logger: typeof defaultLogger;
  private pingIntervals = new Map<string, NodeJS.Timeout>();
  private reconnectionStates = new Map<string, ReconnectionState>();

  constructor(chatService: ChatService) {
    this.chatService = chatService;
    this.logger = defaultLogger.child('ChatWebSocket');
    this.setupServiceListeners();
  }

  // ─── Connection Management ──────────────────────────────────────

  handleConnection(ws: WebSocket, userId: string, sessionId?: string): void {
    const existing = this.clients.get(userId);
    if (existing) {
      this.logger.warn(`User ${userId} reconnecting, closing previous connection`);
      this.handleDisconnect(userId);
    }

    const client: ConnectedClient = {
      userId,
      ws,
      sessionId,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(userId, client);

    if (sessionId) {
      this.joinSession(userId, sessionId);
    }

    this.startPingInterval(userId);

    this.sendToClient(client, {
      type: WSEventType.Connected,
      data: { userId, sessionId, timestamp: new Date().toISOString() },
    });

    this.broadcastPresence(userId, 'online');

    this.logger.info(`User ${userId} connected`, { sessionId });

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString()) as WSPayload;
        this.handleMessage(userId, payload);
      } catch (err) {
        this.sendError(userId, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(userId);
    });

    ws.on('error', (err) => {
      this.logger.error(`WebSocket error for user ${userId}`, err as Error);
      this.handleDisconnect(userId);
    });

    ws.on('pong', () => {
      client.lastPing = new Date();
    });
  }

  handleDisconnect(userId: string): void {
    const client = this.clients.get(userId);
    if (!client) return;

    if (client.sessionId) {
      this.saveReconnectionState(userId, client.sessionId);
    }

    if (client.sessionId) {
      this.leaveSession(userId, client.sessionId);
    }

    const pingInterval = this.pingIntervals.get(userId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(userId);
    }

    this.clients.delete(userId);
    this.broadcastPresence(userId, 'offline');

    this.logger.info(`User ${userId} disconnected`);
  }

  // ─── Message Handling ───────────────────────────────────────────

  private handleMessage(userId: string, payload: WSPayload): void {
    const { type, data } = payload;

    switch (type) {
      case WSEventType.ChatSend:
        this.handleChatSend(userId, data);
        break;
      case WSEventType.ChatTyping:
        this.handleChatTyping(userId, data);
        break;
      case WSEventType.ChatRead:
        this.handleChatRead(userId, data);
        break;
      case WSEventType.ChatReaction:
        this.handleChatReaction(userId, data);
        break;
      case WSEventType.ChatEdit:
        this.handleChatEdit(userId, data);
        break;
      case WSEventType.ChatDelete:
        this.handleChatDelete(userId, data);
        break;
      case WSEventType.ChatJoin:
        this.handleChatJoin(userId, data);
        break;
      case WSEventType.ChatLeave:
        this.handleChatLeave(userId, data);
        break;
      case WSEventType.ChatPresence:
        this.handleChatPresence(userId, data);
        break;
      default:
        this.sendError(userId, `Unknown event type: ${type}`);
    }
  }

  private handleChatSend(userId: string, data: Record<string, unknown>): void {
    const { sessionId, content, type, replyTo } = data;

    if (!sessionId || typeof sessionId !== 'string') {
      return this.sendError(userId, 'sessionId is required');
    }
    if (!content || typeof content !== 'string') {
      return this.sendError(userId, 'content is required');
    }

    try {
      const message = this.chatService.sendMessage({
        sessionId,
        senderId: userId,
        senderType: 'user',
        content,
        type: (type as ChatMessageType) ?? ChatMessageType.Text,
        replyTo: replyTo as string | undefined,
      });

      this.broadcast(sessionId, WSEventType.MessageSent, this.serializeMessage(message));
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatTyping(userId: string, data: Record<string, unknown>): void {
    const { sessionId, isTyping } = data;

    if (!sessionId || typeof sessionId !== 'string') {
      return this.sendError(userId, 'sessionId is required');
    }

    try {
      if (isTyping === false) {
        const indicator = this.chatService.typingStop(sessionId, userId);
        this.broadcastToSession(sessionId, WSEventType.TypingStopped, {
          userId,
          sessionId,
          timestamp: indicator.timestamp.toISOString(),
        }, userId);
      } else {
        const indicator = this.chatService.typingStart(sessionId, userId);
        this.broadcastToSession(sessionId, WSEventType.TypingStarted, {
          userId,
          sessionId,
          timestamp: indicator.timestamp.toISOString(),
        }, userId);
      }
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatRead(userId: string, data: Record<string, unknown>): void {
    const { sessionId, messageIds } = data;

    if (!sessionId || typeof sessionId !== 'string') {
      return this.sendError(userId, 'sessionId is required');
    }

    try {
      const count = this.chatService.markAsRead(sessionId, userId, messageIds as string[] | undefined);

      this.broadcastToSession(sessionId, WSEventType.ChatRead, {
        userId,
        sessionId,
        markedCount: count,
        messageIds: messageIds ?? 'all',
      }, userId);
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatReaction(userId: string, data: Record<string, unknown>): void {
    const { messageId, emoji } = data;

    if (!messageId || typeof messageId !== 'string') {
      return this.sendError(userId, 'messageId is required');
    }
    if (!emoji || typeof emoji !== 'string') {
      return this.sendError(userId, 'emoji is required');
    }

    try {
      const result = this.chatService.addReaction(messageId, userId, emoji);
      const eventType = result.action === 'added' ? WSEventType.ReactionAdded : WSEventType.ReactionRemoved;

      const session = this.chatService.getSession(result.message.sessionId);
      if (session) {
        this.broadcastToSession(session.id, eventType, {
          messageId,
          userId,
          emoji,
          action: result.action,
          message: this.serializeMessage(result.message),
        });
      }
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatEdit(userId: string, data: Record<string, unknown>): void {
    const { messageId, content } = data;

    if (!messageId || typeof messageId !== 'string') {
      return this.sendError(userId, 'messageId is required');
    }
    if (!content || typeof content !== 'string') {
      return this.sendError(userId, 'content is required');
    }

    try {
      const message = this.chatService.editMessage(messageId, userId, content);
      this.broadcastToSession(message.sessionId, WSEventType.MessageEdited, this.serializeMessage(message));
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatDelete(userId: string, data: Record<string, unknown>): void {
    const { messageId } = data;

    if (!messageId || typeof messageId !== 'string') {
      return this.sendError(userId, 'messageId is required');
    }

    try {
      this.chatService.deleteMessage(messageId, userId);
      const original = this.chatService.getMessages(messageId, { limit: 1, offset: 0 });
      if (original.messages.length > 0) {
        this.broadcastToSession(messageId, WSEventType.MessageDeleted, { messageId });
      }
    } catch (err: any) {
      this.sendError(userId, err.message);
    }
  }

  private handleChatJoin(userId: string, data: Record<string, unknown>): void {
    const { sessionId } = data;

    if (!sessionId || typeof sessionId !== 'string') {
      return this.sendError(userId, 'sessionId is required');
    }

    const session = this.chatService.getSession(sessionId);
    if (!session) {
      return this.sendError(userId, 'Session not found');
    }
    if (!session.participants.includes(userId)) {
      return this.sendError(userId, 'You are not a participant of this session');
    }

    this.joinSession(userId, sessionId);

    const client = this.clients.get(userId);
    if (client) {
      client.sessionId = sessionId;
    }

    this.broadcastToSession(sessionId, WSEventType.UserOnline, {
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
    }, userId);
  }

  private handleChatLeave(userId: string, data: Record<string, unknown>): void {
    const { sessionId } = data;

    if (!sessionId || typeof sessionId !== 'string') {
      return this.sendError(userId, 'sessionId is required');
    }

    this.leaveSession(userId, sessionId);

    const client = this.clients.get(userId);
    if (client && client.sessionId === sessionId) {
      client.sessionId = undefined;
    }

    this.broadcastToSession(sessionId, WSEventType.UserOffline, {
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
    }, userId);
  }

  private handleChatPresence(userId: string, data: Record<string, unknown>): void {
    const { status } = data;
    const validStatuses = ['online', 'offline', 'away'] as const;

    if (!status || !validStatuses.includes(status as any)) {
      return this.sendError(userId, `status must be one of: ${validStatuses.join(', ')}`);
    }

    this.broadcastPresence(userId, status as 'online' | 'offline' | 'away');
  }

  // ─── Broadcasting ───────────────────────────────────────────────

  broadcast(sessionId: string, event: WSEventType, data: Record<string, unknown>): void {
    const clientIds = this.sessionClients.get(sessionId);
    if (!clientIds) return;

    const payload = JSON.stringify({ type: event, data });
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  broadcastToSession(sessionId: string, event: WSEventType, data: Record<string, unknown>, excludeUserId?: string): void {
    const clientIds = this.sessionClients.get(sessionId);
    if (!clientIds) return;

    const payload = JSON.stringify({ type: event, data });
    for (const clientId of clientIds) {
      if (clientId === excludeUserId) continue;
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  sendToUser(userId: string, event: WSEventType, data: Record<string, unknown>): void {
    const client = this.clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      this.sendToClient(client, { type: event, data });
    }
  }

  broadcastPresence(userId: string, status: 'online' | 'offline' | 'away'): void {
    const payload = JSON.stringify({
      type: WSEventType.PresenceChanged,
      data: { userId, status, lastSeen: new Date().toISOString() },
    });

    for (const [_, client] of this.clients) {
      if (client.userId === userId) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  // ─── Session Management ─────────────────────────────────────────

  private joinSession(userId: string, sessionId: string): void {
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(userId);
  }

  private leaveSession(userId: string, sessionId: string): void {
    const clients = this.sessionClients.get(sessionId);
    if (clients) {
      clients.delete(userId);
      if (clients.size === 0) {
        this.sessionClients.delete(sessionId);
      }
    }
  }

  // ─── Reconnection ───────────────────────────────────────────────

  private saveReconnectionState(userId: string, sessionId: string): void {
    this.reconnectionStates.set(userId, {
      userId,
      sessionId,
      timestamp: new Date(),
    });
  }

  replayMissedMessages(userId: string, sessionId: string, lastMessageId?: string): void {
    const state = this.reconnectionStates.get(userId);
    if (!state || state.sessionId !== sessionId) return;

    let pagination: PaginationOptions = { limit: 50 };
    if (lastMessageId) {
      pagination.after = lastMessageId;
    }

    const result = this.chatService.getMessages(sessionId, pagination);
    for (const message of result.messages) {
      this.sendToUser(userId, WSEventType.MessageSent, this.serializeMessage(message));
    }

    this.reconnectionStates.delete(userId);
  }

  // ─── Ping / Keep-Alive ──────────────────────────────────────────

  private startPingInterval(userId: string): void {
    const interval = setInterval(() => {
      const client = this.clients.get(userId);
      if (!client) {
        clearInterval(interval);
        return;
      }

      const elapsed = Date.now() - client.lastPing.getTime();
      if (elapsed > 30000) {
        this.logger.warn(`User ${userId} timed out (no ping for ${elapsed}ms)`);
        client.ws.terminate();
        return;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }, 10000);

    this.pingIntervals.set(userId, interval);
  }

  // ─── Service Event Listeners ────────────────────────────────────

  private setupServiceListeners(): void {
    this.chatService.on('message:sent', (message: ChatMessage) => {
      this.broadcast(message.sessionId, WSEventType.MessageSent, this.serializeMessage(message));
    });

    this.chatService.on('message:edited', (message: ChatMessage) => {
      this.broadcast(message.sessionId, WSEventType.MessageEdited, this.serializeMessage(message));
    });

    this.chatService.on('message:deleted', (message: ChatMessage) => {
      this.broadcast(message.sessionId, WSEventType.MessageDeleted, { messageId: message.id });
    });

    this.chatService.on('typing:started', (indicator: ChatTypingIndicator) => {
      this.broadcastToSession(indicator.sessionId, WSEventType.TypingStarted, {
        userId: indicator.userId,
        sessionId: indicator.sessionId,
        timestamp: indicator.timestamp.toISOString(),
      }, indicator.userId);
    });

    this.chatService.on('typing:stopped', (indicator: ChatTypingIndicator) => {
      this.broadcastToSession(indicator.sessionId, WSEventType.TypingStopped, {
        userId: indicator.userId,
        sessionId: indicator.sessionId,
        timestamp: indicator.timestamp.toISOString(),
      }, indicator.userId);
    });

    this.chatService.on('reaction:added', (message: ChatMessage, reaction) => {
      this.broadcast(message.sessionId, WSEventType.ReactionAdded, {
        messageId: message.id,
        userId: reaction.userId,
        emoji: reaction.emoji,
        action: 'added',
        message: this.serializeMessage(message),
      });
    });

    this.chatService.on('reaction:removed', (message: ChatMessage, reaction) => {
      this.broadcast(message.sessionId, WSEventType.ReactionRemoved, {
        messageId: message.id,
        userId: reaction.userId,
        emoji: reaction.emoji,
        action: 'removed',
        message: this.serializeMessage(message),
      });
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private sendToClient(client: ConnectedClient, payload: WSPayload): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(payload));
    }
  }

  private sendError(userId: string, message: string): void {
    this.sendToUser(userId, WSEventType.Error, { message });
  }

  private serializeMessage(message: ChatMessage): Record<string, unknown> {
    return {
      id: message.id,
      sessionId: message.sessionId,
      senderId: message.senderId,
      senderType: message.senderType,
      content: message.content,
      type: message.type,
      replyTo: message.replyTo,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      editedAt: message.editedAt?.toISOString(),
      deletedAt: message.deletedAt?.toISOString(),
      readBy: message.readBy.map((r) => ({
        userId: r.userId,
        readAt: r.readAt.toISOString(),
      })),
      reactions: message.reactions.map((r) => ({
        emoji: r.emoji,
        userId: r.userId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  getConnectedUserIds(): string[] {
    return Array.from(this.clients.keys());
  }

  isUserConnected(userId: string): boolean {
    return this.clients.has(userId);
  }

  getSessionClients(sessionId: string): string[] {
    return Array.from(this.sessionClients.get(sessionId) ?? []);
  }

  destroy(): void {
    for (const interval of this.pingIntervals.values()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();

    for (const [userId, client] of this.clients) {
      client.ws.close(1000, 'Server shutting down');
    }
    this.clients.clear();
    this.sessionClients.clear();
    this.reconnectionStates.clear();
  }
}
