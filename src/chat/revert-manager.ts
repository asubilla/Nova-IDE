import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { ChatMessage, ChatSession } from './chat-types';
import { CheckpointSystem, Checkpoint, CheckpointData } from './checkpoint-system';

export enum RevertType {
  SingleMessage = 'single-message',
  MultipleMessages = 'multiple-messages',
  ToCheckpoint = 'to-checkpoint',
  LastN = 'last-n',
}

export interface RevertRecord {
  id: string;
  sessionId: string;
  type: RevertType;
  targetMessageIds?: string[];
  checkpointId?: string;
  revertCount?: number;
  userId: string;
  reason?: string;
  timestamp: Date;
  originalContent: string[];
  reverted: boolean;
  revertedAt?: Date;
}

export interface RevertPreview {
  revertId: string;
  messagesToRevert: ChatMessage[];
  messagesToKeep: ChatMessage[];
  sessionStateAfter: ChatSession;
  changesSummary: string;
}

export interface CreateRevertPointInput {
  sessionId: string;
  label?: string;
}

export interface RevertManagerEvents {
  'revert:created': (record: RevertRecord) => void;
  'revert:executed': (record: RevertRecord) => void;
  'revert:preview': (preview: RevertPreview) => void;
}

export class RevertManager extends EventEmitter {
  private revertHistory = new Map<string, RevertRecord[]>();
  private pendingReverts = new Map<string, RevertPreview>();
  private lockedSessions = new Set<string>();

  constructor(private checkpointSystem: CheckpointSystem) {
    super();
  }

  revertMessage(
    messageId: string,
    sessionId: string,
    userId: string,
    reason?: string,
  ): RevertRecord {
    this.assertSessionUnlocked(sessionId);

    const messages = this.getMessagesForSession(sessionId);
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error(`Message ${messageId} not found in session ${sessionId}`);
    }

    const originalContent = messages[messageIndex].content;

    const record: RevertRecord = {
      id: this.generateId(),
      sessionId,
      type: RevertType.SingleMessage,
      targetMessageIds: [messageId],
      userId,
      reason,
      timestamp: new Date(),
      originalContent: [originalContent],
      reverted: false,
    };

