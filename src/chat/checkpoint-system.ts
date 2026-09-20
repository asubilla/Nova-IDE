import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { ChatMessage, ChatSession } from './chat-types';

export interface CheckpointData {
  messages: ChatMessage[];
  sessionState: ChatSession;
  files?: Map<string, string>;
}

export interface CheckpointMetadata {
  user?: string;
  reason?: string;
  autoCreated?: boolean;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  label: string;
  timestamp: Date;
  messages: ChatMessage[];
  sessionState: ChatSession;
  files?: Map<string, string>;
  metadata: CheckpointMetadata;
  version: number;
}

export interface CheckpointComparison {
  checkpoint1Id: string;
  checkpoint2Id: string;
  messagesAdded: number;
  messagesRemoved: number;
  messagesModified: number;
  sessionStateChanged: boolean;
  filesChanged: string[];
}

export interface AutoCheckpointConfig {
  messageInterval: number;
  timeIntervalMs: number;
}

export interface CheckpointSystemEvents {
  'checkpoint:created': (checkpoint: Checkpoint) => void;
  'checkpoint:restored': (checkpoint: Checkpoint) => void;
  'checkpoint:deleted': (checkpointId: string) => void;
  'checkpoint:auto-created': (checkpoint: Checkpoint) => void;
}

const DEFAULT_AUTO_CONFIG: AutoCheckpointConfig = {
  messageInterval: 50,
  timeIntervalMs: 30 * 60 * 1000,
};

export class CheckpointSystem extends EventEmitter {
  private checkpoints = new Map<string, Checkpoint>();
  private sessionCheckpoints = new Map<string, string[]>();
  private messageCounters = new Map<string, number>();
  private lastAutoCheckpoint = new Map<string, Date>();
  private autoConfig: AutoCheckpointConfig;

  constructor(autoConfig?: Partial<AutoCheckpointConfig>) {
    super();
    this.autoConfig = { ...DEFAULT_AUTO_CONFIG, ...autoConfig };
  }

  createCheckpoint(
    sessionId: string,
    data: CheckpointData,
    label?: string,
  ): Checkpoint {
    const id = this.generateId();
    const version = this.getNextVersion(sessionId);

    const checkpoint: Checkpoint = {
      id,
      sessionId,
      label: label ?? `Checkpoint ${version} @ ${new Date().toISOString()}`,
      timestamp: new Date(),
      messages: [...data.messages],
      sessionState: { ...data.sessionState },
      files: data.files ? new Map(data.files) : undefined,
      metadata: {
        autoCreated: false,
      },
      version,
    };

    this.checkpoints.set(id, checkpoint);
    const sessionList = this.sessionCheckpoints.get(sessionId) ?? [];
    sessionList.push(id);
    this.sessionCheckpoints.set(sessionId, sessionList);

    this.emit('checkpoint:created', checkpoint);
    return checkpoint;
  }

  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  listCheckpoints(sessionId: string): Checkpoint[] {
    const ids = this.sessionCheckpoints.get(sessionId) ?? [];
    return ids
      .map((id) => this.checkpoints.get(id))
      .filter((c): c is Checkpoint => c !== undefined)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  restoreCheckpoint(checkpointId: string): CheckpointData {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    this.emit('checkpoint:restored', checkpoint);

    return {
      messages: [...checkpoint.messages],
      sessionState: { ...checkpoint.sessionState },
      files: checkpoint.files ? new Map(checkpoint.files) : undefined,
    };
  }

  deleteCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }

    this.checkpoints.delete(checkpointId);

    const sessionList = this.sessionCheckpoints.get(checkpoint.sessionId) ?? [];
    const index = sessionList.indexOf(checkpointId);
    if (index !== -1) {
      sessionList.splice(index, 1);
    }

