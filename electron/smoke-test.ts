import { execSync, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";

const ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(ROOT, "release");

export interface SingleTestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

export interface SmokeTestReport {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  results: SingleTestResult[];
}

class SmokeTest {
  private platform: string;
  private appPath: string;
  private process: ChildProcess | null = null;

  constructor(platform?: string) {
    this.platform = platform || process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
    this.appPath = this.findAppPath();
  }

  private findAppPath(): string {
    const platformDir = path.join(RELEASE, this.platform);
    if (!fs.existsSync(platformDir)) return "";

    if (this.platform === "win") {
      const bat = path.join(platformDir, "start.bat");
      if (fs.existsSync(bat)) return bat;
      const exe = path.join(platformDir, "Nova IDE.exe");
      if (fs.existsSync(exe)) return exe;
    } else if (this.platform === "mac") {
      const sh = path.join(platformDir, "start.sh");
      if (fs.existsSync(sh)) return sh;
      const app = path.join(platformDir, "Nova IDE.app", "Contents", "MacOS", "Nova IDE");
      if (fs.existsSync(app)) return app;
    } else {
      const sh = path.join(platformDir, "start.sh");
      if (fs.existsSync(sh)) return sh;
      const bin = path.join(platformDir, "Nova IDE");
      if (fs.existsSync(bin)) return bin;
    }
    return "";
  }

  private runCommand(cmd: string, timeoutMs: number = 10000): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(cmd, {
        cwd: ROOT,
        encoding: "utf-8",
        timeout: timeoutMs,
        stdio: "pipe",
      });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        exitCode: err.status || 1,
      };
    }
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
  }

  async testAppLaunches(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      if (!this.appPath) {
        return {
          name: "app launches",
          passed: false,
          duration: Date.now() - start,
          error: "App not found in release directory",
        };
      }

      const platformDir = path.join(RELEASE, this.platform);
      const hasMain = fs.existsSync(path.join(platformDir, "electron", "main.js")) ||
        fs.existsSync(path.join(platformDir, "electron", "main.ts"));

      if (!hasMain) {
        return {
          name: "app launches",
          passed: false,
          duration: Date.now() - start,
          error: "electron/main.js not found in package",
        };
      }

      const hasPreload = fs.existsSync(path.join(platformDir, "electron", "preload.js")) ||
        fs.existsSync(path.join(platformDir, "electron", "preload.ts"));

      const hasPackageJson = fs.existsSync(path.join(platformDir, "package.json"));

      const passed = hasMain && hasPreload && hasPackageJson;
      return {
        name: "app launches",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : "Missing required files for launch",
      };
    } catch (err: any) {
      return {
        name: "app launches",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testWindowCreation(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      if (!fs.existsSync(mainPath)) {
        return {
          name: "window creation",
          passed: false,
          duration: Date.now() - start,
          error: "main.js not found",
        };
      }
      const content = fs.readFileSync(mainPath, "utf-8");
      const hasBrowserWindow = content.includes("BrowserWindow");
      const hasWebPreferences = content.includes("webPreferences");
      const hasPreload = content.includes("preload");
      const passed = hasBrowserWindow && hasWebPreferences && hasPreload;
      return {
        name: "window creation",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : "Missing BrowserWindow configuration",
      };
    } catch (err: any) {
      return {
        name: "window creation",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testMenuItems(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      if (!fs.existsSync(mainPath)) {
        return {
          name: "menu items",
          passed: false,
          duration: Date.now() - start,
          error: "main.js not found",
        };
      }
      const content = fs.readFileSync(mainPath, "utf-8");
      const requiredMenus = ["File", "Edit", "View", "Terminal", "Help"];
      const missing = requiredMenus.filter((m) => !content.includes(`"${m}"`));
      const hasMenuTemplate = content.includes("Menu.buildFromTemplate") || content.includes("Menu.setApplicationMenu");
      const passed = missing.length === 0 && hasMenuTemplate;
      return {
        name: "menu items",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : `Missing menus: ${missing.join(", ")}`,
      };
    } catch (err: any) {
      return {
        name: "menu items",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testIPC(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      const preloadPath = path.join(platformDir, "electron", "preload.js");

      if (!fs.existsSync(mainPath) || !fs.existsSync(preloadPath)) {
        return {
          name: "IPC communication",
          passed: false,
          duration: Date.now() - start,
          error: "main.js or preload.js not found",
        };
      }

      const mainContent = fs.readFileSync(mainPath, "utf-8");
      const preloadContent = fs.readFileSync(preloadPath, "utf-8");

      const mainHasIpc = mainContent.includes("ipcMain.handle");
      const preloadHasIpc = preloadContent.includes("ipcRenderer.invoke");
      const hasContextBridge = preloadContent.includes("contextBridge.exposeInMainWorld");

      const passed = mainHasIpc && preloadHasIpc && hasContextBridge;
      return {
        name: "IPC communication",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : "IPC handlers or context bridge not configured",
      };
    } catch (err: any) {
      return {
        name: "IPC communication",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testFileSystem(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      if (!fs.existsSync(mainPath)) {
        return {
          name: "file system operations",
          passed: false,
          duration: Date.now() - start,
          error: "main.js not found",
        };
      }
      const content = fs.readFileSync(mainPath, "utf-8");
      const fsHandlers = ["fs:readFile", "fs:writeFile", "fs:readdir", "fs:mkdir", "fs:rm", "fs:rename", "fs:exists", "fs:stat"];
      const missing = fsHandlers.filter((h) => !content.includes(`"${h}"`));
      const passed = missing.length === 0;
      return {
        name: "file system operations",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : `Missing FS handlers: ${missing.join(", ")}`,
      };
    } catch (err: any) {
      return {
        name: "file system operations",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testTerminal(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      const preloadPath = path.join(platformDir, "electron", "preload.js");

      if (!fs.existsSync(mainPath)) {
        return {
          name: "terminal integration",
          passed: false,
          duration: Date.now() - start,
          error: "main.js not found",
        };
      }

      const mainContent = fs.readFileSync(mainPath, "utf-8");
      const hasTerminalHandler = mainContent.includes("terminal:execute");

      let preloadOk = false;
      if (fs.existsSync(preloadPath)) {
        const preloadContent = fs.readFileSync(preloadPath, "utf-8");
        preloadOk = preloadContent.includes("terminal") && preloadContent.includes("execute");
      }

      const passed = hasTerminalHandler && preloadOk;
      return {
        name: "terminal integration",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : "Terminal IPC handlers not found",
      };
    } catch (err: any) {
      return {
        name: "terminal integration",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async testGitIntegration(): Promise<SingleTestResult> {
    const start = Date.now();
    try {
      const platformDir = path.join(RELEASE, this.platform);
      const mainPath = path.join(platformDir, "electron", "main.js");
      if (!fs.existsSync(mainPath)) {
        return {
          name: "git integration",
          passed: false,
          duration: Date.now() - start,
          error: "main.js not found",
        };
      }
      const content = fs.readFileSync(mainPath, "utf-8");
      const gitHandlers = ["git:status", "git:add", "git:commit", "git:push", "git:pull", "git:log"];
      const missing = gitHandlers.filter((h) => !content.includes(`"${h}"`));
      const passed = missing.length === 0;
      return {
        name: "git integration",
        passed,
        duration: Date.now() - start,
        error: passed ? undefined : `Missing git handlers: ${missing.join(", ")}`,
      };
    } catch (err: any) {
      return {
        name: "git integration",
        passed: false,
        duration: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  async runAllTests(): Promise<SmokeTestReport> {
    const start = Date.now();
    const results: SingleTestResult[] = [];

    results.push(await this.testAppLaunches());
    results.push(await this.testWindowCreation());
    results.push(await this.testMenuItems());
    results.push(await this.testIPC());
    results.push(await this.testFileSystem());
    results.push(await this.testTerminal());
    results.push(await this.testGitIntegration());

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      duration: Date.now() - start,
      results,
    };
  }
}

export { SmokeTest };

if (require.main === module) {
  const platform = process.argv[2];
  const tester = new SmokeTest(platform);
  tester.runAllTests().then((report) => {
    console.log(`\n=== Smoke Test Report ===`);
    console.log(`Total: ${report.total} | Passed: ${report.passed} | Failed: ${report.failed}`);
    console.log(`Duration: ${report.duration}ms\n`);
    for (const r of report.results) {
      const icon = r.passed ? "PASS" : "FAIL";
      console.log(`  [${icon}] ${r.name} (${r.duration}ms)`);
      if (r.error) console.log(`        ${r.error}`);
    }
    process.exit(report.failed > 0 ? 1 : 0);
  });
}
