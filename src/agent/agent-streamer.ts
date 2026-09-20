import { EventEmitter } from 'events';
import { defaultLogger } from '../logging/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'explore'
  | 'read'
  | 'edit'
  | 'create'
  | 'delete'
  | 'search'
  | 'tool'
  | 'command'
  | 'progress'
  | 'error'
  | 'warning'
  | 'result';

export type ActivityStatus = 'pending' | 'running' | 'success' | 'error';

export interface ActivityData {
  message: string;
  path?: string;
  lines?: number;
  added?: number;
  removed?: number;
  query?: string;
  resultCount?: number;
  toolName?: string;
  args?: Record<string, unknown>;
  duration?: number;
  command?: string;
  output?: string;
  exitCode?: number;
  current?: number;
  total?: number;
  context?: string;
  summary?: string;
}

export interface AgentActivity {
  id: string;
  type: ActivityType;
  timestamp: Date;
  data: ActivityData;
  duration?: number;
  status: ActivityStatus;
}

export interface ActivityTimelineEntry {
  time: string;
  activity: AgentActivity;
  relativeMs: number;
}

export type StreamCallback = (activity: AgentActivity) => void;

// ─── AgentStreamer ──────────────────────────────────────────────────────────

export class AgentStreamer extends EventEmitter {
  private taskId: string;
  private activities: AgentActivity[] = [];
  private callbacks: StreamCallback[] = [];
  private isStreaming = false;
  private startTime: Date;
  private logger: typeof defaultLogger;
  private activityIdCounter = 0;

  constructor(taskId: string, callback?: StreamCallback) {
    super();
    this.taskId = taskId;
    this.startTime = new Date();
    this.logger = defaultLogger.child(`AgentStreamer:${taskId}`);

    if (callback) {
      this.callbacks.push(callback);
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isStreaming) return;
    this.isStreaming = true;
    this.startTime = new Date();
    this.logger.info(`Streaming started for task ${this.taskId}`);
    this.emit('stream:start', this.taskId);
  }

  stop(): void {
    if (!this.isStreaming) return;
    this.isStreaming = false;
    this.logger.info(`Streaming stopped for task ${this.taskId}`);
    this.emit('stream:stop', this.taskId);
  }

  // ─── Stream Activity ───────────────────────────────────────────────────

  streamActivity(type: ActivityType, data: ActivityData, duration?: number, status?: ActivityStatus): AgentActivity {
    const activity: AgentActivity = {
      id: `act-${++this.activityIdCounter}-${Date.now().toString(36)}`,
      type,
      timestamp: new Date(),
      data,
      duration,
      status: status ?? 'success',
    };

    this.activities.push(activity);
    this.emit('activity', activity);
    this.notifyCallbacks(activity);
    return activity;
  }

  // ─── File Operations ───────────────────────────────────────────────────

  streamFileExplore(path: string): AgentActivity {
    return this.streamActivity('explore', {
      message: `Exploring: ${path}`,
      path,
    });
  }

  streamFileRead(path: string, lines: number): AgentActivity {
    return this.streamActivity('read', {
      message: `Reading: ${path} (${lines} lines)`,
      path,
      lines,
    });
  }

  streamFileEdit(path: string, added: number, removed: number): AgentActivity {
    return this.streamActivity('edit', {
      message: `Editing: ${path} (+${added}, -${removed})`,
      path,
      added,
      removed,
    });
  }

  streamFileCreate(path: string): AgentActivity {
    return this.streamActivity('create', {
      message: `Creating: ${path}`,
      path,
    });
  }

  streamFileDelete(path: string): AgentActivity {
    return this.streamActivity('delete', {
      message: `Deleting: ${path}`,
      path,
    });
  }

  // ─── Search ────────────────────────────────────────────────────────────

  streamSearch(query: string, resultCount: number): AgentActivity {
    return this.streamActivity('search', {
      message: `Searching: ${query} (${resultCount} results)`,
      query,
      resultCount,
    });
  }

