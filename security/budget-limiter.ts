// =============================================================================
// Budget Limiter - Comprehensive timeout, token, and budget limits per agent
// =============================================================================

export interface SessionBudget {
  maxTotalTokens: number;
  maxTotalCostUSD: number;
  maxTotalDurationMs: number;
  maxAgentsSpawned: number;
  maxConcurrentAgents: number;
  maxRetries: number;
  maxAPIRequests: number;
}

export interface AgentBudget {
  maxTokens: number;
  maxCostUSD: number;
  maxDurationMs: number;
  maxRetries: number;
  maxToolInvocations: number;
  maxFileSize: number;
  maxFilesCreated: number;
  maxFilesModified: number;
  maxBashCommands: number;
}

export interface TaskBudget {
  maxTokens: number;
  maxCostUSD: number;
  maxDurationMs: number;
  maxAgents: number;
  maxDepth: number;
}

export interface GlobalBudget {
  maxTotalTokens: number;
  maxTotalCostUSD: number;
  maxTotalDurationMs: number;
  dailyTokenLimit: number;
  dailyCostLimit: number;
  monthlyTokenLimit: number;
  monthlyCostLimit: number;
}

export interface BudgetConfig {
  perSession: SessionBudget;
  perAgent: AgentBudget;
  perTask: TaskBudget;
  global: GlobalBudget;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  model: string;
  timestamp: Date;
}

export interface UsageSnapshot {
  timestamp: Date;
  metrics: Record<string, number>;
}

export interface BudgetStatus {
  session: { used: number; limit: number; remaining: number; percentUsed: number };
  agent: { used: number; limit: number; remaining: number; percentUsed: number };
  task: { used: number; limit: number; remaining: number; percentUsed: number };
  global: { used: number; limit: number; remaining: number; percentUsed: number };
  isOverBudget: boolean;
  warnings: BudgetWarning[];
}

export interface BudgetWarning {
  type: 'approaching_limit' | 'at_limit' | 'over_limit' | 'daily_limit' | 'monthly_limit';
  scope: 'session' | 'agent' | 'task' | 'global';
  metric: string;
  current: number;
  limit: number;
  percentUsed: number;
  timestamp: Date;
}

export interface BudgetEnforcement {
  action: 'warn' | 'throttle' | 'pause' | 'kill' | 'reject';
  threshold: number;
  cooldownMs: number;
}

export interface UsageSummary {
  tokensUsed: number;
  costUSD: number;
  durationMs: number;
  toolInvocations: number;
  filesCreated: number;
  filesModified: number;
  bashCommands: number;
  agentSpawns: number;
}

export interface EnforcementAction {
  type: 'warn' | 'throttle' | 'pause' | 'kill' | 'reject';
  reason: string;
  target: 'session' | 'agent' | 'task';
  targetId: string;
}

export interface CostBreakdown {
  byAgent: { agentId: string; agentType: string; tokens: number; cost: number }[];
  byModel: { model: string; tokens: number; cost: number }[];
  byTool: { tool: string; invocations: number; estimatedCost: number }[];
  total: { tokens: number; cost: number };
}

// =============================================================================
// Model Pricing Data
// =============================================================================

export const MODEL_PRICING: Record<string, { promptPricePer1k: number; completionPricePer1k: number }> = {
  'gpt-4o': { promptPricePer1k: 2.5, completionPricePer1k: 10.0 },
  'gpt-4o-mini': { promptPricePer1k: 0.15, completionPricePer1k: 0.6 },
  'claude-3.5-sonnet': { promptPricePer1k: 3.0, completionPricePer1k: 15.0 },
  'claude-3-haiku': { promptPricePer1k: 0.25, completionPricePer1k: 1.25 },
  'gemini-2.0-flash': { promptPricePer1k: 0.1, completionPricePer1k: 0.4 },
};

