import { EventEmitter } from 'events';

export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'dead';
  lastHeartbeat: Date;
  errorCount: number;
  successCount: number;
  avgResponseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  lastError?: string;
  consecutiveFailures: number;
}

export interface HealingAction {
  type: 'restart' | 'scale' | 'throttle' | 'migrate' | 'kill' | 'alert' | 'retry' | 'fallback';
  agentId: string;
  reason: string;
  timestamp: Date;
  executed: boolean;
  result?: string;
}

export interface HealthCheck {
  agentId: string;
  checkType: 'heartbeat' | 'response' | 'resource' | 'dependency';
  interval: number;
  timeout: number;
  retries: number;
  lastCheck?: Date;
  lastResult?: boolean;
}

export interface HealingRule {
  id: string;
  name: string;
  condition: (health: AgentHealth) => boolean;
  action: HealingAction['type'];
  cooldown: number;
  lastTriggered?: Date;
}

export class SelfHealingSystem extends EventEmitter {
  private agentHealth: Map<string, AgentHealth> = new Map();
  private healthChecks: Map<string, HealthCheck[]> = new Map();
  private healingHistory: HealingAction[] = new Map() as any;
  private healingActions: HealingAction[] = [];
  private healingRules: HealingRule[] = [];
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private maxHistory = 1000;

  constructor(private config?: { checkIntervalMs?: number; maxConsecutiveFailures?: number }) {
    super();
    this.registerDefaultRules();
  }

  private registerDefaultRules(): void {
    this.healingRules = [
      { id: 'restart-on-failure', name: 'Restart on consecutive failures', condition: (h) => h.consecutiveFailures >= 3, action: 'restart', cooldown: 60000 },
      { id: 'throttle-on-high-cpu', name: 'Throttle on high CPU', condition: (h) => h.cpuUsage > 90, action: 'throttle', cooldown: 30000 },
      { id: 'migrate-on-memory', name: 'Migrate on high memory', condition: (h) => h.memoryUsage > 85, action: 'migrate', cooldown: 120000 },
      { id: 'kill-on-dead', name: 'Kill dead agent', condition: (h) => h.status === 'dead', action: 'kill', cooldown: 10000 },
      { id: 'alert-on-unhealthy', name: 'Alert on unhealthy', condition: (h) => h.status === 'unhealthy', action: 'alert', cooldown: 300000 },
    ];
  }

  registerAgent(agentId: string): void {
    this.agentHealth.set(agentId, {
      agentId, status: 'healthy', lastHeartbeat: new Date(), errorCount: 0, successCount: 0,
      avgResponseTime: 0, memoryUsage: 0, cpuUsage: 0, consecutiveFailures: 0,
    });
  }

  unregisterAgent(agentId: string): void {
    this.agentHealth.delete(agentId);
    this.healthChecks.delete(agentId);
    const interval = this.checkIntervals.get(agentId);
    if (interval) { clearInterval(interval); this.checkIntervals.delete(agentId); }
  }

  recordSuccess(agentId: string, responseTimeMs: number): void {
    const health = this.agentHealth.get(agentId);
    if (!health) return;
    health.successCount++;
    health.consecutiveFailures = 0;
    health.avgResponseTime = (health.avgResponseTime * (health.successCount - 1) + responseTimeMs) / health.successCount;
    health.lastHeartbeat = new Date();
    if (health.status === 'degraded') health.status = 'healthy';
  }

  recordFailure(agentId: string, error: string): void {
    const health = this.agentHealth.get(agentId);
    if (!health) return;
    health.errorCount++;
    health.consecutiveFailures++;
    health.lastError = error;
    health.lastHeartbeat = new Date();
    if (health.consecutiveFailures >= 5) health.status = 'dead';
    else if (health.consecutiveFailures >= 3) health.status = 'unhealthy';
    else if (health.consecutiveFailures >= 1) health.status = 'degraded';
    this.checkHealingRules(health);
  }

  updateResources(agentId: string, memoryMB: number, cpuPercent: number): void {
    const health = this.agentHealth.get(agentId);
    if (!health) return;
    health.memoryUsage = memoryMB;
    health.cpuUsage = cpuPercent;
    this.checkHealingRules(health);
  }

