import { ChildProcess, spawn, execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Supporting Interfaces ──────────────────────────────────────────────────────

export interface ResourceUsage {
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkMbps: number;
  openFileHandles: number;
  childProcesses: number;
  executionTimeMs: number;
  tokensUsed: number;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkMbps: number;
  maxFileHandles: number;
  maxChildProcesses: number;
  maxExecutionTimeMs: number;
  maxTokens: number;
}

export interface ResourceBudget {
  remainingMemory: number;
  remainingCpu: number;
  remainingDisk: number;
  remainingNetwork: number;
  remainingTime: number;
  remainingTokens: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  domain: string;
  port: number;
  timestamp: Date;
  size: number;
  allowed: boolean;
}

export interface SuspiciousActivity {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  details: Record<string, unknown>;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdio?: 'pipe' | 'ignore' | 'inherit' | 'overlapped' | readonly ('pipe' | 'ignore' | 'inherit' | 'overlapped' | number)[];
  timeout?: number;
  maxBuffer?: number;
}

export interface SandboxedProcess {
  id: string;
  process: ChildProcess;
  pid: number | undefined;
  startTime: Date;
  resourceUsage: ResourceUsage;
}

export interface FileLock {
  path: string;
  type: 'shared' | 'exclusive';
  agentId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface NetworkPolicy {
  type: 'none' | 'internal' | 'restricted' | 'full';
  allowedDomains: string[];
  blockedDomains: string[];
  allowInternal: boolean;
}

// ── AgentSandboxConfig ─────────────────────────────────────────────────────────

export interface AgentSandboxConfig {
  agentId: string;
  agentType: string;
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkMbps: number;
  maxFileHandles: number;
  maxChildProcesses: number;
  maxExecutionTimeMs: number;
  allowedDomains: string[];
  blockedDomains: string[];
  filesystemRoot: string;
  writablePaths: string[];
  readonlyPaths: string[];
  blockedPaths: string[];
  envVariables: Record<string, string>;
  secretsAccessible: string[];
  networkPolicy: 'none' | 'internal' | 'restricted' | 'full';
  processIsolation: boolean;
}

export const DEFAULT_SANDBOX_CONFIG: AgentSandboxConfig = {
  agentId: '',
  agentType: 'generic',
  maxMemoryMB: 256,
  maxCpuPercent: 50,
  maxDiskMB: 100,
  maxNetworkMbps: 10,
  maxFileHandles: 64,
  maxChildProcesses: 5,
  maxExecutionTimeMs: 300_000,
  allowedDomains: [],
  blockedDomains: [
    'evil.com',
    'malware.net',
    'phishing.org',
  ],
  filesystemRoot: path.join(os.tmpdir(), 'nova-sandbox'),
  writablePaths: ['/tmp', '/var/tmp'],
  readonlyPaths: ['/usr/lib', '/usr/share'],
  blockedPaths: ['/etc/shadow', '/etc/passwd', '/root', '/home'],
  envVariables: {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: '/tmp',
    LANG: 'en_US.UTF-8',
  },
  secretsAccessible: [],
  networkPolicy: 'restricted',
  processIsolation: true,
};

// ── ResourceMonitor ────────────────────────────────────────────────────────────

export class ResourceMonitor {
  private limits: ResourceLimits;
  private usage: ResourceUsage;
  private monitors: NodeJS.Timeout[] = [];
  private onLimitExceeded: (limit: string) => void;
  private thresholds: Map<string, { percent: number; callback: Function }> = new Map();

  constructor(
    limits: ResourceLimits,
    onLimitExceeded: (limit: string) => void = () => {},
  ) {
    this.limits = limits;
    this.onLimitExceeded = onLimitExceeded;
    this.usage = {
      memoryMB: 0,
      cpuPercent: 0,
      diskMB: 0,
      networkMbps: 0,
      openFileHandles: 0,
      childProcesses: 0,
      executionTimeMs: 0,
      tokensUsed: 0,
    };
  }

  start(intervalMs: number = 1000): void {
    this.stop();

    const memoryTimer = setInterval(() => {
      this.pollMemory();
      this.checkMemory();
    }, intervalMs);
    this.monitors.push(memoryTimer);

    const cpuTimer = setInterval(() => {
      this.pollCpu();
      this.checkCpu();
    }, intervalMs * 2);
    this.monitors.push(cpuTimer);

    const diskTimer = setInterval(() => {
      this.pollDisk();
      this.checkDisk();
    }, intervalMs * 5);
    this.monitors.push(diskTimer);

    const fhTimer = setInterval(() => {
      this.pollFileHandles();
      this.checkFileHandles();
    }, intervalMs);
    this.monitors.push(fhTimer);

    const procTimer = setInterval(() => {
      this.pollChildProcesses();
      this.checkChildProcesses();
    }, intervalMs);
    this.monitors.push(procTimer);
  }

  stop(): void {
    for (const timer of this.monitors) {
      clearInterval(timer);
    }
    this.monitors = [];
  }

  getUsage(): ResourceUsage {
    return { ...this.usage };
  }

  updateUsage(partial: Partial<ResourceUsage>): void {
    Object.assign(this.usage, partial);
  }

  checkMemory(): boolean {
    const ok = this.usage.memoryMB <= this.limits.maxMemoryMB;
    if (!ok) this.onLimitExceeded('memory');
    this.fireThreshold('memory', this.usage.memoryMB / this.limits.maxMemoryMB);
    return ok;
  }

  checkCpu(): boolean {
    const ok = this.usage.cpuPercent <= this.limits.maxCpuPercent;
    if (!ok) this.onLimitExceeded('cpu');
    this.fireThreshold('cpu', this.usage.cpuPercent / this.limits.maxCpuPercent);
    return ok;
  }

  checkDisk(): boolean {
    const ok = this.usage.diskMB <= this.limits.maxDiskMB;
    if (!ok) this.onLimitExceeded('disk');
    this.fireThreshold('disk', this.usage.diskMB / this.limits.maxDiskMB);
    return ok;
  }

  checkFileHandles(): boolean {
    const ok = this.usage.openFileHandles <= this.limits.maxFileHandles;
    if (!ok) this.onLimitExceeded('fileHandles');
    this.fireThreshold('fileHandles', this.usage.openFileHandles / this.limits.maxFileHandles);
    return ok;
  }

  checkChildProcesses(): boolean {
    const ok = this.usage.childProcesses <= this.limits.maxChildProcesses;
    if (!ok) this.onLimitExceeded('childProcesses');
    this.fireThreshold('childProcesses', this.usage.childProcesses / this.limits.maxChildProcesses);
    return ok;
  }

  onThreshold(percent: number, callback: Function): void {
    this.thresholds.set(`threshold_${Date.now()}`, { percent, callback });
  }

  private fireThreshold(resource: string, ratio: number): void {
    for (const [key, entry] of this.thresholds) {
      if (ratio >= entry.percent) {
        entry.callback(resource, ratio);
        this.thresholds.delete(key);
      }
    }
  }

  private pollMemory(): void {
    try {
      if (process.platform === 'win32') {
        const output = execSync(
          `powershell -Command "(Get-Process -Id ${process.pid}).WorkingSet64 / 1MB"`,
          { encoding: 'utf-8', timeout: 2000 },
        );
        this.usage.memoryMB = parseFloat(output.trim()) || 0;
      } else {
        const memInfo = process.memoryUsage();
        this.usage.memoryMB = memInfo.rss / (1024 * 1024);
      }
    } catch {
      // fallback
    }
  }

  private pollCpu(): void {
    try {
      if (process.platform === 'win32') {
        const output = execSync(
          `powershell -Command "(Get-Process -Id ${process.pid}).CPU"`,
          { encoding: 'utf-8', timeout: 2000 },
        );
        this.usage.cpuPercent = parseFloat(output.trim()) || 0;
      } else {
        const stat = execSync(`ps -p ${process.pid} -o %cpu=`, {
          encoding: 'utf-8',
          timeout: 2000,
        });
        this.usage.cpuPercent = parseFloat(stat.trim()) || 0;
      }
    } catch {
      this.usage.cpuPercent = 0;
    }
  }

  private pollDisk(): void {
    try {
      const dir = os.tmpdir();
      const stats = fs.statfsSync(dir);
      const usedMB = (stats.blocks - stats.bfree) * stats.bsize / (1024 * 1024);
      this.usage.diskMB = Math.round(usedMB * 100) / 100;
    } catch {
      // fallback
    }
  }

  private pollFileHandles(): void {
    try {
      if (process.platform !== 'win32') {
        const output = execSync(`ls /proc/${process.pid}/fd 2>/dev/null | wc -l`, {
          encoding: 'utf-8',
          timeout: 2000,
        });
        this.usage.openFileHandles = parseInt(output.trim(), 10) || 0;
      } else {
        this.usage.openFileHandles = 0;
      }
    } catch {
      this.usage.openFileHandles = 0;
    }
  }

  private pollChildProcesses(): void {
    // tracked externally by ProcessGroup
  }
}

// ── NetworkFilter ──────────────────────────────────────────────────────────────

export class NetworkFilter {
  private allowedDomains: string[];
  private blockedDomains: string[];
  private policy: 'none' | 'internal' | 'restricted' | 'full';
  private requestLog: NetworkRequest[] = [];
  private suspiciousPatterns: SuspiciousActivity[] = [];

  constructor(
    policy: 'none' | 'internal' | 'restricted' | 'full',
    allowedDomains: string[],
    blockedDomains: string[],
  ) {
    this.policy = policy;
    this.allowedDomains = allowedDomains;
    this.blockedDomains = blockedDomains;
  }

  isAllowed(domain: string, port: number): boolean {
    if (this.policy === 'none') return false;

    if (this.policy === 'full') {
      if (this.blockedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        return false;
      }
      return true;
    }

    if (this.policy === 'internal') {
      return this.isInternalDomain(domain);
    }

    // restricted
    if (this.blockedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      return false;
    }
    if (this.allowedDomains.length === 0) {
      return true;
    }
    return this.allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  }

  isInternalUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.isInternalDomain(parsed.hostname);
    } catch {
      return false;
    }
  }

  private isInternalDomain(domain: string): boolean {
    const internal = [
      'localhost',
      '127.0.0.1',
      '::1',
      '0.0.0.0',
    ];
    if (internal.includes(domain)) return true;

    if (/^10\.\d+\.\d+\.\d+$/.test(domain)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(domain)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(domain)) return true;
    if (domain.endsWith('.local') || domain.endsWith('.internal')) return true;

    return false;
  }

  filterRequest(request: NetworkRequest): NetworkRequest | null {
    const allowed = this.isAllowed(request.domain, request.port);
    const logged: NetworkRequest = { ...request, allowed };
    this.requestLog.push(logged);

    if (this.requestLog.length > 10_000) {
      this.requestLog = this.requestLog.slice(-5_000);
    }

    if (!allowed) {
      this.suspiciousPatterns.push({
        type: 'blocked_request',
        description: `Blocked request to ${request.domain}:${request.port}`,
        severity: 'medium',
        timestamp: new Date(),
        details: { request },
      });
    }

    return allowed ? request : null;
  }

  getRequestLog(): NetworkRequest[] {
    return [...this.requestLog];
  }

  detectSuspiciousActivity(): SuspiciousActivity[] {
    const activities: SuspiciousActivity[] = [...this.suspiciousPatterns];

    const domainCounts = new Map<string, number>();
    for (const req of this.requestLog) {
      domainCounts.set(req.domain, (domainCounts.get(req.domain) || 0) + 1);
    }
    for (const [domain, count] of domainCounts) {
      if (count > 100) {
        activities.push({
          type: 'high_frequency_requests',
          description: `${count} requests to ${domain}`,
          severity: count > 500 ? 'critical' : count > 200 ? 'high' : 'medium',
          timestamp: new Date(),
          details: { domain, count },
        });
      }
    }

    const now = Date.now();
    const recentFailed = this.requestLog.filter(
      (r) => !r.allowed && now - r.timestamp.getTime() < 60_000,
    );
    if (recentFailed.length > 10) {
      activities.push({
        type: 'repeated_blocked_attempts',
        description: `${recentFailed.length} blocked requests in the last minute`,
        severity: 'high',
        timestamp: new Date(),
        details: { count: recentFailed.length },
      });
    }

    return activities;
  }
}

