import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import * as WebSocket from 'ws';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export interface LoadTestConfig {
  duration: number;
  concurrency: number;
  rampUp: number;
  targetRps: number;
  timeout: number;
}

export interface LoadTestResult {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  p50: number;
  p95: number;
  p99: number;
  maxResponseTime: number;
  throughput: number;
  errors: LoadTestError[];
  duration: number;
}

export interface LoadTestError {
  message: string;
  count: number;
  firstOccurrence: number;
  lastOccurrence: number;
}

export interface LoadMetrics {
  activeConnections: number;
  totalRequests: number;
  currentRps: number;
  avgResponseTime: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  agent?: http.Agent;
}

interface WebSocketTestOptions {
  messages?: string[];
  messageInterval?: number;
  reconnect?: boolean;
}

interface AgentTestOptions {
  agentType?: string;
  taskCount?: number;
  taskTimeout?: number;
}

interface FileTestOptions {
  filePaths?: string[];
  writeSize?: number;
  readWriteCycles?: number;
}

interface MemoryTestOptions {
  targetMb?: number;
  allocationSize?: number;
  gcCycles?: number;
}

interface ConcurrentUserOptions {
  messagesPerUser?: number;
  thinkTime?: number;
}

interface SpikeConfig {
  baselineRps: number;
  spikeRps: number;
  spikeDuration: number;
  cycles: number;
}

export class LoadTest extends EventEmitter {
  private config: LoadTestConfig;
  private metrics: LoadMetrics;
  private timings: number[] = [];
  private errors: Map<string, LoadTestError> = new Map();
  private activeConnections = 0;
  private totalRequests = 0;
  private successCount = 0;
  private errorCount = 0;
  private running = false;
  private startTime = 0;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;
  private rpsWindow: number[] = [];

  constructor(config: Partial<LoadTestConfig> = {}) {
    super();
    this.config = {
      duration: config.duration ?? 30000,
      concurrency: config.concurrency ?? 10,
      rampUp: config.rampUp ?? 5000,
      targetRps: config.targetRps ?? 100,
      timeout: config.timeout ?? 10000,
    };
    this.metrics = {
      activeConnections: 0,
      totalRequests: 0,
      currentRps: 0,
      avgResponseTime: 0,
      errorRate: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }

  async runHttpLoadTest(url: string, options: HttpRequestOptions = {}): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const method = options.method ?? 'GET';
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const interval = 1000 / this.config.targetRps;

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const makeRequest = async (): Promise<void> => {
        if (!this.running || Date.now() - this.startTime >= this.config.duration) return;
        this.activeConnections++;
        this.totalRequests++;
        const requestStart = performance.now();

        try {
          await new Promise<void>((res, rej) => {
            const reqOptions: http.RequestOptions = {
              hostname: parsedUrl.hostname,
              port: parsedUrl.port ?? (isHttps ? 443 : 80),
              path: parsedUrl.pathname + parsedUrl.search,
              method,
              headers: options.headers ?? {},
              timeout: this.config.timeout,
            };

            const transport = isHttps ? https : http;
            const req = transport.request(reqOptions, (response) => {
              let data = '';
              response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
              response.on('end', () => {
                const duration = performance.now() - requestStart;
                this.timings.push(duration);
                this.rpsWindow.push(Date.now());
                if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
                  this.successCount++;
                } else {
                  this.errorCount++;
                  this.recordError(`HTTP ${response.statusCode}`);
                }
                res();
              });
            });

            req.on('error', (err: Error) => {
              const duration = performance.now() - requestStart;
              this.timings.push(duration);
              this.errorCount++;
              this.recordError(err.message);
              rej(err);
            });

            req.on('timeout', () => {
              req.destroy();
              const duration = performance.now() - requestStart;
              this.timings.push(duration);
              this.errorCount++;
              this.recordError('Timeout');
              rej(new Error('Timeout'));
            });

            if (options.body) req.write(options.body);
            req.end();
          });
        } catch {
          // error already recorded
        } finally {
          this.activeConnections--;
        }
      };

      const scheduleRequests = (): void => {
        if (!this.running || Date.now() - this.startTime >= this.config.duration) {
          setTimeout(() => {
            this.running = false;
            this.stopMetricsCollection();
            resolve(this.buildResult());
          }, 1000);
          return;
        }

        const batch = Math.min(this.config.concurrency, this.config.targetRps);
        const promises: Promise<void>[] = [];
        for (let i = 0; i < batch; i++) {
          promises.push(makeRequest());
        }
        Promise.allSettled(promises).then(() => {
          if (this.running) {
            setTimeout(scheduleRequests, interval);
          }
        });
      };

