import {
  Session,
  AgentTask,
  AgentType,
  AgentResult,
  AgentSpawnConfig,
  ResourceProfile,
  ProjectAwareDistributionResult,
} from '../core/types';
import { CapabilityRegistry, AgentResourceEstimate } from './capability-registry';
import { ResourceMonitor, AgentResourceSnapshot } from './resource-monitor';

export type SchedulerEvent =
  | { type: 'agent-spawned'; agentId: string; agentType: AgentType }
  | { type: 'agent-queued'; agentId: string; priority: number }
  | { type: 'agent-completed'; agentId: string; success: boolean }
  | { type: 'agent-failed'; agentId: string; error: string }
  | { type: 'agent-preempted'; agentId: string; reason: string }
  | { type: 'queue-empty' }
  | { type: 'resource-warning'; agentId: string; resource: string; usage: number };

export interface SchedulerConfig {
  maxConcurrentAgents: number;
  maxQueueSize: number;
  preemptionEnabled: boolean;
  resourceCheckEnabled: boolean;
  idleTimeoutMs: number;
  priorityBoostIntervalMs: number;
}

export interface QueuedTask {
  task: AgentTask;
  queuedAt: Date;
  priority: number;
  effectivePriority: number;
  retryCount: number;
  waitTimeMs: number;
}

export interface RunningAgent {
  task: AgentTask;
  startedAt: Date;
  abortController: AbortController;
  resourceSnapshot: AgentResourceSnapshot | null;
}

interface SchedulerState {
  queued: QueuedTask[];
  running: Map<string, RunningAgent>;
  completed: Map<string, AgentResult>;
  failed: Map<string, AgentResult>;
  lastPriorityBoost: Date;
  totalSpawned: number;
  totalCompleted: number;
  totalFailed: number;
}

export type SchedulerEventListener = (event: SchedulerEvent) => void;

export class AgentScheduler {
  private config: SchedulerConfig;
  private capabilityRegistry: CapabilityRegistry;
  private resourceMonitor: ResourceMonitor;
  private state: SchedulerState;
  private listeners: SchedulerEventListener[] = [];
  private schedulingTimer: NodeJS.Timeout | null = null;
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private priorityBoostTimer: NodeJS.Timeout | null = null;
  private isPaused: boolean = false;

  constructor(
    capabilityRegistry: CapabilityRegistry,
    resourceMonitor: ResourceMonitor,
    config?: Partial<SchedulerConfig>
  ) {
    this.capabilityRegistry = capabilityRegistry;
    this.resourceMonitor = resourceMonitor;
    this.config = {
      maxConcurrentAgents: 6,
      maxQueueSize: 50,
      preemptionEnabled: true,
      resourceCheckEnabled: true,
      idleTimeoutMs: 30000,
      priorityBoostIntervalMs: 60000,
      ...config,
    };

    this.state = {
      queued: [],
      running: new Map(),
      completed: new Map(),
      failed: new Map(),
      lastPriorityBoost: new Date(),
      totalSpawned: 0,
      totalCompleted: 0,
      totalFailed: 0,
    };
  }

  onEvent(listener: SchedulerEventListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: SchedulerEventListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private emit(event: SchedulerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  start(distributionResult: ProjectAwareDistributionResult): void {
    const tasks = distributionResult.assignedAgents;
    const plan = distributionResult.distributionPlan;

    const allTasks: AgentTask[] = [];
    for (const [, task] of tasks) {
      allTasks.push(task);
    }

    allTasks.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.spawnOrder - b.spawnOrder;
    });

    for (const task of allTasks) {
      this.enqueue(task);
    }

    this.schedulingTimer = setInterval(() => this.scheduleTick(), 100);
    this.idleCheckTimer = setInterval(() => this.checkIdle(), this.config.idleTimeoutMs);
    this.priorityBoostTimer = setInterval(() => this.boostPriorities(), this.config.priorityBoostIntervalMs);

    this.scheduleTick();
  }

  stop(): void {
    if (this.schedulingTimer) clearInterval(this.schedulingTimer);
    if (this.idleCheckTimer) clearInterval(this.idleCheckTimer);
    if (this.priorityBoostTimer) clearInterval(this.priorityBoostTimer);

    for (const [, agent] of this.state.running) {
      agent.abortController.abort();
    }

    this.schedulingTimer = null;
    this.idleCheckTimer = null;
    this.priorityBoostTimer = null;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.scheduleTick();
  }