// =============================================================================
// Default Budget Config
// =============================================================================

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  perSession: {
    maxTotalTokens: 10_000_000,
    maxTotalCostUSD: 100,
    maxTotalDurationMs: 3_600_000,
    maxAgentsSpawned: 100,
    maxConcurrentAgents: 20,
    maxRetries: 50,
    maxAPIRequests: 1000,
  },
  perAgent: {
    maxTokens: 100_000,
    maxCostUSD: 5,
    maxDurationMs: 300_000,
    maxRetries: 3,
    maxToolInvocations: 100,
    maxFileSize: 1_048_576,
    maxFilesCreated: 20,
    maxFilesModified: 50,
    maxBashCommands: 20,
  },
  perTask: {
    maxTokens: 500_000,
    maxCostUSD: 25,
    maxDurationMs: 600_000,
    maxAgents: 10,
    maxDepth: 5,
  },
  global: {
    maxTotalTokens: 100_000_000,
    maxTotalCostUSD: 1000,
    maxTotalDurationMs: 86_400_000,
    dailyTokenLimit: 50_000_000,
    dailyCostLimit: 500,
    monthlyTokenLimit: 1_000_000_000,
    monthlyCostLimit: 5000,
  },
};

// =============================================================================
// UsageTracker
// =============================================================================

export class UsageTracker {
  private metrics: Map<string, number> = new Map();
  private history: UsageSnapshot[] = [];
  private snapshotInterval: number = 50;
  private operationCount: number = 0;

  track(metric: string, value: number): void {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + value);
    this.operationCount++;
    if (this.operationCount % this.snapshotInterval === 0) {
      this.takeSnapshot();
    }
  }

  set(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  get(metric: string): number {
    return this.metrics.get(metric) || 0;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.metrics) {
      result[key] = value;
    }
    return result;
  }

  getTotal(): number {
    let total = 0;
    for (const value of this.metrics.values()) {
      total += value;
    }
    return total;
  }

  isOverLimit(limit: number): boolean {
    return this.getTotal() > limit;
  }

  isMetricOverLimit(metric: string, limit: number): boolean {
    return this.get(metric) > limit;
  }

  getPercentUsed(limit: number): number {
    if (limit <= 0) return 100;
    return Math.min(100, (this.getTotal() / limit) * 100);
  }

  getMetricPercentUsed(metric: string, limit: number): number {
    if (limit <= 0) return 100;
    return Math.min(100, (this.get(metric) / limit) * 100);
  }

  getHistory(): UsageSnapshot[] {
    return [...this.history];
  }

  reset(): void {
    this.metrics.clear();
    this.history = [];
    this.operationCount = 0;
  }

  resetMetric(metric: string): void {
    this.metrics.delete(metric);
  }

  private takeSnapshot(): void {
    this.history.push({
      timestamp: new Date(),
      metrics: this.getAll(),
    });
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }
}

// =============================================================================
// BudgetLimiter
// =============================================================================

export class BudgetLimiter {
  private config: BudgetConfig;
  private sessionUsage: Map<string, UsageTracker> = new Map();
  private agentUsage: Map<string, UsageTracker> = new Map();
  private taskUsage: Map<string, UsageTracker> = new Map();
  private sessionAgentMap: Map<string, Set<string>> = new Map();
  private agentTaskMap: Map<string, string> = new Map();
  private agentSessionMap: Map<string, string> = new Map();
  private globalUsage: UsageTracker;
  private dailyUsage: UsageTracker;
  private monthlyUsage: UsageTracker;
  private enforcement: BudgetEnforcement[];
  private warnings: BudgetWarning[] = [];
  private listeners: {
    onWarning: Array<(warning: BudgetWarning) => void>;
    onLimit: Array<(action: EnforcementAction) => void>;
    onKill: Array<(target: string, id: string) => void>;
  } = { onWarning: [], onLimit: [], onKill: [] };
  private pausedAgents: Set<string> = new Set();
  private pausedSessions: Set<string> = new Set();
  private lastDayReset: Date = new Date();
  private lastMonthReset: Date = new Date();

  constructor(config: BudgetConfig) {
    this.config = config;
    this.globalUsage = new UsageTracker();
    this.dailyUsage = new UsageTracker();
    this.monthlyUsage = new UsageTracker();
    this.enforcement = [
      { action: 'warn', threshold: 75, cooldownMs: 60_000 },
      { action: 'throttle', threshold: 90, cooldownMs: 30_000 },
      { action: 'pause', threshold: 95, cooldownMs: 10_000 },
      { action: 'kill', threshold: 100, cooldownMs: 0 },
      { action: 'reject', threshold: 105, cooldownMs: 0 },
    ];
  }

  // ===========================================================================
  // Session & Agent Management
  // ===========================================================================

