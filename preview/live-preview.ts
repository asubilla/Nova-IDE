import { EventEmitter } from 'events';
import {
  AgentResult,
  AgentTask,
  AgentType,
  AgentError,
  ValidationResult,
  LogEntry,
  FixLoopIteration,
  QualityGateResult,
  LivePreviewEvent,
  Session,
  CheckpointData,
  ResourceUsage,
} from '../core/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface AgentPreviewState {
  agentId: string;
  agentType: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying';
  progress: number;
  currentStep: string;
  steps: string[];
  startedAt?: Date;
  estimatedCompletion?: Date;
  retryCount: number;
  output?: any;
  error?: any;
  validationResults: any[];
  logs: any[];
}

export interface PreviewState {
  sessionId: string;
  agents: Map<string, AgentPreviewState>;
  sessionStatus: string;
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  runningAgents: number;
  queuedAgents: number;
  startTime: Date;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  resourceUsage: { memoryMB: number; cpuPercent: number };
}

export interface PreviewEvent {
  type: string;
  timestamp: Date;
  agentId?: string;
  data: any;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export interface SessionSummary {
  totalAgents: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  progress: number;
  estimatedTimeRemaining: number;
}

// ─── LivePreviewManager ──────────────────────────────────────────────────────

export class LivePreviewManager {
  private state: PreviewState;
  private eventHistory: PreviewEvent[];
  private listeners: Map<string, Function[]>;
  private updateInterval?: ReturnType<typeof setInterval>;
  private maxEventHistory: number;

  constructor(sessionId: string, totalAgents: number) {
    this.maxEventHistory = 500;
    this.eventHistory = [];
    this.listeners = new Map();

    this.state = {
      sessionId,
      agents: new Map<string, AgentPreviewState>(),
      sessionStatus: 'initializing',
      totalAgents,
      completedAgents: 0,
      failedAgents: 0,
      runningAgents: 0,
      queuedAgents: 0,
      startTime: new Date(),
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      resourceUsage: { memoryMB: 0, cpuPercent: 0 },
    };

    this.initialize();
  }

  initialize(): void {
    this.state.startTime = new Date();
    this.state.sessionStatus = 'initializing';

    this.updateInterval = setInterval(() => {
      this.state.elapsedTime = Date.now() - this.state.startTime.getTime();
      this.updateEstimatedTimeRemaining();
      this.emit({
        type: 'state-tick',
        timestamp: new Date(),
        data: this.getSummary(),
        severity: 'info',
      });
    }, 1000);

    this.emit({
      type: 'session-initialized',
      timestamp: new Date(),
      data: { sessionId: this.state.sessionId, totalAgents: this.state.totalAgents },
      severity: 'info',
    });
  }

  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    this.listeners.clear();
  }

  // ─── Agent Tracking ──────────────────────────────────────────────────────

  agentStarted(agentId: string, agentType: string, name: string): void {
    const agentState: AgentPreviewState = {
      agentId,
      agentType,
      name,
      status: 'running',
      progress: 0,
      currentStep: 'Initializing',
      steps: [],
      startedAt: new Date(),
      retryCount: 0,
      validationResults: [],
      logs: [],
    };

    this.state.agents.set(agentId, agentState);
    this.recalculateCounters();

    this.emit({
      type: 'agent-started',
      timestamp: new Date(),
      agentId,
      data: { agentType, name },
      severity: 'info',
    });
  }

  agentProgress(agentId: string, progress: number, step: string): void {
    const agent = this.state.agents.get(agentId);
    if (!agent) return;

    agent.progress = Math.max(0, Math.min(100, progress));
    agent.currentStep = step;
    if (step && !agent.steps.includes(step)) {
      agent.steps.push(step);
    }

    this.emit({
      type: 'agent-progress',
      timestamp: new Date(),
      agentId,
      data: { progress: agent.progress, step, steps: agent.steps },
      severity: 'info',
    });
  }

  agentCompleted(agentId: string, output: any): void {
    const agent = this.state.agents.get(agentId);
    if (!agent) return;

    agent.status = 'completed';
    agent.progress = 100;
    agent.output = output;
    agent.currentStep = 'Completed';
    this.recalculateCounters();

    this.emit({
      type: 'agent-completed',
      timestamp: new Date(),
      agentId,
      data: { output, durationMs: agent.startedAt ? Date.now() - agent.startedAt.getTime() : 0 },
      severity: 'success',
    });
  }

