import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatEnhanced } from '../../src/chat/chat-enhanced';
import { ChatDatabase } from '../../src/chat/chat-database';
import { ChatSessionType, ChatMessageType } from '../../src/chat/chat-types';

describe('ChatEnhanced', () => {
  let db: ChatDatabase;
  let enhanced: ChatEnhanced;

  beforeEach(() => {
    db = new ChatDatabase();
    enhanced = new ChatEnhanced({ db });
  });

  afterEach(() => {
    enhanced.destroy();
  });

  // ─── Send Message ────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should send message and create version', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Hello world');

      expect(message).toBeDefined();
      expect(message.content).toBe('Hello world');

      const versions = enhanced.getVersionHistory(message.id);
      expect(versions.length).toBe(1);
      expect(versions[0].content).toBe('Hello world');
    });

    it('should auto-mask secrets in message', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE');

      expect(message).toBeDefined();
      expect(message.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should emit secrets:detected event', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      let detected = false;
      enhanced.on('secrets:detected', () => { detected = true; });

      enhanced.sendMessage(session.id, 'user-1', 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE');
      expect(detected).toBe(true);
    });

    it('should not mask secrets when disabled', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Key: AKIAIOSFODNN7EXAMPLE', {
        maskSecrets: false,
      });

      expect(message.content).toContain('AKIAIOSFODNN7EXAMPLE');
    });
  });

  // ─── Edit Message ────────────────────────────────────────────────

  describe('editMessage', () => {
    it('should edit message and create new version', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Original');
      const edited = enhanced.editMessage(message.id, 'user-1', 'Edited content');

      expect(edited.content).toBe('Edited content');

      const versions = enhanced.getVersionHistory(message.id);
      expect(versions.length).toBe(2);
      expect(versions[1].content).toBe('Edited content');
    });

    it('should detect secrets in edited content', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Original');

      let detected = false;
      enhanced.on('secrets:detected', () => { detected = true; });

      enhanced.editMessage(message.id, 'user-1', 'New key: aws_access_key_id=AKIAIOSFODNN7EXAMPLE');

      expect(detected).toBe(true);
    });
  });

  // ─── Revert Message ──────────────────────────────────────────────

  describe('revertMessage', () => {
    it('should create revert record', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      enhanced.createCheckpoint(session.id, 'Initial');

      const message = enhanced.sendMessage(session.id, 'user-1', 'Test message');

      const record = enhanced.revertMessage(message.id, 'user-1', {
        reason: 'Test revert',
      });

      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.reason).toBe('Test revert');
    });

    it('should emit message:reverted event', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      enhanced.createCheckpoint(session.id, 'Initial');

      const message = enhanced.sendMessage(session.id, 'user-1', 'Test');

      let emitted = false;
      enhanced.on('message:reverted', () => { emitted = true; });

      enhanced.revertMessage(message.id, 'user-1');
      expect(emitted).toBe(true);
    });
  });

  // ─── Revert to Checkpoint ────────────────────────────────────────

  describe('revertToCheckpoint', () => {
    it('should revert to checkpoint', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const cp = enhanced.createCheckpoint(session.id, 'Before changes');
      const record = enhanced.revertToCheckpoint(cp.id, 'user-1');

      expect(record).toBeDefined();
      expect(record.type).toBe('to-checkpoint');
    });

    it('should throw for non-existent checkpoint', () => {
      expect(() => enhanced.revertToCheckpoint('nonexistent', 'user-1')).toThrow();
    });
  });

  // ─── Diff ────────────────────────────────────────────────────────

  describe('getDiff', () => {
    it('should compute diff between versions', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Line 1');
      enhanced.editMessage(message.id, 'user-1', 'Line 1\nLine 2');

      const diff = enhanced.getDiff(message.id);
      expect(diff).toBeDefined();
      expect(diff!.stats.addedLines).toBeGreaterThan(0);
    });

    it('should return undefined when less than 2 versions', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'Only one version');
      const diff = enhanced.getDiff(message.id);
      expect(diff).toBeUndefined();
    });
  });

  // ─── Version History ─────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('should return version history', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const message = enhanced.sendMessage(session.id, 'user-1', 'v1');
      enhanced.editMessage(message.id, 'user-1', 'v2');
      enhanced.editMessage(message.id, 'user-1', 'v3');

      const versions = enhanced.getVersionHistory(message.id);
      expect(versions.length).toBe(3);
    });
  });

  // ─── Summary ─────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('should generate session summary', () => {
      const session = db.createSession({
        participants: ['user-1', 'user-2'],
        type: ChatSessionType.UserAgent,
      });

      enhanced.sendMessage(session.id, 'user-1', 'Hello, how are you?');
      enhanced.sendMessage(session.id, 'user-2', 'I am doing well, thanks!');

      const summary = enhanced.getSummary(session.id);
      expect(summary).toBeDefined();
      expect(summary.messageCount).toBe(2);
    });
  });

  // ─── Secrets ─────────────────────────────────────────────────────

  describe('searchSecrets', () => {
    it('should find secrets in session', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      enhanced.sendMessage(session.id, 'user-1', 'Normal message');
      enhanced.sendMessage(session.id, 'user-1', 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE', { maskSecrets: false });

      const secrets = enhanced.searchSecrets(session.id);
      expect(secrets.length).toBeGreaterThan(0);
    });
  });

  // ─── Export ───────────────────────────────────────────────────────

  describe('exportChat', () => {
    it('should export chat', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
        title: 'Export Test',
      });

      enhanced.sendMessage(session.id, 'user-1', 'Export this');

      const result = enhanced.exportChat(session.id, 'json');
      const parsed = JSON.parse(result);
      expect(parsed.session).toBeDefined();
      expect(parsed.messages.length).toBe(1);
    });
  });

  // ─── Checkpoints ─────────────────────────────────────────────────

  describe('checkpoints', () => {
    it('should create checkpoint', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const cp = enhanced.createCheckpoint(session.id, 'Test checkpoint');
      expect(cp).toBeDefined();
      expect(cp.label).toBe('Test checkpoint');
    });

    it('should list checkpoints', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      enhanced.createCheckpoint(session.id, 'CP 1');
      enhanced.createCheckpoint(session.id, 'CP 2');

      const checkpoints = enhanced.listCheckpoints(session.id);
      expect(checkpoints.length).toBe(2);
    });

    it('should restore checkpoint', () => {
      const session = db.createSession({
        participants: ['user-1'],
        type: ChatSessionType.UserAgent,
      });

      const cp = enhanced.createCheckpoint(session.id, 'Restore point');
      const data = enhanced.restoreCheckpoint(cp.id);

      expect(data).toBeDefined();
      expect(data.messages).toBeDefined();
    });
  });

  // ─── Threads ──────────────────────────────────────────────────────

  describe('getThreads', () => {
    it('should find thread root messages', () => {
      const session = db.createSession({
        participants: ['user-1', 'user-2'],
        type: ChatSessionType.UserAgent,
      });

      const msg1 = enhanced.sendMessage(session.id, 'user-1', 'Root message');
      enhanced.sendMessage(session.id, 'user-2', 'Reply', { replyTo: msg1.id });

      const threads = enhanced.getThreads(session.id);
      expect(threads.length).toBe(1);
      expect(threads[0].id).toBe(msg1.id);
    });
  });

  // ─── Cleanup ──────────────────────────────────────────────────────

  describe('destroy', () => {
    it('should clean up all resources', () => {
      enhanced.on('test', () => {});
      enhanced.destroy();
      expect(enhanced.listenerCount('test')).toBe(0);
    });
  });
});
