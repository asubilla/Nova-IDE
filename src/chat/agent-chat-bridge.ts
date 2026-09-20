import { EventEmitter } from 'events';
import { ChatService } from './chat-service';
import { ChatWebSocket, WSEventType } from './chat-websocket';
import {
  ChatMessage,
  ChatSession,
  ChatSessionType,
  ChatMessageType,
} from './chat-types';
import { DiffEngine, DiffResult } from './diff-engine';
import {
  EnhancedSubAgentOrchestrator,
} from '../../core/enhanced-orchestrator';
import {
  AgentTask,
  AgentResult,
  AgentType,
  AgentOutput,
  FileChange,
  LivePreviewEvent,
  Session,
} from '../../core/types';
import { defaultLogger } from '../logging/logger';
import { ChatTaskManager, ChatTask, ChatTaskConfig, ChatTaskStatus } from './chat-task-manager';
import { MessageQueue, QueuedMessage, MessagePriority } from './message-queue';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentChatMessageType =
  | 'task-request'
  | 'task-status'
  | 'task-progress'
  | 'task-complete'
  | 'task-failed'
  | 'task-cancelled'
  | 'task-diff'
  | 'task-preview'
  | 'queue-update'
  | 'agent-status'
  | 'text';

export interface AgentChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  content: string;
  type: AgentChatMessageType;
  taskId?: string;
  progress?: number;
  diff?: DiffResult;
  previewUrl?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface TaskProgressCallback {
  (progress: { taskId: string; percent: number; message: string; timestamp: Date }): void;
}

export interface AgentChatBridgeConfig {
  defaultAgentId?: string;
  maxConcurrentTasks?: number;
  progressIntervalMs?: number;
  enableLivePreview?: boolean;
}

// ─── AgentChatBridge ────────────────────────────────────────────────────────

export class AgentChatBridge extends EventEmitter {
  private chatService: ChatService;
  private chatWebSocket: ChatWebSocket | null = null;
  private orchestrator: EnhancedSubAgentOrchestrator | null = null;
  private taskManager: ChatTaskManager;
  private messageQueue: MessageQueue;
  private diffEngine: DiffEngine;
  private logger: typeof defaultLogger;
  private config: Required<AgentChatBridgeConfig>;

  private progressTimers = new Map<string, ReturnType<typeof setInterval>>();
  private streamingCallbacks = new Map<string, TaskProgressCallback[]>();
  private taskPreviews = new Map<string, string>();
  private taskDiffs = new Map<string, DiffResult>();

  constructor(
    chatService: ChatService,
    config?: AgentChatBridgeConfig,
  ) {
    super();
    this.chatService = chatService;
    this.logger = defaultLogger.child('AgentChatBridge');
    this.config = {
      defaultAgentId: 'nova-default',
      maxConcurrentTasks: 10,
      progressIntervalMs: 2000,
      enableLivePreview: true,
      ...config,
    };

    this.taskManager = new ChatTaskManager();
    this.messageQueue = new MessageQueue();
    this.diffEngine = new DiffEngine();

    this.setupChatListener();
    this.setupOrchestratorEvents();
  }

  // ─── Integration ────────────────────────────────────────────────────────

  setWebSocket(chatWebSocket: ChatWebSocket): void {
    this.chatWebSocket = chatWebSocket;
  }

  setOrchestrator(orchestrator: EnhancedSubAgentOrchestrator): void {
    this.orchestrator = orchestrator;
    this.setupOrchestratorEvents();
  }

  // ─── Send Agent Message ─────────────────────────────────────────────────

