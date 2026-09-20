import { EventEmitter } from 'events';
import type { ResourceProfile, AgentType } from '../core/types';

export interface ResourceQuota {
  sessionId: string;
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkMbps: number;
  maxConcurrentAgents: number;
  maxFilesAccessed: number;
  maxTokensPerMinute: number;
  maxDurationMs: number;
}

export interface ResourceUsage {
  sessionId: string;
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkMbps: number;
  concurrentAgents: number;
  filesAccessed: number;
  tokensUsed: number;
  startedAt: Date;
  lastUpdatedAt: Date;
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource?: string;
  current?: number;
  limit?: number;
  message?: string;
}

export interface QuotaAlert {
  sessionId: string;
  resource: string;
  usage: number;
  limit: number;
  percentage: number;
  severity: 'warning' | 'critical';
  timestamp: Date;
}

export interface ResourceQuotaManagerOptions {
  defaultQuota: ResourceQuota;
  alertThresholds: { warning: number; critical: number };
  checkIntervalMs: number;
  autoScaleEnabled: boolean;
  maxSystemMemoryMB: number;
  maxSystemCpuPercent: number;
}

const DEFAULT_OPTIONS: ResourceQuotaManagerOptions = {
  defaultQuota: {
    sessionId: '',
    maxMemoryMB: 1024,
    maxCpuPercent: 50,
    maxDiskMB: 500,
    maxNetworkMbps: 100,
    maxConcurrentAgents: 5,
    maxFilesAccessed: 50,
    maxTokensPerMinute: 100000,
    maxDurationMs: 600000,
  },
  alertThresholds: { warning: 70, critical: 90 },
  checkIntervalMs: 5000,
  autoScaleEnabled: true,
  maxSystemMemoryMB: 8192,
  maxSystemCpuPercent: 90,
};

export class ResourceQuotaManager extends EventEmitter {
  private quotas: Map<string, ResourceQuota> = new Map();
  private usage: Map<string, ResourceUsage> = new Map();
  private alerts: QuotaAlert[] = [];
  private options: ResourceQuotaManagerOptions;
  private checkTimer?: ReturnType<typeof setInterval>;
  private totalSystemMemory: number = 0;
  private totalSystemCpu: number = 0;

  constructor(options?: Partial<ResourceQuotaManagerOptions>) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setQuota(sessionId: string, quota: Partial<ResourceQuota>): void {
    const existing = this.quotas.get(sessionId) || { ...this.options.defaultQuota, sessionId };
    this.quotas.set(sessionId, { ...existing, ...quota, sessionId });
  }

  getQuota(sessionId: string): ResourceQuota | null {
    return this.quotas.get(sessionId) || null;
  }

  removeQuota(sessionId: string): void {
    this.quotas.delete(sessionId);
    this.usage.delete(sessionId);
  }

