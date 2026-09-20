import { LivePreviewEvent, AgentType, Issue, ValidationResult } from '../core/types';

type EventSeverity = 'info' | 'warning' | 'error' | 'success';

interface FormattedEvent {
  type: string;
  severity: EventSeverity;
  title: string;
  message: string;
  details?: Record<string, any>;
  agentId?: string;
  sessionId: string;
  timestamp: Date;
}

interface EventFilterOptions {
  severity?: EventSeverity[];
  agentType?: AgentType[];
  sessionIds?: string[];
  types?: LivePreviewEvent['type'][];
  since?: Date;
  until?: Date;
}

interface AggregatedCounts {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<EventSeverity, number>;
  byAgent: Record<string, number>;
}

interface ProgressState {
  percentage: number;
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  runningAgents: number;
  queuedAgents: number;
  currentPhase: string;
  eta: number | null;
}

const SEVERITY_MAP: Record<LivePreviewEvent['type'], EventSeverity> = {
  'agent-started': 'info',
  'agent-progress': 'info',
  'agent-completed': 'success',
  'agent-failed': 'error',
  'validation-running': 'info',
  'validation-completed': 'info',
  'error-fix-loop': 'warning',
  'session-status': 'info',
  'agent-spawned': 'info',
  'agent-queued': 'info',
  'dependency-resolved': 'success',
  'context-loaded': 'info',
  'tool-invoked': 'info',
  'checkpoint-created': 'info',
  'session-paused': 'warning',
  'session-resumed': 'success',
};

