import { EventEmitter } from 'events';
import {
  ChatSession,
  ChatMessage,
  ChatSessionType,
  ChatSessionStatus,
  ChatMessageType,
  ChatReaction,
  PaginatedMessages,
  MessageSearchResult,
  ChatTypingIndicator,
} from './chat-types';
import {
  ChatDatabase,
  CreateSessionInput,
  CreateMessageInput,
  GetMessagesOptions,
} from './chat-database';

export interface ChatServiceEvents {
  'message:sent': (message: ChatMessage) => void;
  'message:edited': (message: ChatMessage) => void;
  'message:deleted': (message: ChatMessage) => void;
  'typing:started': (indicator: ChatTypingIndicator) => void;
  'typing:stopped': (indicator: ChatTypingIndicator) => void;
  'user:online': (userId: string) => void;
  'user:offline': (userId: string) => void;
  'reaction:added': (message: ChatMessage, reaction: ChatReaction) => void;
  'reaction:removed': (message: ChatMessage, reaction: ChatReaction) => void;
}

export interface SendMessageOptions {
  sessionId: string;
  senderId: string;
  senderType: ChatMessage['senderType'];
  content: string;
  type?: ChatMessageType;
  replyTo?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  before?: string;
  after?: string;
}

export type ExportFormat = 'json' | 'csv' | 'text';

export class ChatService extends EventEmitter {
  private db: ChatDatabase;
  private typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(db?: ChatDatabase) {
    super();
    this.db = db ?? new ChatDatabase();
  }

  // ─── Session Management ─────────────────────────────────────────

