import { EventEmitter } from 'events';

export interface FileLock {
  filePath: string;
  agentId: string;
  sessionId: string;
  acquiredAt: Date;
  expiresAt: Date;
  lockType: 'read' | 'write' | 'exclusive';
}

export interface LockRequest {
  filePath: string;
  agentId: string;
  sessionId: string;
  lockType: 'read' | 'write' | 'exclusive';
  timeoutMs: number;
}

export interface LockResult {
  acquired: boolean;
  lock?: FileLock;
  waitTimeMs?: number;
  error?: string;
}

export interface FileLockManagerOptions {
  defaultLockTimeoutMs: number;
  maxLocksPerAgent: number;
  maxWaitTimeMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_OPTIONS: FileLockManagerOptions = {
  defaultLockTimeoutMs: 30000,
  maxLocksPerAgent: 10,
  maxWaitTimeMs: 60000,
  cleanupIntervalMs: 5000,
};

export class FileLockManager extends EventEmitter {
  private locks: Map<string, FileLock> = new Map();
  private waitQueues: Map<string, LockRequest[]> = new Map();
  private agentLockCounts: Map<string, number> = new Map();
  private options: FileLockManagerOptions;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options?: Partial<FileLockManagerOptions>) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startCleanupTimer();
  }

  async acquireLock(request: LockRequest): Promise<LockResult> {
    const { filePath, agentId, sessionId, lockType, timeoutMs } = request;
    const lockKey = this.makeLockKey(filePath, sessionId);

    const currentLock = this.locks.get(lockKey);

    if (!currentLock) {
      return this.grantLock(request);
    }

    if (currentLock.agentId === agentId && currentLock.sessionId === sessionId) {
      if (this.canUpgrade(currentLock.lockType, lockType)) {
        currentLock.lockType = lockType;
        currentLock.expiresAt = new Date(Date.now() + timeoutMs);
        return { acquired: true, lock: currentLock };
      }
      return { acquired: false, error: 'Cannot upgrade lock type' };
    }

    if (lockType === 'read' && currentLock.lockType === 'read') {
      const lock: FileLock = {
        filePath,
        agentId,
        sessionId,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + timeoutMs),
        lockType: 'read',
      };
      return { acquired: true, lock };
    }

    return this.waitForLock(request);
  }

  releaseLock(filePath: string, agentId: string, sessionId: string): boolean {
    const lockKey = this.makeLockKey(filePath, sessionId);
    const lock = this.locks.get(lockKey);

    if (!lock) return false;
    if (lock.agentId !== agentId && lock.sessionId !== sessionId) return false;

    this.locks.delete(lockKey);
    this.decrementAgentLockCount(agentId);
    this.emit('lock-released', { filePath, agentId, sessionId });

    this.processWaitQueue(filePath, sessionId);
    return true;
  }

  releaseAllAgentLocks(agentId: string): number {
    let released = 0;
    for (const [key, lock] of this.locks.entries()) {
      if (lock.agentId === agentId) {
        this.locks.delete(key);
        this.decrementAgentLockCount(agentId);
        released++;
      }
    }
    if (released > 0) {
      this.emit('agent-locks-released', { agentId, count: released });
    }
    return released;
  }

  releaseAllSessionLocks(sessionId: string): number {
    let released = 0;
    for (const [key, lock] of this.locks.entries()) {
      if (lock.sessionId === sessionId) {
        this.locks.delete(key);
        this.decrementAgentLockCount(lock.agentId);
        released++;
      }
    }
    if (released > 0) {
      this.emit('session-locks-released', { sessionId, count: released });
    }
    return released;
  }

  isLocked(filePath: string, sessionId?: string): boolean {
    if (sessionId) {
      const lockKey = this.makeLockKey(filePath, sessionId);
      return this.locks.has(lockKey);
    }
    for (const [key] of this.locks) {
      if (key.startsWith(filePath + '::')) return true;
    }
    return false;
  }

  getLockOwner(filePath: string, sessionId?: string): FileLock | null {
    if (sessionId) {
      const lockKey = this.makeLockKey(filePath, sessionId);
      return this.locks.get(lockKey) || null;
    }
    for (const [key, lock] of this.locks) {
      if (key.startsWith(filePath + '::')) return lock;
    }
    return null;
  }

  getAgentLocks(agentId: string): FileLock[] {
    return Array.from(this.locks.values()).filter(l => l.agentId === agentId);
  }

  getSessionLocks(sessionId: string): FileLock[] {
    return Array.from(this.locks.values()).filter(l => l.sessionId === sessionId);
  }

  getFileConflicts(sessionId: string, files: string[]): Array<{ filePath: string; lockedBy: FileLock }> {
    const conflicts: Array<{ filePath: string; lockedBy: FileLock }> = [];
    for (const file of files) {
      const lock = this.getLockOwner(file, sessionId);
      if (lock && lock.agentId !== sessionId) {
        conflicts.push({ filePath: file, lockedBy: lock });
      }
    }
    return conflicts;
  }

  canAgentsRunInParallel(agentA: string, sessionA: string, agentB: string, sessionB: string, files: string[]): boolean {
    if (sessionA === sessionB) return true;

    for (const file of files) {
      const lockA = this.getLockOwner(file, sessionA);
      const lockB = this.getLockOwner(file, sessionB);

      if (lockA && lockB && lockA.agentId !== lockB.agentId) {
        if (lockA.lockType === 'exclusive' || lockB.lockType === 'exclusive') {
          return false;
        }
      }
    }
    return true;
  }

  private grantLock(request: LockRequest): LockResult {
    const { filePath, agentId, sessionId, lockType, timeoutMs } = request;

    if (this.getAgentLockCount(agentId) >= this.options.maxLocksPerAgent) {
      return { acquired: false, error: 'Agent lock limit reached' };
    }

    const lock: FileLock = {
      filePath,
      agentId,
      sessionId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + timeoutMs),
      lockType,
    };

    const lockKey = this.makeLockKey(filePath, sessionId);
    this.locks.set(lockKey, lock);
    this.incrementAgentLockCount(agentId);

    this.emit('lock-acquired', { filePath, agentId, sessionId, lockType });
    return { acquired: true, lock };
  }

  private async waitForLock(request: LockRequest): Promise<LockResult> {
    const { filePath, agentId, sessionId, timeoutMs } = request;
    const lockKey = this.makeLockKey(filePath, sessionId);

    if (!this.waitQueues.has(lockKey)) {
      this.waitQueues.set(lockKey, []);
    }
    this.waitQueues.get(lockKey)!.push(request);

    return new Promise((resolve) => {
      const waitStart = Date.now();
      const checkInterval = setInterval(() => {
        const currentLock = this.locks.get(lockKey);
        if (!currentLock || currentLock.expiresAt < new Date()) {
          clearInterval(checkInterval);
          const idx = this.waitQueues.get(lockKey)?.indexOf(request);
          if (idx !== undefined && idx >= 0) {
            this.waitQueues.get(lockKey)?.splice(idx, 1);
          }
          resolve(this.grantLock(request));
          return;
        }

        if (Date.now() - waitStart > this.options.maxWaitTimeMs) {
          clearInterval(checkInterval);
          const idx = this.waitQueues.get(lockKey)?.indexOf(request);
          if (idx !== undefined && idx >= 0) {
            this.waitQueues.get(lockKey)?.splice(idx, 1);
          }
          resolve({ acquired: false, error: 'Wait timeout exceeded' });
          return;
        }
      }, 100);
    });
  }

  private processWaitQueue(filePath: string, sessionId: string): void {
    const lockKey = this.makeLockKey(filePath, sessionId);
    const queue = this.waitQueues.get(lockKey);
    if (!queue || queue.length === 0) return;

    const next = queue.shift()!;
    this.grantLock(next);
  }

  private canUpgrade(currentType: string, requestedType: string): boolean {
    if (currentType === 'exclusive') return true;
    if (currentType === 'read' && requestedType === 'write') return true;
    return false;
  }

  private makeLockKey(filePath: string, sessionId: string): string {
    return `${filePath}::${sessionId}`;
  }

  private getAgentLockCount(agentId: string): number {
    return this.agentLockCounts.get(agentId) || 0;
  }

  private incrementAgentLockCount(agentId: string): void {
    this.agentLockCounts.set(agentId, this.getAgentLockCount(agentId) + 1);
  }

  private decrementAgentLockCount(agentId: string): void {
    const count = this.getAgentLockCount(agentId);
    if (count <= 1) {
      this.agentLockCounts.delete(agentId);
    } else {
      this.agentLockCounts.set(agentId, count - 1);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.options.cleanupIntervalMs);
  }

  private cleanupExpiredLocks(): void {
    const now = new Date();
    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt < now) {
        this.locks.delete(key);
        this.decrementAgentLockCount(lock.agentId);
        this.emit('lock-expired', { filePath: lock.filePath, agentId: lock.agentId });
        this.processWaitQueue(lock.filePath, lock.sessionId);
      }
    }
  }

  getStats(): { totalLocks: number; locksByType: Record<string, number>; waitingRequests: number } {
    const locksByType: Record<string, number> = { read: 0, write: 0, exclusive: 0 };
    let waitingRequests = 0;

    for (const lock of this.locks.values()) {
      locksByType[lock.lockType] = (locksByType[lock.lockType] || 0) + 1;
    }
    for (const queue of this.waitQueues.values()) {
      waitingRequests += queue.length;
    }

    return {
      totalLocks: this.locks.size,
      locksByType,
      waitingRequests,
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.locks.clear();
    this.waitQueues.clear();
    this.agentLockCounts.clear();
    this.removeAllListeners();
  }
}
