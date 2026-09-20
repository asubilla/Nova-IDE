import { EventEmitter } from 'events';
import { defaultLogger } from '../logging/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolStatus = 'running' | 'success' | 'error' | 'retry';

export interface ToolExecution {
  trackerId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  error?: string;
  attempt: number;
  maxRetries: number;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
}

export interface ToolStats {
  toolName: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  retryCount: number;
  avgDuration: number;
  maxDuration: number;
  lastUsed: Date;
}

export interface ToolStatusRender {
  toolName: string;
  status: string;
  calls: number;
  successRate: string;
  avgDuration: string;
}

// ─── ToolTracker ───────────────────────────────────────────────────────────

export class ToolTracker extends EventEmitter {
  private executions = new Map<string, ToolExecution>();
  private history: ToolExecution[] = [];
  private trackerIdCounter = 0;
  private logger: typeof defaultLogger;

  constructor() {
    super();
    this.logger = defaultLogger.child('ToolTracker');
  }

  // ─── Track Start ────────────────────────────────────────────────────────

  trackStart(toolName: string, args: Record<string, unknown>): string {
    const trackerId = `trk-${++this.trackerIdCounter}-${Date.now().toString(36)}`;
    const execution: ToolExecution = {
      trackerId,
      toolName,
      args,
      status: 'running',
      attempt: 1,
      maxRetries: 3,
      startedAt: new Date(),
    };

    this.executions.set(trackerId, execution);
    this.emit('tool:start', execution);
    return trackerId;
  }

  // ─── Track Success ─────────────────────────────────────────────────────

  trackSuccess(trackerId: string, result: unknown, duration: number): void {
    const execution = this.executions.get(trackerId);
    if (!execution) return;

    execution.status = 'success';
    execution.result = result;
    execution.duration = duration;
    execution.endedAt = new Date();

    this.history.push(execution);
    this.executions.delete(trackerId);
    this.emit('tool:success', execution);
  }

  // ─── Track Error ────────────────────────────────────────────────────────

  trackError(trackerId: string, error: string, duration: number): void {
    const execution = this.executions.get(trackerId);
    if (!execution) return;

    execution.status = 'error';
    execution.error = error;
    execution.duration = duration;
    execution.endedAt = new Date();

    this.history.push(execution);
    this.executions.delete(trackerId);
    this.emit('tool:error', execution);
  }

  // ─── Track Retry ────────────────────────────────────────────────────────

  trackRetry(trackerId: string, attempt: number, maxRetries: number): void {
    const execution = this.executions.get(trackerId);
    if (!execution) return;

    execution.status = 'retry';
    execution.attempt = attempt;
    execution.maxRetries = maxRetries;

    this.emit('tool:retry', execution);
  }

  // ─── Get Tool Stats ────────────────────────────────────────────────────

  getToolStats(): ToolStats[] {
    const statsMap = new Map<string, ToolStats>();

    for (const exec of this.history) {
      let stats = statsMap.get(exec.toolName);
      if (!stats) {
        stats = {
          toolName: exec.toolName,
          totalCalls: 0,
          successCount: 0,
          errorCount: 0,
          retryCount: 0,
          avgDuration: 0,
          maxDuration: 0,
          lastUsed: exec.endedAt ?? exec.startedAt,
        };
        statsMap.set(exec.toolName, stats);
      }

      stats.totalCalls++;
      if (exec.status === 'success') stats.successCount++;
      if (exec.status === 'error') stats.errorCount++;
      if (exec.status === 'retry') stats.retryCount++;
      if (exec.duration) {
        stats.avgDuration =
          (stats.avgDuration * (stats.totalCalls - 1) + exec.duration) / stats.totalCalls;
        stats.maxDuration = Math.max(stats.maxDuration, exec.duration);
      }
      const execEnd = exec.endedAt ?? exec.startedAt;
      if (execEnd > stats.lastUsed) stats.lastUsed = execEnd;
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }

  getToolStatsByName(toolName: string): ToolStats | undefined {
    return this.getToolStats().find((s) => s.toolName === toolName);
  }

  // ─── Get Tool History ──────────────────────────────────────────────────

  getToolHistory(toolName?: string): ToolExecution[] {
    if (toolName) {
      return this.history.filter((e) => e.toolName === toolName);
    }
    return [...this.history];
  }

  // ─── Get Failed Tools ──────────────────────────────────────────────────

  getFailedTools(): ToolExecution[] {
    return this.history.filter((e) => e.status === 'error');
  }

  // ─── Get Slow Tools ────────────────────────────────────────────────────

  getSlowTools(thresholdMs: number = 5000): ToolExecution[] {
    return this.history.filter((e) => e.duration !== undefined && e.duration >= thresholdMs);
  }

  // ─── Get Active Executions ─────────────────────────────────────────────

  getActiveExecutions(): ToolExecution[] {
    return Array.from(this.executions.values());
  }

  // ─── Render Tool Status ────────────────────────────────────────────────

  renderToolStatus(): ToolStatusRender[] {
    const stats = this.getToolStats();
    return stats.map((s) => ({
      toolName: s.toolName,
      status: this.getActiveExecutions().some((e) => e.toolName === s.toolName)
        ? 'running'
        : s.errorCount > 0
          ? 'has-errors'
          : 'idle',
      calls: s.totalCalls,
      successRate:
        s.totalCalls > 0
          ? `${Math.round((s.successCount / s.totalCalls) * 100)}%`
          : '0%',
      avgDuration: this.formatDuration(s.avgDuration),
    }));
  }

  // ─── Render Tool Stats ─────────────────────────────────────────────────

  renderToolStats(): string {
    const stats = this.getToolStats();
    if (stats.length === 0) return 'No tool executions recorded.';

    const lines: string[] = [];
    lines.push('| Tool | Calls | Success | Errors | Avg Duration | Max Duration |');
    lines.push('|------|-------|---------|--------|--------------|--------------|');

    for (const s of stats) {
      const successRate =
        s.totalCalls > 0
          ? `${Math.round((s.successCount / s.totalCalls) * 100)}%`
          : '0%';
      lines.push(
        `| ${s.toolName} | ${s.totalCalls} | ${successRate} (${s.successCount}) | ${s.errorCount} | ${this.formatDuration(s.avgDuration)} | ${this.formatDuration(s.maxDuration)} |`,
      );
    }

    const totalCalls = stats.reduce((sum, s) => sum + s.totalCalls, 0);
    const totalErrors = stats.reduce((sum, s) => sum + s.errorCount, 0);
    lines.push('');
    lines.push(
      `**Total:** ${totalCalls} calls, ${totalErrors} errors, ${stats.length} unique tools`,
    );

    return lines.join('\n');
  }

  // ─── Summary ───────────────────────────────────────────────────────────

  getSummary(): {
    totalCalls: number;
    successCount: number;
    errorCount: number;
    retryCount: number;
    activeCount: number;
    uniqueTools: number;
  } {
    const stats = this.getToolStats();
    return {
      totalCalls: stats.reduce((sum, s) => sum + s.totalCalls, 0),
      successCount: stats.reduce((sum, s) => sum + s.successCount, 0),
      errorCount: stats.reduce((sum, s) => sum + s.errorCount, 0),
      retryCount: stats.reduce((sum, s) => sum + s.retryCount, 0),
      activeCount: this.executions.size,
      uniqueTools: stats.length,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    return `${minutes}m ${remainSec}s`;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.executions.clear();
    this.history = [];
    this.removeAllListeners();
  }
}
