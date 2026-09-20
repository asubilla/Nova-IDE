import { LivePreviewEvent, AgentType, ValidationResult, AgentError, AgentResult } from '../core/types';
import { ProgressCalculator, ProgressState, EventAggregator, EventSeverity, SEVERITY_MAP } from './events';

interface AgentDashboard {
  agentId: string;
  agentType: AgentType | string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  validations: ValidationResult[];
  validationsPassed: number;
  validationsTotal: number;
  fixLoopHistory: FixLoopSnapshot[];
  error: AgentError | null;
  filesModified: string[];
  linesChanged: { added: number; removed: number };
  tokensConsumed: number;
}

interface FixLoopSnapshot {
  iteration: number;
  timestamp: Date;
  errorCategory: string;
  success: boolean;
  durationMs: number;
}

interface ValidationPipelineStatus {
  totalRules: number;
  passed: number;
  failed: number;
  running: number;
  pending: number;
  lastRun: Date | null;
  results: { rule: string; type: string; passed: boolean; durationMs: number }[];
}

interface TimelineEntry {
  timestamp: Date;
  type: string;
  severity: EventSeverity;
  agentId?: string;
  title: string;
  message: string;
  durationMs?: number;
}

interface ResourceSnapshot {
  tokensConsumed: number;
  filesModified: number;
  testsRun: number;
  testsPassed: number;
  linesChanged: { added: number; removed: number };
}

interface SessionDashboard {
  sessionId: string;
  progress: ProgressState;
  agentStatuses: AgentDashboard[];
  validationPipeline: ValidationPipelineStatus;
  errorCounts: { total: number; byCategory: Record<string, number>; bySeverity: Record<string, number> };
  resourceUsage: ResourceSnapshot;
  timeline: TimelineEntry[];
  eventsPerMinute: number;
  uptime: number;
}

export class DashboardBuilder {
  private progressCalc: ProgressCalculator;
  private aggregator: EventAggregator;
  private agents: Map<string, AgentDashboard> = new Map();
  private timeline: TimelineEntry[] = [];
  private validationPipeline: ValidationPipelineStatus = {
    totalRules: 0,
    passed: 0,
    failed: 0,
    running: 0,
    pending: 0,
    lastRun: null,
    results: [],
  };
  private resources: ResourceSnapshot = {
    tokensConsumed: 0,
    filesModified: 0,
    testsRun: 0,
    testsPassed: 0,
    linesChanged: { added: 0, removed: 0 },
  };
  private errorCounts = { total: 0, byCategory: {} as Record<string, number>, bySeverity: {} as Record<string, number> };
  private sessionId: string;
  private startedAt: Date | null = null;

  constructor(sessionId: string, windowMs: number = 60_000) {
    this.sessionId = sessionId;
    this.progressCalc = new ProgressCalculator();
    this.aggregator = new EventAggregator(windowMs);
  }

  processEvent(event: LivePreviewEvent): void {
    if (event.sessionId !== this.sessionId) return;

    this.progressCalc.updateFromEvent(event);
    this.aggregator.add(event);
    this.addTimelineEntry(event);

    if (!this.startedAt) this.startedAt = event.timestamp;

    switch (event.type) {
      case 'session-status':
        if (event.data?.totalAgents) {
          this.progressCalc.setTotalAgents(event.data.totalAgents);
        }
        break;

      case 'agent-started':
        this.handleAgentStarted(event);
        break;

      case 'agent-completed':
        this.handleAgentCompleted(event);
        break;

      case 'agent-failed':
        this.handleAgentFailed(event);
        break;

      case 'agent-queued':
        this.handleAgentQueued(event);
        break;

      case 'validation-running':
        this.handleValidationRunning(event);
        break;

      case 'validation-completed':
        this.handleValidationCompleted(event);
        break;

      case 'error-fix-loop':
        this.handleFixLoop(event);
        break;

      case 'agent-spawned':
        this.handleAgentSpawned(event);
        break;
    }
  }

  processBatch(events: LivePreviewEvent[]): void {
    for (const event of events) {
      this.processEvent(event);
    }
  }

  build(): SessionDashboard {
    const progress = this.progressCalc.calculate();
    const counts = this.aggregator.getCounts();
    const uptime = this.startedAt ? Date.now() - this.startedAt.getTime() : 0;

    const windowEvents = this.aggregator.getEventsInWindow();
    const windowMinutes = 60_000 / 60_000;
    const eventsPerMinute = windowMinutes > 0 ? Math.round(windowEvents.length / windowMinutes) : 0;

    return {
      sessionId: this.sessionId,
      progress,
      agentStatuses: Array.from(this.agents.values()),
      validationPipeline: { ...this.validationPipeline },
      errorCounts: { ...this.errorCounts },
      resourceUsage: { ...this.resources },
      timeline: this.timeline.slice(-100),
      eventsPerMinute,
      uptime,
    };
  }