  private getOrCreateSession(sessionId: string): UsageTracker {
    if (!this.sessionUsage.has(sessionId)) {
      this.sessionUsage.set(sessionId, new UsageTracker());
    }
    return this.sessionUsage.get(sessionId)!;
  }

  private getOrCreateAgent(agentId: string): UsageTracker {
    if (!this.agentUsage.has(agentId)) {
      this.agentUsage.set(agentId, new UsageTracker());
    }
    return this.agentUsage.get(agentId)!;
  }

  private getOrCreateTask(taskId: string): UsageTracker {
    if (!this.taskUsage.has(taskId)) {
      this.taskUsage.set(taskId, new UsageTracker());
    }
    return this.taskUsage.get(taskId)!;
  }

  private getAgentSession(agentId: string): string | undefined {
    return this.agentSessionMap.get(agentId);
  }

  private getTaskAgent(taskId: string): string | undefined {
    return this.agentTaskMap.get(taskId);
  }

  // ===========================================================================
  // Time Period Management
  // ===========================================================================

  private checkTimePeriodResets(): void {
    const now = new Date();
    const currentDay = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const lastDay = `${this.lastDayReset.getFullYear()}-${this.lastDayReset.getMonth()}-${this.lastDayReset.getDate()}`;
    if (currentDay !== lastDay) {
      this.dailyUsage.reset();
      this.lastDayReset = now;
    }
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonth = `${this.lastMonthReset.getFullYear()}-${this.lastMonthReset.getMonth()}`;
    if (currentMonth !== lastMonth) {
      this.monthlyUsage.reset();
      this.lastMonthReset = now;
    }
  }

  // ===========================================================================
  // Usage Tracking
  // ===========================================================================

  trackTokens(sessionId: string, agentId: string, taskId: string, usage: TokenUsage): void {
    this.checkTimePeriodResets();
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    const task = taskId ? this.getOrCreateTask(taskId) : null;

    session.track('tokens', usage.totalTokens);
    session.track('cost', usage.estimatedCostUSD);
    session.track('apiRequests', 1);

    agent.track('tokens', usage.totalTokens);
    agent.track('cost', usage.estimatedCostUSD);
    agent.track('promptTokens', usage.promptTokens);
    agent.track('completionTokens', usage.completionTokens);

    if (task) {
      task.track('tokens', usage.totalTokens);
      task.track('cost', usage.estimatedCostUSD);
    }

    this.globalUsage.track('tokens', usage.totalTokens);
    this.globalUsage.track('cost', usage.estimatedCostUSD);

    this.dailyUsage.track('tokens', usage.totalTokens);
    this.dailyUsage.track('cost', usage.estimatedCostUSD);

    this.monthlyUsage.track('tokens', usage.totalTokens);
    this.monthlyUsage.track('cost', usage.estimatedCostUSD);

    this.checkLimits(sessionId, agentId, taskId);
  }

  trackToolInvocation(sessionId: string, agentId: string, _tool: string): void {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    session.track('toolInvocations', 1);
    agent.track('toolInvocations', 1);
    this.globalUsage.track('toolInvocations', 1);
  }

  trackFileOperation(sessionId: string, agentId: string, operation: 'create' | 'modify' | 'delete', size: number): void {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    session.track('fileOperations', 1);
    agent.track('fileOperations', 1);
    agent.track('fileSize', size);
    this.globalUsage.track('fileOperations', 1);
    if (operation === 'create') {
      agent.track('filesCreated', 1);
      session.track('filesCreated', 1);
    } else if (operation === 'modify') {
      agent.track('filesModified', 1);
      session.track('filesModified', 1);
    }
  }

  trackBashCommand(sessionId: string, agentId: string): void {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    session.track('bashCommands', 1);
    agent.track('bashCommands', 1);
    this.globalUsage.track('bashCommands', 1);
  }

  trackDuration(sessionId: string, agentId: string, durationMs: number): void {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    session.track('duration', durationMs);
    agent.track('duration', durationMs);
    this.globalUsage.track('duration', durationMs);
  }

  // ===========================================================================
  // Limit Checking
  // ===========================================================================

