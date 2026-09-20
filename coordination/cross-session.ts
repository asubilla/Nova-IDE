import { EventEmitter } from 'events';
import type { AgentType, ResourceProfile } from '../core/types';
import { FileLockManager, FileLock } from './file-lock';

export interface CrossSessionConfig {
  maxSessions: number;
  maxConcurrentSessions: number;
  enableFileLocking: boolean;
  enableResourceQuotas: boolean;
  sessionTimeoutMs: number;
}

export interface SessionInfo {
  sessionId: string;
  projectPath: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startedAt: Date;
  lastActiveAt: Date;
  filesAccessed: Set<string>;
  agents: Set<string>;
  resourceUsage: ResourceProfile;
}

export interface CrossSessionConflict {
  type: 'file-overlap' | 'resource-contention' | 'dependency-mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  session1: string;
  session2: string;
  affectedFiles?: string[];
  description: string;
  suggestedResolution: string;
}

export interface CoordinationDecision {
  action: 'allow' | 'block' | 'queue' | 'merge' | 'split';
  reason: string;
  affectedSessions: string[];
  mitigation?: string;
}

export interface ResourceQuota {
  sessionId: string;
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxConcurrentAgents: number;
  maxFilesAccessed: number;
}

export class CrossSessionCoordinator extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private fileLockManager: FileLockManager;
  private resourceQuotas: Map<string, ResourceQuota> = new Map();
  private config: CrossSessionConfig;
  private conflictHistory: CrossSessionConflict[] = [];

  constructor(config?: Partial<CrossSessionConfig>) {
    super();
    this.config = {
      maxSessions: 10,
      maxConcurrentSessions: 5,
      enableFileLocking: true,
      enableResourceQuotas: true,
      sessionTimeoutMs: 300000,
      ...config,
    };
    this.fileLockManager = new FileLockManager();
  }

  registerSession(sessionId: string, projectPath: string): SessionInfo {
    if (this.sessions.size >= this.config.maxSessions) {
      this.evictOldestSession();
    }

    const session: SessionInfo = {
      sessionId,
      projectPath,
      status: 'active',
      startedAt: new Date(),
      lastActiveAt: new Date(),
      filesAccessed: new Set(),
      agents: new Set(),
      resourceUsage: { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 },
    };

    this.sessions.set(sessionId, session);
    this.emit('session-registered', { sessionId, projectPath });

    if (this.config.enableResourceQuotas) {
      this.resourceQuotas.set(sessionId, this.createDefaultQuota(sessionId));
    }

    return session;
  }

  unregisterSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (this.config.enableFileLocking) {
        this.fileLockManager.releaseAllSessionLocks(sessionId);
      }
      this.sessions.delete(sessionId);
      this.resourceQuotas.delete(sessionId);
      this.emit('session-unregistered', { sessionId });
    }
  }

  async coordinateSessions(
    sessionId1: string,
    sessionId2: string,
    proposedFiles: string[]
  ): Promise<CoordinationDecision> {
    const session1 = this.sessions.get(sessionId1);
    const session2 = this.sessions.get(sessionId2);

    if (!session1 || !session2) {
      return { action: 'allow', reason: 'One or both sessions not found', affectedSessions: [sessionId1, sessionId2] };
    }

    const conflicts = this.detectConflicts(sessionId1, sessionId2, proposedFiles);

    if (conflicts.length === 0) {
      return { action: 'allow', reason: 'No conflicts detected', affectedSessions: [sessionId1, sessionId2] };
    }

    const criticalConflicts = conflicts.filter(c => c.severity === 'critical' || c.severity === 'high');

    if (criticalConflicts.length === 0) {
      return {
        action: 'allow',
        reason: 'Low-severity conflicts only',
        affectedSessions: [sessionId1, sessionId2],
        mitigation: 'File locking will handle concurrent access',
      };
    }

    const fileConflicts = conflicts.filter(c => c.type === 'file-overlap');

    if (fileConflicts.length > 0) {
      const canParallel = this.canSessionsRunInParallel(sessionId1, sessionId2, proposedFiles);

      if (!canParallel) {
        return {
          action: 'queue',
          reason: 'File conflicts detected - queuing second session',
          affectedSessions: [sessionId1, sessionId2],
          mitigation: 'Session 2 will wait for Session 1 to release file locks',
        };
      }
    }

    const resourceConflicts = conflicts.filter(c => c.type === 'resource-contention');
    if (resourceConflicts.length > 0) {
      return {
        action: 'queue',
        reason: 'Resource contention - reducing concurrency',
        affectedSessions: [sessionId1, sessionId2],
        mitigation: 'Reducing concurrent agents to stay within resource limits',
      };
    }

    return {
      action: 'block',
      reason: 'Critical conflicts detected',
      affectedSessions: [sessionId1, sessionId2],
      mitigation: 'Resolve conflicts before proceeding',
    };
  }

  detectConflicts(
    sessionId1: string,
    sessionId2: string,
    proposedFiles: string[]
  ): CrossSessionConflict[] {
    const conflicts: CrossSessionConflict[] = [];
    const session1 = this.sessions.get(sessionId1);
    const session2 = this.sessions.get(sessionId2);

    if (!session1 || !session2) return conflicts;

    if (this.config.enableFileLocking) {
      const fileConflicts = this.fileLockManager.getFileConflicts(sessionId2, proposedFiles);
      for (const conflict of fileConflicts) {
        conflicts.push({
          type: 'file-overlap',
          severity: 'high',
          session1: sessionId1,
          session2: sessionId2,
          affectedFiles: [conflict.filePath],
          description: `File ${conflict.filePath} locked by agent ${conflict.lockedBy.agentId} in session ${conflict.lockedBy.sessionId}`,
          suggestedResolution: 'Queue session 2 or use file locking',
        });
      }
    }

    const overlappingFiles = proposedFiles.filter(f => session1.filesAccessed.has(f));
    if (overlappingFiles.length > 0) {
      conflicts.push({
        type: 'file-overlap',
        severity: 'medium',
        session1: sessionId1,
        session2: sessionId2,
        affectedFiles: overlappingFiles,
        description: `Sessions accessing same files: ${overlappingFiles.join(', ')}`,
        suggestedResolution: 'Sequential execution or file partitioning',
      });
    }

    const totalMemory = session1.resourceUsage.memoryMB + session2.resourceUsage.memoryMB;
    const totalCpu = session1.resourceUsage.cpuPercent + session2.resourceUsage.cpuPercent;

    if (totalMemory > 2048 || totalCpu > 80) {
      conflicts.push({
        type: 'resource-contention',
        severity: 'medium',
        session1: sessionId1,
        session2: sessionId2,
        description: `Combined resource usage: Memory ${totalMemory}MB, CPU ${totalCpu}%`,
        suggestedResolution: 'Reduce concurrent agents or defer one session',
      });
    }

    if (session1.projectPath !== session2.projectPath) {
      conflicts.push({
        type: 'dependency-mismatch',
        severity: 'low',
        session1: sessionId1,
        session2: sessionId2,
        description: 'Sessions operating on different projects',
        suggestedResolution: 'No coordination needed',
      });
    }

    return conflicts;
  }

  canSessionsRunInParallel(sessionId1: string, sessionId2: string, proposedFiles: string[]): boolean {
    const session1 = this.sessions.get(sessionId1);
    const session2 = this.sessions.get(sessionId2);

    if (!session1 || !session2) return true;

    if (session1.projectPath !== session2.projectPath) return true;

    const overlappingFiles = proposedFiles.filter(f => session1.filesAccessed.has(f));
    if (overlappingFiles.length > 0) {
      if (this.config.enableFileLocking) {
        for (const file of overlappingFiles) {
          const lock = this.fileLockManager.getLockOwner(file, sessionId1);
          if (lock && lock.lockType === 'exclusive') return false;
        }
      } else {
        return false;
      }
    }

    const totalMemory = session1.resourceUsage.memoryMB + session2.resourceUsage.memoryMB;
    const totalCpu = session1.resourceUsage.cpuPercent + session2.resourceUsage.cpuPercent;

    if (totalMemory > 2048 || totalCpu > 80) return false;

    return true;
  }

  async requestFileAccess(
    sessionId: string,
    agentId: string,
    filePath: string,
    lockType: 'read' | 'write' | 'exclusive'
  ): Promise<{ granted: boolean; error?: string }> {
    if (!this.config.enableFileLocking) {
      return { granted: true };
    }

    const quota = this.resourceQuotas.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (session && quota) {
      if (session.filesAccessed.size >= quota.maxFilesAccessed) {
        return { granted: false, error: 'File access limit reached for session' };
      }
    }

    const result = await this.fileLockManager.acquireLock({
      filePath,
      agentId,
      sessionId,
      lockType,
      timeoutMs: this.config.sessionTimeoutMs,
    });

    if (result.acquired) {
      session?.filesAccessed.add(filePath);
      this.emit('file-access-granted', { sessionId, agentId, filePath, lockType });
    }

    return { granted: result.acquired, error: result.error };
  }

  releaseFileAccess(sessionId: string, agentId: string, filePath: string): void {
    if (this.config.enableFileLocking) {
      this.fileLockManager.releaseLock(filePath, agentId, sessionId);
    }
    this.emit('file-access-released', { sessionId, agentId, filePath });
  }

  updateResourceUsage(sessionId: string, usage: Partial<ResourceProfile>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.resourceUsage = { ...session.resourceUsage, ...usage };
      session.lastActiveAt = new Date();

      const quota = this.resourceQuotas.get(sessionId);
      if (quota) {
        if (session.resourceUsage.memoryMB > quota.maxMemoryMB) {
          this.emit('quota-exceeded', { sessionId, resource: 'memory', current: session.resourceUsage.memoryMB, limit: quota.maxMemoryMB });
        }
        if (session.resourceUsage.cpuPercent > quota.maxCpuPercent) {
          this.emit('quota-exceeded', { sessionId, resource: 'cpu', current: session.resourceUsage.cpuPercent, limit: quota.maxCpuPercent });
        }
      }
    }
  }

  trackAgent(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agents.add(agentId);
      session.lastActiveAt = new Date();
    }
  }

  getSessionConflicts(sessionId: string): CrossSessionConflict[] {
    return this.conflictHistory.filter(
      c => c.session1 === sessionId || c.session2 === sessionId
    );
  }

  getAllConflicts(): CrossSessionConflict[] {
    return [...this.conflictHistory];
  }

  private createDefaultQuota(sessionId: string): ResourceQuota {
    return {
      sessionId,
      maxMemoryMB: 1024,
      maxCpuPercent: 50,
      maxDiskMB: 500,
      maxConcurrentAgents: 5,
      maxFilesAccessed: 50,
    };
  }

  private evictOldestSession(): void {
    let oldest: SessionInfo | null = null;
    for (const session of this.sessions.values()) {
      if (!oldest || session.lastActiveAt < oldest.lastActiveAt) {
        oldest = session;
      }
    }
    if (oldest) {
      this.unregisterSession(oldest.sessionId);
    }
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalLocks: number;
    totalConflicts: number;
    resourceUsage: { memory: number; cpu: number };
  } {
    const activeSessions = this.getActiveSessions();
    const lockStats = this.fileLockManager.getStats();

    let totalMemory = 0;
    let totalCpu = 0;
    for (const session of activeSessions) {
      totalMemory += session.resourceUsage.memoryMB;
      totalCpu += session.resourceUsage.cpuPercent;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalLocks: lockStats.totalLocks,
      totalConflicts: this.conflictHistory.length,
      resourceUsage: { memory: totalMemory, cpu: totalCpu },
    };
  }

  destroy(): void {
    this.fileLockManager.destroy();
    this.sessions.clear();
    this.resourceQuotas.clear();
    this.conflictHistory = [];
    this.removeAllListeners();
  }
}