  reset(): void {
    this.progressCalc.reset();
    this.aggregator.clear();
    this.agents.clear();
    this.timeline = [];
    this.validationPipeline = {
      totalRules: 0, passed: 0, failed: 0, running: 0, pending: 0, lastRun: null, results: [],
    };
    this.resources = { tokensConsumed: 0, filesModified: 0, testsRun: 0, testsPassed: 0, linesChanged: { added: 0, removed: 0 } };
    this.errorCounts = { total: 0, byCategory: {}, bySeverity: {} };
    this.startedAt = null;
  }

  private handleAgentStarted(event: LivePreviewEvent): void {
    const agentId = event.agentId!;
    const task = event.data?.task;

    const dashboard: AgentDashboard = {
      agentId,
      agentType: task?.type ?? 'unknown',
      name: task?.name ?? agentId,
      status: 'running',
      retryCount: 0,
      startedAt: event.timestamp,
      completedAt: null,
      durationMs: null,
      validations: [],
      validationsPassed: 0,
      validationsTotal: 0,
      fixLoopHistory: [],
      error: null,
      filesModified: [],
      linesChanged: { added: 0, removed: 0 },
      tokensConsumed: task?.estimatedTokens ?? 0,
    };

    this.agents.set(agentId, dashboard);
    this.progressCalc.updateAgentStatus(agentId, 'running');
  }

  private handleAgentCompleted(event: LivePreviewEvent): void {
    const agentId = event.agentId!;
    let dashboard = this.agents.get(agentId);

    if (!dashboard) {
      dashboard = this.createEmptyDashboard(agentId, event);
      this.agents.set(agentId, dashboard);
    }

    dashboard.status = 'completed';
    dashboard.completedAt = event.timestamp;
    if (dashboard.startedAt) {
      dashboard.durationMs = event.timestamp.getTime() - dashboard.startedAt.getTime();
    }

    const result = event.data?.result as AgentResult | undefined;
    if (result) {
      dashboard.validations = result.validationResults ?? [];
      dashboard.validationsPassed = result.validationResults?.filter((v: ValidationResult) => v.passed).length ?? 0;
      dashboard.validationsTotal = result.validationResults?.length ?? 0;
      dashboard.fixLoopHistory = (result.fixLoopHistory ?? []).map((f: any) => ({
        iteration: f.iteration,
        timestamp: f.timestamp,
        errorCategory: f.error?.category ?? 'unknown',
        success: f.success,
        durationMs: f.durationMs,
      }));
      dashboard.filesModified = result.summary?.filesModified ?? [];
      dashboard.linesChanged = {
        added: result.summary?.metrics?.linesAdded ?? 0,
        removed: result.summary?.metrics?.linesRemoved ?? 0,
      };
      dashboard.tokensConsumed = result.resourceConsumption?.memoryMB ?? dashboard.tokensConsumed;

      this.resources.filesModified += dashboard.filesModified.length;
      this.resources.linesChanged.added += dashboard.linesChanged.added;
      this.resources.linesChanged.removed += dashboard.linesChanged.removed;
    }

    this.progressCalc.updateAgentStatus(agentId, 'completed', dashboard.durationMs ?? undefined);
  }

  private handleAgentFailed(event: LivePreviewEvent): void {
    const agentId = event.agentId!;
    let dashboard = this.agents.get(agentId);

    if (!dashboard) {
      dashboard = this.createEmptyDashboard(agentId, event);
      this.agents.set(agentId, dashboard);
    }

    dashboard.status = 'failed';
    dashboard.completedAt = event.timestamp;
    dashboard.error = event.data?.error ?? null;

    if (dashboard.startedAt) {
      dashboard.durationMs = event.timestamp.getTime() - dashboard.startedAt.getTime();
    }

    this.progressCalc.updateAgentStatus(agentId, 'failed', dashboard.durationMs ?? undefined);

    this.errorCounts.total++;
    if (dashboard.error) {
      const cat = dashboard.error.category;
      this.errorCounts.byCategory[cat] = (this.errorCounts.byCategory[cat] ?? 0) + 1;
    }
  }