  checkQuota(sessionId: string, required: Partial<ResourceProfile>): QuotaCheckResult {
    const quota = this.quotas.get(sessionId);
    const current = this.usage.get(sessionId);

    if (!quota) {
      return { allowed: true };
    }

    if (current) {
      if (required.memoryMB && current.memoryMB + required.memoryMB > quota.maxMemoryMB) {
        return {
          allowed: false,
          resource: 'memory',
          current: current.memoryMB + required.memoryMB,
          limit: quota.maxMemoryMB,
          message: `Memory quota exceeded: ${current.memoryMB + required.memoryMB}MB > ${quota.maxMemoryMB}MB`,
        };
      }

      if (required.cpuPercent && current.cpuPercent + required.cpuPercent > quota.maxCpuPercent) {
        return {
          allowed: false,
          resource: 'cpu',
          current: current.cpuPercent + required.cpuPercent,
          limit: quota.maxCpuPercent,
          message: `CPU quota exceeded: ${current.cpuPercent + required.cpuPercent}% > ${quota.maxCpuPercent}%`,
        };
      }

      if (current.concurrentAgents >= quota.maxConcurrentAgents) {
        return {
          allowed: false,
          resource: 'concurrentAgents',
          current: current.concurrentAgents + 1,
          limit: quota.maxConcurrentAgents,
          message: `Concurrent agent limit reached: ${current.concurrentAgents} >= ${quota.maxConcurrentAgents}`,
        };
      }

      if (current.filesAccessed >= quota.maxFilesAccessed) {
        return {
          allowed: false,
          resource: 'filesAccessed',
          current: current.filesAccessed,
          limit: quota.maxFilesAccessed,
          message: `File access limit reached: ${current.filesAccessed} >= ${quota.maxFilesAccessed}`,
        };
      }

      const duration = Date.now() - current.startedAt.getTime();
      if (duration > quota.maxDurationMs) {
        return {
          allowed: false,
          resource: 'duration',
          current: duration,
          limit: quota.maxDurationMs,
          message: `Session duration exceeded: ${duration}ms > ${quota.maxDurationMs}ms`,
        };
      }
    }

    if (required.memoryMB) {
      const systemRemaining = this.options.maxSystemMemoryMB - this.totalSystemMemory;
      if (required.memoryMB > systemRemaining) {
        return {
          allowed: false,
          resource: 'systemMemory',
          current: this.totalSystemMemory + required.memoryMB,
          limit: this.options.maxSystemMemoryMB,
          message: `System memory insufficient: ${this.totalSystemMemory + required.memoryMB}MB > ${this.options.maxSystemMemoryMB}MB`,
        };
      }
    }

    if (required.cpuPercent) {
      const systemRemaining = this.options.maxSystemCpuPercent - this.totalSystemCpu;
      if (required.cpuPercent > systemRemaining) {
        return {
          allowed: false,
          resource: 'systemCpu',
          current: this.totalSystemCpu + required.cpuPercent,
          limit: this.options.maxSystemCpuPercent,
          message: `System CPU insufficient: ${this.totalSystemCpu + required.cpuPercent}% > ${this.options.maxSystemCpuPercent}%`,
        };
      }
    }

    return { allowed: true };
  }