  canSpawnAgent(sessionId: string): boolean {
    const session = this.getOrCreateSession(sessionId);
    const spawned = session.get('agentSpawns') || 0;
    if (spawned >= this.config.perSession.maxAgentsSpawned) {
      return false;
    }
    const agents = this.sessionAgentMap.get(sessionId);
    if (agents && agents.size >= this.config.perSession.maxConcurrentAgents) {
      return false;
    }
    return true;
  }

  canUseTokens(sessionId: string, agentId: string, estimatedTokens: number): boolean {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    if (session.get('tokens') + estimatedTokens > this.config.perSession.maxTotalTokens) {
      return false;
    }
    if (agent.get('tokens') + estimatedTokens > this.config.perAgent.maxTokens) {
      return false;
    }
    if (this.globalUsage.get('tokens') + estimatedTokens > this.config.global.maxTotalTokens) {
      return false;
    }
    this.checkTimePeriodResets();
    if (this.dailyUsage.get('tokens') + estimatedTokens > this.config.global.dailyTokenLimit) {
      return false;
    }
    if (this.monthlyUsage.get('tokens') + estimatedTokens > this.config.global.monthlyTokenLimit) {
      return false;
    }
    return true;
  }

  canExecuteTool(sessionId: string, agentId: string, _tool: string): boolean {
    const agent = this.getOrCreateAgent(agentId);
    if (this.pausedAgents.has(agentId)) {
      return false;
    }
    if (agent.get('toolInvocations') >= this.config.perAgent.maxToolInvocations) {
      return false;
    }
    const session = this.getOrCreateSession(sessionId);
    if (session.get('toolInvocations') >= this.config.perSession.maxAPIRequests) {
      return false;
    }
    return true;
  }

  canCreateFile(sessionId: string, agentId: string, size: number): boolean {
    const agent = this.getOrCreateAgent(agentId);
    if (size > this.config.perAgent.maxFileSize) {
      return false;
    }
    if ((agent.get('filesCreated') || 0) >= this.config.perAgent.maxFilesCreated) {
      return false;
    }
    return true;
  }

  canRunBash(sessionId: string, agentId: string): boolean {
    const agent = this.getOrCreateAgent(agentId);
    if (this.pausedAgents.has(agentId)) {
      return false;
    }
    if ((agent.get('bashCommands') || 0) >= this.config.perAgent.maxBashCommands) {
      return false;
    }
    return true;
  }

  canContinueTask(sessionId: string, agentId: string, taskId: string): boolean {
    if (this.pausedAgents.has(agentId) || this.pausedSessions.has(sessionId)) {
      return false;
    }
    const task = this.taskUsage.get(taskId);
    if (task) {
      if (task.get('tokens') >= this.config.perTask.maxTokens) {
        return false;
      }
      if (task.get('duration') >= this.config.perTask.maxDurationMs) {
        return false;
      }
    }
    const agent = this.getOrCreateAgent(agentId);
    if (agent.get('duration') >= this.config.perAgent.maxDurationMs) {
      return false;
    }
    const session = this.getOrCreateSession(sessionId);
    if (session.get('duration') >= this.config.perSession.maxTotalDurationMs) {
      return false;
    }
    return true;
  }

  // ===========================================================================
  // Limit Checking & Warning Generation
  // ===========================================================================

  private checkLimits(sessionId: string, agentId: string, taskId: string): void {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    const task = taskId ? this.taskUsage.get(taskId) : null;

    this.checkMetricLimit(session, 'tokens', this.config.perSession.maxTotalTokens, 'session', sessionId);
    this.checkMetricLimit(session, 'cost', this.config.perSession.maxTotalCostUSD, 'session', sessionId);
    this.checkMetricLimit(session, 'duration', this.config.perSession.maxTotalDurationMs, 'session', sessionId);
    this.checkMetricLimit(agent, 'tokens', this.config.perAgent.maxTokens, 'agent', agentId);
    this.checkMetricLimit(agent, 'cost', this.config.perAgent.maxCostUSD, 'agent', agentId);
    this.checkMetricLimit(agent, 'duration', this.config.perAgent.maxDurationMs, 'agent', agentId);
    if (task) {
      this.checkMetricLimit(task, 'tokens', this.config.perTask.maxTokens, 'task', taskId);
      this.checkMetricLimit(task, 'cost', this.config.perTask.maxCostUSD, 'task', taskId);
      this.checkMetricLimit(task, 'duration', this.config.perTask.maxDurationMs, 'task', taskId);
    }
    this.checkMetricLimit(this.globalUsage, 'tokens', this.config.global.maxTotalTokens, 'global', 'global');
    this.checkMetricLimit(this.globalUsage, 'cost', this.config.global.maxTotalCostUSD, 'global', 'global');
    this.checkMetricLimit(this.dailyUsage, 'tokens', this.config.global.dailyTokenLimit, 'global', 'global');
    this.checkMetricLimit(this.dailyUsage, 'cost', this.config.global.dailyCostLimit, 'global', 'global');
    this.checkMetricLimit(this.monthlyUsage, 'tokens', this.config.global.monthlyTokenLimit, 'global', 'global');
    this.checkMetricLimit(this.monthlyUsage, 'cost', this.config.global.monthlyCostLimit, 'global', 'global');
  }

