import { EventEmitter } from 'events';
import { AgentType } from '../../core/types';
import { DiffEngine, DiffResult } from './diff-engine';
import { defaultLogger } from '../logging/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChatTaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ChatTaskConfig {
  sessionId: string;
  userId: string;
  description: string;
  agentType: AgentType;
  priority: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

export interface ChatTask {
  id: string;
  config: ChatTaskConfig;
  status: ChatTaskStatus;
  progress: number;
  filesChanged: string[];
  diff?: DiffResult;
  previewUrl?: string;
  logs: ChatTaskLog[];
  error?: string;
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatTaskLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

export interface ChatTaskSnapshot {
  filesChanged: string[];
  diff?: DiffResult;
  previewUrl?: string;
  logs: ChatTaskLog[];
}

// ─── ChatTaskManager ────────────────────────────────────────────────────────

export class ChatTaskManager extends EventEmitter {
  private tasks = new Map<string, ChatTask>();
  private sessionTasks = new Map<string, Set<string>>();
  private snapshots = new Map<string, ChatTaskSnapshot>();
  private logger: typeof defaultLogger;
  private taskIdCounter = 0;

  constructor() {
    super();
    this.logger = defaultLogger.child('ChatTaskManager');
  }

  // ─── Create Task ────────────────────────────────────────────────────────

  createTask(sessionId: string, userId: string, config: ChatTaskConfig): ChatTask {
    const now = new Date();
    const task: ChatTask = {
      id: `ctask-${++this.taskIdCounter}-${Date.now().toString(36)}`,
      config,
      status: 'pending',
      progress: 0,
      filesChanged: [],
      logs: [],
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);

    if (!this.sessionTasks.has(sessionId)) {
      this.sessionTasks.set(sessionId, new Set());
    }
    this.sessionTasks.get(sessionId)!.add(task.id);

    this.addLog(task.id, 'info', `Task created: ${config.description}`);
    this.emit('task:created', task);

    return task;
  }

  // ─── Cancel Task ────────────────────────────────────────────────────────

  cancelTask(taskId: string, userId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }

    task.status = 'cancelled';
    task.endedAt = new Date();
    task.updatedAt = new Date();
    this.addLog(taskId, 'info', `Task cancelled by ${userId}`);

    this.emit('task:cancelled', task);
    return true;
  }

  // ─── Pause Task ─────────────────────────────────────────────────────────

  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'paused';
    task.updatedAt = new Date();
    this.addLog(taskId, 'info', 'Task paused');

    this.saveSnapshot(taskId);
    this.emit('task:paused', task);
    return true;
  }

  // ─── Resume Task ────────────────────────────────────────────────────────

  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') return false;

    task.status = 'running';
    task.updatedAt = new Date();
    this.addLog(taskId, 'info', 'Task resumed');

    this.emit('task:resumed', task);
    return true;
  }

  // ─── Queue Task ─────────────────────────────────────────────────────────

  queueTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== 'pending' && task.status !== 'cancelled')) return false;

    task.status = 'queued';
    task.updatedAt = new Date();
    this.addLog(taskId, 'info', 'Task queued');

    this.emit('task:queued', task);
    return true;
  }

  // ─── Update Status ──────────────────────────────────────────────────────

  updateStatus(taskId: string, status: ChatTaskStatus, error?: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const previousStatus = task.status;
    task.status = status;
    task.updatedAt = new Date();

    if (status === 'running' && previousStatus !== 'running') {
      task.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      task.endedAt = new Date();
    }

    if (error) {
      task.error = error;
      this.addLog(taskId, 'error', `Task failed: ${error}`);
    }

    this.emit('task:statusChanged', { task, previousStatus });
    return true;
  }

  // ─── Update Progress ────────────────────────────────────────────────────

  updateProgress(taskId: string, progress: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.progress = Math.max(0, Math.min(100, progress));
    task.updatedAt = new Date();

    this.emit('task:progress', { taskId, progress: task.progress });
    return true;
  }

  // ─── Complete Task ──────────────────────────────────────────────────────

  completeTask(taskId: string, filesChanged?: string[]): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'completed';
    task.progress = 100;
    task.endedAt = new Date();
    task.updatedAt = new Date();

    if (filesChanged) {
      task.filesChanged = filesChanged;
    }

    this.addLog(taskId, 'info', `Task completed. ${task.filesChanged.length} file(s) changed.`);

    this.emit('task:completed', task);
    return true;
  }

  // ─── Get Task Status ────────────────────────────────────────────────────

  getTaskStatus(taskId: string): ChatTask | undefined {
    return this.tasks.get(taskId);
  }

  // ─── Get Task Diff ──────────────────────────────────────────────────────

  getTaskDiff(taskId: string): DiffResult | undefined {
    const task = this.tasks.get(taskId);
    return task?.diff;
  }

  setTaskDiff(taskId: string, diff: DiffResult): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.diff = diff;
      task.updatedAt = new Date();
    }
  }

  // ─── Get Task Preview ───────────────────────────────────────────────────

  getTaskPreview(taskId: string): string | undefined {
    const task = this.tasks.get(taskId);
    return task?.previewUrl;
  }

  setTaskPreview(taskId: string, previewUrl: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.previewUrl = previewUrl;
      task.updatedAt = new Date();
    }
  }

  // ─── Get Task Logs ──────────────────────────────────────────────────────

  getTaskLogs(taskId: string): ChatTaskLog[] {
    return this.tasks.get(taskId)?.logs ?? [];
  }

  addLog(taskId: string, level: ChatTaskLog['level'], message: string, data?: Record<string, unknown>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.logs.push({
      timestamp: new Date(),
      level,
      message,
      data,
    });
  }

  // ─── Rollback Task ──────────────────────────────────────────────────────

  rollbackTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status !== 'completed' && task.status !== 'failed') return false;

    const snapshot = this.snapshots.get(taskId);
    if (snapshot) {
      this.addLog(taskId, 'info', `Rolled back ${snapshot.filesChanged.length} file(s)`);
      task.filesChanged = [];
      task.diff = undefined;
      task.updatedAt = new Date();
    } else {
      this.addLog(taskId, 'warn', 'No snapshot available for rollback');
    }

    this.emit('task:rolledback', task);
    return true;
  }

  // ─── Get Task History ───────────────────────────────────────────────────

  getTaskHistory(sessionId: string): ChatTask[] {
    const taskIds = this.sessionTasks.get(sessionId);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map((id) => this.tasks.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getAllTasks(): ChatTask[] {
    return Array.from(this.tasks.values());
  }

  // ─── Snapshot ───────────────────────────────────────────────────────────

  private saveSnapshot(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    this.snapshots.set(taskId, {
      filesChanged: [...task.filesChanged],
      diff: task.diff,
      previewUrl: task.previewUrl,
      logs: [...task.logs],
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.tasks.clear();
    this.sessionTasks.clear();
    this.snapshots.clear();
    this.removeAllListeners();
  }
}
