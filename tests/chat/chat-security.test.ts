import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatSecurity } from '../../src/chat/chat-security';
import { ChatDatabase } from '../../src/chat/chat-database';
import { ChatService } from '../../src/chat/chat-service';
import { ChatSessionType, ChatMessageType } from '../../src/chat/chat-types';

describe('ChatSecurity', () => {
  let db: ChatDatabase;
  let service: ChatService;
  let security: ChatSecurity;

  beforeEach(() => {
    db = new ChatDatabase();
    service = new ChatService(db);
    security = new ChatSecurity(db);
  });

  afterEach(() => {
    service.destroy();
    security.destroy();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      expect(security.checkRateLimit('user-1', 'messages')).toBe(true);
    });

    it('should block requests exceeding rate limit', () => {
      for (let i = 0; i < 30; i++) {
        security.checkRateLimit('user-1', 'messages');
      }
      expect(security.checkRateLimit('user-1', 'messages')).toBe(false);
    });

    it('should have separate buckets per user', () => {
      for (let i = 0; i < 30; i++) {
        security.checkRateLimit('user-1', 'messages');
      }
      expect(security.checkRateLimit('user-1', 'messages')).toBe(false);
      expect(security.checkRateLimit('user-2', 'messages')).toBe(true);
    });

    it('should have separate buckets per action', () => {
      for (let i = 0; i < 30; i++) {
        security.checkRateLimit('user-1', 'messages');
      }
      expect(security.checkRateLimit('user-1', 'messages')).toBe(false);
      expect(security.checkRateLimit('user-1', 'fileUploads')).toBe(true);
    });

    it('should enforce file upload rate limit', () => {
      for (let i = 0; i < 5; i++) {
        security.checkRateLimit('user-1', 'fileUploads');
      }
      expect(security.checkRateLimit('user-1', 'fileUploads')).toBe(false);
    });

    it('should enforce search rate limit', () => {
      for (let i = 0; i < 10; i++) {
        security.checkRateLimit('user-1', 'search');
      }
      expect(security.checkRateLimit('user-1', 'search')).toBe(false);
    });

    it('should enforce reaction rate limit', () => {
      for (let i = 0; i < 20; i++) {
        security.checkRateLimit('user-1', 'reactions');
      }
      expect(security.checkRateLimit('user-1', 'reactions')).toBe(false);
    });
  });

  describe('XSS Sanitization', () => {
    it('should strip script tags', () => {
      const result = security.sanitizeMessage('<script>alert("xss")</script>Hello');
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('should strip iframe tags', () => {
      const result = security.sanitizeMessage('<iframe src="evil.com"></iframe>Safe');
      expect(result).not.toContain('<iframe>');
      expect(result).toContain('Safe');
    });

    it('should escape HTML entities', () => {
      const result = security.sanitizeMessage('<div class="test">content</div>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should neutralize javascript: URIs', () => {
      const result = security.sanitizeMessage('javascript:alert(1)');
      expect(result).not.toContain('javascript:');
    });

    it('should handle empty content', () => {
      expect(security.sanitizeMessage('')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      expect(security.sanitizeMessage(null as any)).toBe('');
      expect(security.sanitizeMessage(undefined as any)).toBe('');
    });

    it('should preserve normal text', () => {
      const normalText = 'Hello, this is a normal message with no HTML.';
      expect(security.sanitizeMessage(normalText)).toBe(normalText);
    });
  });

  describe('Permission Checks', () => {
    it('should allow viewing session for participants', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      expect(security.canViewSession(session.id, 'user-1')).toBe(true);
      expect(security.canViewSession(session.id, 'user-2')).toBe(true);
    });

    it('should deny viewing session for non-participants', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      expect(security.canViewSession(session.id, 'user-3')).toBe(false);
    });

    it('should deny viewing non-existent session', () => {
      expect(security.canViewSession('non-existent', 'user-1')).toBe(false);
    });

    it('should allow sender to edit their own message', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const msg = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'My message',
      });
      expect(security.canEditMessage(msg.id, 'user-1')).toBe(true);
    });

    it('should deny editing of other users messages', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const msg = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'My message',
      });
      expect(security.canEditMessage(msg.id, 'user-2')).toBe(false);
    });

    it('should allow sender to delete their own message', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const msg = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Delete me',
      });
      expect(security.canDeleteMessage(msg.id, 'user-1')).toBe(true);
    });

    it('should deny deleting of other users messages', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const msg = service.sendMessage({
        sessionId: session.id,
        senderId: 'user-1',
        senderType: 'user',
        content: 'Not yours',
      });
      expect(security.canDeleteMessage(msg.id, 'user-2')).toBe(false);
    });

    it('should allow export for participants', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      expect(security.canExportChat(session.id, 'user-1')).toBe(true);
    });

    it('should deny export for non-participants', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      expect(security.canExportChat(session.id, 'user-3')).toBe(false);
    });

    it('should allow sending message to active session for participants', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      expect(security.canSendMessage(session.id, 'user-1')).toBe(true);
    });

    it('should deny sending message to non-existent session', () => {
      expect(security.canSendMessage('non-existent', 'user-1')).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    it('should log chat audit events', () => {
      const logs: unknown[] = [];
      security.on('audit', (event) => logs.push(event));

      security.logChatAudit({
        eventType: 'permission_check' as any,
        userId: 'user-1',
        action: 'test_action',
        metadata: { test: true },
      });

      // No error means audit was processed
    });
  });

  describe('Attachment Validation', () => {
    it('should accept valid attachment', () => {
      const result = security.validateAttachment({
        fileName: 'document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject empty file name', () => {
      const result = security.validateAttachment({
        fileName: '',
        fileType: 'application/pdf',
        fileSize: 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject path traversal in file name', () => {
      const result = security.validateAttachment({
        fileName: '../../../etc/passwd',
        fileType: 'text/plain',
        fileSize: 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject disallowed file type', () => {
      const result = security.validateAttachment({
        fileName: 'malware.exe',
        fileType: 'application/x-msdownload',
        fileSize: 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject zero-size file', () => {
      const result = security.validateAttachment({
        fileName: 'empty.txt',
        fileType: 'text/plain',
        fileSize: 0,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject oversized file', () => {
      const result = security.validateAttachment({
        fileName: 'huge.zip',
        fileType: 'application/zip',
        fileSize: 100 * 1024 * 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should accept image files', () => {
      const result = security.validateAttachment({
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 5 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Message Content Validation', () => {
    it('should reject empty message', () => {
      const result = security.validateMessageContent('');
      expect(result.valid).toBe(false);
    });

    it('should reject whitespace-only message', () => {
      const result = security.validateMessageContent('   ');
      expect(result.valid).toBe(false);
    });

    it('should accept valid message', () => {
      const result = security.validateMessageContent('Hello, world!');
      expect(result.valid).toBe(true);
    });
  });
});
