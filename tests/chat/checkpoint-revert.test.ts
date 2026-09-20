import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckpointSystem, Checkpoint } from '../../src/chat/checkpoint-system';
import { RevertManager, RevertType } from '../../src/chat/revert-manager';
import {
  ChatMessage,
  ChatSession,
  ChatSessionType,
  ChatSessionStatus,
  ChatMessageType,
} from '../../src/chat/chat-types';

function createTestMessage(sessionId: string, content: string, id?: string): ChatMessage {
  return {
    id: id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId,
    senderId: 'user-1',
    senderType: 'user',
    content,
    type: ChatMessageType.Text,
    createdAt: new Date(),
    updatedAt: new Date(),
    readBy: [],
    reactions: [],
  };
}

function createTestSession(id?: string): ChatSession {
  return {
    id: id ?? `session-${Date.now()}`,
    participants: ['user-1', 'user-2'],
    type: ChatSessionType.UserAgent,
    status: ChatSessionStatus.Active,
    title: 'Test Session',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('CheckpointSystem', () => {
  let system: CheckpointSystem;

  beforeEach(() => {
    system = new CheckpointSystem({ messageInterval: 5, timeIntervalMs: 60000 });
  });

  afterEach(() => {
    system.destroy();
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint', () => {
      const session = createTestSession('s1');
      const messages = [createTestMessage('s1', 'msg1'), createTestMessage('s1', 'msg2')];
      const cp = system.createCheckpoint('s1', { messages, sessionState: session }, 'Test');

      expect(cp).toBeDefined();
      expect(cp.id).toBeDefined();
      expect(cp.sessionId).toBe('s1');
      expect(cp.label).toBe('Test');
      expect(cp.messages.length).toBe(2);
      expect(cp.version).toBe(1);
    });

    it('should auto-generate label', () => {
      const session = createTestSession('s1');
      const cp = system.createCheckpoint('s1', { messages: [], sessionState: session });
      expect(cp.label).toContain('Checkpoint');
    });

    it('should emit checkpoint:created event', () => {
      const session = createTestSession('s1');
      let emitted = false;
      system.on('checkpoint:created', () => { emitted = true; });
      system.createCheckpoint('s1', { messages: [], sessionState: session });
      expect(emitted).toBe(true);
    });

    it('should increment version', () => {
      const session = createTestSession('s1');
      system.createCheckpoint('s1', { messages: [], sessionState: session });
      const cp2 = system.createCheckpoint('s1', { messages: [], sessionState: session });
      expect(cp2.version).toBe(2);
    });
  });

  describe('listCheckpoints', () => {
    it('should list checkpoints', () => {
      const session = createTestSession('s1');
      system.createCheckpoint('s1', { messages: [], sessionState: session }, 'First');
      system.createCheckpoint('s1', { messages: [], sessionState: session }, 'Second');
      expect(system.listCheckpoints('s1').length).toBe(2);
    });

    it('should return empty for unknown session', () => {
      expect(system.listCheckpoints('no-session').length).toBe(0);
    });
  });

  describe('restoreCheckpoint', () => {
    it('should restore checkpoint data', () => {
      const session = createTestSession('s1');
      const messages = [createTestMessage('s1', 'restored')];
      const cp = system.createCheckpoint('s1', { messages, sessionState: session });
      const data = system.restoreCheckpoint(cp.id);

      expect(data.messages.length).toBe(1);
      expect(data.messages[0].content).toBe('restored');
    });

    it('should throw for non-existent checkpoint', () => {
      expect(() => system.restoreCheckpoint('nonexistent')).toThrow('not found');
    });
  });

  describe('compareCheckpoints', () => {
    it('should compare two checkpoints', () => {
      const session = createTestSession('s1');
      const msgs1 = [createTestMessage('s1', 'a'), createTestMessage('s1', 'b')];
      const msgs2 = [createTestMessage('s1', 'a'), createTestMessage('s1', 'c')];
      const cp1 = system.createCheckpoint('s1', { messages: msgs1, sessionState: session });
      const cp2 = system.createCheckpoint('s1', { messages: msgs2, sessionState: session });

      const comp = system.compareCheckpoints(cp1.id, cp2.id);
      expect(comp).toBeDefined();
      expect(comp.messagesAdded).toBeGreaterThanOrEqual(0);
    });

    it('should throw if either checkpoint missing', () => {
      expect(() => system.compareCheckpoints('a', 'b')).toThrow();
    });
  });

  describe('autoCheckpoint', () => {
    it('should auto-checkpoint at message interval', () => {
      const session = createTestSession('s1');
      const data = { messages: [createTestMessage('s1', 'msg')], sessionState: session };
      // First call creates checkpoint (no prior time), then counter resets
      // Next 4 calls return null, 5th call triggers by-count
      system.autoCheckpoint('s1', data);
      for (let i = 0; i < 4; i++) {
        system.autoCheckpoint('s1', data);
      }
      const cp = system.autoCheckpoint('s1', data);
      expect(cp).not.toBeNull();
      expect(cp!.metadata.autoCreated).toBe(true);
    });

    it('should auto-checkpoint on first call due to no prior time', () => {
      const session = createTestSession('s1');
      const data = { messages: [createTestMessage('s1', 'msg')], sessionState: session };
      const cp = system.autoCheckpoint('s1', data);
      expect(cp).not.toBeNull();
      expect(cp!.metadata.autoCreated).toBe(true);
    });
  });

  describe('pruneOldCheckpoints', () => {
    it('should prune old checkpoints', () => {
      const session = createTestSession('s1');
      for (let i = 0; i < 5; i++) {
        system.createCheckpoint('s1', { messages: [], sessionState: session });
      }
      const deleted = system.pruneOldCheckpoints('s1', 2);
      expect(deleted).toBe(3);
      expect(system.getCheckpointCount('s1')).toBe(2);
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete checkpoint', () => {
      const session = createTestSession('s1');
      const cp = system.createCheckpoint('s1', { messages: [], sessionState: session });
      expect(system.deleteCheckpoint(cp.id)).toBe(true);
      expect(system.getCheckpointCount('s1')).toBe(0);
    });

    it('should return false for non-existent', () => {
      expect(system.deleteCheckpoint('nonexistent')).toBe(false);
    });
  });
});

