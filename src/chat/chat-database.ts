import { randomUUID } from 'crypto';
import {
  ChatSession,
  ChatMessage,
  ChatAttachment,
  ChatTypingIndicator,
  ChatPresence,
  ChatSessionStatus,
  ChatMessageType,
  PaginatedMessages,
  MessageSearchResult,
} from './chat-types';

export interface CreateSessionInput {
  participants: string[];
  type: ChatSession['type'];
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  sessionId: string;
  senderId: string;
  senderType: ChatMessage['senderType'];
  content: string;
  type: ChatMessageType;
  replyTo?: string;
}

export interface CreateAttachmentInput {
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
}

export interface GetMessagesOptions {
  limit: number;
  offset: number;
  before?: string;
  after?: string;
}

export class ChatDatabase {
  private sessions = new Map<string, ChatSession>();
  private messages = new Map<string, ChatMessage>();
  private attachments = new Map<string, ChatAttachment>();
  private typingIndicators = new Map<string, ChatTypingIndicator>();
  private presence = new Map<string, ChatPresence>();
  private sessionMessagesIndex = new Map<string, string[]>();

  // ─── Sessions ───────────────────────────────────────────────────

  createSession(input: CreateSessionInput): ChatSession {
    const now = new Date();
    const session: ChatSession = {
      id: randomUUID(),
      participants: input.participants,
      type: input.type,
      status: ChatSessionStatus.Active,
      title: input.title,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.sessionMessagesIndex.set(session.id, []);
    return session;
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(filters?: {
    participant?: string;
    type?: ChatSession['type'];
    status?: ChatSessionStatus;
  }): ChatSession[] {
    let results = Array.from(this.sessions.values());
    if (filters?.participant) {
      results = results.filter((s) => s.participants.includes(filters.participant!));
    }
    if (filters?.type) {
      results = results.filter((s) => s.type === filters.type);
    }
    if (filters?.status) {
      results = results.filter((s) => s.status === filters.status);
    }
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  updateSession(id: string, updates: Partial<Omit<ChatSession, 'id' | 'createdAt'>>): ChatSession | undefined {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.sessions.set(id, updated);
    return updated;
  }

  deleteSession(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) {
      this.sessionMessagesIndex.delete(id);
      for (const [msgId, msg] of this.messages) {
        if (msg.sessionId === id) {
          this.messages.delete(msgId);
        }
      }
    }
    return existed;
  }

  // ─── Messages ───────────────────────────────────────────────────

  createMessage(input: CreateMessageInput): ChatMessage {
    const now = new Date();
    const message: ChatMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      senderId: input.senderId,
      senderType: input.senderType,
      content: input.content,
      type: input.type,
      replyTo: input.replyTo,
      createdAt: now,
      updatedAt: now,
      readBy: [],
      reactions: [],
    };
    this.messages.set(message.id, message);
    const index = this.sessionMessagesIndex.get(input.sessionId) ?? [];
    index.push(message.id);
    this.sessionMessagesIndex.set(input.sessionId, index);
    this.touchSession(input.sessionId);
    return message;
  }

  getMessage(id: string): ChatMessage | undefined {
    return this.messages.get(id);
  }

  getMessagesBySession(sessionId: string, options: GetMessagesOptions): PaginatedMessages {
    const index = this.sessionMessagesIndex.get(sessionId) ?? [];
    let allMessages = index
      .map((id) => this.messages.get(id))
      .filter((m): m is ChatMessage => m !== undefined)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (options.before) {
      const beforeMsg = this.messages.get(options.before);
      if (beforeMsg) {
        allMessages = allMessages.filter((m) => m.createdAt.getTime() < beforeMsg.createdAt.getTime());
      }
    }
    if (options.after) {
      const afterMsg = this.messages.get(options.after);
      if (afterMsg) {
        allMessages = allMessages.filter((m) => m.createdAt.getTime() > afterMsg.createdAt.getTime());
      }
    }

    const total = allMessages.length;
    const paginated = allMessages.slice(options.offset, options.offset + options.limit);

    return {
      messages: paginated,
      total,
      hasMore: options.offset + options.limit < total,
    };
  }

  updateMessage(id: string, updates: Partial<Pick<ChatMessage, 'content' | 'editedAt'>>): ChatMessage | undefined {
    const existing = this.messages.get(id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      editedAt: updates.content ? new Date() : existing.editedAt,
      updatedAt: new Date(),
    };
    this.messages.set(id, updated);
    return updated;
  }

  deleteMessage(id: string): boolean {
    const msg = this.messages.get(id);
    if (!msg) return false;
    const updated = { ...msg, deletedAt: new Date(), updatedAt: new Date() };
    this.messages.set(id, updated);
    return true;
  }

  // ─── Search ─────────────────────────────────────────────────────

  searchMessages(query: string, limit = 20): MessageSearchResult[] {
    const lowerQuery = query.toLowerCase();
    const results: MessageSearchResult[] = [];
    for (const msg of this.messages.values()) {
      if (msg.deletedAt) continue;
      if (msg.content.toLowerCase().includes(lowerQuery)) {
        const snippet = this.extractSnippet(msg.content, lowerQuery);
        const session = this.sessions.get(msg.sessionId);
        results.push({
          message: msg,
          sessionTitle: session?.title,
          snippet,
        });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  private extractSnippet(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(query);
    if (idx === -1) return content.slice(0, 100);
    const start = Math.max(0, idx - 40);
    const end = Math.min(content.length, idx + query.length + 40);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }

  // ─── Read Receipts ─────────────────────────────────────────────

  markAsRead(sessionId: string, userId: string, messageIds?: string[]): number {
    const ids = messageIds ?? (this.sessionMessagesIndex.get(sessionId) ?? []);
    let count = 0;
    const now = new Date();
    for (const msgId of ids) {
      const msg = this.messages.get(msgId);
      if (!msg || msg.sessionId !== sessionId) continue;
      if (msg.senderId === userId) continue;
      const alreadyRead = msg.readBy.some((r) => r.userId === userId);
      if (!alreadyRead) {
        msg.readBy.push({ userId, readAt: now });
        count++;
      }
    }
    return count;
  }

  getUnreadCount(sessionId: string, userId: string): number {
    const index = this.sessionMessagesIndex.get(sessionId) ?? [];
    let count = 0;
    for (const msgId of index) {
      const msg = this.messages.get(msgId);
      if (!msg || msg.senderId === userId || msg.deletedAt) continue;
      const read = msg.readBy.some((r) => r.userId === userId);
      if (!read) count++;
    }
    return count;
  }

  // ─── Reactions ──────────────────────────────────────────────────

  addReaction(messageId: string, userId: string, emoji: string): ChatMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;
    const existing = msg.reactions.find((r) => r.userId === userId && r.emoji === emoji);
    if (existing) return msg;
    msg.reactions.push({ emoji, userId, createdAt: new Date() });
    msg.updatedAt = new Date();
    return msg;
  }

  removeReaction(messageId: string, userId: string, emoji: string): ChatMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;
    msg.reactions = msg.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
    msg.updatedAt = new Date();
    return msg;
  }

  // ─── Attachments ────────────────────────────────────────────────

  createAttachment(input: CreateAttachmentInput): ChatAttachment {
    const attachment: ChatAttachment = {
      id: randomUUID(),
      messageId: input.messageId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      url: input.url,
      uploadedAt: new Date(),
    };
    this.attachments.set(attachment.id, attachment);
    return attachment;
  }

  getAttachment(id: string): ChatAttachment | undefined {
    return this.attachments.get(id);
  }

  getAttachmentsByMessage(messageId: string): ChatAttachment[] {
    return Array.from(this.attachments.values()).filter((a) => a.messageId === messageId);
  }

  // ─── Typing Indicators ──────────────────────────────────────────

  setTypingIndicator(sessionId: string, userId: string, isTyping: boolean): void {
    this.typingIndicators.set(`${sessionId}:${userId}`, {
      sessionId,
      userId,
      isTyping,
      timestamp: new Date(),
    });
  }

  getTypingUsers(sessionId: string): ChatTypingIndicator[] {
    const results: ChatTypingIndicator[] = [];
    for (const [key, indicator] of this.typingIndicators) {
      if (key.startsWith(`${sessionId}:`)) {
        results.push(indicator);
      }
    }
    return results.filter((i) => i.isTyping);
  }

  // ─── Presence ───────────────────────────────────────────────────

  setPresence(userId: string, status: ChatPresence['status']): void {
    this.presence.set(userId, {
      userId,
      status,
      lastSeen: new Date(),
    });
  }

  getPresence(userId: string): ChatPresence | undefined {
    return this.presence.get(userId);
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updatedAt = new Date();
    }
  }

  exportSessionHistory(sessionId: string): {
    session: ChatSession;
    messages: ChatMessage[];
    attachments: ChatAttachment[];
  } | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const index = this.sessionMessagesIndex.get(sessionId) ?? [];
    const messages = index
      .map((id) => this.messages.get(id))
      .filter((m): m is ChatMessage => m !== undefined)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const msgIds = new Set(messages.map((m) => m.id));
    const attachments = Array.from(this.attachments.values()).filter((a) => msgIds.has(a.messageId));
    return { session, messages, attachments };
  }
}
