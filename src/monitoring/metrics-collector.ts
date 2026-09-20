import { EventEmitter } from 'events';
import * as os from 'os';

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

export interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
  count?: number;
  sum?: number;
  min?: number;
  max?: number;
  avg?: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, MetricEntry>;
  timers: Record<string, MetricEntry>;
}

export class MetricsCollector extends EventEmitter {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timerData: Map<string, number[]> = new Map();
  private collectionInterval?: NodeJS.Timeout;
  private startTime: number;
  private maxHistogramSize: number;

  constructor(maxHistogramSize: number = 1000) {
    super();
    this.startTime = Date.now();
    this.maxHistogramSize = maxHistogramSize;
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
    this.emit('gauge', name, value);
  }

  counter(name: string, increment: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + increment);
    this.emit('counter', name, current + increment);
  }

  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    const values = this.histograms.get(name)!;
    values.push(value);
    if (values.length > this.maxHistogramSize) {
      values.shift();
    }
    this.emit('histogram', name, value);
  }

  timer<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordTimer(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordTimer(name, duration);
      throw error;
    }
  }

  async asyncTimer<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordTimer(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordTimer(name, duration);
      throw error;
    }
  }

  private recordTimer(name: string, duration: number): void {
    if (!this.timerData.has(name)) {
      this.timerData.set(name, []);
    }
    const values = this.timerData.get(name)!;
    values.push(duration);
    if (values.length > this.maxHistogramSize) {
      values.shift();
    }
    this.emit('timer', name, duration);
  }

  getMetrics(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of Array.from(this.counters.entries())) {
      counters[k] = v;
    }

    const gauges: Record<string, number> = {};
    for (const [k, v] of Array.from(this.gauges.entries())) {
      gauges[k] = v;
    }

    const histograms: Record<string, MetricEntry> = {};
    for (const [k, values] of Array.from(this.histograms.entries())) {
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      histograms[k] = {
        name: k,
        type: 'histogram',
        value: sum / values.length,
        timestamp: Date.now(),
        count: values.length,
        sum,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
      };
    }

    const timers: Record<string, MetricEntry> = {};
    for (const [k, values] of Array.from(this.timerData.entries())) {
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      timers[k] = {
        name: k,
        type: 'timer',
        value: sum / values.length,
        timestamp: Date.now(),
        count: values.length,
        sum,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      counters,
      gauges,
      histograms,
      timers,
    };
  }

  getMetric(name: string): MetricEntry | number | undefined {
    if (this.counters.has(name)) {
      return {
        name,
        type: 'counter',
        value: this.counters.get(name)!,
        timestamp: Date.now(),
      };
    }
    if (this.gauges.has(name)) {
      return {
        name,
        type: 'gauge',
        value: this.gauges.get(name)!,
        timestamp: Date.now(),
      };
    }
    if (this.histograms.has(name)) {
      const values = this.histograms.get(name)!;
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        name,
        type: 'histogram',
        value: sum / values.length,
        timestamp: Date.now(),
        count: values.length,
        sum,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
      };
    }
    if (this.timerData.has(name)) {
      const values = this.timerData.get(name)!;
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        name,
        type: 'timer',
        value: sum / values.length,
        timestamp: Date.now(),
        count: values.length,
        sum,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
      };
    }
    return undefined;
  }

  resetMetrics(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timerData.clear();
    this.emit('reset');
  }

  exportPrometheus(): string {
    const lines: string[] = [];
    const snapshot = this.getMetrics();

    for (const [name, value] of Object.entries(snapshot.counters)) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of Object.entries(snapshot.gauges)) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, entry] of Object.entries(snapshot.histograms)) {
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${entry.count}`);
      lines.push(`${name}_sum ${entry.sum}`);
      lines.push(`${name}_bucket{le="+Inf"} ${entry.count}`);
    }

    for (const [name, entry] of Object.entries(snapshot.timers)) {
      lines.push(`# TYPE ${name} summary`);
      lines.push(`${name}_count ${entry.count}`);
      lines.push(`${name}_sum ${entry.sum}`);
    }

    return lines.join('\n');
  }

  exportJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  startCollection(intervalMs: number = 5000): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.emit('collect', this.getMetrics());
    }, intervalMs);
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  private collectSystemMetrics(): void {
    const mem = process.memoryUsage();
    this.gauge('system.memory.heapUsed', mem.heapUsed);
    this.gauge('system.memory.heapTotal', mem.heapTotal);
    this.gauge('system.memory.rss', mem.rss);
    this.gauge('system.memory.external', mem.external);
    this.gauge('system.memory.arrayBuffers', mem.arrayBuffers);
    this.gauge('system.memory.free', os.freemem());
    this.gauge('system.memory.total', os.totalmem());
    this.gauge('system.cpu.cpus', os.cpus().length);
    this.gauge('system.cpu.loadavg', os.loadavg()[0]);
    this.gauge('system.uptime', process.uptime());
    this.gauge('system.pid', process.pid);
  }

  collectDefaultMetrics(): void {
    this.gauge('requests.total', this.counters.get('requests') || 0);
    this.gauge('errors.total', this.counters.get('errors') || 0);
    this.gauge('agents.active', this.gauges.get('agentCount') || 0);
    this.gauge('chat.messages', this.counters.get('chatMessages') || 0);
    this.gauge('connections.active', this.gauges.get('activeConnections') || 0);
  }
}