// ── ProcessGroup ───────────────────────────────────────────────────────────────

export class ProcessGroup {
  private processes: Map<string, ChildProcess> = new Map();
  private maxProcesses: number;

  constructor(maxProcesses: number) {
    this.maxProcesses = maxProcesses;
  }

  async spawn(
    id: string,
    command: string,
    args: string[],
    options: SpawnOptions,
  ): Promise<ChildProcess> {
    if (!this.isWithinLimit()) {
      throw new Error(`Process limit reached (${this.maxProcesses}). Cannot spawn new process.`);
    }

    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: (options.stdio || 'pipe') as any,
      timeout: options.timeout,
    });

    this.processes.set(id, proc);

    proc.on('exit', () => {
      this.processes.delete(id);
    });

    proc.on('error', () => {
      this.processes.delete(id);
    });

    return proc;
  }

  async kill(id: string): Promise<void> {
    const proc = this.processes.get(id);
    if (!proc) return;

    return new Promise((resolve) => {
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());

      try {
        if (proc.pid) {
          if (process.platform === 'win32') {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { timeout: 5000 }).toString();
          } else {
            process.kill(-proc.pid, 'SIGTERM');
          }
        } else {
          proc.kill('SIGTERM');
        }
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // process may already be dead
        }
      }

      setTimeout(() => {
        this.processes.delete(id);
        resolve();
      }, 5000);
    });
  }

  async killAll(): Promise<void> {
    const ids = Array.from(this.processes.keys());
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  getActiveCount(): number {
    const alive = Array.from(this.processes.values()).filter(
      (p) => p.exitCode === null,
    );
    return alive.length;
  }

  isWithinLimit(): boolean {
    return this.getActiveCount() < this.maxProcesses;
  }
}