export class EventFormatters {
  static format(event: LivePreviewEvent): FormattedEvent {
    const formatter = formatters[event.type];
    if (!formatter) {
      return {
        type: event.type,
        severity: 'info',
        title: event.type,
        message: JSON.stringify(event.data),
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    }
    return formatter(event);
  }
}

const formatters: Record<LivePreviewEvent['type'], (e: LivePreviewEvent) => FormattedEvent> = {
  'agent-started': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Agent Started`,
    message: `Agent ${e.data?.task?.type ?? e.agentId} started execution`,
    details: { taskName: e.data?.task?.name, taskType: e.data?.task?.type },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'agent-progress': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Agent Progress`,
    message: e.data?.message ?? `Agent ${e.agentId} is progressing`,
    details: { progress: e.data?.progress },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'agent-completed': (e) => ({
    type: e.type,
    severity: 'success',
    title: `Agent Completed`,
    message: `Agent ${e.agentId} completed successfully`,
    details: {
      durationMs: e.data?.result?.summary?.metrics?.durationMs,
      filesModified: e.data?.result?.summary?.filesModified,
      validationsPassed: e.data?.result?.validationResults?.filter((v: ValidationResult) => v.passed).length,
      validationsTotal: e.data?.result?.validationResults?.length,
    },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'agent-failed': (e) => ({
    type: e.type,
    severity: 'error',
    title: `Agent Failed`,
    message: e.data?.error?.message ?? `Agent ${e.agentId} failed`,
    details: {
      errorCode: e.data?.error?.code,
      category: e.data?.error?.category,
      recoverable: e.data?.error?.recoverable,
      suggestedFix: e.data?.error?.suggestedFix,
    },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'validation-running': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Validation Running`,
    message: `Running ${e.data?.rule} validation`,
    details: { rule: e.data?.rule },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'validation-completed': (e) => ({
    type: e.type,
    severity: e.data?.passed ? 'success' : 'warning',
    title: `Validation ${e.data?.passed ? 'Passed' : 'Failed'}`,
    message: `${e.data?.rule} validation ${e.data?.passed ? 'passed' : 'failed'}`,
    details: { rule: e.data?.rule, passed: e.data?.passed },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'error-fix-loop': (e) => ({
    type: e.type,
    severity: 'warning',
    title: `Fix Loop Iteration`,
    message: `Retry attempt ${e.data?.attempt}/${e.data?.maxRetries}`,
    details: { attempt: e.data?.attempt, maxRetries: e.data?.maxRetries },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'session-status': (e) => ({
    type: e.type,
    severity: e.data?.status === 'failed' ? 'error' : e.data?.status === 'completed' ? 'success' : 'info',
    title: `Session ${e.data?.status}`,
    message: `Session is now ${e.data?.status}`,
    details: { status: e.data?.status, totalAgents: e.data?.totalAgents },
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'agent-spawned': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Agent Spawned`,
    message: `Agent ${e.data?.agentType ?? e.agentId} spawned`,
    details: { agentType: e.data?.agentType, taskName: e.data?.taskName },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'agent-queued': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Agent Queued`,
    message: `Agent ${e.agentId} added to queue`,
    details: { position: e.data?.position },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'dependency-resolved': (e) => ({
    type: e.type,
    severity: 'success',
    title: `Dependency Resolved`,
    message: `Dependency ${e.data?.dependencyId} resolved for ${e.agentId}`,
    details: { dependencyId: e.data?.dependencyId, fromAgent: e.data?.fromAgent },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'context-loaded': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Context Loaded`,
    message: `Loaded ${e.data?.fileCount ?? 0} context files`,
    details: { fileCount: e.data?.fileCount, files: e.data?.files },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'tool-invoked': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Tool Invoked`,
    message: `Tool "${e.data?.tool}" invoked by ${e.agentId}`,
    details: { tool: e.data?.tool, params: e.data?.params },
    agentId: e.agentId,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'checkpoint-created': (e) => ({
    type: e.type,
    severity: 'info',
    title: `Checkpoint Created`,
    message: `Checkpoint saved for session`,
    details: {
      completedAgents: e.data?.completedAgents,
      runningAgents: e.data?.runningAgents,
      queuedAgents: e.data?.queuedAgents,
    },
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'session-paused': (e) => ({
    type: e.type,
    severity: 'warning',
    title: `Session Paused`,
    message: `Session has been paused`,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),

  'session-resumed': (e) => ({
    type: e.type,
    severity: 'success',
    title: `Session Resumed`,
    message: `Session has been resumed`,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  }),
};

export class EventFilter {
  private options: EventFilterOptions;

  constructor(options: EventFilterOptions = {}) {
    this.options = options;
  }

  matches(event: LivePreviewEvent): boolean {
    if (this.options.types && this.options.types.length > 0) {
      if (!this.options.types.includes(event.type)) return false;
    }

    if (this.options.sessionIds && this.options.sessionIds.length > 0) {
      if (!this.options.sessionIds.includes(event.sessionId)) return false;
    }

    if (this.options.agentType && this.options.agentType.length > 0) {
      if (!event.agentId) return false;
    }

    if (this.options.severity && this.options.severity.length > 0) {
      const severity = SEVERITY_MAP[event.type] ?? 'info';
      if (!this.options.severity.includes(severity)) return false;
    }

    if (this.options.since && event.timestamp < this.options.since) return false;
    if (this.options.until && event.timestamp > this.options.until) return false;

    return true;
  }

  filter(events: LivePreviewEvent[]): LivePreviewEvent[] {
    return events.filter(e => this.matches(e));
  }

  update(options: Partial<EventFilterOptions>): void {
    Object.assign(this.options, options);
  }
}

export class EventAggregator {
  private events: LivePreviewEvent[] = [];
  private windowMs: number;

  constructor(windowMs: number = 60_000) {
    this.windowMs = windowMs;
  }

  add(event: LivePreviewEvent): void {
    this.events.push(event);
    this.prune();
  }

  addBatch(events: LivePreviewEvent[]): void {
    this.events.push(...events);
    this.prune();
  }

  getCounts(): AggregatedCounts {
    this.prune();

    const byType: Record<string, number> = {};
    const bySeverity: Record<EventSeverity, number> = { info: 0, warning: 0, error: 0, success: 0 };
    const byAgent: Record<string, number> = {};

    for (const event of this.events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;

      const severity = SEVERITY_MAP[event.type] ?? 'info';
      bySeverity[severity]++;

      if (event.agentId) {
        byAgent[event.agentId] = (byAgent[event.agentId] ?? 0) + 1;
      }
    }

    return { total: this.events.length, byType, bySeverity, byAgent };
  }

  getEventsInWindow(windowMs?: number): LivePreviewEvent[] {
    const window = windowMs ?? this.windowMs;
    const cutoff = Date.now() - window;
    return this.events.filter(e => e.timestamp.getTime() >= cutoff);
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs * 2;
    this.events = this.events.filter(e => e.timestamp.getTime() >= cutoff);
  }

  clear(): void {
    this.events = [];
  }
}

export class ProgressCalculator {
  private totalAgents = 0;
  private agentStatuses: Map<string, 'queued' | 'running' | 'completed' | 'failed'> = new Map();
  private startedAt: Date | null = null;
  private durations: number[] = [];

  setTotalAgents(count: number): void {
    this.totalAgents = count;
  }

  updateAgentStatus(agentId: string, status: 'queued' | 'running' | 'completed' | 'failed', durationMs?: number): void {
    this.agentStatuses.set(agentId, status);
    if (durationMs !== undefined) {
      this.durations.push(durationMs);
    }
  }

  updateFromEvent(event: LivePreviewEvent): void {
    switch (event.type) {
      case 'session-status':
        if (event.data?.totalAgents) {
          this.totalAgents = event.data.totalAgents;
        }
        if (!this.startedAt && event.data?.status === 'running') {
          this.startedAt = event.timestamp;
        }
        break;
      case 'agent-started':
        if (event.agentId) {
          this.agentStatuses.set(event.agentId, 'running');
        }
        break;
      case 'agent-completed':
        if (event.agentId) {
          this.agentStatuses.set(event.agentId, 'completed');
          const dur = event.data?.result?.summary?.metrics?.durationMs;
          if (dur) this.durations.push(dur);
        }
        break;
      case 'agent-failed':
        if (event.agentId) {
          this.agentStatuses.set(event.agentId, 'failed');
        }
        break;
      case 'agent-queued':
        if (event.agentId) {
          this.agentStatuses.set(event.agentId, 'queued');
        }
        break;
    }
  }

  calculate(): ProgressState {
    let completedAgents = 0;
    let failedAgents = 0;
    let runningAgents = 0;
    let queuedAgents = 0;

    for (const status of this.agentStatuses.values()) {
      switch (status) {
        case 'completed': completedAgents++; break;
        case 'failed': failedAgents++; break;
        case 'running': runningAgents++; break;
        case 'queued': queuedAgents++; break;
      }
    }

    const resolved = completedAgents + failedAgents;
    const percentage = this.totalAgents > 0 ? Math.round((resolved / this.totalAgents) * 100) : 0;

    let currentPhase = 'idle';
    if (runningAgents > 0) currentPhase = 'executing';
    else if (queuedAgents > 0) currentPhase = 'queued';
    else if (resolved === this.totalAgents && this.totalAgents > 0) {
      currentPhase = failedAgents > 0 ? 'completed-with-errors' : 'completed';
    }

    let eta: number | null = null;
    if (runningAgents > 0 && this.durations.length > 0 && this.totalAgents > 0) {
      const avgDuration = this.durations.reduce((a, b) => a + b, 0) / this.durations.length;
      const remaining = this.totalAgents - resolved;
      eta = Math.round(avgDuration * remaining);
    }

    return {
      percentage,
      totalAgents: this.totalAgents,
      completedAgents,
      failedAgents,
      runningAgents,
      queuedAgents,
      currentPhase,
      eta,
    };
  }

  reset(): void {
    this.totalAgents = 0;
    this.agentStatuses.clear();
    this.startedAt = null;
    this.durations = [];
  }
}

export { SEVERITY_MAP };
export type { FormattedEvent, EventFilterOptions, AggregatedCounts, ProgressState, EventSeverity };