  enqueue(task: AgentTask): void {
    if (this.state.queued.length >= this.config.maxQueueSize) {
      const lowestPriority = this.state.queued[this.state.queued.length - 1];
      if (lowestPriority && task.priority > lowestPriority.priority) {
        this.state.queued.pop();
        this.state.queued.push({
          task,
          queuedAt: new Date(),
          priority: task.priority,
          effectivePriority: task.priority,
          retryCount: 0,
          waitTimeMs: 0,
        });
        this.sortQueue();
      }
      return;
    }

    this.state.queued.push({
      task,
      queuedAt: new Date(),
      priority: task.priority,
      effectivePriority: task.priority,
      retryCount: 0,
      waitTimeMs: 0,
    });

    this.sortQueue();
    this.emit({ type: 'agent-queued', agentId: task.id, priority: task.priority });
  }

  private sortQueue(): void {
    this.state.queued.sort((a, b) => {
      const priorityDiff = b.effectivePriority - a.effectivePriority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });
  }

  private scheduleTick(): void {
    if (this.isPaused) return;

    this.updateWaitTimes();
    this.boostStalePriorities();

    while (this.canSpawnMore()) {
      const nextTask = this.dequeueNextTask();
      if (!nextTask) break;

      if (!this.areDependenciesMet(nextTask.task)) {
        this.requeueWithDepWait(nextTask);
        break;
      }

      if (this.config.resourceCheckEnabled) {
        if (!this.hasEnoughResources(nextTask.task)) {
          if (this.config.preemptionEnabled) {
            const preempted = this.tryPreempt(nextTask);
            if (!preempted) {
              this.requeueWithResourceWait(nextTask);
              break;
            }
          } else {
            this.requeueWithResourceWait(nextTask);
            break;
          }
        }
      }

      this.spawnAgent(nextTask);
    }
  }

  private canSpawnMore(): boolean {
    return this.state.running.size < this.config.maxConcurrentAgents;
  }

  private dequeueNextTask(): QueuedTask | null {
    for (let i = 0; i < this.state.queued.length; i++) {
      const task = this.state.queued[i];
      if (this.areDependenciesMet(task.task)) {
        this.state.queued.splice(i, 1);
        return task;
      }
    }

    if (this.state.queued.length > 0) {
      const task = this.state.queued.shift()!;
      return task;
    }

    return null;
  }

  private areDependenciesMet(task: AgentTask): boolean {
    for (const depId of task.dependencies) {
      if (!this.state.completed.has(depId) && !this.isDependencyOptional(depId)) {
        return false;
      }
    }
    return true;
  }

  private isDependencyOptional(depId: string): boolean {
    return false;
  }

  private hasEnoughResources(task: AgentTask): boolean {
    const resourceEstimate = this.capabilityRegistry.estimateResources(
      task.type,
      this.classifyTaskSize(task)
    );

    const currentUsage = this.resourceMonitor.getSystemSnapshot();
    if (!currentUsage) return true;

    const totalMemory = this.calculateRunningMemory() + resourceEstimate.memoryMB;
    const totalCpu = this.calculateRunningCpu() + resourceEstimate.cpuPercent;

    return totalMemory < 8192 && totalCpu < 90;
  }

  private calculateRunningMemory(): number {
    let total = 0;
    for (const [, agent] of this.state.running) {
      if (agent.resourceSnapshot) {
        total += agent.resourceSnapshot.memoryMB;
      } else {
        const estimate = this.capabilityRegistry.estimateResources(agent.task.type);
        total += estimate.memoryMB;
      }
    }
    return total;
  }

  private calculateRunningCpu(): number {
    let total = 0;
    for (const [, agent] of this.state.running) {
      if (agent.resourceSnapshot) {
        total += agent.resourceSnapshot.cpuPercent;
      } else {
        const estimate = this.capabilityRegistry.estimateResources(agent.task.type);
        total += estimate.cpuPercent;
      }
    }
    return total;
  }

  private tryPreempt(newTask: QueuedTask): boolean {
    if (!this.config.preemptionEnabled) return false;

    let lowestPriorityAgent: [string, RunningAgent] | null = null;
    let lowestPriority = Infinity;

    for (const [id, agent] of this.state.running) {
      const agentPriority = agent.task.priority;
      if (agentPriority < lowestPriority && agentPriority < newTask.priority) {
        lowestPriority = agentPriority;
        lowestPriorityAgent = [id, agent];
      }
    }

    if (lowestPriorityAgent) {
      const [id, agent] = lowestPriorityAgent;
      agent.abortController.abort();
      this.state.running.delete(id);

      this.requeueWithPreemption({
        task: agent.task,
        queuedAt: agent.startedAt,
        priority: agent.task.priority,
        effectivePriority: agent.task.priority,
        retryCount: 0,
        waitTimeMs: 0,
      });

      this.emit({
        type: 'agent-preempted',
        agentId: id,
        reason: `Preempted for higher priority task ${newTask.task.id}`,
      });

      return true;
    }

    return false;
  }

