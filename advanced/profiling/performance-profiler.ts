export interface AgentProfile {
  agentId: string;
  totalRuns: number;
  successRate: number;
  avgResponseTimeMs: number;
  avgTokensUsed: number;
  avgCostPerRun: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  memoryPeakMB: number;
  cpuPeakPercent: number;
  errorRate: number;
  lastRun: Date;
  bottlenecks: string[];
}

export interface PerformanceMetric {
  agentId: string;
  timestamp: Date;
  responseTimeMs: number;
  tokensUsed: number;
  cost: number;
  memoryMB: number;
  cpuPercent: number;
  success: boolean;
  error?: string;
}

export class PerformanceProfiler {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private profiles: Map<string, AgentProfile> = new Map();
  private maxMetricsPerAgent = 1000;

  recordMetric(metric: PerformanceMetric): void {
    const agentMetrics = this.metrics.get(metric.agentId) || [];
    agentMetrics.push(metric);
    if (agentMetrics.length > this.maxMetricsPerAgent) agentMetrics.shift();
    this.metrics.set(metric.agentId, agentMetrics);
    this.updateProfile(metric.agentId);
  }

  private updateProfile(agentId: string): void {
    const metrics = this.metrics.get(agentId);
    if (!metrics || metrics.length === 0) return;
    const successful = metrics.filter(m => m.success);
    const responseTimes = metrics.map(m => m.responseTimeMs).sort((a, b) => a - b);
    const tokens = metrics.map(m => m.tokensUsed);
    const costs = metrics.map(m => m.cost);

    const profile: AgentProfile = {
      agentId, totalRuns: metrics.length,
      successRate: successful.length / metrics.length,
      avgResponseTimeMs: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      avgTokensUsed: tokens.reduce((a, b) => a + b, 0) / tokens.length,
      avgCostPerRun: costs.reduce((a, b) => a + b, 0) / costs.length,
      p50ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
      memoryPeakMB: Math.max(...metrics.map(m => m.memoryMB)),
      cpuPeakPercent: Math.max(...metrics.map(m => m.cpuPercent)),
      errorRate: 1 - successful.length / metrics.length,
      lastRun: metrics[metrics.length - 1].timestamp,
      bottlenecks: this.detectBottlenecks(metrics),
    };
    this.profiles.set(agentId, profile);
  }

  private detectBottlenecks(metrics: PerformanceMetric[]): string[] {
    const bottlenecks: string[] = [];
    const avgResponseTime = metrics.reduce((s, m) => s + m.responseTimeMs, 0) / metrics.length;
    if (avgResponseTime > 10000) bottlenecks.push('High response time');
    const avgTokens = metrics.reduce((s, m) => s + m.tokensUsed, 0) / metrics.length;
    if (avgTokens > 100000) bottlenecks.push('High token usage');
    const errorRate = 1 - metrics.filter(m => m.success).length / metrics.length;
    if (errorRate > 0.1) bottlenecks.push('High error rate');
    const avgMemory = metrics.reduce((s, m) => s + m.memoryMB, 0) / metrics.length;
    if (avgMemory > 500) bottlenecks.push('High memory usage');
    return bottlenecks;
  }

  getProfile(agentId: string): AgentProfile | undefined { return this.profiles.get(agentId); }
  getAllProfiles(): AgentProfile[] { return [...this.profiles.values()]; }
  getMetrics(agentId: string, limit?: number): PerformanceMetric[] { const m = this.metrics.get(agentId) || []; return limit ? m.slice(-limit) : m; }

  getTopPerformers(metric: 'successRate' | 'avgResponseTimeMs' | 'avgCostPerRun', limit?: number): AgentProfile[] {
    const profiles = [...this.profiles.values()];
    if (metric === 'avgResponseTimeMs' || metric === 'avgCostPerRun') profiles.sort((a, b) => a[metric] - b[metric]);
    else profiles.sort((a, b) => b[metric] - a[metric]);
    return profiles.slice(0, limit || 10);
  }

  getWorstPerformers(metric: 'successRate' | 'avgResponseTimeMs' | 'avgCostPerRun', limit?: number): AgentProfile[] {
    const profiles = [...this.profiles.values()];
    if (metric === 'avgResponseTimeMs' || metric === 'avgCostPerRun') profiles.sort((a, b) => b[metric] - a[metric]);
    else profiles.sort((a, b) => a[metric] - b[metric]);
    return profiles.slice(0, limit || 10);
  }

  getBottleneckAgents(): AgentProfile[] { return [...this.profiles.values()].filter(p => p.bottlenecks.length > 0); }

  getStats(): { totalAgents: number; totalMetrics: number; avgSuccessRate: number; avgResponseTime: number } {
    const profiles = [...this.profiles.values()];
    return {
      totalAgents: profiles.length,
      totalMetrics: [...this.metrics.values()].reduce((s, m) => s + m.length, 0),
      avgSuccessRate: profiles.length ? profiles.reduce((s, p) => s + p.successRate, 0) / profiles.length : 0,
      avgResponseTime: profiles.length ? profiles.reduce((s, p) => s + p.avgResponseTimeMs, 0) / profiles.length : 0,
    };
  }

  clearMetrics(agentId?: string): void { if (agentId) this.metrics.delete(agentId); else this.metrics.clear(); }
}
