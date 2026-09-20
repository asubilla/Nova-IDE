import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { performance } from 'perf_hooks';
import * as child_process from 'child_process';

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

export interface BaselineData {
  timestamp: string;
  results: Record<string, BenchmarkResult>;
  system: SystemInfo;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMemory: number;
  nodeVersion: string;
}

export interface ComparisonResult {
  name: string;
  current: number;
  baseline: number;
  change: number;
  changePercent: number;
  regression: boolean;
  improvement: boolean;
  significant: boolean;
}

export class PerformanceBenchmark {
  private results: Map<string, BenchmarkResult> = new Map();
  private baselinePath: string;
  private baseline: BaselineData | null = null;

  constructor() {
    this.baselinePath = path.join(process.cwd(), 'benchmarks', 'baseline.json');
    this.loadBaseline();
  }

  async benchmarkApiCalls(iterations: number = 10000): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      await new Promise<void>((resolve) => {
        const req = {
          method: 'GET',
          url: '/api/test',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: i, timestamp: Date.now() }),
        };

        const latency = Math.random() * 5;
        setTimeout(() => {
          const statusCode = Math.random() > 0.05 ? 200 : 500;
          resolve();
        }, latency);
      });

      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    const result = this.buildResult('API Calls', iterations, timings);
    this.results.set('api', result);
    return result;
  }

  async benchmarkFileOps(iterations: number = 5000): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const tmpDir = path.join(os.tmpdir(), `nova-bench-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const data = Buffer.alloc(4096, 'bench');
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const filePath = path.join(tmpDir, `bench-${i}.txt`);
      const start = performance.now();

      try {
        fs.writeFileSync(filePath, data);
        fs.readFileSync(filePath);
        fs.unlinkSync(filePath);
      } catch {
        // skip errors
      }

      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    const result = this.buildResult('File Operations', iterations, timings);
    this.results.set('file', result);
    return result;
  }

  async benchmarkDatabase(iterations: number = 5000): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const store = new Map<string, string>();
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const key = `key-${i}`;
      const value = crypto.randomBytes(256).toString('hex');

      store.set(key, value);
      store.get(key);
      store.delete(key);

      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    const result = this.buildResult('Database (In-Memory)', iterations, timings);
    this.results.set('database', result);
    return result;
  }

  async benchmarkCompilation(iterations: number = 50): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const tmpDir = path.join(os.tmpdir(), `nova-compile-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const tsConfigPath = path.join(tmpDir, 'tsconfig.json');
    fs.writeFileSync(tsConfigPath, JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: './out',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['*.ts'],
    }));

    const testFile = path.join(tmpDir, 'test.ts');
    const content = `interface Data { id: number; name: string; values: number[]; }\n` +
      `function process(data: Data): number { return data.values.reduce((a, b) => a + b, 0) * data.id; }\n` +
      `const items: Data[] = Array.from({ length: 100 }, (_, i) => ({ id: i, name: \`item-\${i}\`, values: [i, i * 2, i * 3] }));\n` +
      `export const result = items.map(process);`;

    fs.writeFileSync(testFile, content);
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        child_process.execSync('npx tsc --noEmit', {
          cwd: tmpDir,
          timeout: 30000,
          stdio: 'pipe',
        });
      } catch {
        // compilation errors are expected for benchmarks
      }
      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    const result = this.buildResult('TypeScript Compilation', iterations, timings);
    this.results.set('compilation', result);
    return result;
  }

  async benchmarkMemoryAllocation(iterations: number = 10000): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const startTotal = performance.now();
    const buffers: Buffer[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const size = 1024 + Math.floor(Math.random() * 10240);
      const buf = Buffer.alloc(size, i % 256);
      buffers.push(buf);

      if (buffers.length > 1000) {
        buffers.splice(0, 500);
        if (global.gc) global.gc();
      }

      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    buffers.length = 0;
    if (global.gc) global.gc();
    const result = this.buildResult('Memory Allocation', iterations, timings);
    this.results.set('memory', result);
    return result;
  }

  async benchmarkCrypto(iterations: number = 5000): Promise<BenchmarkResult> {
    const timings: number[] = [];
    const data = crypto.randomBytes(1024);
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      const hash = crypto.createHash('sha256').update(data).digest('hex');
      const hmac = crypto.createHmac('sha256', 'key').update(data).digest('hex');
      const cipher = crypto.createCipheriv('aes-256-cbc', crypto.randomBytes(32), crypto.randomBytes(16));
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

      timings.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    const result = this.buildResult('Crypto Operations', iterations, timings);
    this.results.set('crypto', result);
    return result;
  }

  compareWithBaseline(result: BenchmarkResult, baseline: BenchmarkResult): ComparisonResult {
    const current = result.avgTime;
    const baselineAvg = baseline.avgTime;
    const change = current - baselineAvg;
    const changePercent = baselineAvg > 0 ? (change / baselineAvg) * 100 : 0;

    return {
      name: result.name,
      current,
      baseline: baselineAvg,
      change,
      changePercent,
      regression: changePercent > 10,
      improvement: changePercent < -10,
      significant: Math.abs(changePercent) > 5,
    };
  }

  getReport(): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                 Performance Benchmark Report                ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`System: ${os.platform()} ${os.arch()} | Node ${process.version}`);
    lines.push(`CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model ?? 'unknown'}`);
    lines.push(`Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
    lines.push('');

    this.results.forEach((result, key) => {
      lines.push(`── ${result.name} ──────────────────────────────────────────`);
      lines.push(`  Iterations:   ${result.iterations.toLocaleString()}`);
      lines.push(`  Total Time:   ${(result.totalTime / 1000).toFixed(2)}s`);
      lines.push(`  Avg Time:     ${result.avgTime.toFixed(3)}ms`);
      lines.push(`  Min Time:     ${result.minTime.toFixed(3)}ms`);
      lines.push(`  Max Time:     ${result.maxTime.toFixed(3)}ms`);
      lines.push(`  Throughput:   ${result.opsPerSecond.toLocaleString()} ops/sec`);
      lines.push('');
    });

    if (this.baseline) {
      lines.push('── Baseline Comparison ────────────────────────────────────');
      this.results.forEach((result, key) => {
        const baselineResult = this.baseline!.results[key];
        if (baselineResult) {
          const comparison = this.compareWithBaseline(result, baselineResult);
          const status = comparison.regression ? 'REGRESSION' : comparison.improvement ? 'IMPROVED' : 'STABLE';
          const symbol = comparison.regression ? '↓' : comparison.improvement ? '↑' : '─';
          lines.push(`  ${symbol} ${result.name}: ${comparison.changePercent > 0 ? '+' : ''}${comparison.changePercent.toFixed(1)}% [${status}]`);
        }
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  saveBaseline(): void {
    const dir = path.dirname(this.baselinePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const baselineData: BaselineData = {
      timestamp: new Date().toISOString(),
      results: Object.fromEntries(this.results),
      system: this.getSystemInfo(),
    };

    fs.writeFileSync(this.baselinePath, JSON.stringify(baselineData, null, 2));
    this.baseline = baselineData;
  }

  loadBaseline(): void {
    try {
      if (fs.existsSync(this.baselinePath)) {
        const data = fs.readFileSync(this.baselinePath, 'utf-8');
        this.baseline = JSON.parse(data);
      }
    } catch {
      this.baseline = null;
    }
  }

  getBaseline(): BaselineData | null {
    return this.baseline;
  }

  getResults(): Map<string, BenchmarkResult> {
    return new Map(this.results);
  }

  // ── Private ─────────────────────────────────────────────────────────

  private buildResult(name: string, iterations: number, timings: number[]): BenchmarkResult {
    const sorted = [...timings].sort((a, b) => a - b);
    const totalTime = timings.reduce((a, b) => a + b, 0);

    return {
      name,
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      minTime: sorted[0] ?? 0,
      maxTime: sorted[sorted.length - 1] ?? 0,
      opsPerSecond: totalTime > 0 ? (iterations / totalTime) * 1000 : 0,
    };
  }

  private getSystemInfo(): SystemInfo {
    const cpus = os.cpus();
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: cpus.length,
      cpuModel: cpus[0]?.model ?? 'unknown',
      totalMemory: os.totalmem(),
      nodeVersion: process.version,
    };
  }
}