  createSession(
    participants: string[],
    type: ChatSessionType,
    title?: string,
    metadata?: Record<string, unknown>,
  ): ChatSession {
    if (participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    const input: CreateSessionInput = { participants, type, title, metadata };
    const session = this.db.createSession(input);
    return session;
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.db.getSession(sessionId);
  }

  listSessions(filters?: {
    participant?: string;
    type?: ChatSessionType;
    status?: ChatSessionStatus;
  }): ChatSession[] {
    return this.db.listSessions(filters);
  }

  // ─── Message Operations ─────────────────────────────────────────

  sendMessage(options: SendMessageOptions): ChatMessage {
    const session = this.db.getSession(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }
    if (!session.participants.includes(options.senderId)) {
      throw new Error(`User ${options.senderId} is not a participant of session ${options.sessionId}`);
    }
    if (session.status === ChatSessionStatus.Archived || session.status === ChatSessionStatus.Deleted) {
      throw new Error(`Cannot send message to ${session.status} session`);
    }

    if (options.replyTo) {
      const parentMsg = this.db.getMessage(options.replyTo);
      if (!parentMsg || parentMsg.sessionId !== options.sessionId) {
        throw new Error(`Reply target ${options.replyTo} not found in this session`);
      }
    }

    const input: CreateMessageInput = {
      sessionId: options.sessionId,
      senderId: options.senderId,
      senderType: options.senderType,
      content: options.content,
      type: options.type ?? ChatMessageType.Text,
      replyTo: options.replyTo,
    };

    const message = this.db.createMessage(input);
    this.emit('message:sent', message);
    return message;
  }

  editMessage(messageId: string, userId: string, newContent: string): ChatMessage {
    if (!newContent || newContent.trim().length === 0) {
      throw new Error('New content cannot be empty');
    }

    const message = this.db.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    if (message.senderId !== userId) {
      throw new Error('Only the sender can edit their message');
    }
    if (message.deletedAt) {
      throw new Error('Cannot edit a deleted message');
    }

    const updated = this.db.updateMessage(messageId, { content: newContent });
    if (!updated) {
      throw new Error('Failed to update message');
    }

    this.emit('message:edited', updated);
    return updated;
  }

  deleteMessage(messageId: string, userId: string): boolean {
    const message = this.db.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    if (message.senderId !== userId) {
      throw new Error('Only the sender can delete their message');
    }

    const deleted = this.db.deleteMessage(messageId);
    if (deleted) {
      const updated = this.db.getMessage(messageId);
      if (updated) {
        this.emit('message:deleted', updated);
      }
    }
    return deleted;
  }

  replyToMessage(
    messageId: string,
    senderId: string,
    senderType: ChatMessage['senderType'],
    content: string,
  ): ChatMessage {
    const parent = this.db.getMessage(messageId);
    if (!parent) {
      throw new Error(`Message ${messageId} not found`);
    }

    const session = this.db.getSession(parent.sessionId);
    if (!session) {
      throw new Error(`Session for message ${messageId} not found`);
    }
    if (!session.participants.includes(senderId)) {
      throw new Error(`User ${senderId} is not a participant of this session`);
    }

    const input: CreateMessageInput = {
      sessionId: parent.sessionId,
      senderId,
      senderType,
      content,
      type: ChatMessageType.Text,
      replyTo: messageId,
    };

    const message = this.db.createMessage(input);
    this.emit('message:sent', message);
    return message;
  }

  // ─── Reactions ──────────────────────────────────────────────────

  addReaction(messageId: string, userId: string, emoji: string): { message: ChatMessage; action: 'added' | 'removed' } {
    const message = this.db.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const hasReaction = message.reactions.some(
      (r) => r.userId === userId && r.emoji === emoji,
    );

    let updatedMessage: ChatMessage | undefined;
    let reaction: ChatReaction | undefined;

    if (hasReaction) {
      reaction = message.reactions.find((r) => r.userId === userId && r.emoji === emoji)!;
      updatedMessage = this.db.removeReaction(messageId, userId, emoji);
      if (updatedMessage) {
        this.emit('reaction:removed', updatedMessage, reaction);
      }
      return { message: updatedMessage ?? message, action: 'removed' };
    } else {
      updatedMessage = this.db.addReaction(messageId, userId, emoji);
      if (updatedMessage) {
        const newReaction = updatedMessage.reactions.find(
          (r) => r.userId === userId && r.emoji === emoji,
        )!;
        this.emit('reaction:added', updatedMessage, newReaction);
        reaction = newReaction;
      }
      return { message: updatedMessage ?? message, action: 'added', };
    }
  }

  // ─── Read Receipts ──────────────────────────────────────────────

  markAsRead(sessionId: string, userId: string, messageIds?: string[]): number {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (!session.participants.includes(userId)) {
      throw new Error(`User ${userId} is not a participant of session ${sessionId}`);
    }

    return this.db.markAsRead(sessionId, userId, messageIds);
  }

  getUnreadCounts(userId: string): Map<string, number> {
    const sessions = this.db.listSessions({ participant: userId });
    const counts = new Map<string, number>();

    for (const session of sessions) {
      const count = this.db.getUnreadCount(session.id, userId);
      if (count > 0) {
        counts.set(session.id, count);
      }
    }

    return counts;
  }

  // ─── Messages Retrieval ─────────────────────────────────────────

  getMessages(sessionId: string, pagination?: PaginationOptions): PaginatedMessages {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const options: GetMessagesOptions = {
      limit: pagination?.limit ?? 50,
      offset: pagination?.offset ?? 0,
      before: pagination?.before,
      after: pagination?.after,
    };

    return this.db.getMessagesBySession(sessionId, options);
  }

  searchMessages(query: string, userId: string, sessionId?: string): MessageSearchResult[] {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    let results = this.db.searchMessages(query);

    if (sessionId) {
      results = results.filter((r) => r.message.sessionId === sessionId);
    }

    const userSessions = new Set(
      this.db.listSessions({ participant: userId }).map((s) => s.id),
    );
    results = results.filter((r) => userSessions.has(r.message.sessionId));

    return results;
  }

  // ─── Typing Indicators ──────────────────────────────────────────

  typingStart(sessionId: string, userId: string): ChatTypingIndicator {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (!session.participants.includes(userId)) {
      throw new Error(`User ${userId} is not a participant of session ${sessionId}`);
    }

    this.db.setTypingIndicator(sessionId, userId, true);

    const timerKey = `${sessionId}:${userId}`;
    if (this.typingTimers.has(timerKey)) {
      clearTimeout(this.typingTimers.get(timerKey)!);
    }

    const timer = setTimeout(() => {
      this.typingStop(sessionId, userId);
      this.typingTimers.delete(timerKey);
    }, 5000);
    this.typingTimers.set(timerKey, timer);

    const indicator: ChatTypingIndicator = {
      sessionId,
      userId,
      isTyping: true,
      timestamp: new Date(),
    };
    this.emit('typing:started', indicator);
    return indicator;
  }

  typingStop(sessionId: string, userId: string): ChatTypingIndicator {
    this.db.setTypingIndicator(sessionId, userId, false);

    const timerKey = `${sessionId}:${userId}`;
    if (this.typingTimers.has(timerKey)) {
      clearTimeout(this.typingTimers.get(timerKey)!);
      this.typingTimers.delete(timerKey);
    }

    const indicator: ChatTypingIndicator = {
      sessionId,
      userId,
      isTyping: false,
      timestamp: new Date(),
    };
    this.emit('typing:stopped', indicator);
    return indicator;
  }

  getOnlineUsers(sessionId: string): string[] {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const typingUsers = this.db.getTypingUsers(sessionId);
    const onlineUserIds = new Set(typingUsers.filter((t) => t.isTyping).map((t) => t.userId));

    return session.participants.filter((p) => onlineUserIds.has(p));
  }

  // ─── Export ─────────────────────────────────────────────────────

  exportChat(sessionId: string, format: ExportFormat): string {
    const history = this.db.exportSessionHistory(sessionId);
    if (!history) {
      throw new Error(`Session ${sessionId} not found`);
    }

    switch (format) {
      case 'json':
        return this.exportAsJson(history);
      case 'csv':
        return this.exportAsCsv(history);
      case 'text':
        return this.exportAsText(history);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private exportAsJson(history: { session: ChatSession; messages: ChatMessage[] }): string {
    return JSON.stringify({
      session: history.session,
      messages: history.messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderType: m.senderType,
        content: m.content,
        type: m.type,
        replyTo: m.replyTo,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString(),
        reactions: m.reactions,
        readBy: m.readBy,
      })),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  private exportAsCsv(history: { messages: ChatMessage[] }): string {
    const header = 'id,senderId,senderType,content,type,replyTo,createdAt,editedAt';
    const rows = history.messages.map((m) => {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        m.id,
        m.senderId,
        m.senderType,
        escape(m.content),
        m.type,
        m.replyTo ?? '',
        m.createdAt.toISOString(),
        m.editedAt?.toISOString() ?? '',
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  private exportAsText(history: { session: ChatSession; messages: ChatMessage[] }): string {
    const lines: string[] = [];
    lines.push(`Chat Session: ${history.session.title ?? history.session.id}`);
    lines.push(`Type: ${history.session.type}`);
    lines.push(`Participants: ${history.session.participants.join(', ')}`);
    lines.push('---');

    for (const msg of history.messages) {
      if (msg.deletedAt) continue;
      const time = msg.createdAt.toISOString().slice(0, 19).replace('T', ' ');
      const edited = msg.editedAt ? ' (edited)' : '';
      lines.push(`[${time}] ${msg.senderId}: ${msg.content}${edited}`);
    }

    return lines.join('\n');
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  destroy(): void {
    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();
    this.removeAllListeners();
  }
}
