import { SystemLogger, type LogEntry } from './system-logger';

export interface DiffComputeEntry {
  type: string;
  lineCount: number;
  duration: number;
  timestamp: number;
  success: boolean;
}

export interface DiffApplyEntry {
  filePath: string;
  hunks: number;
  success: boolean;
  timestamp: number;
  duration?: number;
}

export interface CheckpointEntry {
  sessionId: string;
  checkpointId: string;
  timestamp: number;
}

export interface RestoreEntry {
  sessionId: string;
  checkpointId: string;
  timestamp: number;
  success: boolean;
}

export interface RevertEntry {
  sessionId: string;
  messageId: string;
  userId: string;
  timestamp: number;
}

export interface VersionStats {
  totalDiffComputes: number;
  totalDiffApplies: number;
  totalCheckpoints: number;
  totalRestores: number
  totalReverts: number;
  avgDiffDuration: number;
  diffApplySuccessRate: number;
  restoreSuccessRate: number;
  mostModifiedFiles: { filePath: string; modifyCount: number }[];
}

export class DiffLogger {
  private diffComputes: DiffComputeEntry[] = [];
  private diffApplies: DiffApplyEntry[] = [];
  private checkpoints: CheckpointEntry[] = [];
  private restores: RestoreEntry[] = [];
  private reverts: RevertEntry[] = [];
  private readonly maxEntries = 5000;

  constructor(private readonly systemLogger: SystemLogger) {}

  logDiffCompute(type: string, lineCount: number, duration: number): LogEntry {
    const entry: DiffComputeEntry = {
      type,
      lineCount,
      duration,
      timestamp: Date.now(),
      success: true,
    };
    this.diffComputes.push(entry);
    if (this.diffComputes.length > this.maxEntries) {
      this.diffComputes = this.diffComputes.slice(this.diffComputes.length - this.maxEntries);
    }

    return this.systemLogger.info('performance', `Diff computed: ${type} (${lineCount} lines, ${duration}ms)`, {
      type,
      lineCount,
      duration,
    });
  }

  logDiffApply(filePath: string, hunks: number, success: boolean): LogEntry {
    const entry: DiffApplyEntry = {
      filePath,
      hunks,
      success,
      timestamp: Date.now(),
    };
    this.diffApplies.push(entry);
    if (this.diffApplies.length > this.maxEntries) {
      this.diffApplies = this.diffApplies.slice(this.diffApplies.length - this.maxEntries);
    }

    const level = success ? 'info' : 'error';
    return this.systemLogger.log(level, 'performance', `Diff applied: ${filePath} (${hunks} hunks) - ${success ? 'success' : 'failed'}`, {
      filePath,
      hunks,
      success,
    });
  }

  logCheckpointCreate(sessionId: string, checkpointId: string): LogEntry {
    const entry: CheckpointEntry = {
      sessionId,
      checkpointId,
      timestamp: Date.now(),
    };
    this.checkpoints.push(entry);
    if (this.checkpoints.length > this.maxEntries) {
      this.checkpoints = this.checkpoints.slice(this.checkpoints.length - this.maxEntries);
    }

    return this.systemLogger.info('session', `Checkpoint created: ${checkpointId}`, {
      sessionId,
      checkpointId,
    });
  }

  logCheckpointRestore(sessionId: string, checkpointId: string): LogEntry {
    const entry: RestoreEntry = {
      sessionId,
      checkpointId,
      timestamp: Date.now(),
      success: true,
    };
    this.restores.push(entry);
    if (this.restores.length > this.maxEntries) {
      this.restores = this.restores.slice(this.restores.length - this.maxEntries);
    }

    return this.systemLogger.info('session', `Checkpoint restored: ${checkpointId}`, {
      sessionId,
      checkpointId,
    });
  }

  logRevert(sessionId: string, messageId: string, userId: string): LogEntry {
    const entry: RevertEntry = {
      sessionId,
      messageId,
      userId,
      timestamp: Date.now(),
    };
    this.reverts.push(entry);
    if (this.reverts.length > this.maxEntries) {
      this.reverts = this.reverts.slice(this.reverts.length - this.maxEntries);
    }

    return this.systemLogger.warn('session', `Revert: message ${messageId} by user ${userId}`, {
      sessionId,
      messageId,
      userId,
    });
  }

  getVersionStats(): VersionStats {
    let totalDiffDuration = 0;
    for (const entry of this.diffComputes) {
      totalDiffDuration += entry.duration;
    }

    const diffApplySuccesses = this.diffApplies.filter((d) => d.success).length;
    const restoreSuccesses = this.restores.filter((r) => r.success).length;

    const fileCounts = new Map<string, number>();
    for (const entry of this.diffApplies) {
      fileCounts.set(entry.filePath, (fileCounts.get(entry.filePath) ?? 0) + 1);
    }
    const mostModified = [...fileCounts.entries()]
      .map(([filePath, modifyCount]) => ({ filePath, modifyCount }))
      .sort((a, b) => b.modifyCount - a.modifyCount)
      .slice(0, 10);

    return {
      totalDiffComputes: this.diffComputes.length,
      totalDiffApplies: this.diffApplies.length,
      totalCheckpoints: this.checkpoints.length,
      totalRestores: this.restores.length,
      totalReverts: this.reverts.length,
      avgDiffDuration: this.diffComputes.length > 0 ? totalDiffDuration / this.diffComputes.length : 0,
      diffApplySuccessRate: this.diffApplies.length > 0 ? diffApplySuccesses / this.diffApplies.length : 0,
      restoreSuccessRate: this.restores.length > 0 ? restoreSuccesses / this.restores.length : 0,
      mostModifiedFiles: mostModified,
    };
  }
}
