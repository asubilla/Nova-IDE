import { EventEmitter } from 'events';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, CheckResult>;
}

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  metadata?: Record<string, any>;
}

export interface MetricsData {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; min: number; max: number; avg: number }>;
}

export class HealthChecker extends EventEmitter {
  private checks: Map<string, () => Promise<CheckResult>> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private startTime: number;

  constructor(private version: string = '2.0.0') { super(); this.startTime = Date.now(); }

  registerCheck(name: string, check: () => Promise<CheckResult>): void { this.checks.set(name, check); }

  async runChecks(): Promise<HealthStatus> {
    const checks: Record<string, CheckResult> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const [name, checkFn] of this.checks) {
      try {
        const start = Date.now();
        const result = await Promise.race([checkFn(), new Promise<CheckResult>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))]);
        result.duration = Date.now() - start;
        checks[name] = result;
        if (result.status === 'fail') overallStatus = 'unhealthy';
        else if (result.status === 'warn' && overallStatus === 'healthy') overallStatus = 'degraded';
      } catch (error) {
        checks[name] = { status: 'fail', message: (error as Error).message, duration: 0 };
        overallStatus = 'unhealthy';
      }
    }

    return { status: overallStatus, timestamp: new Date().toISOString(), uptime: Date.now() - this.startTime, version: this.version, checks };
  }

  counter(name: string, value: number = 1): void { this.counters.set(name, (this.counters.get(name) || 0) + value); }
  gauge(name: string, value: number): void { this.gauges.set(name, value); }
  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    const values = this.histograms.get(name)!;
    values.push(value);
    if (values.length > 1000) values.shift();
  }

  getMetrics(): MetricsData {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const gauges: Record<string, number> = {};
    for (const [k, v] of this.gauges) gauges[k] = v;
    const histograms: Record<string, { count: number; sum: number; min: number; max: number; avg: number }> = {};
    for (const [k, values] of this.histograms) {
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      histograms[k] = { count: values.length, sum, min: Math.min(...values), max: Math.max(...values), avg: sum / values.length };
    }
    return { timestamp: new Date().toISOString(), counters, gauges, histograms };
  }

  resetMetrics(): void { this.counters.clear(); this.gauges.clear(); this.histograms.clear(); }
}