  private handleAgentQueued(event: LivePreviewEvent): void {
    const agentId = event.agentId!;
    if (!this.agents.has(agentId)) {
      const dashboard: AgentDashboard = {
        agentId,
        agentType: 'unknown',
        name: agentId,
        status: 'queued',
        retryCount: 0,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        validations: [],
        validationsPassed: 0,
        validationsTotal: 0,
        fixLoopHistory: [],
        error: null,
        filesModified: [],
        linesChanged: { added: 0, removed: 0 },
        tokensConsumed: 0,
      };
      this.agents.set(agentId, dashboard);
    }
    this.progressCalc.updateAgentStatus(agentId, 'queued');
  }

  private handleValidationRunning(event: LivePreviewEvent): void {
    this.validationPipeline.running++;
    this.validationPipeline.totalRules++;
    this.validationPipeline.pending = Math.max(0, this.validationPipeline.pending - 1);
  }

  private handleValidationCompleted(event: LivePreviewEvent): void {
    this.validationPipeline.running = Math.max(0, this.validationPipeline.running - 1);
    this.validationPipeline.lastRun = event.timestamp;

    const passed = event.data?.passed ?? false;
    if (passed) {
      this.validationPipeline.passed++;
    } else {
      this.validationPipeline.failed++;
    }

    this.validationPipeline.results.push({
      rule: event.data?.rule ?? 'unknown',
      type: event.data?.rule ?? 'unknown',
      passed,
      durationMs: 0,
    });

    if (this.validationPipeline.results.length > 50) {
      this.validationPipeline.results = this.validationPipeline.results.slice(-50);
    }
  }

  private handleFixLoop(event: LivePreviewEvent): void {
    const agentId = event.agentId;
    if (!agentId) return;

    const dashboard = this.agents.get(agentId);
    if (dashboard) {
      dashboard.retryCount = event.data?.attempt ?? 0;
    }
  }

  private handleAgentSpawned(event: LivePreviewEvent): void {
    const agentId = event.agentId;
    if (!agentId || this.agents.has(agentId)) return;

    const dashboard: AgentDashboard = {
      agentId,
      agentType: event.data?.agentType ?? 'unknown',
      name: event.data?.taskName ?? agentId,
      status: 'queued',
      retryCount: 0,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      validations: [],
      validationsPassed: 0,
      validationsTotal: 0,
      fixLoopHistory: [],
      error: null,
      filesModified: [],
      linesChanged: { added: 0, removed: 0 },
      tokensConsumed: 0,
    };
    this.agents.set(agentId, dashboard);
    this.progressCalc.updateAgentStatus(agentId, 'queued');
  }

  private addTimelineEntry(event: LivePreviewEvent): void {
    const severity = SEVERITY_MAP[event.type] ?? 'info';

    let title: string = event.type;
    let message = '';
    let durationMs: number | undefined;

    switch (event.type) {
      case 'agent-started':
        title = 'Agent Started';
        message = event.data?.task?.type ?? event.agentId ?? '';
        break;
      case 'agent-completed':
        title = 'Agent Completed';
        message = event.agentId ?? '';
        durationMs = event.data?.result?.summary?.metrics?.durationMs;
        break;
      case 'agent-failed':
        title = 'Agent Failed';
        message = event.data?.error?.message ?? event.agentId ?? '';
        break;
      case 'validation-completed':
        title = event.data?.passed ? 'Validation Passed' : 'Validation Failed';
        message = event.data?.rule ?? '';
        break;
      case 'error-fix-loop':
        title = 'Fix Loop';
        message = `Attempt ${event.data?.attempt}/${event.data?.maxRetries}`;
        break;
      case 'session-status':
        title = 'Session Status';
        message = event.data?.status ?? '';
        break;
      default:
        message = JSON.stringify(event.data).slice(0, 100);
    }

    this.timeline.push({
      timestamp: event.timestamp,
      type: event.type,
      severity,
      agentId: event.agentId,
      title,
      message,
      durationMs,
    });

    if (this.timeline.length > 200) {
      this.timeline = this.timeline.slice(-200);
    }
  }

  private createEmptyDashboard(agentId: string, event: LivePreviewEvent): AgentDashboard {
    return {
      agentId,
      agentType: 'unknown',
      name: agentId,
      status: 'running',
      retryCount: 0,
      startedAt: event.timestamp,
      completedAt: null,
      durationMs: null,
      validations: [],
      validationsPassed: 0,
      validationsTotal: 0,
      fixLoopHistory: [],
      error: null,
      filesModified: [],
      linesChanged: { added: 0, removed: 0 },
      tokensConsumed: 0,
    };
  }
}

export type {
  AgentDashboard,
  ValidationPipelineStatus,
  TimelineEntry,
  ResourceSnapshot,
  SessionDashboard,
  FixLoopSnapshot,
};