  // ─── Tool Usage ────────────────────────────────────────────────────────

  streamToolUse(toolName: string, args: Record<string, unknown>, duration: number): AgentActivity {
    return this.streamActivity('tool', {
      message: `Tool: ${toolName} (${duration}ms)`,
      toolName,
      args,
      duration,
    }, duration);
  }

  streamToolError(toolName: string, error: string): AgentActivity {
    return this.streamActivity('tool', {
      message: `Tool Error: ${toolName} - ${error}`,
      toolName,
      context: error,
    }, undefined, 'error');
  }

  // ─── Command Execution ─────────────────────────────────────────────────

  streamCommand(command: string, output: string, exitCode: number): AgentActivity {
    const status: ActivityStatus = exitCode === 0 ? 'success' : 'error';
    return this.streamActivity('command', {
      message: `Command: ${command} \u2192 exit ${exitCode}`,
      command,
      output,
      exitCode,
    }, undefined, status);
  }

  // ─── Progress ──────────────────────────────────────────────────────────

  streamProgress(current: number, total: number): AgentActivity {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    return this.streamActivity('progress', {
      message: `Progress: ${current}/${total} (${percent}%)`,
      current,
      total,
    });
  }

  // ─── Error / Warning ──────────────────────────────────────────────────

  streamError(error: string, context?: string): AgentActivity {
    return this.streamActivity('error', {
      message: `Error: ${error}`,
      context: context ?? error,
    }, undefined, 'error');
  }

  streamWarning(warning: string): AgentActivity {
    return this.streamActivity('warning', {
      message: `Warning: ${warning}`,
      context: warning,
    }, undefined, 'pending');
  }

  // ─── Result ────────────────────────────────────────────────────────────

  streamResult(summary: string): AgentActivity {
    return this.streamActivity('result', {
      message: `Result: ${summary}`,
      summary,
    }, undefined, 'success');
  }

  // ─── Subscribe ─────────────────────────────────────────────────────────

  onActivity(callback: StreamCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  private notifyCallbacks(activity: AgentActivity): void {
    for (const cb of this.callbacks) {
      try {
        cb(activity);
      } catch {
        // callback error should not break streaming
      }
    }
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  getActivities(): AgentActivity[] {
    return [...this.activities];
  }

  getActivitiesByType(type: ActivityType): AgentActivity[] {
    return this.activities.filter((a) => a.type === type);
  }

  getFailedActivities(): AgentActivity[] {
    return this.activities.filter((a) => a.status === 'error');
  }

  getActivityTimeline(): ActivityTimelineEntry[] {
    if (this.activities.length === 0) return [];

    const baseTime = this.startTime.getTime();
    return this.activities.map((activity) => ({
      time: this.formatTimestamp(activity.timestamp),
      activity,
      relativeMs: activity.timestamp.getTime() - baseTime,
    }));
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime.getTime();
  }

  getElapsedFormatted(): string {
    return this.formatDuration(this.getElapsedMs());
  }

  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  // ─── Export ────────────────────────────────────────────────────────────

  exportActivities(): string {
    return JSON.stringify(
      {
        taskId: this.taskId,
        startTime: this.startTime.toISOString(),
        elapsedMs: this.getElapsedMs(),
        totalActivities: this.activities.length,
        activities: this.activities.map((a) => ({
          id: a.id,
          type: a.type,
          timestamp: a.timestamp.toISOString(),
          data: a.data,
          duration: a.duration,
          status: a.status,
        })),
      },
      null,
      2,
    );
  }

  // ─── Formatting ────────────────────────────────────────────────────────

  private formatTimestamp(date: Date): string {
    const ms = date.getTime() - this.startTime.getTime();
    return this.formatDuration(ms);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    return `${minutes}m ${remainSec}s`;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this.activities = [];
    this.callbacks = [];
    this.removeAllListeners();
  }
}
