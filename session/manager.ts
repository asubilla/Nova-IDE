import { Session, SessionConfig, TaskSpec, ProjectProfile, AgentTask, AgentResult, LivePreviewEvent } from '../core/types';
import { EventEmitter } from 'events';

export interface SessionManagerOptions {
  maxSessions: number;
  sessionTimeoutMs: number;
  cleanupIntervalMs: number;
  persistencePath?: string;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private options: SessionManagerOptions) {
    super();
    this.startCleanupTimer();
  }

  createSession(config: SessionConfig, taskSpec: TaskSpec, projectProfile: ProjectProfile): Session {
    if (this.sessions.size >= this.options.maxSessions) {
      this.evictOldestSession();
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const session: Session = {
      id: sessionId,
      taskSpec,
      projectProfile,
      config,
      agents: new Map(),
      results: new Map(),
      status: 'initializing',
      createdAt: new Date(),
      updatedAt: new Date(),
      spawnQueue: [],
      runningAgents: new Map(),
      coordinationBus: [],
      checkpoints: [],
      resourceUsage: {
        currentMemoryMB: 0,
        currentCpuPercent: 0,
        currentDiskMB: 0,
        peakMemoryMB: 0,
        peakCpuPercent: 0,
        totalAgentsSpawned: 0,
        totalAgentsCompleted: 0,
        totalAgentsFailed: 0,
      },
    };

    this.sessions.set(sessionId, session);
    this.emit('session-created', session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updatedAt = new Date();
    }
    return session;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => 
      ['initializing', 'planning', 'running'].includes(s.status)
    );
  }

  updateSessionStatus(sessionId: string, status: Session['status']): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.updatedAt = new Date();
      this.emit('session-status-changed', session);
    }
  }

  addAgentTask(sessionId: string, task: AgentTask): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agents.set(task.id, task);
      session.updatedAt = new Date();
    }
  }

  addAgentResult(sessionId: string, result: AgentResult): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.results.set(result.taskId, result);
      session.updatedAt = new Date();
      this.emit('agent-result', { sessionId, result });
    }
  }

  updateAgentResult(sessionId: string, taskId: string, updates: Partial<AgentResult>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const result = session.results.get(taskId);
      if (result) {
        Object.assign(result, updates);
        session.updatedAt = new Date();
      }
    }
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.emit('session-deleted', sessionId);
    }
    return deleted;
  }

  async checkpointSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const checkpointId = `checkpoint-${sessionId}-${Date.now()}`;
    session.checkpointId = checkpointId;
    
    if (this.options.persistencePath) {
      await this.persistCheckpoint(session, checkpointId);
    }

    this.emit('session-checkpointed', { sessionId, checkpointId });
    return checkpointId;
  }

  async restoreFromCheckpoint(checkpointId: string): Promise<Session | null> {
    if (!this.options.persistencePath) return null;
    
    const session = await this.loadCheckpoint(checkpointId);
    if (session) {
      this.sessions.set(session.id, session);
      this.emit('session-restored', session);
    }
    return session;
  }

  private async persistCheckpoint(session: Session, checkpointId: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.options.persistencePath!, `${checkpointId}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  private async loadCheckpoint(checkpointId: string): Promise<Session | null> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.options.persistencePath!, `${checkpointId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private evictOldestSession(): void {
    let oldest: Session | null = null;
    for (const session of this.sessions.values()) {
      if (!oldest || session.createdAt < oldest.createdAt) {
        oldest = session;
      }
    }
    if (oldest) {
      this.deleteSession(oldest.id);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.options.cleanupIntervalMs);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt.getTime() > this.options.sessionTimeoutMs) {
        if (['completed', 'failed', 'paused'].includes(session.status)) {
          this.deleteSession(id);
        }
      }
    }
  }

  getSessionStats(): SessionStats {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      byStatus: {
        initializing: sessions.filter(s => s.status === 'initializing').length,
        planning: sessions.filter(s => s.status === 'planning').length,
        running: sessions.filter(s => s.status === 'running').length,
        paused: sessions.filter(s => s.status === 'paused').length,
        completed: sessions.filter(s => s.status === 'completed').length,
        failed: sessions.filter(s => s.status === 'failed').length,
      },
      totalAgents: sessions.reduce((sum, s) => sum + s.agents.size, 0),
      totalResults: sessions.reduce((sum, s) => sum + s.results.size, 0),
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.sessions.clear();
    this.removeAllListeners();
  }
}

export interface SessionStats {
  total: number;
  byStatus: Record<Session['status'], number>;
  totalAgents: number;
  totalResults: number;
}