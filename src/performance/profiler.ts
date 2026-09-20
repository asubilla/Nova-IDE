import { performance, PerformanceObserver } from "perf_hooks";
import * as os from "os";

interface TimingEntry {
  label: string;
  start: number;
  end?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  timestamp: number;
}

interface PerformanceReport {
  timings: TimingEntry[];
  summary: {
    totalOperations: number;
    averageDuration: number;
    slowestOperation: TimingEntry | null;
    fastestOperation: TimingEntry | null;
  };
  memory: MemorySnapshot;
  eventLoopDelay: number;
}

export class PerformanceProfiler {
  private timings: Map<string, TimingEntry[]> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private memorySnapshots: MemorySnapshot[] = [];
  private slowThresholdMs: number;

  constructor(slowThresholdMs: number = 1000) {
    this.slowThresholdMs = slowThresholdMs;
    this.setupMemoryTracking();
  }

  start(label: string): void {
    const now = performance.now();
    this.activeTimers.set(label, now);
    const entry: TimingEntry = { label, start: now };
    const existing = this.timings.get(label) || [];
    existing.push(entry);
    this.timings.set(label, existing);
  }

  end(label: string): number {
    const start = this.activeTimers.get(label);
    if (start === undefined) {
      throw new Error(`No active timer found for label: ${label}`);
    }
    const end = performance.now();
    const duration = end - start;
    this.activeTimers.delete(label);

    const entries = this.timings.get(label);
    if (entries && entries.length > 0) {
      const last = entries[entries.length - 1];
      if (last.end === undefined) {
        last.end = end;
        last.duration = duration;
      }
    }

    return duration;
  }

  measure<T>(label: string, fn: () => T): T {
    this.start(label);
    try {
      const result = fn();
      this.end(label);
      return result;
    } catch (err) {
      this.end(label);
      throw err;
    }
  }

  async asyncMeasure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      this.end(label);
      return result;
    } catch (err) {
      this.end(label);
      throw err;
    }
  }

  getReport(): PerformanceReport {
    const allTimings: TimingEntry[] = [];
    const durations: number[] = [];

    for (const entries of this.timings.values()) {
      for (const entry of entries) {
        if (entry.duration !== undefined) {
          allTimings.push(entry);
          durations.push(entry.duration);
        }
      }
    }

    allTimings.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      timings: allTimings,
      summary: {
        totalOperations: allTimings.length,
        averageDuration,
        slowestOperation: allTimings.length > 0 ? allTimings[allTimings.length - 1] : null,
        fastestOperation: allTimings.length > 0 ? allTimings[0] : null,
      },
      memory: this.getMemoryUsage(),
      eventLoopDelay: this.getEventLoopDelay(),
    };
  }

  getSlowOperations(thresholdMs?: number): TimingEntry[] {
    const threshold = thresholdMs ?? this.slowThresholdMs;
    const slow: TimingEntry[] = [];

    for (const entries of this.timings.values()) {
      for (const entry of entries) {
        if (entry.duration !== undefined && entry.duration >= threshold) {
          slow.push(entry);
        }
      }
    }

    return slow.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
  }

  getMemoryUsage(): MemorySnapshot {
    const mem = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      arrayBuffers: mem.arrayBuffers,
      timestamp: Date.now(),
    };
    this.memorySnapshots.push(snapshot);
    if (this.memorySnapshots.length > 1000) {
      this.memorySnapshots.shift();
    }
    return snapshot;
  }

  getEventLoopDelay(): number {
    const start = performance.now();
    const loop = performance.eventLoopUtilization();
    const elapsed = performance.now() - start;
    return elapsed;
  }

  optimize(): string[] {
    const suggestions: string[] = [];
    const mem = this.getMemoryUsage();
    const heapUsedMB = mem.heapUsed / (1024 * 1024);
    const heapTotalMB = mem.heapTotal / (1024 * 1024);
    const heapUtilization = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;

    if (heapUtilization > 85) {
      suggestions.push(`High heap utilization (${heapUtilization.toFixed(1)}%). Consider reducing memory usage or increasing --max-old-space-size.`);
    }

    if (heapUsedMB > 1024) {
      suggestions.push(`Heap usage is ${heapUsedMB.toFixed(1)}MB. Check for memory leaks.`);
    }

    const slowOps = this.getSlowOperations();
    if (slowOps.length > 0) {
      const top3 = slowOps.slice(0, 3);
      for (const op of top3) {
        suggestions.push(`Slow operation detected: "${op.label}" took ${(op.duration ?? 0).toFixed(2)}ms`);
      }
    }

    const report = this.getReport();
    if (report.summary.averageDuration > 500) {
      suggestions.push(`Average operation duration is ${report.summary.averageDuration.toFixed(2)}ms. Consider batching or caching.`);
    }

    if (suggestions.length === 0) {
      suggestions.push("No performance issues detected. System is running optimally.");
    }

    return suggestions;
  }

  renderReport(): string {
    const report = this.getReport();
    const lines: string[] = [];

    lines.push("╔══════════════════════════════════════════════════════════════╗");
    lines.push("║                   Performance Report                       ║");
    lines.push("╚══════════════════════════════════════════════════════════════╝");
    lines.push("");
    lines.push(`Total Operations:  ${report.summary.totalOperations}`);
    lines.push(`Avg Duration:      ${report.summary.averageDuration.toFixed(2)}ms`);

    if (report.summary.slowestOperation) {
      lines.push(`Slowest:           ${report.summary.slowestOperation.label} (${report.summary.slowestOperation.duration?.toFixed(2)}ms)`);
    }
    if (report.summary.fastestOperation) {
      lines.push(`Fastest:           ${report.summary.fastestOperation.label} (${report.summary.fastestOperation.duration?.toFixed(2)}ms)`);
    }

    lines.push("");
    lines.push("── Memory ──────────────────────────────────────────────────");
    const mem = report.memory;
    lines.push(`Heap Used:   ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Heap Total:  ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`RSS:         ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`External:    ${(mem.external / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Free Mem:    ${(os.freemem() / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`System Mem:  ${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`);

    lines.push("");
    lines.push("── Top Operations ──────────────────────────────────────────");
    const topOps = report.timings.slice(-10).reverse();
    for (const op of topOps) {
      const dur = op.duration?.toFixed(2) ?? "N/A";
      lines.push(`  ${op.label.padEnd(35)} ${dur}ms`);
    }

    lines.push("");
    lines.push("── Slow Operations (> " + this.slowThresholdMs + "ms) ──────────────────────────");
    const slowOps = this.getSlowOperations();
    if (slowOps.length === 0) {
      lines.push("  None detected.");
    } else {
      for (const op of slowOps.slice(0, 10)) {
        const dur = op.duration?.toFixed(2) ?? "N/A";
        lines.push(`  ${op.label.padEnd(35)} ${dur}ms`);
      }
    }

    lines.push("");
    const suggestions = this.optimize();
    lines.push("── Optimization Suggestions ────────────────────────────────");
    for (const s of suggestions) {
      lines.push(`  • ${s}`);
    }

    return lines.join("\n");
  }

  clear(): void {
    this.timings.clear();
    this.activeTimers.clear();
    this.memorySnapshots = [];
  }

  private setupMemoryTracking(): void {
    if (global.gc) {
      setInterval(() => {
        global.gc!();
      }, 30000);
    }
  }
}

let _defaultProfiler: PerformanceProfiler | null = null;

export function getProfiler(slowThresholdMs?: number): PerformanceProfiler {
  if (!_defaultProfiler) {
    _defaultProfiler = new PerformanceProfiler(slowThresholdMs);
  }
  return _defaultProfiler;
}