describe('RevertManager', () => {
  let cpSystem: CheckpointSystem;
  let manager: RevertManager;

  beforeEach(() => {
    cpSystem = new CheckpointSystem();
    manager = new RevertManager(cpSystem);
  });

  afterEach(() => {
    manager.destroy();
    cpSystem.destroy();
  });

  function setupSession(sessionId: string, contents: string[]): void {
    const session = createTestSession(sessionId);
    const messages = contents.map((c, i) => createTestMessage(sessionId, c, `msg-${i}`));
    cpSystem.createCheckpoint(sessionId, { messages, sessionState: session });
  }

  describe('revertMessage', () => {
    it('should create revert record for single message', () => {
      setupSession('s1', ['msg1', 'msg2', 'msg3']);
      const record = manager.revertMessage('msg-1', 's1', 'user-1', 'test');

      expect(record.type).toBe(RevertType.SingleMessage);
      expect(record.targetMessageIds).toEqual(['msg-1']);
      expect(record.reason).toBe('test');
    });

    it('should emit revert:created event', () => {
      setupSession('s1', ['msg1']);
      let emitted = false;
      manager.on('revert:created', () => { emitted = true; });
      manager.revertMessage('msg-0', 's1', 'user-1');
      expect(emitted).toBe(true);
    });

    it('should throw for non-existent message', () => {
      setupSession('s1', ['msg1']);
      expect(() => manager.revertMessage('nonexistent', 's1', 'user-1')).toThrow('not found');
    });
  });

  describe('revertMessages', () => {
    it('should create revert for multiple messages', () => {
      setupSession('s1', ['msg1', 'msg2', 'msg3']);
      const record = manager.revertMessages(['msg-0', 'msg-1'], 's1', 'user-1');
      expect(record.type).toBe(RevertType.MultipleMessages);
      expect(record.targetMessageIds!.length).toBe(2);
    });

    it('should throw on empty ids', () => {
      setupSession('s1', ['msg1']);
      expect(() => manager.revertMessages([], 's1', 'user-1')).toThrow('At least one');
    });
  });

  describe('revertToCheckpoint', () => {
    it('should create revert to checkpoint', () => {
      setupSession('s1', ['msg1', 'msg2']);
      const session = createTestSession('s1');
      cpSystem.createCheckpoint('s1', { messages: [], sessionState: session }, 'Target');
      const cps = cpSystem.listCheckpoints('s1');
      const record = manager.revertToCheckpoint(cps[1].id, 's1', 'user-1');
      expect(record.type).toBe(RevertType.ToCheckpoint);
    });
  });

  describe('revertLast', () => {
    it('should revert last N messages', () => {
      setupSession('s1', ['msg1', 'msg2', 'msg3']);
      const record = manager.revertLast(2, 's1', 'user-1');
      expect(record.type).toBe(RevertType.LastN);
      expect(record.revertCount).toBe(2);
    });

    it('should throw if N > messages', () => {
      setupSession('s1', ['msg1']);
      expect(() => manager.revertLast(5, 's1', 'user-1')).toThrow('Cannot revert');
    });
  });

  describe('getRevertHistory', () => {
    it('should return history', () => {
      setupSession('s1', ['msg1', 'msg2']);
      manager.revertMessage('msg-0', 's1', 'user-1');
      manager.revertMessage('msg-1', 's1', 'user-1');
      expect(manager.getRevertHistory('s1').length).toBe(2);
    });
  });

  describe('session locking', () => {
    it('should lock and unlock sessions', () => {
      manager.lockSession('s1');
      expect(manager.isSessionLocked('s1')).toBe(true);
      manager.unlockSession('s1');
      expect(manager.isSessionLocked('s1')).toBe(false);
    });

    it('should throw on revert for locked session', () => {
      setupSession('s1', ['msg1']);
      manager.lockSession('s1');
      expect(() => manager.revertMessage('msg-0', 's1', 'user-1')).toThrow('locked');
    });
  });

  describe('confirmRevert', () => {
    it('should confirm a revert', () => {
      setupSession('s1', ['msg1']);
      const record = manager.revertMessage('msg-0', 's1', 'user-1');
      const confirmed = manager.confirmRevert(record.id);
      expect(confirmed.reverted).toBe(true);
    });

    it('should throw on double confirm', () => {
      setupSession('s1', ['msg1']);
      const record = manager.revertMessage('msg-0', 's1', 'user-1');
      manager.confirmRevert(record.id);
      expect(() => manager.confirmRevert(record.id)).toThrow('already been executed');
    });
  });
});
