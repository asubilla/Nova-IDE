import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatService, SendMessageOptions, PaginationOptions } from '../../src/chat/chat-service';
import { ChatDatabase } from '../../src/chat/chat-database';
import {
  ChatSessionType,
  ChatSessionStatus,
  ChatMessageType,
} from '../../src/chat/chat-types';

describe('ChatService', () => {
  let db: ChatDatabase;
  let service: ChatService;

  beforeEach(() => {
    db = new ChatDatabase();
    service = new ChatService(db);
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Session Management', () => {
    it('should create session with valid participants', () => {
      const session = service.createSession(
        ['user-1', 'user-2'],
        ChatSessionType.UserAgent,
        'Test Session',
      );

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.participants).toEqual(['user-1', 'user-2']);
      expect(session.type).toBe(ChatSessionType.UserAgent);
      expect(session.status).toBe(ChatSessionStatus.Active);
      expect(session.title).toBe('Test Session');
    });

    it('should throw on empty participants', () => {
      expect(() => service.createSession([], ChatSessionType.Group)).toThrow('At least one participant is required');
    });

    it('should get session by id', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      const retrieved = service.getSession(session.id);
      expect(retrieved?.id).toBe(session.id);
    });

    it('should list sessions with filters', () => {
      service.createSession(['user-1'], ChatSessionType.UserAgent);
      service.createSession(['user-1', 'user-2'], ChatSessionType.Group);
      service.createSession(['user-2'], ChatSessionType.UserAgent);

      const user1Sessions = service.listSessions({ participant: 'user-1' });
      expect(user1Sessions.length).toBe(2);

      const groupSessions = service.listSessions({ type: ChatSessionType.Group });
      expect(groupSessions.length).toBe(1);
    });
  });

  describe('Message Operations', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should send message to session', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Hello, world!',
      });

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.sessionId).toBe(session.id);
      expect(message.senderId).toBe('user-1');
      expect(message.content).toBe('Hello, world!');
      expect(message.type).toBe(ChatMessageType.Text);
      expect(message.readBy).toEqual([]);
      expect(message.reactions).toEqual([]);
    });

    it('should throw when sending to non-existent session', () => {
      expect(() =>
        service.sendMessage({
          sessionId: 'non-existent',
          senderId: 'user-1',
          senderType: 'user',
          content: 'Hello',
        }),
      ).toThrow('not found');
    });

    it('should throw when non-participant sends message', () => {
      expect(() =>
        service.sendMessage({
          sessionId: session.id,
          senderId: 'user-3',
          senderType: 'user',
          content: 'Intruder!',
        }),
      ).toThrow('not a participant');
    });

    it('should throw when sending to archived session', () => {
      db.updateSession(session.id, { status: ChatSessionStatus.Archived });
      expect(() =>
        service.sendMessage({
          sessionId: session.id,
          senderId: 'user-1',
          senderType: 'user',
          content: 'Hello',
        }),
      ).toThrow('archived');
    });

    it('should emit message:sent event', () => {
      let received = false;
      service.on('message:sent', () => { received = true; });
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Test event',
      });
      expect(received).toBe(true);
    });
  });

  describe('Reply to Message', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should reply to message', () => {
      const original = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Original message',
      });

      const reply = service.replyToMessage(original.id, 'user-2', 'user', 'Reply content');

      expect(reply.replyTo).toBe(original.id);
      expect(reply.content).toBe('Reply content');
      expect(reply.sessionId).toBe(session.id);
    });

    it('should throw when replying to non-existent message', () => {
      expect(() =>
        service.replyToMessage('non-existent', 'user-1', 'user', 'Reply'),
      ).toThrow('not found');
    });
  });

  describe('Edit Message', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should edit message (only sender)', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Original',
      });

      const edited = service.editMessage(message.id, 'user-1', 'Edited content');
      expect(edited.content).toBe('Edited content');
      expect(edited.editedAt).toBeDefined();
    });

    it('should throw when other user tries to edit', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Original',
      });

      expect(() => service.editMessage(message.id, 'user-2', 'Hacked')).toThrow('Only the sender can edit');
    });

    it('should throw when editing deleted message', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'To delete',
      });
      service.deleteMessage(message.id, 'user-1');

      expect(() => service.editMessage(message.id, 'user-1', 'Edit')).toThrow('deleted');
    });

    it('should throw when editing with empty content', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Original',
      });

      expect(() => service.editMessage(message.id, 'user-1', '')).toThrow('empty');
    });
  });

  describe('Delete Message', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should delete message (only sender)', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'To delete',
      });

      const result = service.deleteMessage(message.id, 'user-1');
      expect(result).toBe(true);

      const deleted = db.getMessage(message.id);
      expect(deleted?.deletedAt).toBeDefined();
    });

    it('should throw when other user tries to delete', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Not yours',
      });

      expect(() => service.deleteMessage(message.id, 'user-2')).toThrow('Only the sender can delete');
    });

    it('should emit message:deleted event', () => {
      let receivedEvent = false;
      service.on('message:deleted', () => { receivedEvent = true; });
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Gone',
      });
      service.deleteMessage(message.id, 'user-1');
      expect(receivedEvent).toBe(true);
    });
  });

  describe('Reactions', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should add reaction', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'React to me',
      });

      const result = service.addReaction(message.id, 'user-1', '👍');
      expect(result.action).toBe('added');
      expect(result.message.reactions.length).toBe(1);
      expect(result.message.reactions[0].emoji).toBe('👍');
    });

    it('should remove reaction on second call (toggle)', () => {
      const message = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Toggle reaction',
      });

      service.addReaction(message.id, 'user-1', '❤️');
      const result = service.addReaction(message.id, 'user-1', '❤️');
      expect(result.action).toBe('removed');
    });

    it('should throw when reacting to non-existent message', () => {
      expect(() => service.addReaction('non-existent', 'user-1', '👍')).toThrow('not found');
    });
  });

  describe('Read Receipts', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should mark messages as read', () => {
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Read me',
      });
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Read me too',
      });

      const count = service.markAsRead(session.id, 'user-2');
      expect(count).toBe(2);
    });

    it('should get unread counts', () => {
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Unread 1',
      });
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Unread 2',
      });

      const counts = service.getUnreadCounts('user-2');
      expect(counts.get(session.id)).toBe(2);
    });

    it('should not count own messages as unread', () => {
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'My message',
      });

      const counts = service.getUnreadCounts('user-1');
      expect(counts.has(session.id)).toBe(false);
    });
  });

  describe('Search Messages', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Find this unique keyword xyz',
      });
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-2',
        senderType: 'user',
        content: 'Another message',
      });
    });

    it('should search messages by query', () => {
      const results = service.searchMessages('unique keyword', 'user-1');
      expect(results.length).toBe(1);
      expect(results[0].message.content).toContain('unique keyword');
    });

    it('should return empty for no matches', () => {
      const results = service.searchMessages('zzzznotfound', 'user-1');
      expect(results.length).toBe(0);
    });

    it('should throw on empty query', () => {
      expect(() => service.searchMessages('', 'user-1')).toThrow('empty');
    });

    it('should only return messages from user sessions', () => {
      const otherSession = service.createSession(['user-3', 'user-4'], ChatSessionType.UserAgent);
      service.sendMessage({
        sessionId: otherSession.id,
        senderId: 'user-3',
        senderType: 'user',
        content: 'Has unique keyword xyz',
      });

      const results = service.searchMessages('unique keyword', 'user-1');
      expect(results.length).toBe(1);
      expect(results[0].message.sessionId).toBe(session.id);
    });
  });

  describe('Typing Indicators', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
    });

    it('should start typing indicator', () => {
      const indicator = service.typingStart(session.id, 'user-1');
      expect(indicator.isTyping).toBe(true);
      expect(indicator.userId).toBe('user-1');
      expect(indicator.sessionId).toBe(session.id);
    });

    it('should stop typing indicator', () => {
      service.typingStart(session.id, 'user-1');
      const indicator = service.typingStop(session.id, 'user-1');
      expect(indicator.isTyping).toBe(false);
    });

    it('should get online users from typing', () => {
      service.typingStart(session.id, 'user-1');
      const online = service.getOnlineUsers(session.id);
      expect(online).toContain('user-1');
    });
  });

  describe('Paginated Messages', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      for (let i = 0; i < 10; i++) {
        service.sendMessage({
          sessionId: session.id,
          senderId: 'user-1',
          senderType: 'user',
          content: `Message ${i}`,
        });
      }
    });

    it('should get paginated messages with limit', () => {
      const result = service.getMessages(session.id, { limit: 3 });
      expect(result.messages.length).toBe(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should get paginated messages with offset', () => {
      const result = service.getMessages(session.id, { limit: 5, offset: 5 });
      expect(result.messages.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should return correct hasMore flag', () => {
      const result = service.getMessages(session.id, { limit: 10, offset: 0 });
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Export', () => {
    let session: ReturnType<ChatService['createSession']>;

    beforeEach(() => {
      session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent, 'Export Test');
      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Export this',
      });
    });

    it('should export as JSON', () => {
      const result = service.exportChat(session.id, 'json');
      const parsed = JSON.parse(result);
      expect(parsed.session).toBeDefined();
      expect(parsed.messages.length).toBe(1);
    });

    it('should export as CSV', () => {
      const result = service.exportChat(session.id, 'csv');
      expect(result).toContain('id,senderId');
      expect(result).toContain('Export this');
    });

    it('should export as text', () => {
      const result = service.exportChat(session.id, 'text');
      expect(result).toContain('Export Test');
      expect(result).toContain('Export this');
    });
  });

  describe('Cleanup', () => {
    it('should destroy and clean up timers', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      service.typingStart(session.id, 'user-1');
      service.destroy();
      expect(service.listenerCount('message:sent')).toBe(0);
    });
  });
});