    this.emit('checkpoint:deleted', checkpointId);
    return true;
  }

  compareCheckpoints(id1: string, id2: string): CheckpointComparison {
    const cp1 = this.checkpoints.get(id1);
    const cp2 = this.checkpoints.get(id2);

    if (!cp1 || !cp2) {
      throw new Error('Both checkpoints must exist');
    }

    const cp1MsgIds = new Set(cp1.messages.map((m) => m.id));
    const cp2MsgIds = new Set(cp2.messages.map((m) => m.id));
    const cp1MsgMap = new Map(cp1.messages.map((m) => [m.id, m]));
    const cp2MsgMap = new Map(cp2.messages.map((m) => [m.id, m]));

    let messagesAdded = 0;
    let messagesRemoved = 0;
    let messagesModified = 0;

    for (const id of Array.from(cp2MsgIds)) {
      if (!cp1MsgIds.has(id)) {
        messagesAdded++;
      } else {
        const m1 = cp1MsgMap.get(id)!;
        const m2 = cp2MsgMap.get(id)!;
        if (m1.content !== m2.content || m1.deletedAt !== m2.deletedAt) {
          messagesModified++;
        }
      }
    }

    for (const id of Array.from(cp1MsgIds)) {
      if (!cp2MsgIds.has(id)) {
        messagesRemoved++;
      }
    }

    const filesChanged: string[] = [];
    if (cp1.files || cp2.files) {
      const allFiles = new Set<string>([
        ...Array.from(cp1.files?.keys() ?? []),
        ...Array.from(cp2.files?.keys() ?? []),
      ]);
      for (const file of Array.from(allFiles)) {
        const v1 = cp1.files?.get(file);
        const v2 = cp2.files?.get(file);
        if (v1 !== v2) {
          filesChanged.push(file);
        }
      }
    }

    const sessionStateChanged =
      JSON.stringify(cp1.sessionState) !== JSON.stringify(cp2.sessionState);

    return {
      checkpoint1Id: id1,
      checkpoint2Id: id2,
      messagesAdded,
      messagesRemoved,
      messagesModified,
      sessionStateChanged,
      filesChanged,
    };
  }

  autoCheckpoint(sessionId: string, data: CheckpointData): Checkpoint | null {
    const counter = (this.messageCounters.get(sessionId) ?? 0) + 1;
    this.messageCounters.set(sessionId, counter);

    const now = new Date();
    const lastTime = this.lastAutoCheckpoint.get(sessionId);

    const byCount = counter % this.autoConfig.messageInterval === 0;
    const byTime =
      !lastTime || now.getTime() - lastTime.getTime() >= this.autoConfig.timeIntervalMs;

    if (!byCount && !byTime) {
      return null;
    }

    this.lastAutoCheckpoint.set(sessionId, now);
    this.messageCounters.set(sessionId, 0);

    const id = this.generateId();
    const version = this.getNextVersion(sessionId);

    const checkpoint: Checkpoint = {
      id,
      sessionId,
      label: `Auto-checkpoint @ ${now.toISOString()}`,
      timestamp: now,
      messages: [...data.messages],
      sessionState: { ...data.sessionState },
      files: data.files ? new Map(data.files) : undefined,
      metadata: {
        autoCreated: true,
        reason: byCount
          ? `Every ${this.autoConfig.messageInterval} messages`
          : `Every ${this.autoConfig.timeIntervalMs / 60000} minutes`,
      },
      version,
    };

    this.checkpoints.set(id, checkpoint);
    const sessionList = this.sessionCheckpoints.get(sessionId) ?? [];
    sessionList.push(id);
    this.sessionCheckpoints.set(sessionId, sessionList);

    this.emit('checkpoint:auto-created', checkpoint);
    return checkpoint;
  }

  pruneOldCheckpoints(sessionId: string, keepCount: number): number {
    const checkpointIds = this.sessionCheckpoints.get(sessionId) ?? [];
    const checkpoints = checkpointIds
      .map((id) => this.checkpoints.get(id))
      .filter((c): c is Checkpoint => c !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (checkpoints.length <= keepCount) {
      return 0;
    }

    const toDelete = checkpoints.slice(keepCount);
    let deleted = 0;

    for (const cp of toDelete) {
      this.deleteCheckpoint(cp.id);
      deleted++;
    }

    return deleted;
  }

  getCheckpointCount(sessionId: string): number {
    return (this.sessionCheckpoints.get(sessionId) ?? []).length;
  }

  getSessionIds(): string[] {
    return Array.from(this.sessionCheckpoints.keys());
  }

  destroy(): void {
    this.checkpoints.clear();
    this.sessionCheckpoints.clear();
    this.messageCounters.clear();
    this.lastAutoCheckpoint.clear();
    this.removeAllListeners();
  }

  // ─── Internal ────────────────────────────────────────────────────

  private getNextVersion(sessionId: string): number {
    const ids = this.sessionCheckpoints.get(sessionId) ?? [];
    let maxVersion = 0;
    for (const id of ids) {
      const cp = this.checkpoints.get(id);
      if (cp && cp.version > maxVersion) {
        maxVersion = cp.version;
      }
    }
    return maxVersion + 1;
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
