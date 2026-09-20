export interface BuildResult {
  success: boolean;
  duration: number;
  command: string;
  warnings: BuildWarning[];
  errors: string[];
  testResults?: TestResult;
  coverage?: CoverageReport;
}

export interface BuildWarning {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
}

export interface TestResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures?: TestFailure[];
}

export interface TestFailure {
  name: string;
  message: string;
  stack?: string;
}

export interface LintResult {
  total: number;
  errors: number;
  warnings: number;
  fixable: number;
}

export interface TypeCheckResult {
  total: number;
  errors: number;
  files: string[];
}

export interface CoverageReport {
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  statements: CoverageMetric;
}

export interface CoverageMetric {
  total: number;
  covered: number;
  pct: number;
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export class BuildResultDisplay {
  renderBuildStart(command: string): string {
    return `${CYAN}${BOLD}\u2699\ufe0f Build started${RESET}\n$ ${command}\n${DIM}Running...${RESET}`;
  }

  renderBuildProgress(output: string): string {
    if (!output) return '';
    const lines = output.split('\n').filter(Boolean);
    const last = lines.slice(-5);
    return last.map((l) => `${DIM}  ${l}${RESET}`).join('\n');
  }

  renderBuildSuccess(result: BuildResult): string {
    const lines: string[] = [
      `${GREEN}${BOLD}\u2705 Build succeeded${RESET}`,
      '',
      `${DIM}Command:${RESET} ${result.command}`,
      `${DIM}Duration:${RESET} ${this.fmtDuration(result.duration)}`,
    ];

    if (result.warnings.length > 0) {
      lines.push('', this.renderBuildWarning(result.warnings));
    }
    if (result.testResults) {
      lines.push('', this.renderTestResults(result.testResults));
    }
    if (result.coverage) {
      lines.push('', this.renderCoverageReport(result.coverage));
    }

    return lines.join('\n');
  }

  renderBuildFailure(result: BuildResult): string {
    const lines: string[] = [
      `${RED}${BOLD}\u274c Build failed${RESET}`,
      '',
      `${DIM}Command:${RESET} ${result.command}`,
      `${DIM}Duration:${RESET} ${this.fmtDuration(result.duration)}`,
    ];

    if (result.errors.length > 0) {
      lines.push('', `${RED}${BOLD}Errors (${result.errors.length}):${RESET}`);
      result.errors.forEach((e, i) => {
        lines.push(`  ${RED}${i + 1}.${RESET} ${e}`);
      });
    }

    if (result.warnings.length > 0) {
      lines.push('', this.renderBuildWarning(result.warnings));
    }

    return lines.join('\n');
  }

  renderBuildWarning(warnings: BuildWarning[]): string {
    if (warnings.length === 0) return '';
    const lines: string[] = [
      `${YELLOW}${BOLD}\u26a0\ufe0f Warnings (${warnings.length}):${RESET}`,
    ];
    warnings.forEach((w, i) => {
      const loc = w.file ? `${w.file}${w.line ? `:${w.line}` : ''}` : 'unknown';
      lines.push(`  ${YELLOW}${i + 1}.${RESET} [${loc}] ${w.message}`);
    });
    return lines.join('\n');
  }

  renderTestResults(results: TestResult): string {
    const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : '0.0';
    const icon = results.failed === 0 ? '\u2705' : '\u274c';

    const lines: string[] = [
      `${icon} ${BOLD}Test Results${RESET}`,
      '',
      `  ${GREEN}\u2714 ${results.passed} passed${RESET}  ${results.failed > 0 ? RED : GREEN}\u2716 ${results.failed} failed${RESET}  ${DIM}\u25cb ${results.skipped} skipped${RESET}`,
      `  Total: ${results.total}  Pass rate: ${passRate}%  Duration: ${this.fmtDuration(results.duration)}`,
    ];

    if (results.failures && results.failures.length > 0) {
      lines.push('', `${RED}Failures:${RESET}`);
      results.failures.forEach((f) => {
        lines.push(`  ${RED}\u2716${RESET} ${f.name}`);
        lines.push(`    ${DIM}${f.message}${RESET}`);
      });
    }

    return lines.join('\n');
  }

  renderLintResults(results: LintResult): string {
    const icon = results.errors === 0 ? '\u2705' : '\u274c';
    const lines: string[] = [
      `${icon} ${BOLD}Lint Results${RESET}`,
      '',
      `  ${results.total} issues  ${RED}${results.errors} errors${RESET}  ${YELLOW}${results.warnings} warnings${RESET}`,
    ];

    if (results.fixable > 0) {
      lines.push(`  ${GREEN}${results.fixable} auto-fixable${RESET}`);
    }

    return lines.join('\n');
  }

  renderTypeCheckResults(results: TypeCheckResult): string {
    const icon = results.errors === 0 ? '\u2705' : '\u274c';
    const lines: string[] = [
      `${icon} ${BOLD}Type Check${RESET}`,
      '',
      `  ${results.errors === 0 ? GREEN : RED}${results.errors} errors${RESET} in ${results.total} files checked`,
    ];

    if (results.files.length > 0) {
      lines.push('');
      results.files.slice(0, 10).forEach((f) => {
        lines.push(`  ${RED}\u2022${RESET} ${f}`);
      });
      if (results.files.length > 10) {
        lines.push(`  ${DIM}...and ${results.files.length - 10} more${RESET}`);
      }
    }

    return lines.join('\n');
  }

  renderCoverageReport(coverage: CoverageReport): string {
    const fmtMetric = (name: string, m: CoverageMetric) => {
      const icon = m.pct >= 90 ? GREEN : m.pct >= 70 ? YELLOW : RED;
      const bar = this.miniBar(m.pct);
      return `  ${name.padEnd(12)} ${bar} ${icon}${m.pct.toFixed(1)}%${RESET}  (${m.covered}/${m.total})`;
    };

    return [
      `${BOLD}\u{1f4ca} Coverage${RESET}`,
      '',
      fmtMetric('Lines', coverage.lines),
      fmtMetric('Functions', coverage.functions),
      fmtMetric('Branches', coverage.branches),
      fmtMetric('Statements', coverage.statements),
    ].join('\n');
  }

  renderSummary(result: BuildResult): string {
    const icon = result.success ? '\u2705' : '\u274c';
    const statusColor = result.success ? GREEN : RED;
    const statusText = result.success ? 'PASSED' : 'FAILED';

    return [
      `${'─'.repeat(40)}`,
      `${icon} ${BOLD}Build ${statusColor}${statusText}${RESET}`,
      `${DIM}Command:${RESET} ${result.command}`,
      `${DIM}Duration:${RESET} ${this.fmtDuration(result.duration)}`,
      result.errors.length > 0 ? `${DIM}Errors:${RESET}   ${RED}${result.errors.length}${RESET}` : '',
      result.warnings.length > 0 ? `${DIM}Warnings:${RESET} ${YELLOW}${result.warnings.length}${RESET}` : '',
      result.testResults ? `${DIM}Tests:${RESET}   ${result.testResults.passed}/${result.testResults.total} passed` : '',
      `${'─'.repeat(40)}`,
    ].filter(Boolean).join('\n');
  }

  private fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = ms / 1000;
    if (secs < 60) return `${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const rem = (secs % 60).toFixed(0);
    return `${mins}m ${rem}s`;
  }

  private miniBar(pct: number): string {
    const width = 10;
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    const color = pct >= 90 ? GREEN : pct >= 70 ? YELLOW : RED;
    return `${color}${'\u2588'.repeat(filled)}${DIM}${'\u2591'.repeat(empty)}${RESET}`;
  }
}
