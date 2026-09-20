import { execSync, ExecSyncOptions } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestReport {
  results: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  totalDuration: number;
  timestamp: string;
}

interface PackageOptions {
  appPath: string;
  outDir: string;
  platform: "win32" | "darwin" | "linux";
  arch: "x64" | "arm64" | "universal";
  name: string;
  icon?: string;
  overwrite?: boolean;
}

const EXEC_OPTS: ExecSyncOptions = {
  encoding: "utf-8",
  timeout: 300_000,
  stdio: "pipe",
};

class PackageTest {
  private results: TestResult[] = [];
  private options: PackageOptions;

  constructor(options: PackageOptions) {
    this.options = options;
  }

  private verifyOutput(platform: string): void {
    const outDir = path.join(this.options.outDir, `${this.options.name}-${platform}-x64`);
    if (!fs.existsSync(outDir)) throw new Error(`Output directory not found: ${outDir}`);
    const files = fs.readdirSync(outDir);
    if (files.length === 0) throw new Error(`Output directory is empty: ${outDir}`);
  }

  private measure<T>(name: string, fn: () => T): TestResult {
    const start = performance.now();
    try {
      fn();
      const duration = performance.now() - start;
      const result: TestResult = { name, passed: true, duration };
      this.results.push(result);
      return result;
    } catch (err) {
      const duration = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const result: TestResult = { name, passed: false, duration, error: message };
      this.results.push(result);
      return result;
    }
  }

  testBuild(): TestResult {
    return this.measure("Build Compilation", () => {
      execSync("npx tsc --noEmit", {
        ...EXEC_OPTS,
        cwd: path.resolve(__dirname, ".."),
      });
    });
  }

  testPackageWindows(): TestResult {
    return this.measure("Package Windows", () => {
      const cmd = this.buildPackagerCmd("win32");
      execSync(cmd, { ...EXEC_OPTS, cwd: path.resolve(__dirname, "..") });
      this.verifyOutput("win32");
    });
  }

  testPackageMac(): TestResult {
    return this.measure("Package macOS", () => {
      const cmd = this.buildPackagerCmd("darwin");
      execSync(cmd, { ...EXEC_OPTS, cwd: path.resolve(__dirname, "..") });
      this.verifyOutput("darwin");
    });
  }

  testPackageLinux(): TestResult {
    return this.measure("Package Linux", () => {
      const cmd = this.buildPackagerCmd("linux");
      execSync(cmd, { ...EXEC_OPTS, cwd: path.resolve(__dirname, "..") });
      this.verifyOutput("linux");
    });
  }

  testPackageAll(): TestResult[] {
    this.testPackageWindows();
    this.testPackageMac();
    this.testPackageLinux();
    return this.results.filter((r) =>
      ["Package Windows", "Package macOS", "Package Linux"].includes(r.name)
    );
  }

  verifyPackageSize(): TestResult {
    return this.measure("Verify Package Size", () => {
      const platform = process.platform as "win32" | "darwin" | "linux";
      const outPath = this.getOutputPath(platform);
      if (!fs.existsSync(outPath)) {
        throw new Error(`Package output not found: ${outPath}`);
      }
      const size = this.getDirSize(outPath);
      const maxBytes = 500 * 1024 * 1024;
      if (size > maxBytes) {
        throw new Error(
          `Package size ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit ${maxBytes / 1024 / 1024}MB`
        );
      }
    });
  }

  verifyExecutableExists(): TestResult {
    return this.measure("Verify Executable Exists", () => {
      const platform = process.platform as "win32" | "darwin" | "linux";
      const outPath = this.getOutputPath(platform);
      if (!fs.existsSync(outPath)) {
        throw new Error(`Package directory not found: ${outPath}`);
      }
      const exePath = this.getExecutablePath(platform);
      if (!fs.existsSync(exePath)) {
        throw new Error(`Executable not found: ${exePath}`);
      }
    });
  }

  testAppLaunch(): TestResult {
    return this.measure("Test App Launch", () => {
      const platform = process.platform as "win32" | "darwin" | "linux";
      const exePath = this.getExecutablePath(platform);
      if (!fs.existsSync(exePath)) {
        throw new Error(`Executable not found: ${exePath}`);
      }
      if (platform === "win32") {
        execSync(`"${exePath}" --no-sandbox --disable-gpu`, {
          ...EXEC_OPTS,
          timeout: 10_000,
        });
      }
    });
  }