  agentFailed(agentId: string, error: any): void {
    const agent = this.state.agents.get(agentId);
    if (!agent) return;

    agent.status = 'failed';
    agent.error = error;
    agent.currentStep = 'Failed';
    this.recalculateCounters();

    this.emit({
      type: 'agent-failed',
      timestamp: new Date(),
      agentId,
      data: { error },
      severity: 'error',
    });
  }

  agentRetrying(agentId: string, attempt: number): void {
    const agent = this.state.agents.get(agentId);
    if (!agent) return;

    agent.status = 'retrying';
    agent.retryCount = attempt;
    agent.currentStep = `Retrying (attempt ${attempt})`;
    agent.progress = 0;
    this.recalculateCounters();

    this.emit({
      type: 'agent-retrying',
      timestamp: new Date(),
      agentId,
      data: { attempt },
      severity: 'warning',
    });
  }

  agentQueued(agentId: string, agentType: string, name: string): void {
    const agentState: AgentPreviewState = {
      agentId,
      agentType,
      name,
      status: 'queued',
      progress: 0,
      currentStep: 'Queued',
      steps: [],
      retryCount: 0,
      validationResults: [],
      logs: [],
    };

    this.state.agents.set(agentId, agentState);
    this.recalculateCounters();

    this.emit({
      type: 'agent-queued',
      timestamp: new Date(),
      agentId,
      data: { agentType, name },
      severity: 'info',
    });
  }

  // ─── Validation Tracking ─────────────────────────────────────────────────

  validationStarted(agentId: string, validationType: string): void {
    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.currentStep = `Running validation: ${validationType}`;
    }

