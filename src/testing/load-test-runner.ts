import * as fs from 'fs';
import * as path from 'path';
import { LoadTest, LoadTestResult, LoadTestConfig } from './load-test';
import { StressTest, StressResult, SystemHealth } from './stress-test';
import { PerformanceBenchmark, BenchmarkResult } from './performance-benchmark';

export interface TestSuiteResult {
  tests: TestEntry[];
  results: TestResultEntry[];
  summary: SuiteSummary;
  duration: number;
  timestamp: string;
}

export interface TestEntry {
  name: string;
  type: 'load' | 'stress' | 'benchmark' | 'smoke';
  config?: Record<string, unknown>;
}

export interface TestResultEntry {
  name: string;
  type: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  result?: LoadTestResult | StressResult | BenchmarkResult;
  error?: string;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDuration: number;
  avgDuration: number;
}

export interface CustomSuiteConfig {
  tests: TestEntry[];
  parallel?: boolean;
  timeout?: number;
}

export class LoadTestRunner {
  private loadTest: LoadTest;
  private stressTest: StressTest;
  private benchmark: PerformanceBenchmark;
  private results: TestResultEntry[] = [];

  constructor() {
    this.loadTest = new LoadTest();
    this.stressTest = new StressTest();
    this.benchmark = new PerformanceBenchmark();
  }

  async runFullSuite(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    this.results = [];

    const tests: TestEntry[] = [
      { name: 'HTTP Load Test', type: 'load', config: { url: 'http://localhost:3000', concurrency: 10, duration: 5000 } },
      { name: 'WebSocket Load Test', type: 'load', config: { url: 'ws://localhost:3001', concurrency: 5, duration: 5000 } },
      { name: 'Agent Load Test', type: 'load', config: { taskCount: 50, concurrency: 10 } },
      { name: 'File I/O Load Test', type: 'load', config: { readWriteCycles: 100, concurrency: 5 } },
      { name: 'Memory Load Test', type: 'load', config: { targetMb: 128 } },
      { name: 'Concurrent Users Test', type: 'load', config: { userCount: 20, duration: 10000 } },
      { name: 'Spike Test', type: 'load', config: { baselineRps: 10, spikeRps: 100, spikeDuration: 2000, cycles: 3 } },
      { name: 'Endurance Test', type: 'load', config: { duration: 15000, concurrency: 5, targetRps: 50 } },
      { name: 'Max Connections Stress', type: 'stress', config: { max: 100 } },
      { name: 'Max Agents Stress', type: 'stress', config: { max: 50 } },
      { name: 'Memory Pressure Stress', type: 'stress', config: { limitMb: 256 } },
      { name: 'CPU Pressure Stress', type: 'stress', config: { cores: 4 } },
      { name: 'Disk I/O Stress', type: 'stress', config: { operations: 500 } },
      { name: 'Graceful Degradation Stress', type: 'stress', config: {} },
      { name: 'API Benchmark', type: 'benchmark', config: { iterations: 5000 } },
      { name: 'File Ops Benchmark', type: 'benchmark', config: { iterations: 2000 } },
      { name: 'Database Benchmark', type: 'benchmark', config: { iterations: 2000 } },
      { name: 'Memory Allocation Benchmark', type: 'benchmark', config: { iterations: 5000 } },
      { name: 'Crypto Benchmark', type: 'benchmark', config: { iterations: 2000 } },
    ];

    for (const test of tests) {
      const result = await this.runTest(test);
      this.results.push(result);
    }

    const duration = Date.now() - startTime;

    return {
      tests,
      results: [...this.results],
      summary: this.buildSummary(duration),
      duration,
      timestamp: new Date().toISOString(),
    };
  }

  async runQuickSuite(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    this.results = [];

    const tests: TestEntry[] = [
      { name: 'HTTP Quick Test', type: 'smoke', config: { url: 'http://localhost:3000', concurrency: 2, duration: 3000 } },
      { name: 'File I/O Quick Test', type: 'smoke', config: { readWriteCycles: 50, concurrency: 2 } },
      { name: 'Memory Quick Test', type: 'smoke', config: { targetMb: 32 } },
      { name: 'API Quick Benchmark', type: 'benchmark', config: { iterations: 1000 } },
      { name: 'System Health Check', type: 'stress', config: {} },
    ];

    for (const test of tests) {
      const result = await this.runTest(test);
      this.results.push(result);
    }

    const duration = Date.now() - startTime;

    return {
      tests,
      results: [...this.results],
      summary: this.buildSummary(duration),
      duration,
      timestamp: new Date().toISOString(),
    };
  }