// ── AgentSandbox ───────────────────────────────────────────────────────────────

export class AgentSandbox {
  private config: AgentSandboxConfig;
  private resourceMonitor: ResourceMonitor;
  private processGroup: ProcessGroup | null = null;
  private fileLocks: Map<string, FileLock> = new Map();
  private networkFilter: NetworkFilter;
  private startTime: Date;
  private resourceUsage: ResourceUsage;
  private initialized: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private sandboxDir: string;

  constructor(config: AgentSandboxConfig) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    this.startTime = new Date();
    this.sandboxDir = '';

    this.resourceUsage = {
      memoryMB: 0,
      cpuPercent: 0,
      diskMB: 0,
      networkMbps: 0,
      openFileHandles: 0,
      childProcesses: 0,
      executionTimeMs: 0,
      tokensUsed: 0,
    };

    this.resourceMonitor = new ResourceMonitor(
      {
        maxMemoryMB: this.config.maxMemoryMB,
        maxCpuPercent: this.config.maxCpuPercent,
        maxDiskMB: this.config.maxDiskMB,
        maxNetworkMbps: this.config.maxNetworkMbps,
        maxFileHandles: this.config.maxFileHandles,
        maxChildProcesses: this.config.maxChildProcesses,
        maxExecutionTimeMs: this.config.maxExecutionTimeMs,
        maxTokens: Infinity,
      },
      (limit) => {
        this.enforceLimits();
      },
    );