  private requeueWithDepWait(task: QueuedTask): void {
    task.effectivePriority = Math.max(task.priority - 1, 0);
    this.state.queued.push(task);
    this.sortQueue();
  }

  private requeueWithResourceWait(task: QueuedTask): void {
    this.state.queued.push(task);
    this.sortQueue();
  }

  private requeueWithPreemption(task: QueuedTask): void {
    task.effectivePriority = Math.max(task.priority - 2, 0);
    this.state.queued.push(task);
    this.sortQueue();
  }

  private spawnAgent(queuedTask: QueuedTask): void {
    const task = queuedTask.task;
    const abortController = new AbortController();

    const runningAgent: RunningAgent = {
      task,
      startedAt: new Date(),
      abortController,
      resourceSnapshot: null,
    };

    this.state.running.set(task.id, runningAgent);
    this.state.totalSpawned++;

    this.emit({ type: 'agent-spawned', agentId: task.id, agentType: task.type });

    this.simulateAgentExecution(task, abortController);
  }

  private async simulateAgentExecution(task: AgentTask, abortController: AbortController): Promise<void> {
    const resourceEstimate = this.capabilityRegistry.estimateResources(
      task.type,
      this.classifyTaskSize(task)
    );

    const runningAgent = this.state.running.get(task.id);
    if (runningAgent) {
      runningAgent.resourceSnapshot = {
        agentId: task.id,
        memoryMB: resourceEstimate.memoryMB,
        cpuPercent: resourceEstimate.cpuPercent,
        diskMB: resourceEstimate.diskMB,
        networkMbps: resourceEstimate.networkMbps,
        timestamp: new Date(),
      };
    }

    const duration = resourceEstimate.estimatedDurationMs;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), duration);
      abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    if (abortController.signal.aborted) {
      return;
    }

    this.completeAgent(task.id, {
      taskId: task.id,
      agentType: task.type,
      status: 'completed',
      output: { files: [], artifacts: [], changes: [] },
      summary: {
        overview: `Task ${task.name} completed`,
        keyDecisions: [],
        filesModified: task.assignedFiles,
        testsAdded: [],
        issuesFound: [],
        recommendations: [],
        metrics: {
          linesAdded: 0,
          linesRemoved: 0,
          filesTouched: task.assignedFiles.length,
          testCoverageDelta: 0,
          complexityDelta: 0,
          durationMs: duration,
        },
      },
      validationResults: [],
      retryCount: 0,
      startedAt: runningAgent?.startedAt || new Date(),
      completedAt: new Date(),
      logs: [],
      fixLoopHistory: [],
      qualityGateResults: [],
      coordinationMessages: [],
      resourceConsumption: {
        memoryMB: resourceEstimate.memoryMB,
        cpuPercent: resourceEstimate.cpuPercent,
        diskMB: resourceEstimate.diskMB,
        networkMbps: resourceEstimate.networkMbps,
      },
      artifactsProduced: [],
      childResults: new Map(),
    });
  }

  completeAgent(agentId: string, result: AgentResult): void {
    this.state.running.delete(agentId);
    this.state.completed.set(agentId, result);
    this.state.totalCompleted++;

    this.capabilityRegistry.updateUsageStats(result.agentType, result.summary.metrics.durationMs, true);

    const success = result.status === 'completed';
    this.emit({ type: 'agent-completed', agentId, success });

    this.scheduleTick();
  }

  failAgent(agentId: string, error: string): void {
    const running = this.state.running.get(agentId);
    if (!running) return;

    this.state.running.delete(agentId);

    const result: AgentResult = {
      taskId: agentId,
      agentType: running.task.type,
      status: 'failed',
      output: { files: [], artifacts: [], changes: [] },
      summary: {
        overview: `Task failed: ${error}`,
        keyDecisions: [],
        filesModified: [],
        testsAdded: [],
        issuesFound: [],
        recommendations: [],
        metrics: {
          linesAdded: 0,
          linesRemoved: 0,
          filesTouched: 0,
          testCoverageDelta: 0,
          complexityDelta: 0,
          durationMs: Date.now() - running.startedAt.getTime(),
        },
      },
      validationResults: [],
      retryCount: 0,
      startedAt: running.startedAt,
      completedAt: new Date(),
      error: {
        code: 'AGENT_FAILED',
        message: error,
        category: 'execution',
        recoverable: true,
      },
      logs: [],
      fixLoopHistory: [],
      qualityGateResults: [],
      coordinationMessages: [],
      resourceConsumption: { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 },
      artifactsProduced: [],
      childResults: new Map(),
    };

    this.state.failed.set(agentId, result);
    this.state.totalFailed++;

    this.capabilityRegistry.updateUsageStats(running.task.type, Date.now() - running.startedAt.getTime(), false);

    this.emit({ type: 'agent-failed', agentId, error });

    this.scheduleTick();
  }

  private updateWaitTimes(): void {
    const now = Date.now();
    for (const queued of this.state.queued) {
      queued.waitTimeMs = now - queued.queuedAt.getTime();
    }
  }

  private boostStalePriorities(): void {
    const staleThreshold = 30000;
    for (const queued of this.state.queued) {
      if (queued.waitTimeMs > staleThreshold) {
        const boost = Math.min(Math.floor(queued.waitTimeMs / staleThreshold), 3);
        queued.effectivePriority = queued.priority + boost;
      }
    }
    this.sortQueue();
  }

  private boostPriorities(): void {
    const now = new Date();
    const elapsed = now.getTime() - this.state.lastPriorityBoost.getTime();

    if (elapsed >= this.config.priorityBoostIntervalMs) {
      for (const queued of this.state.queued) {
        queued.effectivePriority += 1;
      }
      this.sortQueue();
      this.state.lastPriorityBoost = now;
    }
  }

  private checkIdle(): void {
    if (this.state.running.size === 0 && this.state.queued.length === 0) {
      this.emit({ type: 'queue-empty' });
    }

    const now = Date.now();
    for (const [id, agent] of this.state.running) {
      const runningTime = now - agent.startedAt.getTime();
      if (runningTime > 600000) {
        this.emit({
          type: 'resource-warning',
          agentId: id,
          resource: 'time',
          usage: runningTime,
        });
      }
    }
  }

  private classifyTaskSize(task: AgentTask): 'small' | 'medium' | 'large' {
    if (task.assignedFiles.length <= 3 && task.estimatedTokens < 5000) return 'small';
    if (task.assignedFiles.length > 10 || task.estimatedTokens > 20000) return 'large';
    return 'medium';
  }

  getQueuedTasks(): QueuedTask[] {
    return [...this.state.queued];
  }

  getRunningAgents(): Map<string, RunningAgent> {
    return new Map(this.state.running);
  }

  getCompletedResults(): Map<string, AgentResult> {
    return new Map(this.state.completed);
  }

  getFailedResults(): Map<string, AgentResult> {
    return new Map(this.state.failed);
  }

  getStatus(): {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    totalSpawned: number;
  } {
    return {
      queued: this.state.queued.length,
      running: this.state.running.size,
      completed: this.state.totalCompleted,
      failed: this.state.totalFailed,
      totalSpawned: this.state.totalSpawned,
    };
  }

  cancelAgent(agentId: string): boolean {
    const running = this.state.running.get(agentId);
    if (running) {
      running.abortController.abort();
      this.state.running.delete(agentId);
      this.emit({ type: 'agent-preempted', agentId, reason: 'Cancelled by user' });
      return true;
    }

    const queueIndex = this.state.queued.findIndex(q => q.task.id === agentId);
    if (queueIndex >= 0) {
      this.state.queued.splice(queueIndex, 1);
      return true;
    }

    return false;
  }

  reprioritize(agentId: string, newPriority: number): boolean {
    const queued = this.state.queued.find(q => q.task.id === agentId);
    if (queued) {
      queued.priority = newPriority;
      queued.effectivePriority = newPriority;
      this.sortQueue();
      return true;
    }

    const running = this.state.running.get(agentId);
    if (running) {
      running.task.priority = newPriority;
      return true;
    }

    return false;
  }

  getStats(): {
    avgWaitTimeMs: number;
    avgRunTimeMs: number;
    throughputPerMinute: number;
    queueUtilization: number;
  } {
    const now = Date.now();
    const avgWaitTime = this.state.queued.length > 0
      ? this.state.queued.reduce((sum, q) => sum + q.waitTimeMs, 0) / this.state.queued.length
      : 0;

    let totalRunTime = 0;
    let count = 0;
    for (const [, result] of this.state.completed) {
      totalRunTime += result.summary.metrics.durationMs;
      count++;
    }
    const avgRunTime = count > 0 ? totalRunTime / count : 0;

    const completedCount = this.state.totalCompleted;
    const timeSinceStart = this.state.totalSpawned > 0
      ? (now - (this.state.queued[0]?.queuedAt.getTime() || now)) / 60000
      : 1;
    const throughput = completedCount / Math.max(timeSinceStart, 0.1);

    const queueUtilization = this.state.running.size / this.config.maxConcurrentAgents;

    return {
      avgWaitTimeMs: Math.round(avgWaitTime),
      avgRunTimeMs: Math.round(avgRunTime),
      throughputPerMinute: Math.round(throughput * 100) / 100,
      queueUtilization: Math.round(queueUtilization * 100) / 100,
    };
  }
}