  async runCustomSuite(config: CustomSuiteConfig): Promise<TestSuiteResult> {
    const startTime = Date.now();
    this.results = [];

    if (config.parallel) {
      const promises = config.tests.map((test) => this.runTest(test));
      const results = await Promise.allSettled(promises);
      for (const r of results) {
        if (r.status === 'fulfilled') this.results.push(r.value);
      }
    } else {
      for (const test of config.tests) {
        const result = await this.runTest(test);
        this.results.push(result);
      }
    }

    const duration = Date.now() - startTime;

    return {
      tests: config.tests,
      results: [...this.results],
      summary: this.buildSummary(duration),
      duration,
      timestamp: new Date().toISOString(),
    };
  }

  generateHTMLReport(results: TestSuiteResult): string {
    const passed = results.summary.passed;
    const failed = results.summary.failed;
    const skipped = results.summary.skipped;
    const passRate = results.summary.total > 0
      ? ((passed / results.summary.total) * 100).toFixed(1)
      : '0';

    let rows = '';
    for (const r of results.results) {
      const statusClass = r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : 'skip';
      const statusIcon = r.status === 'passed' ? '&#10003;' : r.status === 'failed' ? '&#10007;' : '&#8722;';
      rows += `
        <tr class="${statusClass}">
          <td>${this.escapeHtml(r.name)}</td>
          <td>${this.escapeHtml(r.type)}</td>
          <td class="status"><span class="icon">${statusIcon}</span> ${r.status}</td>
          <td>${r.duration.toFixed(0)}ms</td>
          <td>${r.error ? this.escapeHtml(r.error) : '—'}</td>
        </tr>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Load Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
    .header { text-align: center; margin-bottom: 32px; }
    .header h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
    .header .subtitle { color: #8b949e; font-size: 14px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 32px; }
    .summary-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
    .summary-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; }
    .summary-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .summary-card.passed .value { color: #3fb950; }
    .summary-card.failed .value { color: #f85149; }
    .summary-card.skipped .value { color: #d29922; }
    .summary-card.rate .value { color: #58a6ff; }
    .summary-card.duration .value { color: #bc8cff; font-size: 20px; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; border: 1px solid #30363d; }
    th { background: #1c2128; color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 12px 16px; text-align: left; }
    td { padding: 12px 16px; border-top: 1px solid #21262d; font-size: 14px; }
    tr.pass td { border-left: 3px solid #3fb950; }
    tr.fail td { border-left: 3px solid #f85149; }
    tr.skip td { border-left: 3px solid #d29922; }
    tr:hover { background: #1c2128; }
    .status .icon { font-size: 16px; margin-right: 4px; }
    tr.pass .status { color: #3fb950; }
    tr.fail .status { color: #f85149; }
    tr.skip .status { color: #d29922; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Nova Sub-Agent IDE — Load Test Report</h1>
    <div class="subtitle">Generated: ${results.timestamp} | Duration: ${(results.duration / 1000).toFixed(1)}s</div>
  </div>
  <div class="summary">
    <div class="summary-card passed"><div class="label">Passed</div><div class="value">${passed}</div></div>
    <div class="summary-card failed"><div class="label">Failed</div><div class="value">${failed}</div></div>
    <div class="summary-card skipped"><div class="label">Skipped</div><div class="value">${skipped}</div></div>
    <div class="summary-card rate"><div class="label">Pass Rate</div><div class="value">${passRate}%</div></div>
    <div class="summary-card duration"><div class="label">Total Duration</div><div class="value">${(results.duration / 1000).toFixed(1)}s</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Test</th><th>Type</th><th>Status</th><th>Duration</th><th>Error</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</body>
</html>`;
  }

  generateMarkdownReport(results: TestSuiteResult): string {
    const lines: string[] = [];
    const passed = results.summary.passed;
    const failed = results.summary.failed;
    const passRate = results.summary.total > 0
      ? ((passed / results.summary.total) * 100).toFixed(1)
      : '0';

    lines.push('# Nova Sub-Agent IDE — Load Test Report');
    lines.push('');
    lines.push(`**Generated:** ${results.timestamp}`);
    lines.push(`**Duration:** ${(results.duration / 1000).toFixed(1)}s`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Tests | ${results.summary.total} |`);
    lines.push(`| Passed | ${passed} |`);
    lines.push(`| Failed | ${failed} |`);
    lines.push(`| Skipped | ${results.summary.skipped} |`);
    lines.push(`| Pass Rate | ${passRate}% |`);
    lines.push(`| Avg Duration | ${results.summary.avgDuration.toFixed(0)}ms |`);
    lines.push('');
    lines.push('## Results');
    lines.push('');
    lines.push('| Test | Type | Status | Duration | Error |');
    lines.push('|------|------|--------|----------|-------|');

    for (const r of results.results) {
      const statusIcon = r.status === 'passed' ? '&#10003;' : r.status === 'failed' ? '&#10007;' : '&#8722;';
      lines.push(`| ${r.name} | ${r.type} | ${statusIcon} ${r.status} | ${r.duration.toFixed(0)}ms | ${r.error || '—'} |`);
    }

    lines.push('');

    const loadResults = results.results.filter((r) => r.type === 'load' && r.result && 'throughput' in r.result);
    if (loadResults.length > 0) {
      lines.push('## Load Test Details');
      lines.push('');
      for (const r of loadResults) {
        const lr = r.result as LoadTestResult;
        lines.push(`### ${r.name}`);
        lines.push('');
        lines.push(`- **Total Requests:** ${lr.totalRequests}`);
        lines.push(`- **Success:** ${lr.successCount} | **Errors:** ${lr.errorCount}`);
        lines.push(`- **Avg Response:** ${lr.avgResponseTime.toFixed(2)}ms`);
        lines.push(`- **P50:** ${lr.p50.toFixed(2)}ms | **P95:** ${lr.p95.toFixed(2)}ms | **P99:** ${lr.p99.toFixed(2)}ms`);
        lines.push(`- **Throughput:** ${lr.throughput.toFixed(1)} req/s`);
        lines.push('');
      }
    }

    const benchResults = results.results.filter((r) => r.type === 'benchmark' && r.result && 'opsPerSecond' in r.result);
    if (benchResults.length > 0) {
      lines.push('## Benchmark Details');
      lines.push('');
      for (const r of benchResults) {
        const br = r.result as BenchmarkResult;
        lines.push(`### ${br.name}`);
        lines.push('');
        lines.push(`- **Iterations:** ${br.iterations.toLocaleString()}`);
        lines.push(`- **Avg Time:** ${br.avgTime.toFixed(3)}ms`);
        lines.push(`- **Min/Max:** ${br.minTime.toFixed(3)}ms / ${br.maxTime.toFixed(3)}ms`);
        lines.push(`- **Throughput:** ${br.opsPerSecond.toLocaleString()} ops/sec`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  saveReport(report: string, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, report, 'utf-8');
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async runTest(test: TestEntry): Promise<TestResultEntry> {
    const start = Date.now();
    const entry: TestResultEntry = {
      name: test.name,
      type: test.type,
      status: 'passed',
      duration: 0,
    };

    try {
      switch (test.type) {
        case 'load':
          entry.result = await this.runLoadTest(test);
          break;
        case 'stress':
          entry.result = await this.runStressTest(test);
          break;
        case 'benchmark':
          entry.result = await this.runBenchmark(test);
          break;
        case 'smoke':
          entry.result = await this.runSmokeTest(test);
          break;
      }
    } catch (err) {
      entry.status = 'failed';
      entry.error = (err as Error).message;
    }

    entry.duration = Date.now() - start;
    return entry;
  }

  private async runLoadTest(test: TestEntry): Promise<LoadTestResult> {
    const config = test.config ?? {};
    const lt = new LoadTest({
      concurrency: (config.concurrency as number) ?? 10,
      duration: (config.duration as number) ?? 10000,
      targetRps: (config.targetRps as number) ?? 50,
      rampUp: (config.rampUp as number) ?? 2000,
      timeout: (config.timeout as number) ?? 5000,
    });

    if (test.name.toLowerCase().includes('http')) {
      return lt.runHttpLoadTest(
        (config.url as string) ?? 'http://localhost:3000',
        { method: 'GET' }
      );
    }

    if (test.name.toLowerCase().includes('websocket') || test.name.toLowerCase().includes('ws')) {
      return lt.runWebSocketLoadTest(
        (config.url as string) ?? 'ws://localhost:3001',
        { messages: ['ping'], messageInterval: 1000 }
      );
    }

    if (test.name.toLowerCase().includes('agent')) {
      return lt.runAgentLoadTest({
        agentType: (config.agentType as string) ?? 'default',
        taskCount: (config.taskCount as number) ?? 50,
      });
    }

    if (test.name.toLowerCase().includes('file')) {
      return lt.runFileLoadTest({
        readWriteCycles: (config.readWriteCycles as number) ?? 100,
      });
    }

    if (test.name.toLowerCase().includes('memory')) {
      return lt.runMemoryLoadTest({
        targetMb: (config.targetMb as number) ?? 64,
      });
    }

    if (test.name.toLowerCase().includes('concurrent')) {
      return lt.runConcurrentUsersTest(
        (config.userCount as number) ?? 10,
        (config.duration as number) ?? 10000
      );
    }

    if (test.name.toLowerCase().includes('spike')) {
      return lt.runSpikeTest({
        baselineRps: (config.baselineRps as number) ?? 10,
        spikeRps: (config.spikeRps as number) ?? 100,
        spikeDuration: (config.spikeDuration as number) ?? 2000,
        cycles: (config.cycles as number) ?? 3,
      });
    }

    if (test.name.toLowerCase().includes('endurance')) {
      return lt.runEnduranceTest((config.duration as number) ?? 15000);
    }

    return lt.runHttpLoadTest(
      (config.url as string) ?? 'http://localhost:3000',
      { method: 'GET' }
    );
  }

  private async runStressTest(test: TestEntry): Promise<StressResult> {
    const config = test.config ?? {};
    const st = new StressTest();

    if (test.name.toLowerCase().includes('connection')) {
      return st.testMaxConnections((config.max as number) ?? 100);
    }

    if (test.name.toLowerCase().includes('agent')) {
      return st.testMaxAgents((config.max as number) ?? 50);
    }

    if (test.name.toLowerCase().includes('memory')) {
      return st.testMemoryPressure((config.limitMb as number) ?? 256);
    }

    if (test.name.toLowerCase().includes('cpu')) {
      return st.testCpuPressure((config.cores as number) ?? 4);
    }

    if (test.name.toLowerCase().includes('disk')) {
      return st.testDiskIO((config.operations as number) ?? 500);
    }

    if (test.name.toLowerCase().includes('degradation') || test.name.toLowerCase().includes('health')) {
      return st.testGracefulDegradation();
    }

    return st.testGracefulDegradation();
  }

  private async runBenchmark(test: TestEntry): Promise<BenchmarkResult> {
    const config = test.config ?? {};
    const iterations = (config.iterations as number) ?? 5000;

    if (test.name.toLowerCase().includes('api')) {
      return this.benchmark.benchmarkApiCalls(iterations);
    }

    if (test.name.toLowerCase().includes('file')) {
      return this.benchmark.benchmarkFileOps(iterations);
    }

    if (test.name.toLowerCase().includes('database') || test.name.toLowerCase().includes('db')) {
      return this.benchmark.benchmarkDatabase(iterations);
    }

    if (test.name.toLowerCase().includes('compilation') || test.name.toLowerCase().includes('compile')) {
      return this.benchmark.benchmarkCompilation(iterations);
    }

    if (test.name.toLowerCase().includes('memory')) {
      return this.benchmark.benchmarkMemoryAllocation(iterations);
    }

    if (test.name.toLowerCase().includes('crypto')) {
      return this.benchmark.benchmarkCrypto(iterations);
    }

    return this.benchmark.benchmarkApiCalls(iterations);
  }

  private async runSmokeTest(test: TestEntry): Promise<LoadTestResult> {
    return this.runLoadTest(test);
  }

  private buildSummary(duration: number): SuiteSummary {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === 'passed').length;
    const failed = this.results.filter((r) => r.status === 'failed').length;
    const skipped = this.results.filter((r) => r.status === 'skipped').length;

    return {
      total,
      passed,
      failed,
      skipped,
      totalDuration: duration,
      avgDuration: total > 0 ? this.results.reduce((a, r) => a + r.duration, 0) / total : 0,
    };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