    this.networkFilter = new NetworkFilter(
      this.config.networkPolicy,
      this.config.allowedDomains,
      this.config.blockedDomains,
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.sandboxDir = path.join(
      this.config.filesystemRoot,
      `agent-${this.config.agentId}-${Date.now()}`,
    );

    fs.mkdirSync(this.sandboxDir, { recursive: true });

    for (const sub of ['tmp', 'work', 'output', 'logs']) {
      fs.mkdirSync(path.join(this.sandboxDir, sub), { recursive: true });
    }

    const filteredEnv = this.buildFilteredEnv();
    fs.writeFileSync(
      path.join(this.sandboxDir, '.env.json'),
      JSON.stringify(filteredEnv, null, 2),
    );

    if (this.config.processIsolation) {
      this.processGroup = new ProcessGroup(this.config.maxChildProcesses);
    }

    this.resourceMonitor.start(1000);

    this.executionTimer = setInterval(() => {
      this.resourceUsage.executionTimeMs = Date.now() - this.startTime.getTime();
      if (this.resourceUsage.executionTimeMs >= this.config.maxExecutionTimeMs) {
        this.killAllProcesses();
      }
    }, 1000);

    this.initialized = true;
  }

  async destroy(): Promise<void> {
    if (!this.initialized) return;

    if (this.executionTimer) {
      clearInterval(this.executionTimer);
      this.executionTimer = null;
    }

    this.resourceMonitor.stop();

    if (this.processGroup) {
      await this.processGroup.killAll();
    }

    this.releaseAllFileLocks();

    try {
      if (this.sandboxDir && fs.existsSync(this.sandboxDir)) {
        fs.rmSync(this.sandboxDir, { recursive: true, force: true });
      }
    } catch {
      // best effort cleanup
    }

    this.initialized = false;
  }

