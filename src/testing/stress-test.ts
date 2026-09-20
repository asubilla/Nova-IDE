import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as WebSocket from 'ws';

export interface StressResult {
  limit: number;
  reached: boolean;
  degradation: DegradationMetrics;
  recoveryTime: number;
  metrics: StressMetrics;
}

export interface DegradationMetrics {
  responseTimeIncrease: number;
  errorRateIncrease: number;
  throughputDecrease: number;
  memoryPressure: number;
}

export interface StressMetrics {
  peakMemory: number;
  peakCpu: number;
  totalOps: number;
  errorCount: number;
  avgResponseTime: number;
  maxResponseTime: number;
  eventLoopDelay: number;
}

export interface SystemHealth {
  cpu: CpuHealth;
  memory: MemoryHealth;
  disk: DiskHealth;
  network: NetworkHealth;
  eventLoop: EventLoopHealth;
  overall: 'healthy' | 'degraded' | 'critical';
}

export interface CpuHealth {
  usage: number;
  cores: number;
  model: string;
  speed: number;
}

export interface MemoryHealth {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  freeSystem: number;
  totalSystem: number;
}

export interface DiskHealth {
  readSpeed: number;
  writeSpeed: number;
  iops: number;
}

export interface NetworkHealth {
  connections: number;
  throughput: number;
  latency: number;
}

export interface EventLoopHealth {
  delay: number;
  utilization: number;
}