  heartbeat(agentId: string): void {
    const health = this.agentHealth.get(agentId);
    if (health) { health.lastHeartbeat = new Date(); }
  }

  private checkHealingRules(health: AgentHealth): void {
    for (const rule of this.healingRules) {
      if (rule.condition(health)) {
        const now = Date.now();
        if (rule.lastTriggered && now - rule.lastTriggered.getTime() < rule.cooldown) continue;
        rule.lastTriggered = new Date();
        const action: HealingAction = { type: rule.action, agentId: health.agentId, reason: rule.name, timestamp: new Date(), executed: false };
        this.executeHealingAction(action);
      }
    }
  }

  private async executeHealingAction(action: HealingAction): Promise<void> {
    action.executed = true;
    this.healingActions.push(action);
    if (this.healingActions.length > this.maxHistory) this.healingActions.shift();

    this.emit('healing-action', action);

    switch (action.type) {
      case 'restart': this.emit('restart-agent', { agentId: action.agentId }); break;
      case 'kill': this.emit('kill-agent', { agentId: action.agentId }); break;
      case 'throttle': this.emit('throttle-agent', { agentId: action.agentId }); break;
      case 'migrate': this.emit('migrate-agent', { agentId: action.agentId }); break;
      case 'alert': this.emit('healing-alert', { agentId: action.agentId, reason: action.reason }); break;
      case 'scale': this.emit('scale-agent', { agentId: action.agentId }); break;
      case 'retry': this.emit('retry-agent', { agentId: action.agentId }); break;
      case 'fallback': this.emit('fallback-agent', { agentId: action.agentId }); break;
    }
  }

  startHealthCheck(agentId: string, config: HealthCheck): void {
    const checks = this.healthChecks.get(agentId) || [];
    checks.push(config);
    this.healthChecks.set(agentId, checks);

    const interval = setInterval(async () => {
      const health = this.agentHealth.get(agentId);
      if (!health) return;
      const timeSinceHeartbeat = Date.now() - health.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > config.timeout * config.retries) {
        health.status = 'unhealthy';
        this.checkHealingRules(health);
      }
    }, config.interval);
    this.checkIntervals.set(agentId, interval);
  }

  stopHealthCheck(agentId: string): void {
    const interval = this.checkIntervals.get(agentId);
    if (interval) { clearInterval(interval); this.checkIntervals.delete(agentId); }
  }

  getAgentHealth(agentId: string): AgentHealth | undefined { return this.agentHealth.get(agentId); }
  getAllHealth(): AgentHealth[] { return [...this.agentHealth.values()]; }
  getHealthyAgents(): string[] { return [...this.agentHealth.entries()].filter(([, h]) => h.status === 'healthy').map(([id]) => id); }
  getUnhealthyAgents(): string[] { return [...this.agentHealth.entries()].filter(([, h]) => h.status !== 'healthy').map(([id]) => id); }
  getHealingHistory(limit?: number): HealingAction[] { return limit ? this.healingActions.slice(-limit) : this.healingActions; }

  getStats(): { totalAgents: number; healthy: number; degraded: number; unhealthy: number; dead: number; totalHealings: number } {
    let healthy = 0, degraded = 0, unhealthy = 0, dead = 0;
    for (const h of this.agentHealth.values()) {
      if (h.status === 'healthy') healthy++; else if (h.status === 'degraded') degraded++;
      else if (h.status === 'unhealthy') unhealthy++; else dead++;
    }
    return { totalAgents: this.agentHealth.size, healthy, degraded, unhealthy, dead, totalHealings: this.healingActions.length };
  }

  addCustomRule(rule: HealingRule): void { this.healingRules.push(rule); }
  removeRule(ruleId: string): boolean { const idx = this.healingRules.findIndex(r => r.id === ruleId); if (idx >= 0) { this.healingRules.splice(idx, 1); return true; } return false; }

  destroy(): void {
    for (const interval of this.checkIntervals.values()) clearInterval(interval);
    this.checkIntervals.clear();
    this.agentHealth.clear();
    this.healthChecks.clear();
    this.healingActions = [];
    this.removeAllListeners();
  }
}