  // ── Filesystem ─────────────────────────────────────────────────────────────

  canAccessFile(filePath: string, mode: 'read' | 'write' | 'delete'): boolean {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return false;

    const normalized = path.normalize(resolved);

    for (const blocked of this.config.blockedPaths) {
      const blockedNorm = path.normalize(blocked);
      if (normalized.startsWith(blockedNorm)) return false;
    }

    if (mode === 'write' || mode === 'delete') {
      const inSandbox = normalized.startsWith(path.normalize(this.sandboxDir));
      if (!inSandbox) {
        const canWrite = this.config.writablePaths.some((p) =>
          normalized.startsWith(path.normalize(p)),
        );
        if (!canWrite) return false;
      }
    }

    if (mode === 'read') {
      const canRead = this.config.readonlyPaths.some((p) =>
        normalized.startsWith(path.normalize(p)),
      );
      const canWrite = this.config.writablePaths.some((p) =>
        normalized.startsWith(path.normalize(p)),
      );
      const inSandbox = normalized.startsWith(path.normalize(this.sandboxDir));
      if (!canRead && !canWrite && !inSandbox) return false;
    }

    return true;
  }

  resolvePath(requestedPath: string): string | null {
    if (!requestedPath) return null;

    let resolved: string;
    if (path.isAbsolute(requestedPath)) {
      resolved = path.resolve(requestedPath);
    } else {
      resolved = path.resolve(this.sandboxDir, requestedPath);
    }

    const normalized = path.normalize(resolved);

    if (normalized.includes('..')) {
      return null;
    }

    return normalized;
  }

  createSandboxedPath(originalPath: string): string {
    const basename = path.basename(originalPath);
    const ext = path.extname(basename);
    const name = basename.slice(0, -ext.length) || basename;
    const unique = `${name}_${uuidv4().slice(0, 8)}${ext}`;
    return path.join(this.sandboxDir, 'work', unique);
  }

