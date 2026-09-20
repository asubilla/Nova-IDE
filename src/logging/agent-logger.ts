import { SystemLogger, type LogEntry } from './system-logger';

export interface TimelineEntry {
  timestamp: number;
  event: string;
  duration?: number;
  data?: Record<string, unknown>;
}

export interface AgentLogContext {
  agentId: string;
  type?: string;
  config?: Record<string, unknown>;
  startTime?: number;
  progress?: number;
}

export class AgentLogger {
  private agentContexts: Map<string, AgentLogContext> = new Map();

  constructor(private readonly systemLogger: SystemLogger) {}

  logAgentSpawn(agentId: string, type: string, config?: Record<string, unknown>): LogEntry {
    this.agentContexts.set(agentId, { agentId, type, config, startTime: Date.now() });
    return this.systemLogger.info('agent', `Agent spawned: ${type}`, {
      agentId,
      type,
      config,
    });
  }

  logAgentStart(agentId: string, task: string): LogEntry {
    const ctx = this.agentContexts.get(agentId);
    if (ctx) ctx.startTime = Date.now();
    return this.systemLogger.info('agent', `Agent started: ${task}`, {
      agentId,
      task,
    });
  }

  logAgentProgress(agentId: string, progress: number, message: string): LogEntry {
    return this.systemLogger.info('agent', `Agent progress: ${message}`, {
      agentId,
      progress,
      message,
    });
  }

  logAgentComplete(agentId: string, result?: Record<string, unknown>): LogEntry {
    const ctx = this.agentContexts.get(agentId);
    const duration = ctx?.startTime ? Date.now() - ctx.startTime : undefined;
    const entry = this.systemLogger.info('agent', 'Agent completed', {
      agentId,
      result,
      duration,
    });
    entry.duration = duration;
    this.agentContexts.delete(agentId);
    return entry;
  }

  logAgentError(agentId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    const ctx = this.agentContexts.get(agentId);
    const duration = ctx?.startTime ? Date.now() - ctx.startTime : undefined;
    const entry = this.systemLogger.error('agent', `Agent error: ${errorMsg}`, {
      agentId,
      error: errorMsg,
      stack,
    });
    entry.duration = duration;
    this.agentContexts.delete(agentId);
    return entry;
  }

  logAgentCancel(agentId: string, reason: string): LogEntry {
    const ctx = this.agentContexts.get(agentId);
    const duration = ctx?.startTime ? Date.now() - ctx.startTime : undefined;
    const entry = this.systemLogger.warn('agent', `Agent cancelled: ${reason}`, {
      agentId,
      reason,
    });
    entry.duration = duration;
    this.agentContexts.delete(agentId);
    return entry;
  }

  logAgentRetry(agentId: string, attempt: number, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    return this.systemLogger.warn('agent', `Agent retry attempt ${attempt}`, {
      agentId,
      attempt,
      error: errorMsg,
    });
  }

  logToolUse(
    agentId: string,
    tool: string,
    args: Record<string, unknown>,
    result?: Record<string, unknown>,
    duration?: number,
  ): LogEntry {
    const entry = this.systemLogger.info('agent', `Tool used: ${tool}`, {
      agentId,
      tool,
      args,
      result,
      duration,
    });
    entry.duration = duration;
    return entry;
  }

  logToolError(agentId: string, tool: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    return this.systemLogger.error('agent', `Tool error: ${tool}`, {
      agentId,
      tool,
      error: errorMsg,
      stack,
    });
  }

  logCommand(agentId: string, command: string, output: string, exitCode: number): LogEntry {
    return this.systemLogger.info('agent', `Command executed: ${command}`, {
      agentId,
      command,
      output,
      exitCode,
    });
  }

  logFileOperation(agentId: string, op: string, path: string, result?: string): LogEntry {
    return this.systemLogger.info('agent', `File op: ${op} ${path}`, {
      agentId,
      op,
      path,
      result,
    });
  }

  logSubAgentSpawn(parentId: string, childId: string): LogEntry {
    this.agentContexts.set(childId, { agentId: childId, startTime: Date.now() });
    return this.systemLogger.info('agent', `Sub-agent spawned: ${childId} from ${parentId}`, {
      agentId: childId,
      parentId,
    });
  }

  logSubAgentResult(childId: string, result?: Record<string, unknown>): LogEntry {
    const ctx = this.agentContexts.get(childId);
    const duration = ctx?.startTime ? Date.now() - ctx.startTime : undefined;
    const entry = this.systemLogger.info('agent', `Sub-agent result: ${childId}`, {
      agentId: childId,
      result,
      duration,
    });
    entry.duration = duration;
    this.agentContexts.delete(childId);
    return entry;
  }

  getAgentLogs(agentId: string): LogEntry[] {
    return this.systemLogger.getLogs({ agentId });
  }

  getAgentTimeline(agentId: string): TimelineEntry[] {
    return this.getAgentLogs(agentId).map((e) => ({
      timestamp: e.timestamp,
      event: e.message,
      duration: e.duration,
      data: e.data,
    }));
  }
}
