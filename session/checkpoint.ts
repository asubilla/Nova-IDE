import * as fs from 'fs';
import * as path from 'path';
import type {
  CheckpointData,
  Session,
  AgentResult,
  AgentCoordinationMessage,
} from '../core/types';

export interface CheckpointConfig {
  intervalMs: number;
  maxCheckpoints: number;
  persistencePath: string;
  persistenceEnabled: boolean;
  incrementalEnabled: boolean;
}

export interface IncrementalCheckpoint {
  baseCheckpointId: string;
  deltaId: string;
  timestamp: Date;
  completedAgents: string[];
  runningAgents: string[];
  queuedAgents: string[];
  agentResultDeltas: Map<string, AgentResult>;
  sharedContextDeltas: Map<string, any>;
  coordinationLogDelta: AgentCoordinationMessage[];
}

export interface CheckpointMetadata {
  id: string;
  sessionId: string;
  timestamp: Date;
  sizeBytes: number;
  isIncremental: boolean;
  baseCheckpointId?: string;
}

const DEFAULT_CONFIG: CheckpointConfig = {
  intervalMs: 30000,
  maxCheckpoints: 10,
  persistencePath: '.checkpoints',
  persistenceEnabled: false,
  incrementalEnabled: true,
};

export class CheckpointManager {
  private config: CheckpointConfig;
  private checkpoints: Map<string, CheckpointData> = new Map();
  private checkpointMetadata: Map<string, CheckpointMetadata> = new Map();
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private lastCheckpointId: string | null = null;
  private sessionId: string = '';

