import type { QualityGate, QualityGateResult, AgentTask } from '../core/types';

export type GateType = QualityGate['type'];

export interface GateDefinition {
  type: GateType;
  name: string;
  description: string;
  defaultCommand: string;
  defaultArgs: string[];
  defaultThreshold: number;
  defaultBlocking: boolean;
  defaultTimeoutMs: number;
  parseOutput: (output: string) => number;
}

export interface GateRunConfig {
  gate: QualityGate;
  timeoutMs: number;
  workingDirectory?: string;
  env?: Record<string, string>;
}

export interface GateRunResult extends QualityGateResult {
  gateName: string;
  gateType: GateType;
  blocking: boolean;
  error?: string;
}

export interface GateHistoryEntry {
  taskId: string;
  gateName: string;
  gateType: GateType;
  results: GateRunResult[];
  timestamp: Date;
  allBlockingPassed: boolean;
  overallPassed: boolean;
}

export interface GateTrend {
  gateName: string;
  gateType: GateType;
  runs: { timestamp: Date; passed: boolean; value: number }[];
  passRate: number;
  averageValue: number;
  trend: 'improving' | 'stable' | 'regressing';
}

export interface AggregatedResult {
  taskId: string;
  allPassed: boolean;
  blockingPassed: boolean;
  results: GateRunResult[];
  blockingFailures: GateRunResult[];
  nonBlockingFailures: GateRunResult[];
}

const BUILT_IN_GATES: GateDefinition[] = [
  {
    type: 'lint',
    name: 'Linter',
    description: 'Code linting checks',
    defaultCommand: 'eslint',
    defaultArgs: ['.'],
    defaultThreshold: 0,
    defaultBlocking: true,
    defaultTimeoutMs: 30000,
    parseOutput: (output) => {
      const match = output.match(/(\d+)\s+problems?/);
      return match ? parseInt(match[1], 10) : 0;
    },
  },
  {
    type: 'typecheck',
    name: 'Type Checker',
    description: 'TypeScript type checking',
    defaultCommand: 'tsc',
    defaultArgs: ['--noEmit'],
    defaultThreshold: 0,
    defaultBlocking: true,
    defaultTimeoutMs: 60000,
    parseOutput: (output) => {
      const match = output.match(/(\d+)\s+errors?/);
      return match ? parseInt(match[1], 10) : 0;
    },
  },
  {
    type: 'test',
    name: 'Tests',
    description: 'Unit and integration tests',
    defaultCommand: 'jest',
    defaultArgs: ['--passWithNoTests'],
    defaultThreshold: 80,
    defaultBlocking: true,
    defaultTimeoutMs: 120000,
    parseOutput: (output) => {
      const match = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)%/);
      return match ? parseInt(match[2], 10) : 0;
    },
  },
  {
    type: 'security',
    name: 'Security Scanner',
    description: 'Security vulnerability scanning',
    defaultCommand: 'npm',
    defaultArgs: ['audit', '--json'],
    defaultThreshold: 0,
    defaultBlocking: true,
    defaultTimeoutMs: 60000,
    parseOutput: (output) => {
      try {
        const json = JSON.parse(output);
        return json.metadata?.vulnerabilities?.total || 0;
      } catch {
        return 0;
      }
    },
  },
  {
    type: 'performance',
    name: 'Performance',
    description: 'Performance benchmarks',
    defaultCommand: 'echo',
    defaultArgs: ['0'],
    defaultThreshold: 100,
    defaultBlocking: false,
    defaultTimeoutMs: 30000,
    parseOutput: (output) => parseFloat(output.trim()) || 0,
  },
  {
    type: 'coverage',
    name: 'Coverage',
    description: 'Code coverage checks',
    defaultCommand: 'jest',
    defaultArgs: ['--coverage', '--coverageReporters=text-summary'],
    defaultThreshold: 80,
    defaultBlocking: true,
    defaultTimeoutMs: 120000,
    parseOutput: (output) => {
      const match = output.match(/Lines\s*:\s*(\d+\.?\d*)%/);
      return match ? parseFloat(match[1]) : 0;
    },
  },
];

export class QualityGateRunner {
  private gateDefinitions: Map<GateType, GateDefinition> = new Map();
  private gateHistory: GateHistoryEntry[] = [];
  private customGates: Map<string, GateDefinition> = new Map();

  constructor() {
    for (const def of BUILT_IN_GATES) {
      this.gateDefinitions.set(def.type, def);
    }
  }

  registerCustomGate(definition: GateDefinition): void {
    this.customGates.set(definition.name, definition);
  }

  getGateDefinition(type: GateType, name?: string): GateDefinition | undefined {
    if (name) {
      return this.customGates.get(name);
    }
    return this.gateDefinitions.get(type);
  }

  createDefaultGate(type: GateType): QualityGate {
    const def = this.gateDefinitions.get(type);
    if (!def) throw new Error(`Unknown gate type: ${type}`);
    return {
      name: def.name,
      type: def.type,
      threshold: def.defaultThreshold,
      blocking: def.defaultBlocking,
      command: def.defaultCommand,
      args: [...def.defaultArgs],
    };
  }