  recordUsage(sessionId: string, resourceUpdate: Partial<ResourceUsage>): void {
    const existing = this.usage.get(sessionId) || {
      sessionId,
      memoryMB: 0,
      cpuPercent: 0,
      diskMB: 0,
      networkMbps: 0,
      concurrentAgents: 0,
      filesAccessed: 0,
      tokensUsed: 0,
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    const updated = { ...existing, ...resourceUpdate, lastUpdatedAt: new Date() };
    this.usage.set(sessionId, updated);

    this.recalculateSystemTotals();
    this.checkThresholds(sessionId, updated);
  }

  incrementAgents(sessionId: string): QuotaCheckResult {
    const current = this.usage.get(sessionId);
    const quota = this.quotas.get(sessionId);

    if (quota && current && current.concurrentAgents >= quota.maxConcurrentAgents) {
      return {
        allowed: false,
        resource: 'concurrentAgents',
        current: current.concurrentAgents + 1,
        limit: quota.maxConcurrentAgents,
      };
    }

    this.recordUsage(sessionId, {
      concurrentAgents: (current?.concurrentAgents || 0) + 1,
    });

    return { allowed: true };
  }

  decrementAgents(sessionId: string): void {
    const current = this.usage.get(sessionId);
    if (current && current.concurrentAgents > 0) {
      this.recordUsage(sessionId, {
        concurrentAgents: current.concurrentAgents - 1,
      });
    }
  }

  addTokens(sessionId: string, tokens: number): QuotaCheckResult {
    const current = this.usage.get(sessionId);
    const quota = this.quotas.get(sessionId);

    if (quota && current) {
      const tokensPerMinute = (current.tokensUsed + tokens) / ((Date.now() - current.startedAt.getTime()) / 60000);
      if (tokensPerMinute > quota.maxTokensPerMinute) {
        return {
          allowed: false,
          resource: 'tokens',
          current: tokensPerMinute,
          limit: quota.maxTokensPerMinute,
          message: `Token rate exceeded: ${tokensPerMinute.toFixed(0)} tokens/min > ${quota.maxTokensPerMinute} tokens/min`,
        };
      }
    }

    this.recordUsage(sessionId, {
      tokensUsed: (current?.tokensUsed || 0) + tokens,
    });

    return { allowed: true };
  }

  getUsage(sessionId: string): ResourceUsage | null {
    return this.usage.get(sessionId) || null;
  }

  getSystemUsage(): { totalMemoryMB: number; totalCpuPercent: number; sessionCount: number } {
    return {
      totalMemoryMB: this.totalSystemMemory,
      totalCpuPercent: this.totalSystemCpu,
      sessionCount: this.usage.size,
    };
  }

  getAlerts(sessionId?: string): QuotaAlert[] {
    if (sessionId) {
      return this.alerts.filter(a => a.sessionId === sessionId);
    }
    return [...this.alerts];
  }

  clearAlerts(sessionId?: string): void {
    if (sessionId) {
      this.alerts = this.alerts.filter(a => a.sessionId !== sessionId);
    } else {
      this.alerts = [];
    }
  }

  suggestScaling(sessionId: string): { action: 'scale-up' | 'scale-down' | 'none'; reason: string } | null {
    const quota = this.quotas.get(sessionId);
    const current = this.usage.get(sessionId);

    if (!quota || !current) return null;

    const memoryUsage = (current.memoryMB / quota.maxMemoryMB) * 100;
    const cpuUsage = (current.cpuPercent / quota.maxCpuPercent) * 100;

    if (memoryUsage > this.options.alertThresholds.critical || cpuUsage > this.options.alertThresholds.critical) {
      return {
        action: 'scale-down',
        reason: `Resource usage critical: Memory ${memoryUsage.toFixed(0)}%, CPU ${cpuUsage.toFixed(0)}%`,
      };
    }

    if (memoryUsage < 30 && cpuUsage < 30 && current.concurrentAgents < quota.maxConcurrentAgents / 2) {
      return {
        action: 'scale-up',
        reason: `Resource usage low: Memory ${memoryUsage.toFixed(0)}%, CPU ${cpuUsage.toFixed(0)}%`,
      };
    }

    return { action: 'none', reason: 'Resource usage normal' };
  }

  startMonitoring(): void {
    this.checkTimer = setInterval(() => {
      this.runCheck();
    }, this.options.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  private runCheck(): void {
    for (const [sessionId, current] of this.usage) {
      this.checkThresholds(sessionId, current);
    }
  }

  private checkThresholds(sessionId: string, current: ResourceUsage): void {
    const quota = this.quotas.get(sessionId);
    if (!quota) return;

    const checks = [
      { resource: 'memory', current: current.memoryMB, limit: quota.maxMemoryMB },
      { resource: 'cpu', current: current.cpuPercent, limit: quota.maxCpuPercent },
      { resource: 'concurrentAgents', current: current.concurrentAgents, limit: quota.maxConcurrentAgents },
    ];

    for (const check of checks) {
      const percentage = (check.current / check.limit) * 100;

      if (percentage >= this.options.alertThresholds.critical) {
        this.createAlert(sessionId, check.resource, check.current, check.limit, percentage, 'critical');
      } else if (percentage >= this.options.alertThresholds.warning) {
        this.createAlert(sessionId, check.resource, check.current, check.limit, percentage, 'warning');
      }
    }
  }

  private createAlert(
    sessionId: string,
    resource: string,
    usage: number,
    limit: number,
    percentage: number,
    severity: 'warning' | 'critical'
  ): void {
    const alert: QuotaAlert = {
      sessionId,
      resource,
      usage,
      limit,
      percentage,
      severity,
      timestamp: new Date(),
    };

    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    this.emit('quota-alert', alert);
  }

  private recalculateSystemTotals(): void {
    this.totalSystemMemory = 0;
    this.totalSystemCpu = 0;

    for (const current of this.usage.values()) {
      this.totalSystemMemory += current.memoryMB;
      this.totalSystemCpu += current.cpuPercent;
    }
  }

  destroy(): void {
    this.stopMonitoring();
    this.quotas.clear();
    this.usage.clear();
    this.alerts = [];
    this.removeAllListeners();
  }
}