  private checkMetricLimit(
    tracker: UsageTracker | undefined,
    metric: string,
    limit: number,
    scope: 'session' | 'agent' | 'task' | 'global',
    _targetId: string
  ): void {
    if (!tracker) return;
    const used = tracker.get(metric);
    const percentUsed = tracker.getMetricPercentUsed(metric, limit);
    if (percentUsed >= 100) {
      this.addWarning({ type: 'over_limit', scope, metric, current: used, limit, percentUsed, timestamp: new Date() });
    } else if (percentUsed >= 95) {
      this.addWarning({ type: 'at_limit', scope, metric, current: used, limit, percentUsed, timestamp: new Date() });
    } else if (percentUsed >= 75) {
      this.addWarning({ type: 'approaching_limit', scope, metric, current: used, limit, percentUsed, timestamp: new Date() });
    }
  }

  private addWarning(warning: BudgetWarning): void {
    const existing = this.warnings.find(
      w => w.scope === warning.scope && w.metric === warning.metric && w.type === warning.type
    );
    if (!existing) {
      this.warnings.push(warning);
      for (const listener of this.listeners.onWarning) {
        listener(warning);
      }
    }
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  getStatus(sessionId: string, agentId?: string, taskId?: string): BudgetStatus {
    const session = this.getOrCreateSession(sessionId);
    const agent = agentId ? this.getOrCreateAgent(agentId) : undefined;
    const task = taskId ? this.taskUsage.get(taskId) : undefined;

    const makeEntry = (tracker: UsageTracker | undefined, limit: number) => {
      if (!tracker) return { used: 0, limit, remaining: limit, percentUsed: 0 };
      const used = tracker.get('tokens');
      return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        percentUsed: tracker.getMetricPercentUsed('tokens', limit),
      };
    };

    const sessionEntry = makeEntry(session, this.config.perSession.maxTotalTokens);
    const agentEntry = makeEntry(agent, this.config.perAgent.maxTokens);
    const taskEntry = makeEntry(task, this.config.perTask.maxTokens);
    const globalEntry = makeEntry(this.globalUsage, this.config.global.maxTotalTokens);

    return {
      session: sessionEntry,
      agent: agentEntry,
      task: taskEntry,
      global: globalEntry,
      isOverBudget:
        sessionEntry.percentUsed >= 100 ||
        agentEntry.percentUsed >= 100 ||
        taskEntry.percentUsed >= 100 ||
        globalEntry.percentUsed >= 100,
      warnings: this.warnings.filter(w => w.scope === 'session' || w.scope === 'global'),
    };
  }

  getSessionUsage(sessionId: string): UsageSummary {
    const tracker = this.sessionUsage.get(sessionId);
    if (!tracker) {
      return { tokensUsed: 0, costUSD: 0, durationMs: 0, toolInvocations: 0, filesCreated: 0, filesModified: 0, bashCommands: 0, agentSpawns: 0 };
    }
    return {
      tokensUsed: tracker.get('tokens'),
      costUSD: tracker.get('cost'),
      durationMs: tracker.get('duration'),
      toolInvocations: tracker.get('toolInvocations'),
      filesCreated: tracker.get('filesCreated'),
      filesModified: tracker.get('filesModified'),
      bashCommands: tracker.get('bashCommands'),
      agentSpawns: tracker.get('agentSpawns'),
    };
  }