  async acquireFileLock(filePath: string, lockType: 'shared' | 'exclusive'): Promise<FileLock> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) {
      throw new Error(`Cannot resolve path: ${filePath}`);
    }

    if (!this.canAccessFile(resolved, 'write')) {
      throw new Error(`Permission denied for file lock: ${resolved}`);
    }

    const existing = this.fileLocks.get(resolved);
    if (existing) {
      if (existing.type === 'exclusive' || lockType === 'exclusive') {
        throw new Error(`File is locked by agent ${existing.agentId}: ${resolved}`);
      }
      if (existing.agentId !== this.config.agentId) {
        // shared lock allows multiple agents
      }
    }

    const lock: FileLock = {
      path: resolved,
      type: lockType,
      agentId: this.config.agentId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
    };

    this.fileLocks.set(resolved, lock);
    return lock;
  }

  releaseFileLock(filePath: string): void {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return;

    const lock = this.fileLocks.get(resolved);
    if (lock && lock.agentId === this.config.agentId) {
      this.fileLocks.delete(resolved);
    }
  }

  getTempDirectory(): string {
    return path.join(this.sandboxDir, 'tmp');
  }

  listAccessibleFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string, depth: number = 0) => {
      if (depth > 10) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (this.canAccessFile(full, 'read')) {
            files.push(full);
          }
        }
      } catch {
        // permission error
      }
    };

    walk(this.sandboxDir);

    for (const dir of this.config.readonlyPaths) {
      if (fs.existsSync(dir)) {
        walk(dir);
      }
    }

    return files;
  }

  // ── Network ────────────────────────────────────────────────────────────────

  canMakeRequest(domain: string, port: number): boolean {
    return this.networkFilter.isAllowed(domain, port);
  }

  filterUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80;

      if (!this.networkFilter.isAllowed(domain, port)) {
        return null;
      }

      return url;
    } catch {
      return null;
    }
  }

  getNetworkPolicy(): NetworkPolicy {
    return {
      type: this.config.networkPolicy,
      allowedDomains: [...this.config.allowedDomains],
      blockedDomains: [...this.config.blockedDomains],
      allowInternal: this.config.networkPolicy === 'internal' || this.config.networkPolicy === 'full',
    };
  }

  // ── Process ────────────────────────────────────────────────────────────────

  async spawnProcess(
    command: string,
    args: string[],
    options: SpawnOptions,
  ): Promise<SandboxedProcess> {
    if (!this.processGroup) {
      this.processGroup = new ProcessGroup(this.config.maxChildProcesses);
    }

    const id = uuidv4();
    const filteredEnv = this.buildFilteredEnv();

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd || this.sandboxDir,
      env: { ...filteredEnv, ...options.env },
      stdio: options.stdio || 'pipe',
      timeout: options.timeout || this.config.maxExecutionTimeMs,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    };

    const proc = await this.processGroup.spawn(id, command, args, spawnOptions);
    this.resourceUsage.childProcesses = this.processGroup.getActiveCount();

    return {
      id,
      process: proc,
      pid: proc.pid,
      startTime: new Date(),
      resourceUsage: this.resourceMonitor.getUsage(),
    };
  }

  async killAllProcesses(): Promise<void> {
    if (this.processGroup) {
      await this.processGroup.killAll();
    }
    this.resourceUsage.childProcesses = 0;
  }

  getProcessCount(): number {
    return this.processGroup ? this.processGroup.getActiveCount() : 0;
  }

  getOpenFileHandles(): number {
    return this.resourceMonitor.getUsage().openFileHandles;
  }

  // ── Resources ──────────────────────────────────────────────────────────────

  getResourceUsage(): ResourceUsage {
    const monitorUsage = this.resourceMonitor.getUsage();
    this.resourceUsage = {
      ...monitorUsage,
      executionTimeMs: Date.now() - this.startTime.getTime(),
      childProcesses: this.processGroup ? this.processGroup.getActiveCount() : 0,
    };
    return { ...this.resourceUsage };
  }

  isWithinLimits(): boolean {
    const usage = this.getResourceUsage();

    if (usage.memoryMB > this.config.maxMemoryMB) return false;
    if (usage.cpuPercent > this.config.maxCpuPercent) return false;
    if (usage.diskMB > this.config.maxDiskMB) return false;
    if (usage.networkMbps > this.config.maxNetworkMbps) return false;
    if (usage.openFileHandles > this.config.maxFileHandles) return false;
    if (usage.childProcesses > this.config.maxChildProcesses) return false;
    if (usage.executionTimeMs > this.config.maxExecutionTimeMs) return false;

    return true;
  }

  enforceLimits(): void {
    if (this.isWithinLimits()) return;

    const usage = this.getResourceUsage();

    if (usage.executionTimeMs > this.config.maxExecutionTimeMs) {
      this.killAllProcesses();
      return;
    }

    if (usage.childProcesses > this.config.maxChildProcesses) {
      this.killAllProcesses();
      return;
    }

    if (usage.memoryMB > this.config.maxMemoryMB * 1.1) {
      this.killAllProcesses();
    }
  }

  getRemainingBudget(): ResourceBudget {
    const usage = this.getResourceUsage();

    return {
      remainingMemory: Math.max(0, this.config.maxMemoryMB - usage.memoryMB),
      remainingCpu: Math.max(0, this.config.maxCpuPercent - usage.cpuPercent),
      remainingDisk: Math.max(0, this.config.maxDiskMB - usage.diskMB),
      remainingNetwork: Math.max(0, this.config.maxNetworkMbps - usage.networkMbps),
      remainingTime: Math.max(0, this.config.maxExecutionTimeMs - usage.executionTimeMs),
      remainingTokens: Infinity,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private buildFilteredEnv(): Record<string, string> {
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(this.config.envVariables)) {
      env[key] = value;
    }

    env['SANDBOX_ID'] = this.config.agentId;
    env['SANDBOX_TYPE'] = this.config.agentType;
    env['SANDBOX_DIR'] = this.sandboxDir;
    env['SANDBOX_TMP'] = path.join(this.sandboxDir, 'tmp');
    env['SANDBOX_WORK'] = path.join(this.sandboxDir, 'work');
    env['SANDBOX_OUTPUT'] = path.join(this.sandboxDir, 'output');

    return env;
  }

  private releaseAllFileLocks(): void {
    for (const [path, lock] of this.fileLocks) {
      if (lock.agentId === this.config.agentId) {
        this.fileLocks.delete(path);
      }
    }
  }
}

export default AgentSandbox;