  sendAgentMessage(
    sessionId: string,
    agentId: string,
    content: string,
    type: AgentChatMessageType = 'text',
    taskId?: string,
  ): ChatMessage {
    const message = this.chatService.sendMessage({
      sessionId,
      senderId: agentId,
      senderType: 'agent',
      content,
      type: ChatMessageType.AgentResponse,
    });

    this.emit('agent:message', {
      id: `acm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      agentId,
      content,
      type,
      taskId,
      timestamp: new Date(),
    } satisfies AgentChatMessage);

    return message;
  }

  // ─── Request Agent Task ─────────────────────────────────────────────────

  async requestAgentTask(
    sessionId: string,
    userId: string,
    taskDescription: string,
    options?: {
      agentType?: AgentType;
      priority?: number;
      timeoutMs?: number;
    },
  ): Promise<ChatTask> {
    const runningCount = this.taskManager
      .getTaskHistory(sessionId)
      .filter((t) => t.status === 'running').length;

    const config: ChatTaskConfig = {
      sessionId,
      userId,
      description: taskDescription,
      agentType: options?.agentType ?? 'feature-coder',
      priority: options?.priority ?? 5,
      timeoutMs: options?.timeoutMs ?? 300000,
    };

    const task = this.taskManager.createTask(sessionId, userId, config);

    if (runningCount >= this.config.maxConcurrentTasks) {
      this.taskManager.queueTask(task.id);
      this.sendAgentMessage(sessionId, 'system',
        `Task queued. ${runningCount} task(s) currently running. Position in queue: ${this.getQueuePosition(task.id)}`,
        'queue-update',
        task.id,
      );
      this.emit('task:queued', task);
      return task;
    }

    await this.executeTask(task);
    return task;
  }

  private async executeTask(task: ChatTask): Promise<void> {
    this.taskManager.updateStatus(task.id, 'running');

    const statusMessage = this.sendAgentMessage(
      task.config.sessionId,
      task.config.agentType,
      `Starting task: ${task.config.description}`,
      'task-status',
      task.id,
    );

    this.startProgressStreaming(task.id, task.config.sessionId);

    if (this.orchestrator) {
      try {
        const session = await this.orchestrator.executeTask(
          task.config.description,
          process.cwd(),
        );

        this.handleOrchestratorCompletion(task, session);
      } catch (err: any) {
        this.logger.error(`Orchestrator task failed: ${task.id}`, err);
        this.taskManager.updateStatus(task.id, 'failed', err.message);
        this.sendAgentMessage(
          task.config.sessionId,
          task.config.agentType,
          `Task failed: ${err.message}`,
          'task-failed',
          task.id,
        );
        this.emit('task:failed', { task, error: err.message });
        this.processQueue();
      }
    } else {
      this.simulateTaskExecution(task);
    }
  }

  private handleOrchestratorCompletion(task: ChatTask, session: Session): void {
    this.stopProgressStreaming(task.id);

    const changes: FileChange[] = [];
    for (const [, result] of session.results) {
      if (result.output?.changes) {
        changes.push(...result.output.changes);
      }
    }

    let diffResult: DiffResult | undefined;
    if (changes.length > 0) {
      const oldContent = changes.map((c) => c.oldContent ?? '').join('\n');
      const newContent = changes.map((c) => c.newContent).join('\n');
      diffResult = this.diffEngine.computeDiff(oldContent, newContent);
      this.taskDiffs.set(task.id, diffResult);
    }

    const filesChanged = changes.map((c) => c.path);
    this.taskManager.completeTask(task.id, filesChanged);

    const summary = filesChanged.length > 0
      ? `Task completed. ${filesChanged.length} file(s) changed.`
      : 'Task completed.';

    this.sendAgentMessage(
      task.config.sessionId,
      task.config.agentType,
      summary,
      'task-complete',
      task.id,
    );

    if (diffResult) {
      this.sendAgentMessage(
        task.config.sessionId,
        task.config.agentType,
        this.diffEngine.renderDiff(diffResult, 'html' as any),
        'task-diff',
        task.id,
      );
    }

    this.emit('task:completed', { task, filesChanged, diff: diffResult });
    this.processQueue();
  }

  // ─── Cancel Agent Task ──────────────────────────────────────────────────

  cancelAgentTask(sessionId: string, taskId: string, userId: string): boolean {
    const task = this.taskManager.getTaskStatus(taskId);
    if (!task) return false;

    if (task.config.userId !== userId) {
      this.logger.warn(`User ${userId} attempted to cancel task ${taskId} owned by ${task.config.userId}`);
      return false;
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }

    this.stopProgressStreaming(taskId);

    if (task.status === 'queued') {
      this.taskManager.cancelTask(taskId, userId);
      this.sendAgentMessage(sessionId, 'system',
        `Task cancelled.`,
        'task-cancelled',
        taskId,
      );
      this.emit('task:cancelled', task);
      this.processQueue();
      return true;
    }

    if (task.status === 'running' && this.orchestrator) {
      const sessionMap = (this.orchestrator as any).sessions as Map<string, Session>;
      for (const [, session] of sessionMap) {
        const agentTask = session.agents.get(taskId);
        if (agentTask) {
          const controller = session.runningAgents.get(taskId);
          if (controller) {
            controller.abort();
          }
          break;
        }
      }
    }

    this.taskManager.cancelTask(taskId, userId);
    this.sendAgentMessage(sessionId, 'system',
      `Task cancelled.`,
      'task-cancelled',
      taskId,
    );
    this.emit('task:cancelled', task);
    this.processQueue();
    return true;
  }

  // ─── Get Agent Status ───────────────────────────────────────────────────

  getAgentStatus(taskId: string): ChatTask | undefined {
    return this.taskManager.getTaskStatus(taskId);
  }

  // ─── Stream Agent Progress ──────────────────────────────────────────────

  streamAgentProgress(taskId: string, callback: TaskProgressCallback): () => void {
    if (!this.streamingCallbacks.has(taskId)) {
      this.streamingCallbacks.set(taskId, []);
    }
    this.streamingCallbacks.get(taskId)!.push(callback);

    return () => {
      const callbacks = this.streamingCallbacks.get(taskId);
      if (callbacks) {
        const idx = callbacks.indexOf(callback);
        if (idx !== -1) callbacks.splice(idx, 1);
      }
    };
  }

  private startProgressStreaming(taskId: string, sessionId: string): void {
    this.stopProgressStreaming(taskId);

    const timer = setInterval(() => {
      const task = this.taskManager.getTaskStatus(taskId);
      if (!task || task.status !== 'running') {
        this.stopProgressStreaming(taskId);
        return;
      }

      const elapsed = Date.now() - task.startedAt.getTime();
      const timeout = task.config.timeoutMs;
      const percent = Math.min(95, Math.floor((elapsed / timeout) * 100));

      const progress = {
        taskId,
        percent,
        message: `Running... ${Math.floor(elapsed / 1000)}s elapsed`,
        timestamp: new Date(),
      };

      this.taskManager.updateProgress(taskId, percent);

      const callbacks = this.streamingCallbacks.get(taskId);
      if (callbacks) {
        for (const cb of callbacks) {
          try { cb(progress); } catch {}
        }
      }

      if (this.chatWebSocket) {
        this.chatWebSocket.broadcastToSession(sessionId, 'agent:progress' as WSEventType, {
          taskId,
          agentId: task.config.agentType,
          percent,
          message: progress.message,
        });
      }
    }, this.config.progressIntervalMs);

    this.progressTimers.set(taskId, timer);
  }

  private stopProgressStreaming(taskId: string): void {
    const timer = this.progressTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.progressTimers.delete(taskId);
    }
  }

  // ─── Show Task Diff ─────────────────────────────────────────────────────

  showTaskDiff(taskId: string): DiffResult | undefined {
    return this.taskDiffs.get(taskId);
  }

  // ─── Show Task Preview ──────────────────────────────────────────────────

  showTaskPreview(taskId: string): string | undefined {
    return this.taskPreviews.get(taskId);
  }

  // ─── Queue Management ───────────────────────────────────────────────────

  queueTask(sessionId: string, userId: string, task: ChatTask): void {
    this.taskManager.queueTask(task.id);
    this.sendAgentMessage(sessionId, 'system',
      `Task queued. Waiting for available agent.`,
      'queue-update',
      task.id,
    );
    this.emit('task:queued', task);
  }

  processQueue(): void {
    const runningCount = this.taskManager
      .getAllTasks()
      .filter((t) => t.status === 'running').length;

    if (runningCount >= this.config.maxConcurrentTasks) return;

    const queuedTasks = this.taskManager
      .getAllTasks()
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const slotsAvailable = this.config.maxConcurrentTasks - runningCount;

    for (let i = 0; i < Math.min(slotsAvailable, queuedTasks.length); i++) {
      const task = queuedTasks[i];
      this.executeTask(task).catch((err) => {
        this.logger.error(`Failed to execute queued task ${task.id}`, err);
      });
    }
  }

  getQueuedTasks(sessionId: string): ChatTask[] {
    return this.taskManager
      .getTaskHistory(sessionId)
      .filter((t) => t.status === 'queued');
  }

  cancelQueuedTask(taskId: string): boolean {
    const task = this.taskManager.getTaskStatus(taskId);
    if (!task || task.status !== 'queued') return false;

    this.taskManager.cancelTask(taskId, task.config.userId);
    this.emit('task:cancelled', task);
    return true;
  }

  // ─── Rerun Task ─────────────────────────────────────────────────────────

  async rerunTask(taskId: string, userId: string): Promise<ChatTask | null> {
    const original = this.taskManager.getTaskStatus(taskId);
    if (!original) return null;

    if (original.status !== 'completed' && original.status !== 'failed') return null;

    const newTask = this.taskManager.createTask(
      original.config.sessionId,
      userId,
      {
        ...original.config,
        description: `${original.config.description} (rerun)`,
      },
    );

    this.taskDiffs.delete(taskId);
    this.taskPreviews.delete(taskId);

    await this.executeTask(newTask);
    return newTask;
  }

  // ─── Private: Chat Listener ─────────────────────────────────────────────

  private setupChatListener(): void {
    this.chatService.on('message:sent', async (message: ChatMessage) => {
      if (message.senderType !== 'user') return;

      const session = this.chatService.getSession(message.sessionId);
      if (!session) return;
      if (session.type !== ChatSessionType.UserAgent) return;

      const taskRequest = this.parseTaskRequest(message.content);
      if (taskRequest) {
        await this.requestAgentTask(
          message.sessionId,
          message.senderId,
          taskRequest.description,
          {
            agentType: taskRequest.agentType,
            priority: taskRequest.priority,
          },
        );
      }
    });
  }

  private parseTaskRequest(content: string): {
    description: string;
    agentType?: AgentType;
    priority?: number;
  } | null {
    const commandPatterns = [
      { regex: /^\/task\s+(.+)/i, type: 'feature-coder' as AgentType },
      { regex: /^\/fix\s+(.+)/i, type: 'bug-fixer' as AgentType },
      { regex: /^\/refactor\s+(.+)/i, type: 'refactorer' as AgentType },
      { regex: /^\/test\s+(.+)/i, type: 'test-writer' as AgentType },
      { regex: /^\/doc\s+(.+)/i, type: 'doc-generator' as AgentType },
      { regex: /^\/review\s+(.+)/i, type: 'code-reviewer' as AgentType },
      { regex: /^\/security\s+(.+)/i, type: 'security-scanner' as AgentType },
    ];

    for (const pattern of commandPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        return { description: match[1].trim(), agentType: pattern.type };
      }
    }

    return null;
  }

  // ─── Private: Orchestrator Events ───────────────────────────────────────

  private setupOrchestratorEvents(): void {
    if (!this.orchestrator) return;

    this.orchestrator.on('preview', (event: LivePreviewEvent) => {
      if (event.type === 'agent-progress' && event.agentId) {
        const task = this.findTaskByAgentId(event.agentId);
        if (task) {
          const percent = event.data?.progress ?? 50;
          this.taskManager.updateProgress(task.id, percent);

          const callbacks = this.streamingCallbacks.get(task.id);
          if (callbacks) {
            for (const cb of callbacks) {
              try {
                cb({
                  taskId: task.id,
                  percent,
                  message: event.data?.message ?? 'Processing...',
                  timestamp: new Date(),
                });
              } catch {}
            }
          }

          if (this.chatWebSocket) {
            this.chatWebSocket.broadcastToSession(task.config.sessionId, 'agent:progress' as WSEventType, {
              taskId: task.id,
              agentId: event.agentId,
              percent,
              message: event.data?.message,
            });
          }
        }
      }

      if (event.type === 'agent-completed' && event.agentId) {
        const task = this.findTaskByAgentId(event.agentId);
        if (task) {
          if (event.data?.previewUrl) {
            this.taskPreviews.set(task.id, event.data.previewUrl);
          }
        }
      }
    });
  }

  private findTaskByAgentId(agentId: string): ChatTask | undefined {
    const allTasks = this.taskManager.getAllTasks();
    return allTasks.find((t) => t.config.agentType === agentId && t.status === 'running');
  }

  // ─── Private: Simulation (fallback) ─────────────────────────────────────

  private simulateTaskExecution(task: ChatTask): void {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);

        this.stopProgressStreaming(task.id);

        const filesChanged = this.simulateFileChanges(task);
        this.taskManager.completeTask(task.id, filesChanged);

        const oldContent = `// Original ${task.config.description}`;
        const newContent = `// Updated ${task.config.description}\n// Changes applied`;
        const diff = this.diffEngine.computeDiff(oldContent, newContent);
        this.taskDiffs.set(task.id, diff);

        this.sendAgentMessage(
          task.config.sessionId,
          task.config.agentType,
          `Task completed. ${filesChanged.length} file(s) changed.`,
          'task-complete',
          task.id,
        );

        this.emit('task:completed', { task, filesChanged, diff });
        this.processQueue();
      } else {
        this.taskManager.updateProgress(task.id, Math.floor(progress));
      }
    }, 500);
  }

  private simulateFileChanges(task: ChatTask): string[] {
    const baseName = task.config.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    return [`src/${baseName}.ts`, `src/${baseName}.test.ts`];
  }

  private getQueuePosition(taskId: string): number {
    const queued = this.taskManager
      .getAllTasks()
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return queued.findIndex((t) => t.id === taskId) + 1;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    for (const timer of this.progressTimers.values()) {
      clearInterval(timer);
    }
    this.progressTimers.clear();
    this.streamingCallbacks.clear();
    this.taskPreviews.clear();
    this.taskDiffs.clear();
    this.taskManager.destroy();
    this.messageQueue.destroy();
    this.removeAllListeners();
  }
}