    this.storeRecord(sessionId, record);
    this.emit('revert:created', record);
    return record;
  }

  revertMessages(
    messageIds: string[],
    sessionId: string,
    userId: string,
    reason?: string,
  ): RevertRecord {
    this.assertSessionUnlocked(sessionId);

    if (messageIds.length === 0) {
      throw new Error('At least one message ID is required');
    }

    const messages = this.getMessagesForSession(sessionId);
    const originalContents: string[] = [];
    const notFound: string[] = [];

    for (const id of messageIds) {
      const msg = messages.find((m) => m.id === id);
      if (msg) {
        originalContents.push(msg.content);
      } else {
        notFound.push(id);
      }
    }

    if (notFound.length > 0) {
      throw new Error(`Messages not found: ${notFound.join(', ')}`);
    }

    const record: RevertRecord = {
      id: this.generateId(),
      sessionId,
      type: RevertType.MultipleMessages,
      targetMessageIds: [...messageIds],
      userId,
      reason,
      timestamp: new Date(),
      originalContent: originalContents,
      reverted: false,
    };

    this.storeRecord(sessionId, record);
    this.emit('revert:created', record);
    return record;
  }

  revertToCheckpoint(
    checkpointId: string,
    sessionId: string,
    userId: string,
    reason?: string,
  ): RevertRecord {
    this.assertSessionUnlocked(sessionId);

    const checkpoint = this.checkpointSystem.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    if (checkpoint.sessionId !== sessionId) {
      throw new Error('Checkpoint does not belong to this session');
    }

    const messages = this.getMessagesForSession(sessionId);
    const originalContents = messages.map((m) => m.content);

    const record: RevertRecord = {
      id: this.generateId(),
      sessionId,
      type: RevertType.ToCheckpoint,
      checkpointId,
      userId,
      reason,
      timestamp: new Date(),
      originalContent: originalContents,
      reverted: false,
    };

    this.storeRecord(sessionId, record);
    this.emit('revert:created', record);
    return record;
  }

  revertLast(
    n: number,
    sessionId: string,
    userId: string,
    reason?: string,
  ): RevertRecord {
    this.assertSessionUnlocked(sessionId);

    const messages = this.getMessagesForSession(sessionId);
    if (n > messages.length) {
      throw new Error(`Cannot revert ${n} messages: session has only ${messages.length}`);
    }

    const targetMessages = messages.slice(-n);
    const originalContents = targetMessages.map((m) => m.content);

    const record: RevertRecord = {
      id: this.generateId(),
      sessionId,
      type: RevertType.LastN,
      revertCount: n,
      targetMessageIds: targetMessages.map((m) => m.id),
      userId,
      reason,
      timestamp: new Date(),
      originalContent: originalContents,
      reverted: false,
    };

    this.storeRecord(sessionId, record);
    this.emit('revert:created', record);
    return record;
  }

  getRevertHistory(sessionId: string): RevertRecord[] {
    return [...(this.revertHistory.get(sessionId) ?? [])].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  createRevertPoint(input: CreateRevertPointInput): Checkpoint {
    const messages = this.getMessagesForSession(input.sessionId);
    const session = this.getSessionForId(input.sessionId);

    return this.checkpointSystem.createCheckpoint(
      input.sessionId,
      {
        messages,
        sessionState: session,
      },
      input.label ?? `Revert point @ ${new Date().toISOString()}`,
    );
  }

  previewRevert(revertId: string): RevertPreview {
    const record = this.findRecord(revertId);
    if (!record) {
      throw new Error(`Revert record ${revertId} not found`);
    }

    if (record.reverted) {
      throw new Error('Revert has already been executed');
    }

    const messages = this.getMessagesForSession(record.sessionId);
    const session = this.getSessionForId(record.sessionId);

    const targetIds = new Set(record.targetMessageIds ?? []);
    const messagesToRevert = messages.filter((m) => targetIds.has(m.id));
    const messagesToKeep = messages.filter((m) => !targetIds.has(m.id));

    let changesSummary: string;
    switch (record.type) {
      case RevertType.SingleMessage:
        changesSummary = `Reverting 1 message (${record.targetMessageIds?.[0]})`;
        break;
      case RevertType.MultipleMessages:
        changesSummary = `Reverting ${record.targetMessageIds?.length} messages`;
        break;
      case RevertType.ToCheckpoint:
        changesSummary = `Reverting to checkpoint ${record.checkpointId}`;
        break;
      case RevertType.LastN:
        changesSummary = `Reverting last ${record.revertCount} messages`;
        break;
    }

    const preview: RevertPreview = {
      revertId,
      messagesToRevert,
      messagesToKeep,
      sessionStateAfter: { ...session },
      changesSummary,
    };

    this.pendingReverts.set(revertId, preview);
    this.emit('revert:preview', preview);
    return preview;
  }

  confirmRevert(revertId: string): RevertRecord {
    const record = this.findRecord(revertId);
    if (!record) {
      throw new Error(`Revert record ${revertId} not found`);
    }

    if (record.reverted) {
      throw new Error('Revert has already been executed');
    }

    this.assertSessionUnlocked(record.sessionId);

    record.reverted = true;
    record.revertedAt = new Date();
    this.pendingReverts.delete(revertId);

    this.emit('revert:executed', record);
    return record;
  }

  lockSession(sessionId: string): void {
    this.lockedSessions.add(sessionId);
  }

  unlockSession(sessionId: string): void {
    this.lockedSessions.delete(sessionId);
  }

  isSessionLocked(sessionId: string): boolean {
    return this.lockedSessions.has(sessionId);
  }

  getPendingReverts(sessionId: string): RevertPreview[] {
    const records = this.revertHistory.get(sessionId) ?? [];
    return records
      .filter((r) => !r.reverted && this.pendingReverts.has(r.id))
      .map((r) => this.pendingReverts.get(r.id)!)
      .filter((p): p is RevertPreview => p !== undefined);
  }

  destroy(): void {
    this.revertHistory.clear();
    this.pendingReverts.clear();
    this.lockedSessions.clear();
    this.removeAllListeners();
  }

  // ─── Internal ────────────────────────────────────────────────────

  private assertSessionUnlocked(sessionId: string): void {
    if (this.lockedSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is locked and cannot be reverted`);
    }
  }

  private storeRecord(sessionId: string, record: RevertRecord): void {
    const records = this.revertHistory.get(sessionId) ?? [];
    records.push(record);
    this.revertHistory.set(sessionId, records);
  }

  private findRecord(revertId: string): RevertRecord | undefined {
    for (const records of Array.from(this.revertHistory.values())) {
      const found = records.find((r: RevertRecord) => r.id === revertId);
      if (found) return found;
    }
    return undefined;
  }

  private getMessagesForSession(sessionId: string): ChatMessage[] {
    const cp = this.checkpointSystem.listCheckpoints(sessionId);
    if (cp.length > 0) {
      const latest = cp[cp.length - 1];
      return latest.messages;
    }
    return [];
  }

  private getSessionForId(sessionId: string): ChatSession {
    const cp = this.checkpointSystem.listCheckpoints(sessionId);
    if (cp.length > 0) {
      const latest = cp[cp.length - 1];
      return latest.sessionState;
    }
    throw new Error(`No session data found for ${sessionId}`);
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