  getAgentUsage(agentId: string): UsageSummary {
    const tracker = this.agentUsage.get(agentId);
    if (!tracker) {
      return { tokensUsed: 0, costUSD: 0, durationMs: 0, toolInvocations: 0, filesCreated: 0, filesModified: 0, bashCommands: 0, agentSpawns: 0 };
    }
    return {
      tokensUsed: tracker.get('tokens'),
      costUSD: tracker.get('cost'),
      durationMs: tracker.get('duration'),
      toolInvocations: tracker.get('toolInvocations'),
      filesCreated: tracker.get('filesCreated'),
      filesModified: tracker.get('filesModified'),
      bashCommands: tracker.get('bashCommands'),
      agentSpawns: tracker.get('agentSpawns'),
    };
  }

  getGlobalUsage(): UsageSummary {
    return {
      tokensUsed: this.globalUsage.get('tokens'),
      costUSD: this.globalUsage.get('cost'),
      durationMs: this.globalUsage.get('duration'),
      toolInvocations: this.globalUsage.get('toolInvocations'),
      filesCreated: this.globalUsage.get('filesCreated'),
      filesModified: this.globalUsage.get('filesModified'),
      bashCommands: this.globalUsage.get('bashCommands'),
      agentSpawns: this.globalUsage.get('agentSpawns'),
    };
  }

  getDailyUsage(): UsageSummary {
    return {
      tokensUsed: this.dailyUsage.get('tokens'),
      costUSD: this.dailyUsage.get('cost'),
      durationMs: this.dailyUsage.get('duration'),
      toolInvocations: this.dailyUsage.get('toolInvocations'),
      filesCreated: this.dailyUsage.get('filesCreated'),
      filesModified: this.dailyUsage.get('filesModified'),
      bashCommands: this.dailyUsage.get('bashCommands'),
      agentSpawns: this.dailyUsage.get('agentSpawns'),
    };
  }

  getMonthlyUsage(): UsageSummary {
    return {
      tokensUsed: this.monthlyUsage.get('tokens'),
      costUSD: this.monthlyUsage.get('cost'),
      durationMs: this.monthlyUsage.get('duration'),
      toolInvocations: this.monthlyUsage.get('toolInvocations'),
      filesCreated: this.monthlyUsage.get('filesCreated'),
      filesModified: this.monthlyUsage.get('filesModified'),
      bashCommands: this.monthlyUsage.get('bashCommands'),
      agentSpawns: this.monthlyUsage.get('agentSpawns'),
    };
  }

  // ===========================================================================
  // Enforcement
  // ===========================================================================

  enforce(sessionId: string, agentId: string): EnforcementAction | null {
    const session = this.getOrCreateSession(sessionId);
    const agent = this.getOrCreateAgent(agentId);
    const sessionPercent = session.getMetricPercentUsed('tokens', this.config.perSession.maxTotalTokens);
    const agentPercent = agent.getMetricPercentUsed('tokens', this.config.perAgent.maxTokens);
    const maxPercent = Math.max(sessionPercent, agentPercent);
    const applicable = this.enforcement
      .filter(e => maxPercent >= e.threshold)
      .sort((a, b) => b.threshold - a.threshold);
    if (applicable.length === 0) return null;
    const rule = applicable[0];
    const target = sessionPercent >= agentPercent ? 'session' : 'agent';
    const targetId = target === 'session' ? sessionId : agentId;
    return {
      type: rule.action,
      reason: `${target} ${targetId} at ${maxPercent.toFixed(1)}% token usage (threshold: ${rule.threshold}%)`,
      target,
      targetId,
    };
  }

  applyEnforcement(action: EnforcementAction): void {
    for (const listener of this.listeners.onLimit) {
      listener(action);
    }
    switch (action.type) {
      case 'pause':
        if (action.target === 'agent') {
          this.pauseAgent(action.targetId);
        } else if (action.target === 'session') {
          this.pauseSession(action.targetId);
        }
        break;
      case 'kill':
        if (action.target === 'agent') {
          this.killAgent(action.targetId);
        }
        break;
    }
  }

  pauseAgent(agentId: string): void {
    this.pausedAgents.add(agentId);
  }

