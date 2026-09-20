import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthStatus;
  checks: CheckResult[];
  uptime: number;
  timestamp: string;
  version: string;
}

export type CheckFunction = () => Promise<CheckResult>;

export class HealthChecker extends EventEmitter {
  private checks: Map<string, CheckFunction> = new Map();
  private history: HealthReport[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private startTime: number;
  private version: string;
  private maxHistorySize: number;

  constructor(version: string = '2.0.0', maxHistorySize: number = 100) {
    super();
    this.startTime = Date.now();
    this.version = version;
    this.maxHistorySize = maxHistorySize;
    this.registerBuiltInChecks();
  }

  private registerBuiltInChecks(): void {
    this.registerCheck('memory', async () => {
      const mem = process.memoryUsage();
      const heapUsedMB = mem.heapUsed / (1024 * 1024);
      const heapTotalMB = mem.heapTotal / (1024 * 1024);
      const utilization = (heapUsedMB / heapTotalMB) * 100;

      if (utilization > 90) {
        return {
          name: 'memory',
          status: 'fail',
          message: `Heap utilization critical: ${utilization.toFixed(1)}%`,
          duration: 0,
          metadata: { heapUsedMB, heapTotalMB, utilization },
        };
      }
      if (utilization > 75) {
        return {
          name: 'memory',
          status: 'warn',
          message: `Heap utilization elevated: ${utilization.toFixed(1)}%`,
          duration: 0,
          metadata: { heapUsedMB, heapTotalMB, utilization },
        };
      }
      return {
        name: 'memory',
        status: 'pass',
        message: `Heap utilization normal: ${utilization.toFixed(1)}%`,
        duration: 0,
        metadata: { heapUsedMB, heapTotalMB, utilization },
      };
    });

    this.registerCheck('cpu', async () => {
      const loadavg = os.loadavg();
      const cpus = os.cpus().length;
      const load1 = loadavg[0];
      const utilization = (load1 / cpus) * 100;

      if (utilization > 90) {
        return {
          name: 'cpu',
          status: 'fail',
          message: `CPU load critical: ${load1.toFixed(2)} (${utilization.toFixed(1)}%)`,
          duration: 0,
          metadata: { loadavg, cpus, utilization },
        };
      }
      if (utilization > 70) {
        return {
          name: 'cpu',
          status: 'warn',
          message: `CPU load elevated: ${load1.toFixed(2)} (${utilization.toFixed(1)}%)`,
          duration: 0,
          metadata: { loadavg, cpus, utilization },
        };
      }
      return {
        name: 'cpu',
        status: 'pass',
        message: `CPU load normal: ${load1.toFixed(2)} (${utilization.toFixed(1)}%)`,
        duration: 0,
        metadata: { loadavg, cpus, utilization },
      };
    });

    this.registerCheck('disk', async () => {
      try {
        const stats = fs.statfsSync('/');
        const totalGB = (stats.blocks * stats.bsize) / (1024 * 1024 * 1024);
        const freeGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
        const usedPercent = ((totalGB - freeGB) / totalGB) * 100;

        if (usedPercent > 95) {
          return {
            name: 'disk',
            status: 'fail',
            message: `Disk space critical: ${usedPercent.toFixed(1)}% used`,
            duration: 0,
            metadata: { totalGB, freeGB, usedPercent },
          };
        }
        if (usedPercent > 85) {
          return {
            name: 'disk',
            status: 'warn',
            message: `Disk space low: ${usedPercent.toFixed(1)}% used`,
            duration: 0,
            metadata: { totalGB, freeGB, usedPercent },
          };
        }
        return {
          name: 'disk',
          status: 'pass',
          message: `Disk space OK: ${usedPercent.toFixed(1)}% used`,
          duration: 0,
          metadata: { totalGB, freeGB, usedPercent },
        };
      } catch {
        return {
          name: 'disk',
          status: 'warn',
          message: 'Unable to check disk space',
          duration: 0,
        };
      }
    });

    this.registerCheck('network', async () => {
      const start = Date.now();
      try {
        const interfaces = os.networkInterfaces();
        const activeInterfaces = Object.values(interfaces)
          .flat()
          .filter((iface) => iface && !iface.internal);

        if (activeInterfaces.length === 0) {
          return {
            name: 'network',
            status: 'warn',
            message: 'No active network interfaces',
            duration: Date.now() - start,
            metadata: { interfaceCount: 0 },
          };
        }

        return {
          name: 'network',
          status: 'pass',
          message: `${activeInterfaces.length} network interface(s) active`,
          duration: Date.now() - start,
          metadata: { interfaceCount: activeInterfaces.length },
        };
      } catch {
        return {
          name: 'network',
          status: 'fail',
          message: 'Network check failed',
          duration: Date.now() - start,
        };
      }
    });

    this.registerCheck('api', async () => {
      const start = Date.now();
      try {
        const response = await Promise.race([
          fetch('https://httpbin.org/get', { method: 'GET' }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
        ]);

        if (response.ok) {
          return {
            name: 'api',
            status: 'pass',
            message: 'API endpoint reachable',
            duration: Date.now() - start,
          };
        }
        return {
          name: 'api',
          status: 'warn',
          message: `API returned status ${response.status}`,
          duration: Date.now() - start,
        };
      } catch {
        return {
          name: 'api',
          status: 'fail',
          message: 'API endpoint unreachable',
          duration: Date.now() - start,
        };
      }
    });

    this.registerCheck('database', async () => {
      const start = Date.now();
      try {
        const dbPath = './data/nova.db';
        const exists = fs.existsSync(dbPath);
        return {
          name: 'database',
          status: exists ? 'pass' : 'warn',
          message: exists ? 'Database file exists' : 'Database file not found',
          duration: Date.now() - start,
          metadata: { path: dbPath },
        };
      } catch {
        return {
          name: 'database',
          status: 'fail',
          message: 'Database check failed',
          duration: Date.now() - start,
        };
      }
    });

    this.registerCheck('agents', async () => {
      return {
        name: 'agents',
        status: 'pass',
        message: 'Agent system operational',
        duration: 0,
        metadata: { timestamp: Date.now() },
      };
    });
  }

  registerCheck(name: string, checkFn: CheckFunction): void {
    this.checks.set(name, checkFn);
    this.emit('checkRegistered', name);
  }

  unregisterCheck(name: string): boolean {
    const result = this.checks.delete(name);
    if (result) {
      this.emit('checkUnregistered', name);
    }
    return result;
  }

  async checkHealth(): Promise<HealthReport> {
    const checks: CheckResult[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const [name, checkFn] of Array.from(this.checks.entries())) {
      try {
        const start = Date.now();
        const result = await Promise.race([
          checkFn(),
          new Promise<CheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Check timeout')), 10000)
          ),
        ]);
        result.duration = Date.now() - start;
        checks.push(result);

        if (result.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          message: (error as Error).message,
          duration: 0,
        });
        overallStatus = 'unhealthy';
      }
    }

    const report: HealthReport = {
      status: overallStatus,
      checks,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      version: this.version,
    };

    this.history.push(report);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    this.emit('healthCheck', report);
    return report;
  }

  async checkSpecific(name: string): Promise<CheckResult> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      return {
        name,
        status: 'fail',
        message: `Check '${name}' not found`,
        duration: 0,
      };
    }

    try {
      const start = Date.now();
      const result = await Promise.race([
        checkFn(),
        new Promise<CheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Check timeout')), 10000)
        ),
      ]);
      result.duration = Date.now() - start;
      this.emit('specificCheck', name, result);
      return result;
    } catch (error) {
      return {
        name,
        status: 'fail',
        message: (error as Error).message,
        duration: 0,
      };
    }
  }

  getOverallStatus(): HealthStatus {
    if (this.history.length === 0) {
      return 'healthy';
    }
    return this.history[this.history.length - 1].status;
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.monitoringInterval = setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);
    this.emit('monitoringStarted', intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.emit('monitoringStopped');
    }
  }

  getHistory(): HealthReport[] {
    return [...this.history];
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }
}
