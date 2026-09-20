import { SystemLogger, type LogEntry } from './system-logger';

export interface TimelineEntry {
  timestamp: number;
  event: string;
  duration?: number;
  data?: Record<string, unknown>;
}

export interface SessionStats {
  sessionId: string;
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  agentCount: number;
  checkpointCount: number;
  revertCount: number;
  errorCount: number;
  totalLogs: number;
}

export class SessionLogger {
  private sessionStarts: Map<string, number> = new Map();

  constructor(private readonly systemLogger: SystemLogger) {}

  logSessionCreate(sessionId: string, config?: Record<string, unknown>): LogEntry {
    this.sessionStarts.set(sessionId, Date.now());
    return this.systemLogger.info('session', `Session created: ${sessionId}`, {
      sessionId,
      config,
    });
  }

  logSessionStart(sessionId: string): LogEntry {
    this.sessionStarts.set(sessionId, Date.now());
    return this.systemLogger.info('session', `Session started: ${sessionId}`, {
      sessionId,
    });
  }

  logSessionEnd(sessionId: string, result?: Record<string, unknown>): LogEntry {
    const start = this.sessionStarts.get(sessionId);
    const duration = start ? Date.now() - start : undefined;
    const entry = this.systemLogger.info('session', `Session ended: ${sessionId}`, {
      sessionId,
      result,
      duration,
    });
    entry.duration = duration;
    this.sessionStarts.delete(sessionId);
    return entry;
  }

  logSessionError(sessionId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    return this.systemLogger.error('session', `Session error: ${errorMsg}`, {
      sessionId,
      error: errorMsg,
      stack,
    });
  }

  logAgentAssign(sessionId: string, agentId: string): LogEntry {
    return this.systemLogger.info('session', `Agent assigned: ${agentId} to session ${sessionId}`, {
      sessionId,
      agentId,
    });
  }

  logAgentComplete(sessionId: string, agentId: string, result?: Record<string, unknown>): LogEntry {
    return this.systemLogger.info('session', `Agent completed in session: ${agentId}`, {
      sessionId,
      agentId,
      result,
    });
  }

  logCheckpoint(sessionId: string, checkpointId: string): LogEntry {
    return this.systemLogger.info('session', `Checkpoint saved: ${checkpointId}`, {
      sessionId,
      checkpointId,
    });
  }

  logRevert(sessionId: string, revertId: string): LogEntry {
    return this.systemLogger.warn('session', `Session reverted: ${revertId}`, {
      sessionId,
      revertId,
    });
  }

  getSessionLogs(sessionId: string): LogEntry[] {
    return this.systemLogger.getLogs({ sessionId });
  }

  getSessionTimeline(sessionId: string): TimelineEntry[] {
    return this.getSessionLogs(sessionId).map((e) => ({
      timestamp: e.timestamp,
      event: e.message,
      duration: e.duration,
      data: e.data,
    }));
  }

  getSessionStats(sessionId: string): SessionStats {
    const logs = this.getSessionLogs(sessionId);
    const agentIds = new Set<string>();
    let checkpointCount = 0;
    let revertCount = 0;
    let errorCount = 0;
    for (const l of logs) {
      if (l.data && typeof l.data === 'object' && 'agentId' in l.data && typeof (l.data as Record<string, unknown>).agentId === 'string') {
        agentIds.add((l.data as Record<string, string>).agentId);
      }
      if (l.message.includes('Checkpoint saved')) checkpointCount++;
      if (l.message.includes('Session reverted')) revertCount++;
      if (l.level === 'error') errorCount++;
    }
    const start = this.sessionStarts.get(sessionId) ?? null;
    const end = logs.find((l) => l.message.includes('Session ended'))?.timestamp ?? null;
    return {
      sessionId,
      startTime: start,
      endTime: end,
      duration: start && end ? end - start : null,
      agentCount: agentIds.size,
      checkpointCount,
      revertCount,
      errorCount,
      totalLogs: logs.length,
    };
  }
}