  killAgent(agentId: string): void {
    this.pausedAgents.add(agentId);
    const tracker = this.agentUsage.get(agentId);
    if (tracker) {
      tracker.reset();
    }
    for (const listener of this.listeners.onKill) {
      listener('agent', agentId);
    }
    const sessionId = this.agentSessionMap.get(agentId);
    if (sessionId) {
      const agents = this.sessionAgentMap.get(sessionId);
      if (agents) {
        agents.delete(agentId);
      }
    }
  }

  pauseSession(sessionId: string): void {
    this.pausedSessions.add(sessionId);
    const agents = this.sessionAgentMap.get(sessionId);
    if (agents) {
      for (const agentId of agents) {
        this.pausedAgents.add(agentId);
      }
    }
  }

  // ===========================================================================
  // Agent/Task Registration
  // ===========================================================================

  registerAgent(sessionId: string, agentId: string): void {
    if (!this.sessionAgentMap.has(sessionId)) {
      this.sessionAgentMap.set(sessionId, new Set());
    }
    this.sessionAgentMap.get(sessionId)!.add(agentId);
    this.agentSessionMap.set(agentId, sessionId);
    const session = this.getOrCreateSession(sessionId);
    session.track('agentSpawns', 1);
  }

  registerTask(agentId: string, taskId: string): void {
    this.agentTaskMap.set(taskId, agentId);
  }

  // ===========================================================================
  // Cost Estimation
  // ===========================================================================

  estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.getModelPricing(model);
    return (promptTokens / 1000) * pricing.promptPricePer1k + (completionTokens / 1000) * pricing.completionPricePer1k;
  }

  getModelPricing(model: string): { promptPricePer1k: number; completionPricePer1k: number } {
    return MODEL_PRICING[model] || { promptPricePer1k: 0, completionPricePer1k: 0 };
  }

  // ===========================================================================
  // Reporting
  // ===========================================================================

  generateReport(sessionId: string): string {
    const sessionUsage = this.getSessionUsage(sessionId);
    const globalUsage = this.getGlobalUsage();
    const dailyUsage = this.getDailyUsage();
    const monthlyUsage = this.getMonthlyUsage();
    const agents = this.sessionAgentMap.get(sessionId) || new Set();
    const lines: string[] = [
      '=== Budget Report ===',
      '',
      `Session: ${sessionId}`,
      `  Tokens: ${sessionUsage.tokensUsed.toLocaleString()} / ${this.config.perSession.maxTotalTokens.toLocaleString()}`,
      `  Cost: $${sessionUsage.costUSD.toFixed(4)} / $${this.config.perSession.maxTotalCostUSD}`,
      `  Duration: ${(sessionUsage.durationMs / 1000).toFixed(1)}s / ${(this.config.perSession.maxTotalDurationMs / 1000).toFixed(1)}s`,
      `  API Requests: ${sessionUsage.toolInvocations} / ${this.config.perSession.maxAPIRequests}`,
      `  Agents Spawned: ${sessionUsage.agentSpawns} / ${this.config.perSession.maxAgentsSpawned}`,
      `  Concurrent Agents: ${agents.size} / ${this.config.perSession.maxConcurrentAgents}`,
      '',
      '--- Global ---',
      `  Tokens: ${globalUsage.tokensUsed.toLocaleString()} / ${this.config.global.maxTotalTokens.toLocaleString()}`,
      `  Cost: $${globalUsage.costUSD.toFixed(4)} / $${this.config.global.maxTotalCostUSD}`,
      '',
      '--- Daily ---',
      `  Tokens: ${dailyUsage.tokensUsed.toLocaleString()} / ${this.config.global.dailyTokenLimit.toLocaleString()}`,
      `  Cost: $${dailyUsage.costUSD.toFixed(4)} / $${this.config.global.dailyCostLimit}`,
      '',
      '--- Monthly ---',
      `  Tokens: ${monthlyUsage.tokensUsed.toLocaleString()} / ${this.config.global.monthlyTokenLimit.toLocaleString()}`,
      `  Cost: $${monthlyUsage.costUSD.toFixed(4)} / $${this.config.global.monthlyCostLimit}`,
      '',
      '--- Agent Breakdown ---',
    ];
    for (const agentId of agents) {
      const usage = this.getAgentUsage(agentId);
      lines.push(`  ${agentId}: ${usage.tokensUsed.toLocaleString()} tokens, $${usage.costUSD.toFixed(4)}, ${usage.toolInvocations} tools`);
    }
    if (this.warnings.length > 0) {
      lines.push('', '--- Warnings ---');
      for (const w of this.warnings) {
        lines.push(`  [${w.type}] ${w.scope}: ${w.metric} at ${w.percentUsed.toFixed(1)}% (${w.current}/${w.limit})`);
      }
    }
    return lines.join('\n');
  }

  getWarnings(sessionId?: string): BudgetWarning[] {
    if (sessionId) {
      return this.warnings.filter(w => w.scope === 'session' || w.scope === 'global');
    }
    return [...this.warnings];
  }

  getCostBreakdown(sessionId: string): CostBreakdown {
    const agents = this.sessionAgentMap.get(sessionId) || new Set();
    const byAgent: CostBreakdown['byAgent'] = [];
    const byModelMap: Record<string, { tokens: number; cost: number }> = {};
    const byToolMap: Record<string, { invocations: number; estimatedCost: number }> = {};
    let totalTokens = 0;
    let totalCost = 0;

    for (const agentId of agents) {
      const tracker = this.agentUsage.get(agentId);
      if (tracker) {
        const tokens = tracker.get('tokens');
        const cost = tracker.get('cost');
        totalTokens += tokens;
        totalCost += cost;
        byAgent.push({ agentId, agentType: 'subagent', tokens, cost });
        const promptTokens = tracker.get('promptTokens') || 0;
        const completionTokens = tracker.get('completionTokens') || 0;
        if (!byModelMap['default']) byModelMap['default'] = { tokens: 0, cost: 0 };
        byModelMap['default'].tokens += tokens;
        byModelMap['default'].cost += cost;
        byToolMap['tool_invocations'] = {
          invocations: tracker.get('toolInvocations') || 0,
          estimatedCost: 0,
        };
      }
    }

    const byModel: CostBreakdown['byModel'] = Object.entries(byModelMap).map(([model, data]) => ({
      model,
      ...data,
    }));
    const byTool: CostBreakdown['byTool'] = Object.entries(byToolMap).map(([tool, data]) => ({
      tool,
      ...data,
    }));

    return { byAgent, byModel, byTool, total: { tokens: totalTokens, cost: totalCost } };
  }

  // ===========================================================================
  // Event Listeners
  // ===========================================================================

  onWarning(listener: (warning: BudgetWarning) => void): void {
    this.listeners.onWarning.push(listener);
  }

  onLimit(listener: (action: EnforcementAction) => void): void {
    this.listeners.onLimit.push(listener);
  }

  onKill(listener: (target: string, id: string) => void): void {
    this.listeners.onKill.push(listener);
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  updateConfig(config: Partial<BudgetConfig>): void {
    if (config.perSession) this.config.perSession = { ...this.config.perSession, ...config.perSession };
    if (config.perAgent) this.config.perAgent = { ...this.config.perAgent, ...config.perAgent };
    if (config.perTask) this.config.perTask = { ...this.config.perTask, ...config.perTask };
    if (config.global) this.config.global = { ...this.config.global, ...config.global };
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  clearSession(sessionId: string): void {
    const agents = this.sessionAgentMap.get(sessionId);
    if (agents) {
      for (const agentId of agents) {
        this.agentUsage.delete(agentId);
        this.agentSessionMap.delete(agentId);
        this.pausedAgents.delete(agentId);
      }
    }
    this.sessionUsage.delete(sessionId);
    this.sessionAgentMap.delete(sessionId);
  }

  clearAgent(agentId: string): void {
    this.agentUsage.delete(agentId);
    const sessionId = this.agentSessionMap.get(agentId);
    if (sessionId) {
      const agents = this.sessionAgentMap.get(sessionId);
      if (agents) agents.delete(agentId);
    }
    this.agentSessionMap.delete(agentId);
    this.pausedAgents.delete(agentId);
  }

  resetAll(): void {
    this.sessionUsage.clear();
    this.agentUsage.clear();
    this.taskUsage.clear();
    this.sessionAgentMap.clear();
    this.agentTaskMap.clear();
    this.agentSessionMap.clear();
    this.globalUsage.reset();
    this.dailyUsage.reset();
    this.monthlyUsage.reset();
    this.warnings = [];
    this.pausedAgents.clear();
    this.pausedSessions.clear();
  }
}