  constructor(config?: Partial<CheckpointConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  startPeriodicCheckpointing(session: Session): void {
    this.sessionId = session.id;
    this.stopPeriodicCheckpointing();

    this.intervalTimer = setInterval(() => {
      this.createCheckpoint(session);
    }, this.config.intervalMs);
  }

  stopPeriodicCheckpointing(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  createCheckpoint(session: Session): CheckpointData {
    const checkpoint: CheckpointData = {
      sessionId: session.id,
      timestamp: new Date(),
      completedAgents: [],
      runningAgents: [],
      queuedAgents: [],
      agentResults: new Map(session.results),
      sharedContext: new Map(),
      coordinationLog: [...session.coordinationBus],
    };

    for (const [agentId, task] of session.agents) {
      const result = session.results.get(agentId);
      if (result) {
        if (result.status === 'completed') checkpoint.completedAgents.push(agentId);
        else if (result.status === 'running') checkpoint.runningAgents.push(agentId);
        else checkpoint.queuedAgents.push(agentId);
      }
    }

    const checkpointId = `cp-${session.id}-${Date.now()}`;
    this.checkpoints.set(checkpointId, checkpoint);

    const metadata: CheckpointMetadata = {
      id: checkpointId,
      sessionId: session.id,
      timestamp: checkpoint.timestamp,
      sizeBytes: this.estimateSize(checkpoint),
      isIncremental: false,
    };
    this.checkpointMetadata.set(checkpointId, metadata);

    this.cleanupOldCheckpoints(session.id);
    this.lastCheckpointId = checkpointId;

    if (this.config.persistenceEnabled) {
      this.saveToDisk(checkpointId, checkpoint);
    }

    return checkpoint;
  }

  createIncrementalCheckpoint(session: Session): CheckpointData | IncrementalCheckpoint {
    if (!this.config.incrementalEnabled || !this.lastCheckpointId) {
      return this.createCheckpoint(session);
    }

    const baseCheckpoint = this.checkpoints.get(this.lastCheckpointId);
    if (!baseCheckpoint) {
      return this.createCheckpoint(session);
    }

    const delta: IncrementalCheckpoint = {
      baseCheckpointId: this.lastCheckpointId,
      deltaId: `inc-${session.id}-${Date.now()}`,
      timestamp: new Date(),
      completedAgents: [],
      runningAgents: [],
      queuedAgents: [],
      agentResultDeltas: new Map(),
      sharedContextDeltas: new Map(),
      coordinationLogDelta: [],
    };

    for (const [agentId, result] of session.results) {
      const baseResult = baseCheckpoint.agentResults.get(agentId);
      if (!baseResult || baseResult.status !== result.status) {
        delta.agentResultDeltas.set(agentId, result);
      }
      if (result.status === 'completed') delta.completedAgents.push(agentId);
      else if (result.status === 'running') delta.runningAgents.push(agentId);
      else delta.queuedAgents.push(agentId);
    }

    const baseCoordLen = baseCheckpoint.coordinationLog.length;
    if (session.coordinationBus.length > baseCoordLen) {
      delta.coordinationLogDelta = session.coordinationBus.slice(baseCoordLen);
    }

    this.checkpointMetadata.set(delta.deltaId, {
      id: delta.deltaId,
      sessionId: session.id,
      timestamp: delta.timestamp,
      sizeBytes: this.estimateSize(delta as any),
      isIncremental: true,
      baseCheckpointId: this.lastCheckpointId,
    });

    this.lastCheckpointId = delta.deltaId;
    return delta;
  }

  saveToDisk(checkpointId: string, data: CheckpointData): void {
    const dir = path.join(this.config.persistencePath, data.sessionId);
    fs.mkdirSync(dir, { recursive: true });

    const serialized = JSON.stringify(data, (key, value) => {
      if (value instanceof Map) {
        return { __type: 'Map', entries: Array.from(value.entries()) };
      }
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    });

    const filePath = path.join(dir, `${checkpointId}.json`);
    fs.writeFileSync(filePath, serialized, 'utf-8');
  }

  loadFromDisk(sessionId: string, checkpointId: string): CheckpointData | null {
    const filePath = path.join(
      this.config.persistencePath,
      sessionId,
      `${checkpointId}.json`
    );

    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw, (key, value) => {
      if (value && value.__type === 'Map') {
        return new Map(value.entries);
      }
      if (value && value.__type === 'Date') {
        return new Date(value.value);
      }
      return value;
    }) as CheckpointData;
  }

  listCheckpoints(sessionId: string): CheckpointMetadata[] {
    const entries: CheckpointMetadata[] = [];
    for (const [, meta] of this.checkpointMetadata) {
      if (meta.sessionId === sessionId) {
        entries.push(meta);
      }
    }
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  restoreSession(checkpointId: string): CheckpointData | null {
    return this.checkpoints.get(checkpointId) || null;
  }

  restoreFromDisk(sessionId: string, checkpointId: string): CheckpointData | null {
    const data = this.loadFromDisk(sessionId, checkpointId);
    if (data) {
      this.checkpoints.set(checkpointId, data);
    }
    return data;
  }

  private cleanupOldCheckpoints(sessionId: string): void {
    const sessionCheckpoints = this.listCheckpoints(sessionId);
    while (sessionCheckpoints.length > this.config.maxCheckpoints) {
      const oldest = sessionCheckpoints.pop()!;
      this.checkpoints.delete(oldest.id);
      this.checkpointMetadata.delete(oldest.id);

      const filePath = path.join(
        this.config.persistencePath,
        sessionId,
        `${oldest.id}.json`
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 256;
    }
  }

  getLastCheckpointId(): string | null {
    return this.lastCheckpointId;
  }

  getSessionCheckpoints(sessionId: string): CheckpointData[] {
    const results: CheckpointData[] = [];
    for (const [id, data] of this.checkpoints) {
      if (data.sessionId === sessionId) {
        results.push(data);
      }
    }
    return results.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  deleteCheckpoint(checkpointId: string): boolean {
    const meta = this.checkpointMetadata.get(checkpointId);
    if (!meta) return false;

    this.checkpoints.delete(checkpointId);
    this.checkpointMetadata.delete(checkpointId);

    if (this.lastCheckpointId === checkpointId) {
      this.lastCheckpointId = null;
    }

    const filePath = path.join(
      this.config.persistencePath,
      meta.sessionId,
      `${checkpointId}.json`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      for (const [id, data] of this.checkpoints) {
        if (data.sessionId === sessionId) {
          this.checkpoints.delete(id);
          this.checkpointMetadata.delete(id);
        }
      }
    } else {
      this.checkpoints.clear();
      this.checkpointMetadata.clear();
      this.lastCheckpointId = null;
    }
  }

  setConfig(config: Partial<CheckpointConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): CheckpointConfig {
    return { ...this.config };
  }
}