    this.emit({
      type: 'validation-started',
      timestamp: new Date(),
      agentId,
      data: { validationType },
      severity: 'info',
    });
  }

  validationCompleted(agentId: string, validationType: string, passed: boolean): void {
    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.validationResults.push({ type: validationType, passed, timestamp: new Date() });
      agent.currentStep = passed ? `${validationType} passed` : `${validationType} failed`;
    }

    this.emit({
      type: 'validation-completed',
      timestamp: new Date(),
      agentId,
      data: { validationType, passed },
      severity: passed ? 'success' : 'warning',
    });
  }

  // ─── Error-Fix Loop Tracking ─────────────────────────────────────────────

  errorFixIteration(agentId: string, iteration: number, error: any, fixStrategy: string): void {
    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.logs.push({
        timestamp: new Date(),
        level: 'warn',
        message: `Error-fix iteration ${iteration}: ${fixStrategy}`,
        data: { error, fixStrategy },
      });
    }

    this.emit({
      type: 'error-fix-loop',
      timestamp: new Date(),
      agentId,
      data: { iteration, error, fixStrategy },
      severity: 'warning',
    });
  }

  // ─── Session Tracking ────────────────────────────────────────────────────

  sessionStatusChanged(status: string): void {
    this.state.sessionStatus = status;

    this.emit({
      type: 'session-status-changed',
      timestamp: new Date(),
      data: { status },
      severity: status === 'failed' ? 'error' : 'info',
    });
  }

  checkpointCreated(checkpointId: string): void {
    this.emit({
      type: 'checkpoint-created',
      timestamp: new Date(),
      data: { checkpointId },
      severity: 'info',
    });
  }

  // ─── Event System ────────────────────────────────────────────────────────

  on(eventType: string, callback: Function): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  off(eventType: string, callback: Function): void {
    const callbacks = this.listeners.get(eventType);
    if (!callbacks) return;
    const idx = callbacks.indexOf(callback);
    if (idx !== -1) callbacks.splice(idx, 1);
  }

  emit(event: PreviewEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.maxEventHistory);
    }

    const wildcardCallbacks = this.listeners.get('*') || [];
    for (const cb of wildcardCallbacks) {
      try { cb(event); } catch (_) { /* listener error ignored */ }
    }

    const typedCallbacks = this.listeners.get(event.type) || [];
    for (const cb of typedCallbacks) {
      try { cb(event); } catch (_) { /* listener error ignored */ }
    }
  }

  getEvents(agentId?: string, type?: string): PreviewEvent[] {
    return this.eventHistory.filter((e) => {
      if (agentId && e.agentId !== agentId) return false;
      if (type && e.type !== type) return false;
      return true;
    });
  }

  // ─── State Management ────────────────────────────────────────────────────

  getState(): PreviewState {
    return this.state;
  }

  getAgentState(agentId: string): AgentPreviewState | undefined {
    return this.state.agents.get(agentId);
  }

  getSummary(): SessionSummary {
    const agents = Array.from(this.state.agents.values());
    const totalProgress = agents.length > 0
      ? agents.reduce((sum, a) => sum + a.progress, 0) / agents.length
      : 0;

    return {
      totalAgents: this.state.totalAgents,
      completed: this.state.completedAgents,
      failed: this.state.failedAgents,
      running: this.state.runningAgents,
      queued: this.state.queuedAgents,
      progress: Math.round(totalProgress * 100) / 100,
      estimatedTimeRemaining: this.state.estimatedTimeRemaining,
    };
  }

  getTimeline(): PreviewEvent[] {
    return [...this.eventHistory].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  exportSnapshot(): string {
    const snapshot = {
      sessionId: this.state.sessionId,
      sessionStatus: this.state.sessionStatus,
      startTime: this.state.startTime.toISOString(),
      elapsedTime: this.state.elapsedTime,
      summary: this.getSummary(),
      resourceUsage: this.state.resourceUsage,
      agents: Array.from(this.state.agents.entries()).map(([id, state]) => ({
        ...state,
        startedAt: state.startedAt?.toISOString(),
        estimatedCompletion: state.estimatedCompletion?.toISOString(),
      })),
      eventCount: this.eventHistory.length,
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(snapshot, null, 2);
  }

  exportAgentReport(agentId: string): string {
    const agent = this.state.agents.get(agentId);
    if (!agent) {
      return JSON.stringify({ error: `Agent ${agentId} not found` }, null, 2);
    }

    const agentEvents = this.getEvents(agentId);
    const report = {
      agentId: agent.agentId,
      agentType: agent.agentType,
      name: agent.name,
      status: agent.status,
      progress: agent.progress,
      retryCount: agent.retryCount,
      startedAt: agent.startedAt?.toISOString(),
      estimatedCompletion: agent.estimatedCompletion?.toISOString(),
      steps: agent.steps,
      validationResults: agent.validationResults,
      logs: agent.logs,
      output: agent.output,
      error: agent.error,
      eventHistory: agentEvents.map((e) => ({
        type: e.type,
        timestamp: e.timestamp.toISOString(),
        data: e.data,
        severity: e.severity,
      })),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(report, null, 2);
  }

  // ─── Rendering (Text-based) ──────────────────────────────────────────────

  renderDashboard(): string {
    const summary = this.getSummary();
    const lines: string[] = [];
    const width = 72;

    lines.push('═'.repeat(width));
    lines.push(this.padCenter('LIVE PREVIEW DASHBOARD', width));
    lines.push('═'.repeat(width));
    lines.push(`  Session:  ${this.state.sessionId}`);
    lines.push(`  Status:   ${this.state.sessionStatus.toUpperCase()}`);
    lines.push(`  Started:  ${this.state.startTime.toISOString()}`);
    lines.push(`  Elapsed:  ${this.formatDuration(this.state.elapsedTime)}`);
    lines.push(`  ETA:      ${this.formatDuration(summary.estimatedTimeRemaining)}`);
    lines.push('');
    lines.push(`  Total: ${summary.totalAgents}  |  Completed: ${summary.completed}  |  Running: ${summary.running}  |  Queued: ${summary.queued}  |  Failed: ${summary.failed}`);
    lines.push(`  Overall Progress: ${this.renderProgressBar(summary.progress)} ${summary.progress.toFixed(1)}%`);
    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('AGENTS', width));
    lines.push('─'.repeat(width));

    const agents = Array.from(this.state.agents.values());
    if (agents.length === 0) {
      lines.push('  (no agents registered)');
    } else {
      for (const agent of agents) {
        const statusIcon = this.statusIcon(agent.status);
        lines.push(`  ${statusIcon} ${this.truncate(agent.name, 30)} [${agent.agentType}]`);
        lines.push(`    ${this.renderProgressBar(agent.progress)} ${agent.progress.toFixed(1)}%  ${agent.currentStep}`);
        if (agent.error) {
          const errMsg = typeof agent.error === 'string' ? agent.error : agent.error.message || 'Unknown error';
          lines.push(`    ERROR: ${this.truncate(errMsg, 50)}`);
        }
        if (agent.retryCount > 0) {
          lines.push(`    Retry: ${agent.retryCount}`);
        }
      }
    }

    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('RECENT EVENTS', width));
    lines.push('─'.repeat(width));

    const recentEvents = this.eventHistory.slice(-8);
    if (recentEvents.length === 0) {
      lines.push('  (no events)');
    } else {
      for (const event of recentEvents) {
        const time = event.timestamp.toTimeString().slice(0, 8);
        const sev = this.severityIcon(event.severity);
        const agentTag = event.agentId ? `[${this.truncate(event.agentId, 12)}]` : '[session]';
        lines.push(`  ${time} ${sev} ${agentTag} ${event.type}`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  renderAgentDetail(agentId: string): string {
    const agent = this.state.agents.get(agentId);
    if (!agent) return `Agent "${agentId}" not found.`;

    const width = 60;
    const lines: string[] = [];

    lines.push('═'.repeat(width));
    lines.push(this.padCenter(`AGENT: ${agent.name}`, width));
    lines.push('═'.repeat(width));
    lines.push(`  ID:       ${agent.agentId}`);
    lines.push(`  Type:     ${agent.agentType}`);
    lines.push(`  Status:   ${this.statusIcon(agent.status)} ${agent.status.toUpperCase()}`);
    lines.push(`  Progress: ${this.renderProgressBar(agent.progress)} ${agent.progress.toFixed(1)}%`);
    lines.push(`  Step:     ${agent.currentStep}`);
    lines.push(`  Retries:  ${agent.retryCount}`);

    if (agent.startedAt) {
      lines.push(`  Started:  ${agent.startedAt.toISOString()}`);
    }
    if (agent.estimatedCompletion) {
      lines.push(`  ETA:      ${agent.estimatedCompletion.toISOString()}`);
    }

    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('STEPS', width));
    lines.push('─'.repeat(width));

    if (agent.steps.length === 0) {
      lines.push('  (no steps yet)');
    } else {
      for (let i = 0; i < agent.steps.length; i++) {
        const marker = agent.steps[i] === agent.currentStep ? ' > ' : '   ';
        lines.push(`${marker}${i + 1}. ${agent.steps[i]}`);
      }
    }

    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('VALIDATIONS', width));
    lines.push('─'.repeat(width));

    if (agent.validationResults.length === 0) {
      lines.push('  (no validations)');
    } else {
      for (const v of agent.validationResults) {
        const icon = v.passed ? '✓' : '✗';
        lines.push(`  ${icon} ${v.type} — ${v.passed ? 'PASSED' : 'FAILED'}`);
      }
    }

    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('LOGS', width));
    lines.push('─'.repeat(width));

    const recentLogs = agent.logs.slice(-10);
    if (recentLogs.length === 0) {
      lines.push('  (no logs)');
    } else {
      for (const log of recentLogs) {
        const time = log.timestamp instanceof Date ? log.timestamp.toTimeString().slice(0, 8) : '';
        lines.push(`  ${time} [${log.level.toUpperCase()}] ${log.message}`);
      }
    }

    if (agent.error) {
      lines.push('');
      lines.push('─'.repeat(width));
      lines.push(this.padCenter('ERROR', width));
      lines.push('─'.repeat(width));
      const errMsg = typeof agent.error === 'string' ? agent.error : JSON.stringify(agent.error, null, 2);
      lines.push(`  ${errMsg}`);
    }

    if (agent.output) {
      lines.push('');
      lines.push('─'.repeat(width));
      lines.push(this.padCenter('OUTPUT', width));
      lines.push('─'.repeat(width));
      const outStr = typeof agent.output === 'string' ? agent.output : JSON.stringify(agent.output, null, 2);
      const outputLines = outStr.split('\n').slice(0, 20);
      for (const l of outputLines) {
        lines.push(`  ${l}`);
      }
      if (outStr.split('\n').length > 20) {
        lines.push(`  ... (${outStr.split('\n').length - 20} more lines)`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  renderTimeline(): string {
    const width = 72;
    const lines: string[] = [];

    lines.push('═'.repeat(width));
    lines.push(this.padCenter('EVENT TIMELINE', width));
    lines.push('═'.repeat(width));

    const timeline = this.getTimeline();
    if (timeline.length === 0) {
      lines.push('  (no events)');
    } else {
      let lastDate = '';
      for (const event of timeline) {
        const dateStr = event.timestamp.toISOString().slice(0, 10);
        if (dateStr !== lastDate) {
          lines.push('');
          lines.push(`  ── ${dateStr} ──`);
          lastDate = dateStr;
        }
        const time = event.timestamp.toTimeString().slice(0, 8);
        const sev = this.severityIcon(event.severity);
        const agentTag = event.agentId ? `[${this.truncate(event.agentId, 14)}]` : '[session   ]';
        const dataStr = event.data ? this.truncate(JSON.stringify(event.data), 30) : '';
        lines.push(`  ${time} ${sev} ${agentTag} ${this.padRight(event.type, 24)} ${dataStr}`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  renderProgress(): string {
    const width = 72;
    const lines: string[] = [];

    lines.push('═'.repeat(width));
    lines.push(this.padCenter('PROGRESS OVERVIEW', width));
    lines.push('═'.repeat(width));

    const agents = Array.from(this.state.agents.values());
    if (agents.length === 0) {
      lines.push('  (no agents)');
    } else {
      const maxNameLen = Math.max(...agents.map((a) => a.name.length), 10);
      for (const agent of agents) {
        const icon = this.statusIcon(agent.status);
        const name = this.padRight(agent.name, maxNameLen + 2);
        lines.push(`  ${icon} ${name} ${this.renderProgressBar(agent.progress)} ${agent.progress.toFixed(1).padStart(5)}%  ${agent.currentStep}`);
      }
    }

    const summary = this.getSummary();
    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(`  Overall: ${this.renderProgressBar(summary.progress)} ${summary.progress.toFixed(1)}%`);
    lines.push(`  Elapsed: ${this.formatDuration(this.state.elapsedTime)}  |  ETA: ${this.formatDuration(summary.estimatedTimeRemaining)}`);
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private recalculateCounters(): void {
    const agents = Array.from(this.state.agents.values());
    this.state.completedAgents = agents.filter((a) => a.status === 'completed').length;
    this.state.failedAgents = agents.filter((a) => a.status === 'failed').length;
    this.state.runningAgents = agents.filter((a) => a.status === 'running' || a.status === 'retrying').length;
    this.state.queuedAgents = agents.filter((a) => a.status === 'queued').length;
  }

  private updateEstimatedTimeRemaining(): void {
    const agents = Array.from(this.state.agents.values());
    const active = agents.filter((a) => a.status === 'running' || a.status === 'retrying');
    if (active.length === 0) {
      this.state.estimatedTimeRemaining = 0;
      return;
    }

    const totalRemaining = active.reduce((sum, a) => sum + (100 - a.progress), 0);
    const avgProgressPerSecond = this.state.elapsedTime > 0
      ? (agents.filter((a) => a.status === 'completed').length * 100) / this.state.elapsedTime / 1000
      : 0.1;

    this.state.estimatedTimeRemaining = avgProgressPerSecond > 0
      ? (totalRemaining / avgProgressPerSecond) * 1000
      : 60000;
  }

  private renderProgressBar(percent: number, length: number = 20): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  private statusIcon(status: string): string {
    switch (status) {
      case 'running':   return '▶';
      case 'completed': return '✓';
      case 'failed':    return '✗';
      case 'queued':    return '◦';
      case 'retrying':  return '↻';
      default:          return '?';
    }
  }

  private severityIcon(severity: string): string {
    switch (severity) {
      case 'info':    return 'ℹ';
      case 'success': return '✓';
      case 'warning': return '⚠';
      case 'error':   return '✗';
      default:        return '·';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 0) return '0s';
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }

  private padCenter(text: string, width: number): string {
    const pad = Math.max(0, width - text.length);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + text + ' '.repeat(right);
  }

  private padRight(text: string, width: number): string {
    if (text.length >= width) return text.slice(0, width);
    return text + ' '.repeat(width - text.length);
  }
}

// ─── PreviewEventEmitter ─────────────────────────────────────────────────────

export class PreviewEventEmitter extends EventEmitter {
  private manager: LivePreviewManager;
  private subscriptions: Array<() => void> = [];

  constructor(manager: LivePreviewManager) {
    super();
    this.manager = manager;

    const handler = (event: PreviewEvent) => {
      this.broadcast(event);
    };
    this.manager.on('*', handler);
    this.subscriptions.push(() => this.manager.off('*', handler));
  }

  broadcast(event: PreviewEvent): void {
    this.emit('preview-event', event);
    this.emit(event.type, event);
  }

  async *stream(agentId?: string, type?: string): AsyncIterableIterator<PreviewEvent> {
    const queue: PreviewEvent[] = [];
    let resolve: (() => void) | null = null;

    const handler = (event: PreviewEvent) => {
      if (agentId && event.agentId !== agentId) return;
      if (type && event.type !== type) return;
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    this.manager.on('*', handler);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => { resolve = r; });
        }
      }
    } finally {
      this.manager.off('*', handler);
    }
  }

  dispose(): void {
    for (const unsub of this.subscriptions) unsub();
    this.subscriptions = [];
    this.removeAllListeners();
  }
}