      scheduleRequests();
    });
  }

  async runWebSocketLoadTest(url: string, options: WebSocketTestOptions = {}): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const messages = options.messages ?? ['ping'];
    const messageInterval = options.messageInterval ?? 1000;
    const sockets: WebSocket.WebSocket[] = [];

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const connectSocket = (): Promise<void> => {
        return new Promise((res) => {
          this.activeConnections++;
          this.totalRequests++;
          const start = performance.now();

          try {
            const ws = new WebSocket.WebSocket(url);
            sockets.push(ws);

            ws.on('open', () => {
              const duration = performance.now() - start;
              this.timings.push(duration);
              this.rpsWindow.push(Date.now());
              this.successCount++;
              let msgIndex = 0;
              const sendLoop = setInterval(() => {
                if (!this.running || ws.readyState !== WebSocket.WebSocket.OPEN) {
                  clearInterval(sendLoop);
                  return;
                }
                const msg = messages[msgIndex % messages.length];
                this.totalRequests++;
                const msgStart = performance.now();
                ws.send(msg, (err) => {
                  const msgDuration = performance.now() - msgStart;
                  this.timings.push(msgDuration);
                  this.rpsWindow.push(Date.now());
                  if (err) {
                    this.errorCount++;
                    this.recordError(err.message);
                  } else {
                    this.successCount++;
                  }
                });
                msgIndex++;
              }, messageInterval);
            });

            ws.on('message', () => {
              // received response
            });

            ws.on('error', (err: Error) => {
              const duration = performance.now() - start;
              this.timings.push(duration);
              this.errorCount++;
              this.recordError(err.message);
              this.activeConnections--;
              res();
            });

            ws.on('close', () => {
              this.activeConnections--;
              res();
            });

            setTimeout(() => {
              if (ws.readyState === WebSocket.WebSocket.OPEN) ws.close();
            }, this.config.duration);
          } catch (err) {
            this.errorCount++;
            this.recordError((err as Error).message);
            this.activeConnections--;
            res();
          }
        });
      };

      const connectAll = async (): Promise<void> => {
        const batchSize = Math.min(this.config.concurrency, 50);
        for (let i = 0; i < this.config.concurrency && this.running; i += batchSize) {
          const batch: Promise<void>[] = [];
          for (let j = 0; j < batchSize && i + j < this.config.concurrency; j++) {
            batch.push(connectSocket());
          }
          await Promise.allSettled(batch);
          if (i + batchSize < this.config.concurrency) {
            await this.sleep(this.config.rampUp / (this.config.concurrency / batchSize));
          }
        }
      };

      connectAll().then(() => {
        setTimeout(() => {
          this.running = false;
          for (const ws of sockets) {
            if (ws.readyState === WebSocket.WebSocket.OPEN) ws.close();
          }
          this.stopMetricsCollection();
          resolve(this.buildResult());
        }, this.config.duration);
      });
    });
  }

  async runAgentLoadTest(options: AgentTestOptions = {}): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const agentType = options.agentType ?? 'default';
    const taskCount = options.taskCount ?? this.config.targetRps * (this.config.duration / 1000);
    const taskTimeout = options.taskTimeout ?? this.config.timeout;

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const spawnAgent = async (taskId: number): Promise<void> => {
        this.activeConnections++;
        this.totalRequests++;
        const start = performance.now();

        try {
          await Promise.race([
            new Promise<void>((res) => {
              const payload = JSON.stringify({ type: agentType, taskId, timestamp: Date.now() });
              const dataSize = Buffer.byteLength(payload);
              const processingTime = Math.random() * 100 + 10;
              setTimeout(() => {
                this.timings.push(processingTime);
                this.rpsWindow.push(Date.now());
                this.successCount++;
                res();
              }, processingTime);
            }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Agent task timeout')), taskTimeout)),
          ]);
        } catch (err) {
          const duration = performance.now() - start;
          this.timings.push(duration);
          this.errorCount++;
          this.recordError((err as Error).message);
        } finally {
          this.activeConnections--;
        }
      };

      const runTasks = async (): Promise<void> => {
        const batchSize = this.config.concurrency;
        for (let i = 0; i < taskCount && this.running; i += batchSize) {
          const batch: Promise<void>[] = [];
          for (let j = 0; j < batchSize && i + j < taskCount; j++) {
            batch.push(spawnAgent(i + j));
          }
          await Promise.allSettled(batch);
          const elapsed = Date.now() - this.startTime;
          if (elapsed >= this.config.duration) break;
        }
      };

      runTasks().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        resolve(this.buildResult());
      });
    });
  }

  async runFileLoadTest(options: FileTestOptions = {}): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const tmpDir = path.join(os.tmpdir(), `nova-loadtest-${Date.now()}`);
    const filePaths = options.filePaths ?? [path.join(tmpDir, 'loadtest.txt')];
    const writeSize = options.writeSize ?? 4096;
    const readWriteCycles = options.readWriteCycles ?? this.config.targetRps * (this.config.duration / 1000);

    fs.mkdirSync(tmpDir, { recursive: true });

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const writeData = Buffer.alloc(writeSize, 'x');
      let completedOps = 0;

      const performOp = async (filePath: string): Promise<void> => {
        this.activeConnections++;
        this.totalRequests++;
        const start = performance.now();

        try {
          await fs.promises.writeFile(filePath, writeData);
          await fs.promises.readFile(filePath);
          const duration = performance.now() - start;
          this.timings.push(duration);
          this.rpsWindow.push(Date.now());
          this.successCount++;
        } catch (err) {
          const duration = performance.now() - start;
          this.timings.push(duration);
          this.errorCount++;
          this.recordError((err as Error).message);
        } finally {
          this.activeConnections--;
          completedOps++;
        }
      };

      const runOps = async (): Promise<void> => {
        const batchSize = this.config.concurrency;
        for (let i = 0; i < readWriteCycles && this.running; i += batchSize) {
          const batch: Promise<void>[] = [];
          for (let j = 0; j < batchSize && i + j < readWriteCycles; j++) {
            const filePath = filePaths[(i + j) % filePaths.length];
            batch.push(performOp(filePath));
          }
          await Promise.allSettled(batch);
          const elapsed = Date.now() - this.startTime;
          if (elapsed >= this.config.duration) break;
        }
      };

      runOps().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        resolve(this.buildResult());
      });
    });
  }

  async runMemoryLoadTest(options: MemoryTestOptions = {}): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const targetMb = options.targetMb ?? 512;
    const allocationSize = options.allocationSize ?? 1024 * 1024;
    const gcCycles = options.gcCycles ?? 10;
    const buffers: Buffer[] = [];

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const allocateMemory = async (): Promise<void> => {
        this.activeConnections++;
        this.totalRequests++;
        const start = performance.now();

        try {
          const targetBytes = targetMb * 1024 * 1024;
          const allocations = Math.floor(targetBytes / allocationSize);
          for (let i = 0; i < allocations && this.running; i++) {
            const buf = Buffer.alloc(allocationSize, i % 256);
            buffers.push(buf);
            this.totalRequests++;
            this.timings.push(performance.now() - start);
            this.rpsWindow.push(Date.now());
            this.successCount++;
          }

          for (let cycle = 0; cycle < gcCycles && this.running; cycle++) {
            const releaseCount = Math.floor(buffers.length / 2);
            buffers.splice(0, releaseCount);
            if (global.gc) global.gc();
            await this.sleep(10);
          }

          const finalMem = process.memoryUsage();
          this.metrics.memoryUsage = finalMem.heapUsed;
        } catch (err) {
          this.errorCount++;
          this.recordError((err as Error).message);
        } finally {
          buffers.length = 0;
          if (global.gc) global.gc();
          this.activeConnections--;
        }
      };

      allocateMemory().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        resolve(this.buildResult());
      });
    });
  }

  async runConcurrentUsersTest(userCount: number, duration: number): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.config.duration = duration;
    this.config.concurrency = userCount;

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const simulateUser = async (userId: number): Promise<void> => {
        const thinkTime = 500 + Math.random() * 2000;
        const actions = 3 + Math.floor(Math.random() * 5);

        for (let action = 0; action < actions && this.running; action++) {
          this.activeConnections++;
          this.totalRequests++;
          const start = performance.now();

          try {
            const actionTime = 50 + Math.random() * 200;
            await this.sleep(actionTime);
            const duration = performance.now() - start;
            this.timings.push(duration);
            this.rpsWindow.push(Date.now());
            this.successCount++;
          } catch (err) {
            this.errorCount++;
            this.recordError((err as Error).message);
          } finally {
            this.activeConnections--;
          }

          if (this.running && action < actions - 1) {
            await this.sleep(thinkTime);
          }
        }
      };

      const runUsers = async (): Promise<void> => {
        const batchSize = Math.min(this.config.concurrency, 50);
        for (let i = 0; i < userCount && this.running; i += batchSize) {
          const batch: Promise<void>[] = [];
          for (let j = 0; j < batchSize && i + j < userCount; j++) {
            batch.push(simulateUser(i + j));
          }
          await Promise.allSettled(batch);
          if (this.config.rampUp > 0 && i + batchSize < userCount) {
            await this.sleep(this.config.rampUp / (userCount / batchSize));
          }
        }
      };

      runUsers().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        resolve(this.buildResult());
      });
    });
  }

  async runSpikeTest(spikeConfig: SpikeConfig): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    const cycleDuration = this.config.duration / spikeConfig.cycles;

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const runCycle = async (isSpike: boolean): Promise<void> => {
        const rps = isSpike ? spikeConfig.spikeRps : spikeConfig.baselineRps;
        const interval = 1000 / rps;
        const cycleStart = Date.now();
        const cycleLength = isSpike ? spikeConfig.spikeDuration : cycleDuration - spikeConfig.spikeDuration;

        return new Promise((res) => {
          const doWork = (): void => {
            if (!this.running || Date.now() - cycleStart >= cycleLength) {
              res();
              return;
            }
            this.totalRequests++;
            const start = performance.now();
            const processingTime = Math.random() * 50;
            setTimeout(() => {
              const duration = performance.now() - start + processingTime;
              this.timings.push(duration);
              this.rpsWindow.push(Date.now());
              if (Math.random() > 0.05) {
                this.successCount++;
              } else {
                this.errorCount++;
                this.recordError('Spike error');
              }
              setTimeout(doWork, interval);
            }, processingTime);
          };
          doWork();
        });
      };

      const runAll = async (): Promise<void> => {
        for (let cycle = 0; cycle < spikeConfig.cycles && this.running; cycle++) {
          await runCycle(false);
          if (this.running) await runCycle(true);
        }
      };

      runAll().then(() => {
        this.running = false;
        this.stopMetricsCollection();
        resolve(this.buildResult());
      });
    });
  }

  async runEnduranceTest(duration: number): Promise<LoadTestResult> {
    this.reset();
    this.running = true;
    this.startTime = Date.now();
    this.config.duration = duration;

    this.startMetricsCollection();

    return new Promise<LoadTestResult>((resolve) => {
      const doWork = async (): Promise<void> => {
        while (this.running && Date.now() - this.startTime < duration) {
          this.activeConnections++;
          this.totalRequests++;
          const start = performance.now();

          try {
            const workTime = 10 + Math.random() * 90;
            await this.sleep(workTime);
            const duration = performance.now() - start;
            this.timings.push(duration);
            this.rpsWindow.push(Date.now());
            this.successCount++;
          } catch (err) {
            this.errorCount++;
            this.recordError((err as Error).message);
          } finally {
            this.activeConnections--;
          }

          await this.sleep(1000 / this.config.targetRps);
        }
      };

      const workers: Promise<void>[] = [];
      for (let i = 0; i < this.config.concurrency; i++) {
        workers.push(doWork());
      }

      Promise.allSettled(workers).then(() => {
        this.running = false;
        this.stopMetricsCollection();
        resolve(this.buildResult());
      });
    });
  }

  getMetrics(): LoadMetrics {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + (total - cpu.times.idle) / total;
    }, 0) / cpus.length * 100;

    return {
      activeConnections: this.activeConnections,
      totalRequests: this.totalRequests,
      currentRps: this.calculateCurrentRps(),
      avgResponseTime: this.timings.length > 0
        ? this.timings.reduce((a, b) => a + b, 0) / this.timings.length
        : 0,
      errorRate: this.totalRequests > 0
        ? (this.errorCount / this.totalRequests) * 100
        : 0,
      memoryUsage: mem.heapUsed,
      cpuUsage,
    };
  }

  stop(): void {
    this.running = false;
    this.stopMetricsCollection();
  }

  // ── Private ─────────────────────────────────────────────────────────

  private reset(): void {
    this.timings = [];
    this.errors.clear();
    this.activeConnections = 0;
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.rpsWindow = [];
    this.running = false;
  }

  private recordError(message: string): void {
    const existing = this.errors.get(message);
    const now = Date.now();
    if (existing) {
      existing.count++;
      existing.lastOccurrence = now;
    } else {
      this.errors.set(message, {
        message,
        count: 1,
        firstOccurrence: now,
        lastOccurrence: now,
      });
    }
  }

  private calculateCurrentRps(): number {
    const now = Date.now();
    const windowMs = 1000;
    this.rpsWindow = this.rpsWindow.filter((t) => now - t < windowMs);
    return this.rpsWindow.length;
  }

  private buildResult(): LoadTestResult {
    const sorted = [...this.timings].sort((a, b) => a - b);
    const p = (percentile: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.ceil(sorted.length * percentile / 100) - 1;
      return sorted[Math.max(0, idx)];
    };

    const duration = (Date.now() - this.startTime) / 1000;

    return {
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgResponseTime: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p50: p(50),
      p95: p(95),
      p99: p(99),
      maxResponseTime: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      throughput: duration > 0 ? this.totalRequests / duration : 0,
      errors: Array.from(this.errors.values()),
      duration: duration * 1000,
    };
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const m = this.getMetrics();
      this.metrics = m;
      this.emit('metrics', m);
    }, 1000);
  }

  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