  async runGate(config: GateRunConfig): Promise<GateRunResult> {
    const startTime = Date.now();
    const { gate, timeoutMs, workingDirectory, env } = config;

    try {
      const result = await this.executeCommand(
        gate.command,
        gate.args,
        timeoutMs || 30000,
        workingDirectory,
        env
      );

      const def = this.gateDefinitions.get(gate.type);
      const value = def ? def.parseOutput(result.output) : parseFloat(result.output) || 0;

      const passed = gate.type === 'security' || gate.type === 'lint' || gate.type === 'typecheck'
        ? value <= gate.threshold
        : value >= gate.threshold;

      return {
        gate,
        passed,
        value,
        threshold: gate.threshold,
        output: result.output,
        durationMs: Date.now() - startTime,
        gateName: gate.name,
        gateType: gate.type,
        blocking: gate.blocking,
        error: result.error,
      };
    } catch (err: any) {
      return {
        gate,
        passed: false,
        value: 0,
        threshold: gate.threshold,
        output: '',
        durationMs: Date.now() - startTime,
        gateName: gate.name,
        gateType: gate.type,
        blocking: gate.blocking,
        error: err.message,
      };
    }
  }

  private async executeCommand(
    command: string,
    args: string[],
    timeoutMs: number,
    cwd?: string,
    env?: Record<string, string>
  ): Promise<{ output: string; error?: string; exitCode: number }> {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      const proc = execFile(
        command,
        args,
        {
          cwd: cwd || process.cwd(),
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, ...env },
        },
        (error, stdout, stderr) => {
          resolve({
            output: stdout || stderr || '',
            error: error?.message,
            exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
          });
        }
      );
    });
  }

  async runAllGates(
    gates: QualityGate[],
    options?: { workingDirectory?: string; env?: Record<string, string>; parallel?: boolean }
  ): Promise<AggregatedResult> {
    const results: GateRunResult[] = [];

    if (options?.parallel) {
      const promises = gates.map(gate =>
        this.runGate({
          gate,
          timeoutMs: 30000,
          workingDirectory: options.workingDirectory,
          env: options.env,
        })
      );
      const gateResults = await Promise.all(promises);
      results.push(...gateResults);
    } else {
      for (const gate of gates) {
        const result = await this.runGate({
          gate,
          timeoutMs: 30000,
          workingDirectory: options?.workingDirectory,
          env: options?.env,
        });
        results.push(result);

        if (gate.blocking && !result.passed) {
          break;
        }
      }
    }

    const blockingFailures = results.filter(r => r.blocking && !r.passed);
    const nonBlockingFailures = results.filter(r => !r.blocking && !r.passed);

    return {
      taskId: '',
      allPassed: results.every(r => r.passed),
      blockingPassed: blockingFailures.length === 0,
      results,
      blockingFailures,
      nonBlockingFailures,
    };
  }

  async runTaskGates(task: AgentTask): Promise<AggregatedResult> {
    const result = await this.runAllGates(task.qualityGates);
    return { ...result, taskId: task.id };
  }

  recordHistory(entry: GateHistoryEntry): void {
    this.gateHistory.push(entry);
  }

  getHistory(taskId?: string): GateHistoryEntry[] {
    if (taskId) {
      return this.gateHistory.filter(e => e.taskId === taskId);
    }
    return [...this.gateHistory];
  }

  getTrends(gateName?: string): GateTrend[] {
    const trendMap = new Map<string, GateTrend>();

    for (const entry of this.gateHistory) {
      for (const result of entry.results) {
        const key = result.gateName;
        if (gateName && key !== gateName) continue;

        if (!trendMap.has(key)) {
          trendMap.set(key, {
            gateName: result.gateName,
            gateType: result.gateType,
            runs: [],
            passRate: 0,
            averageValue: 0,
            trend: 'stable',
          });
        }
        const trend = trendMap.get(key)!;
        trend.runs.push({
          timestamp: entry.timestamp,
          passed: result.passed,
          value: result.value,
        });
      }
    }

    for (const trend of trendMap.values()) {
      if (trend.runs.length === 0) continue;
      trend.passRate = trend.runs.filter(r => r.passed).length / trend.runs.length;
      trend.averageValue = trend.runs.reduce((sum, r) => sum + r.value, 0) / trend.runs.length;

      if (trend.runs.length >= 3) {
        const recent = trend.runs.slice(-3);
        const older = trend.runs.slice(-6, -3);
        if (older.length > 0) {
          const recentPassRate = recent.filter(r => r.passed).length / recent.length;
          const olderPassRate = older.filter(r => r.passed).length / older.length;
          if (recentPassRate > olderPassRate + 0.1) trend.trend = 'improving';
          else if (recentPassRate < olderPassRate - 0.1) trend.trend = 'regressing';
          else trend.trend = 'stable';
        }
      }
    }

    return Array.from(trendMap.values());
  }

  clearHistory(): void {
    this.gateHistory = [];
  }
}