  testIPCCommunication(): TestResult {
    return this.measure("Test IPC Communication", () => {
      const platform = process.platform as "win32" | "darwin" | "linux";
      const exePath = this.getExecutablePath(platform);
      if (!fs.existsSync(exePath)) {
        throw new Error(`Executable not found: ${exePath}`);
      }
      const testScript = path.join(__dirname, "ipc-test.js");
      if (!fs.existsSync(testScript)) {
        throw new Error(`IPC test script not found: ${testScript}`);
      }
      execSync(`"${exePath}" "${testScript}" --no-sandbox --disable-gpu`, {
        ...EXEC_OPTS,
        timeout: 15_000,
      });
    });
  }

  testFileSystemAccess(): TestResult {
    return this.measure("Test File System Access", () => {
      const platform = process.platform as "win32" | "darwin" | "linux";
      const outPath = this.getOutputPath(platform);
      const resourcesPath =
        platform === "darwin"
          ? path.join(outPath, `${this.options.name}.app`, "Contents", "Resources")
          : path.join(outPath, `${this.options.name}-${platform}-${this.options.arch}`, "resources");
      if (!fs.existsSync(resourcesPath)) {
        throw new Error(`Resources path not found: ${resourcesPath}`);
      }
      const asarPath = path.join(resourcesPath, "app.asar");
      if (!fs.existsSync(asarPath)) {
        throw new Error(`app.asar not found: ${asarPath}`);
      }
      const stats = fs.statSync(asarPath);
      if (stats.size === 0) {
        throw new Error("app.asar is empty");
      }
    });
  }

  testTerminalExecution(): TestResult {
    return this.measure("Test Terminal Execution", () => {
      const terminalScript = path.join(__dirname, "terminal-test.sh");
      if (!fs.existsSync(terminalScript)) {
        throw new Error(`Terminal test script not found: ${terminalScript}`);
      }
      execSync(`bash "${terminalScript}"`, {
        ...EXEC_OPTS,
        timeout: 30_000,
      });
    });
  }

  testGitIntegration(): TestResult {
    return this.measure("Test Git Integration", () => {
      const gitScript = path.join(__dirname, "git-test.sh");
      if (!fs.existsSync(gitScript)) {
        throw new Error(`Git integration test script not found: ${gitScript}`);
      }
      execSync(`bash "${gitScript}"`, {
        ...EXEC_OPTS,
        timeout: 30_000,
      });
    });
  }

  generateTestReport(): TestReport {
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const passed = this.results.filter((r) => r.passed).length;
    return {
      results: [...this.results],
      totalTests: this.results.length,
      passed,
      failed: this.results.length - passed,
      totalDuration,
      timestamp: new Date().toISOString(),
    };
  }

  verifyAll(): TestReport {
    this.results = [];
    this.testBuild();
    this.testPackageWindows();
    this.testPackageMac();
    this.testPackageLinux();
    this.verifyPackageSize();
    this.verifyExecutableExists();
    this.testAppLaunch();
    this.testIPCCommunication();
    this.testFileSystemAccess();
    this.testTerminalExecution();
    this.testGitIntegration();
    return this.generateTestReport();
  }

  private buildPackagerCmd(platform: string): string {
    const args = [
      "npx electron-packager",
      `"${this.options.appPath}"`,
      `"${this.options.name}"`,
      `--platform=${platform}`,
      `--arch=${this.options.arch}`,
      `--out="${this.options.outDir}"`,
    ];
    if (this.options.icon) args.push(`--icon="${this.options.icon}"`);
    if (this.options.overwrite) args.push("--overwrite");
    args.push("--asar");
    return args.join(" ");
  }

  private getOutputPath(platform: string): string {
    const dirName = `${this.options.name}-${platform}-${this.options.arch}`;
    return path.join(this.options.outDir, dirName);
  }

  private getExecutablePath(platform: string): string {
    const outPath = this.getOutputPath(platform);
    switch (platform) {
      case "win32":
        return path.join(outPath, `${this.options.name}.exe`);
      case "darwin":
        return path.join(
          outPath,
          `${this.options.name}.app`,
          "Contents",
          "MacOS",
          this.options.name
        );
      case "linux":
        return path.join(outPath, this.options.name);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private getDirSize(dirPath: string): number {
    let total = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += this.getDirSize(fullPath);
      } else {
        total += fs.statSync(fullPath).size;
      }
    }
    return total;
  }
}

export { PackageTest, TestResult, TestReport, PackageOptions };