export class StressTest extends EventEmitter {
  private running = false;
  private startTime = 0;
  private metrics: StressMetrics;
  private peakMemory = 0;
  private peakCpu = 0;
  private totalOps = 0;
  private errorCount = 0;
  private timings: number[] = [];
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.metrics = {
      peakMemory: 0,
      peakCpu: 0,
      totalOps: 0,
      errorCount: 0,
      avgResponseTime: 0,
      maxResponseTime: 0,
      eventLoopDelay: 0,
    };
  }

  async testMaxConnections(max: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    let connectionsReached = 0;
    const sockets: WebSocket.WebSocket[] = [];

    return new Promise<StressResult>((resolve) => {
      const testConnection = async (id: number): Promise<boolean> => {
        return new Promise((res) => {
          const start = performance.now();
          try {
            const ws = new WebSocket.WebSocket('ws://localhost:1');
            sockets.push(ws);

            ws.on('open', () => {
              this.timings.push(performance.now() - start);
              this.totalOps++;
              connectionsReached = Math.max(connectionsReached, id + 1);
              res(true);
            });

            ws.on('error', () => {
              this.timings.push(performance.now() - start);
              this.errorCount++;
              res(false);
            });

            setTimeout(() => {
              if (ws.readyState === WebSocket.WebSocket.OPEN) ws.close();
              res(false);
            }, 2000);
          } catch {
            this.errorCount++;
            res(false);
          }
        });
      };

      const runTest = async (): Promise<void> => {
        const batchSize = 50;
        for (let i = 0; i < max; i += batchSize) {
          if (!this.running) break;
          const batch: Promise<boolean>[] = [];
          for (let j = 0; j < batchSize && i + j < max; j++) {
            batch.push(testConnection(i + j));
          }
          const results = await Promise.allSettled(batch);
          const failures = results.filter((r) => r.status === 'fulfilled' && r.value === false).length;
          if (failures > batchSize * 0.5) break;
        }
      };

      runTest().then(() => {
        this.running = false;
        for (const ws of sockets) {
          try { ws.close(); } catch { /* ignore */ }
        }
        this.stopMetricsCollection();
        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();
        resolve({
          limit: connectionsReached,
          reached: connectionsReached >= max,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      });
    });
  }

  async testMaxAgents(max: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    let agentsReached = 0;
    const agents: Array<{ id: number; active: boolean }> = [];

    return new Promise<StressResult>((resolve) => {
      const spawnAgent = async (id: number): Promise<boolean> => {
        return new Promise((res) => {
          const start = performance.now();
          try {
            const agent = { id, active: true };
            agents.push(agent);

            const workDuration = 100 + Math.random() * 500;
            setTimeout(() => {
              if (agent.active) {
                this.timings.push(performance.now() - start);
                this.totalOps++;
                agentsReached = Math.max(agentsReached, id + 1);
                agent.active = false;
                res(true);
              }
            }, workDuration);

            setTimeout(() => {
              if (agent.active) {
                agent.active = false;
                res(false);
              }
            }, 5000);
          } catch (err) {
            this.errorCount++;
            res(false);
          }
        });
      };

      const runTest = async (): Promise<void> => {
        const batchSize = 20;
        for (let i = 0; i < max; i += batchSize) {
          if (!this.running) break;
          const batch: Promise<boolean>[] = [];
          for (let j = 0; j < batchSize && i + j < max; j++) {
            batch.push(spawnAgent(i + j));
          }
          await Promise.allSettled(batch);
        }
      };

      runTest().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();
        resolve({
          limit: agentsReached,
          reached: agentsReached >= max,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      });
    });
  }

  async testMemoryPressure(limitMb: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    const buffers: Buffer[] = [];
    let allocatedMb = 0;

    return new Promise<StressResult>((resolve) => {
      const allocationChunk = 1024 * 1024; // 1MB
      let limitReached = false;

      const allocate = (): void => {
        while (this.running && allocatedMb < limitMb) {
          try {
            const buf = Buffer.alloc(allocationChunk, allocatedMb % 256);
            buffers.push(buf);
            allocatedMb++;
            this.totalOps++;

            const mem = process.memoryUsage();
            if (mem.heapUsed > this.peakMemory) {
              this.peakMemory = mem.heapUsed;
            }

            if (allocatedMb % 50 === 0) {
              this.emit('progress', { allocatedMb, limitMb, percent: (allocatedMb / limitMb) * 100 });
            }
          } catch (err) {
            this.errorCount++;
            limitReached = true;
            break;
          }
        }

        if (allocatedMb >= limitMb) limitReached = true;
        this.running = false;
      };

      allocate();

      setTimeout(() => {
        this.running = false;
        buffers.length = 0;
        if (global.gc) global.gc();
        this.stopMetricsCollection();

        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();

        resolve({
          limit: allocatedMb,
          reached: limitReached,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      }, 1000);
    });
  }

  async testCpuPressure(cores: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    const workers: Array<{ active: boolean; stop: () => void }> = [];

    return new Promise<StressResult>((resolve) => {
      const startWorker = (id: number): { active: boolean; stop: () => void } => {
        let active = true;
        const worker = { active, stop: () => { active = false; } };
        workers.push(worker);

        const compute = (): void => {
          if (!active || !this.running) return;
          const start = performance.now();
          let result = 0;
          for (let i = 0; i < 1000000; i++) {
            result += Math.sqrt(i) * Math.sin(i);
          }
          this.timings.push(performance.now() - start);
          this.totalOps++;
          setImmediate(compute);
        };

        compute();
        return worker;
      };

      for (let i = 0; i < cores; i++) {
        startWorker(i);
      }

      const measurementInterval = setInterval(() => {
        const cpus = os.cpus();
        const cpuUsage = cpus.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          return acc + (total - cpu.times.idle) / total;
        }, 0) / cpus.length * 100;
        if (cpuUsage > this.peakCpu) this.peakCpu = cpuUsage;
      }, 100);

      setTimeout(() => {
        this.running = false;
        for (const w of workers) w.stop();
        clearInterval(measurementInterval);
        this.stopMetricsCollection();

        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();

        resolve({
          limit: cores,
          reached: true,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      }, 10000);
    });
  }

  async testDiskIO(operations: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    const tmpDir = path.join(os.tmpdir(), `nova-stress-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    let opsCompleted = 0;

    return new Promise<StressResult>((resolve) => {
      const performIO = async (opId: number): Promise<void> => {
        const filePath = path.join(tmpDir, `file-${opId}.dat`);
        const data = crypto.randomBytes(4096);
        const start = performance.now();

        try {
          await fs.promises.writeFile(filePath, data);
          await fs.promises.readFile(filePath);
          await fs.promises.unlink(filePath);
          this.timings.push(performance.now() - start);
          this.totalOps++;
          opsCompleted++;
        } catch (err) {
          this.errorCount++;
          this.timings.push(performance.now() - start);
        }
      };

      const runOps = async (): Promise<void> => {
        const batchSize = 20;
        for (let i = 0; i < operations; i += batchSize) {
          if (!this.running) break;
          const batch: Promise<void>[] = [];
          for (let j = 0; j < batchSize && i + j < operations; j++) {
            batch.push(performIO(i + j));
          }
          await Promise.allSettled(batch);
        }
      };

      runOps().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();

        resolve({
          limit: opsCompleted,
          reached: opsCompleted >= operations,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      });
    });
  }

  async testNetworkThroughput(dataMb: number): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    const chunkSize = 64 * 1024;
    const totalBytes = dataMb * 1024 * 1024;
    let bytesTransferred = 0;

    return new Promise<StressResult>((resolve) => {
      const simulateTransfer = async (): Promise<void> => {
        while (this.running && bytesTransferred < totalBytes) {
          const start = performance.now();
          const chunk = crypto.randomBytes(chunkSize);
          const hash = crypto.createHash('sha256').update(chunk).digest('hex');
          this.timings.push(performance.now() - start);
          this.totalOps++;
          bytesTransferred += chunkSize;
        }
      };

      simulateTransfer().then(() => {
        this.running = false;
        this.stopMetricsCollection();

        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();

        resolve({
          limit: Math.floor(bytesTransferred / (1024 * 1024)),
          reached: bytesTransferred >= totalBytes,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      });
    });
  }

  async testGracefulDegradation(): Promise<StressResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.startMetricsCollection();

    const baselineMetrics = this.captureBaseline();
    const stages = [
      { load: 10, duration: 3000 },
      { load: 50, duration: 3000 },
      { load: 100, duration: 3000 },
      { load: 200, duration: 3000 },
      { load: 500, duration: 3000 },
    ];

    return new Promise<StressResult>((resolve) => {
      const runStage = async (stageIndex: number): Promise<void> => {
        if (stageIndex >= stages.length || !this.running) return;
        const stage = stages[stageIndex];

        const tasks: Promise<void>[] = [];
        for (let i = 0; i < stage.load; i++) {
          tasks.push(new Promise((res) => {
            const start = performance.now();
            const workTime = 10 + Math.random() * 100;
            setTimeout(() => {
              this.timings.push(performance.now() - start);
              this.totalOps++;
              if (Math.random() > 0.95) {
                this.errorCount++;
              }
              res();
            }, workTime);
          }));
        }

        await Promise.allSettled(tasks);
        this.emit('stageComplete', { stage: stageIndex, load: stage.load });

        if (stageIndex + 1 < stages.length) {
          await new Promise((res) => setTimeout(res, 500));
          await runStage(stageIndex + 1);
        }
      };

      runStage(0).then(() => {
        this.running = false;
        this.stopMetricsCollection();

        const degradation = this.calculateDegradation(baselineMetrics);
        const recoveryTime = this.measureRecovery();

        resolve({
          limit: 500,
          reached: true,
          degradation,
          recoveryTime,
          metrics: this.buildMetrics(),
        });
      });
    });
  }

  getSystemHealth(): SystemHealth {
    const cpus = os.cpus();
    const mem = process.memoryUsage();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + (total - cpu.times.idle) / total;
    }, 0) / cpus.length * 100;

    const heapUsedPct = (mem.heapUsed / mem.heapTotal) * 100;
    const systemMemPct = ((totalMem - freeMem) / totalMem) * 100;

    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (cpuUsage > 90 || systemMemPct > 95) overall = 'critical';
    else if (cpuUsage > 70 || systemMemPct > 80) overall = 'degraded';

    return {
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
        model: cpus[0]?.model ?? 'unknown',
        speed: cpus[0]?.speed ?? 0,
      },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        freeSystem: freeMem,
        totalSystem: totalMem,
      },
      disk: {
        readSpeed: 0,
        writeSpeed: 0,
        iops: 0,
      },
      network: {
        connections: 0,
        throughput: 0,
        latency: 0,
      },
      eventLoop: {
        delay: this.measureEventLoopDelay(),
        utilization: 0,
      },
      overall,
    };
  }

  generateReport(): string {
    const lines: string[] = [];
    const metrics = this.buildMetrics();
    const health = this.getSystemHealth();

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                   Stress Test Report                       ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Duration:       ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
    lines.push(`Total Ops:      ${metrics.totalOps}`);
    lines.push(`Error Count:    ${metrics.errorCount}`);
    lines.push(`Avg Response:   ${metrics.avgResponseTime.toFixed(2)}ms`);
    lines.push(`Max Response:   ${metrics.maxResponseTime.toFixed(2)}ms`);
    lines.push(`Peak Memory:    ${(metrics.peakMemory / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Peak CPU:       ${metrics.peakCpu.toFixed(1)}%`);
    lines.push('');
    lines.push('── System Health ──────────────────────────────────────────');
    lines.push(`Overall:        ${health.overall}`);
    lines.push(`CPU:            ${health.cpu.usage.toFixed(1)}% (${health.cpu.cores} cores)`);
    lines.push(`Heap:           ${(health.memory.heapUsed / 1024 / 1024).toFixed(2)} / ${(health.memory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`RSS:            ${(health.memory.rss / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Free System:    ${(health.memory.freeSystem / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Event Loop:     ${health.eventLoop.delay.toFixed(2)}ms delay`);

    return lines.join('\n');
  }

  stop(): void {
    this.running = false;
    this.stopMetricsCollection();
  }

  // ── Private ─────────────────────────────────────────────────────────

  private reset(): void {
    this.timings = [];
    this.totalOps = 0;
    this.errorCount = 0;
    this.peakMemory = 0;
    this.peakCpu = 0;
    this.running = false;
  }

  private captureBaseline(): { memory: number; cpu: number; timing: number } {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + (total - cpu.times.idle) / total;
    }, 0) / cpus.length * 100;

    return {
      memory: mem.heapUsed,
      cpu: cpuUsage,
      timing: this.timings.length > 0 ? this.timings.reduce((a, b) => a + b, 0) / this.timings.length : 0,
    };
  }

  private calculateDegradation(baseline: { memory: number; cpu: number; timing: number }): DegradationMetrics {
    const current = this.captureBaseline();
    return {
      responseTimeIncrease: baseline.timing > 0
        ? ((current.timing - baseline.timing) / baseline.timing) * 100
        : 0,
      errorRateIncrease: this.totalOps > 0
        ? (this.errorCount / this.totalOps) * 100
        : 0,
      throughputDecrease: 0,
      memoryPressure: baseline.memory > 0
        ? ((current.memory - baseline.memory) / baseline.memory) * 100
        : 0,
    };
  }

  private measureRecovery(): number {
    const start = Date.now();
    const checkRecovery = (): number => {
      const mem = process.memoryUsage();
      const gcReady = mem.heapUsed < this.peakMemory * 1.1;
      return gcReady ? Date.now() - start : 0;
    };
    if (global.gc) global.gc();
    return checkRecovery();
  }

  private measureEventLoopDelay(): number {
    const start = performance.now();
    const timeout = setTimeout(() => {}, 0);
    const delay = performance.now() - start;
    clearTimeout(timeout);
    return delay;
  }

  private buildMetrics(): StressMetrics {
    const sorted = [...this.timings].sort((a, b) => a - b);
    return {
      peakMemory: this.peakMemory,
      peakCpu: this.peakCpu,
      totalOps: this.totalOps,
      errorCount: this.errorCount,
      avgResponseTime: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      maxResponseTime: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      eventLoopDelay: this.measureEventLoopDelay(),
    };
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const mem = process.memoryUsage();
      if (mem.heapUsed > this.peakMemory) this.peakMemory = mem.heapUsed;
    }, 100);
  }

  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}
