import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as net from 'net';

export type DebugAdapterType = 'node' | 'python';
export type DebugConfigType = 'launch' | 'attach';

export interface DebugConfig {
  type: DebugAdapterType;
  request: DebugConfigType;
  name: string;
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  port?: number;
  host?: string;
  stopOnEntry?: boolean;
  console?: 'internalConsole' | 'integratedTerminal' | 'externalTerminal';
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  timeout?: number;
}

export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCount?: number;
  enabled: boolean;
  verified: boolean;
}

export interface StackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  column: number;
  source?: string;
  presentationHint?: 'normal' | 'subtle' | 'label';
}

export interface Variable {
  name: string;
  value: string;
  type: string;
  evaluateName?: string;
  variablesReference?: number;
}

export interface Thread {
  id: number;
  name: string;
  state: 'running' | 'stopped' | 'terminated';
}

export type DebugEventType = 'stopped' | 'continued' | 'terminated' | 'output' | 'error' | 'started';

export interface DebugEvent {
  type: DebugEventType;
  threadId?: number;
  reason?: string;
  output?: string;
  file?: string;
  line?: number;
  timestamp: Date;
}

export type DebugState = 'idle' | 'running' | 'stopped' | 'terminated';

export interface DapMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
  command?: string;
  arguments?: Record<string, unknown>;
  body?: Record<string, unknown>;
  message?: string;
  request_seq?: number;
  success?: boolean;
}

export interface DapRequest {
  seq: number;
  type: 'request';
  command: string;
  arguments?: Record<string, unknown>;
}

export interface DapResponse {
  seq: number;
  type: 'response';
  command: string;
  request_seq: number;
  success: boolean;
  message?: string;
  body?: Record<string, unknown>;
}

export interface DapEvent {
  seq: number;
  type: 'event';
  event: string;
  body?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (body: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

export class DebugAdapter extends EventEmitter {
  private state: DebugState = 'idle';
  private sessionId: string | null = null;
  private config: DebugConfig | null = null;
  private debuggeeProcess: ChildProcess | null = null;
  private debuggeeSocket: net.Socket | null = null;
  private seq = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private eventBuffer: string = '';
  private threads: Map<number, Thread> = new Map();
  private breakpoints: Map<string, Breakpoint[]> = new Map();
  private events: DebugEvent[] = [];
  private requestTimeout: number = 5000;

  constructor() {
    super();
    this.threads.set(1, { id: 1, name: 'Main Thread', state: 'stopped' });
  }

  async startDebugging(config: DebugConfig): Promise<void> {
    if (this.state === 'running') {
      throw new Error('Debug session already running');
    }
    this.config = config;
    this.sessionId = uuidv4();
    this.seq = 0;
    this.pendingRequests.clear();
    this.eventBuffer = '';
    this.threads.clear();
    this.threads.set(1, { id: 1, name: 'Main Thread', state: 'running' });

    try {
      if (config.request === 'launch') {
        await this.launchProcess(config);
      } else {
        await this.attachToSocket(config);
      }
      await this.initializeDap();
      this.state = 'running';
      this.recordEvent({ type: 'started', timestamp: new Date(), output: `Debug session ${this.sessionId} started` });
      this.emit('sessionStarted', this.sessionId);
    } catch (err) {
      this.state = 'terminated';
      this.cleanup();
      throw err;
    }
  }

  async stopDebugging(): Promise<void> {
    if (this.state === 'idle' || this.state === 'terminated') {
      throw new Error('No active debug session');
    }
    try {
      await this.sendRequest('disconnect', { restart: false, terminateDebuggee: true });
    } catch {
      // ignore disconnect errors
    }
    this.state = 'terminated';
    this.recordEvent({ type: 'terminated', timestamp: new Date(), output: 'Debug session terminated' });
    this.emit('sessionStopped', this.sessionId);
    this.cleanup();
    this.sessionId = null;
    this.config = null;
  }

  async setBreakpoint(file: string, line: number, condition?: string, column?: number): Promise<Breakpoint> {
    const id = uuidv4();
    const breakpoint: Breakpoint = {
      id,
      file,
      line,
      column,
      condition,
      enabled: true,
      verified: this.state !== 'idle',
    };

    if (this.state !== 'idle' && this.state !== 'terminated') {
      try {
        const source: Record<string, unknown> = { path: file };
        const bps: Array<{ line: number; column?: number; condition?: string; verified?: boolean }> = [
          { line, column, condition },
        ];
        const resp = await this.sendRequest('setBreakpoints', {
          source,
          breakpoints: bps,
          sourceModified: this.breakpoints.has(file),
        });
        const responseBps = (resp as unknown as { breakpoints?: Array<{ id?: number; verified?: boolean }> }).breakpoints;
        if (responseBps && responseBps.length > 0) {
          breakpoint.verified = responseBps[0].verified ?? true;
          breakpoint.id = String(responseBps[0].id ?? id);
        }
      } catch {
        breakpoint.verified = false;
      }
    }

    const existing = this.breakpoints.get(file) || [];
    existing.push(breakpoint);
    this.breakpoints.set(file, existing);
    this.emit('breakpointSet', breakpoint);
    return breakpoint;
  }

  async removeBreakpoint(id: string): Promise<void> {
    const entries = Array.from(this.breakpoints.entries());
    for (const [file, bps] of entries) {
      const idx = bps.findIndex((bp) => bp.id === id);
      if (idx >= 0) {
        bps.splice(idx, 1);
        if (bps.length === 0) {
          this.breakpoints.delete(file);
        }
        if (this.state !== 'idle' && this.state !== 'terminated') {
          await this.syncBreakpoints(file);
        }
        return;
      }
    }
    throw new Error(`Breakpoint ${id} not found`);
  }

  async getBreakpoints(): Promise<Breakpoint[]> {
    const all: Breakpoint[] = [];
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      all.push(...bps);
    }
    return all;
  }

  async stepOver(): Promise<void> {
    this.ensureSessionActive();
    const threadId = this.getStoppedThreadId();
    await this.sendRequest('next', { threadId });
    this.recordEvent({ type: 'stopped', reason: 'step', threadId, timestamp: new Date() });
  }

  async stepInto(): Promise<void> {
    this.ensureSessionActive();
    const threadId = this.getStoppedThreadId();
    await this.sendRequest('stepIn', { threadId });
    this.recordEvent({ type: 'stopped', reason: 'step', threadId, timestamp: new Date() });
  }

  async stepOut(): Promise<void> {
    this.ensureSessionActive();
    const threadId = this.getStoppedThreadId();
    await this.sendRequest('stepOut', { threadId });
    this.recordEvent({ type: 'stopped', reason: 'step', threadId, timestamp: new Date() });
  }

  async continue(): Promise<void> {
    this.ensureSessionActive();
    const threadId = this.getStoppedThreadId();
    const resp = await this.sendRequest('continue', { threadId });
    const allThreadsContinued = (resp as unknown as { allThreadsContinued?: boolean }).allThreadsContinued;
    if (allThreadsContinued) {
      const threadsArr = Array.from(this.threads.values());
      for (const thread of threadsArr) {
        thread.state = 'running';
      }
    } else {
      const thread = this.threads.get(threadId);
      if (thread) thread.state = 'running';
    }
    this.state = 'running';
    this.recordEvent({ type: 'continued', threadId, timestamp: new Date() });
    this.emit('continued');
  }

  async pause(): Promise<void> {
    this.ensureSessionActive();
    const threadId = this.getStoppedThreadId();
    await this.sendRequest('pause', { threadId });
    this.state = 'stopped';
    const threadsArr = Array.from(this.threads.values());
    for (const thread of threadsArr) {
      thread.state = 'stopped';
    }
    this.recordEvent({ type: 'stopped', reason: 'pause', threadId, timestamp: new Date() });
    this.emit('paused');
  }

  async evaluate(expression: string, frameId?: number): Promise<Variable> {
    this.ensureSessionActive();
    const args: Record<string, unknown> = { expression };
    if (frameId !== undefined) args.frameId = frameId;
    const resp = await this.sendRequest('evaluate', args);
    const body = resp as unknown as { result?: string; type?: string; variablesReference?: number };
    return {
      name: expression,
      value: body.result ?? 'undefined',
      type: body.type ?? 'unknown',
      evaluateName: expression,
      variablesReference: body.variablesReference,
    };
  }

  async getStackTrace(threadId?: number): Promise<StackFrame[]> {
    this.ensureSessionActive();
    const tid = threadId ?? this.getStoppedThreadId();
    const resp = await this.sendRequest('stackTrace', { threadId: tid, startFrame: 0, levels: 100 });
    const body = resp as unknown as { stackFrames?: Array<{ id: number; name: string; source?: { path?: string }; line: number; column: number }> };
    return (body.stackFrames ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      file: f.source?.path ?? '<unknown>',
      line: f.line,
      column: f.column,
    }));
  }

  async getVariables(variablesReference: number): Promise<Variable[]> {
    this.ensureSessionActive();
    const resp = await this.sendRequest('variables', { variablesReference });
    const body = resp as unknown as { variables?: Array<{ name: string; value: string; type: string; evaluateName?: string; variablesReference?: number }> };
    return (body.variables ?? []).map((v) => ({
      name: v.name,
      value: v.value,
      type: v.type,
      evaluateName: v.evaluateName,
      variablesReference: v.variablesReference,
    }));
  }

  async setVariable(name: string, value: string, variablesReference: number = 0): Promise<void> {
    this.ensureSessionActive();
    await this.sendRequest('setVariable', { variablesReference, name, value });
  }

  async getThreads(): Promise<Thread[]> {
    if (this.state === 'idle' || this.state === 'terminated') {
      return Array.from(this.threads.values());
    }
    try {
      const resp = await this.sendRequest('threads', {});
      const body = resp as unknown as { threads?: Array<{ id: number; name: string }> };
      this.threads.clear();
      const threadList = body.threads ?? [];
      for (const t of threadList) {
        this.threads.set(t.id, { id: t.id, name: t.name, state: 'running' });
      }
    } catch {
      // fallback to cached threads
    }
    return Array.from(this.threads.values());
  }

  async launchNode(scriptPath: string): Promise<void> {
    const resolved = this.resolveFilePath(scriptPath);
    await this.startDebugging({
      type: 'node',
      request: 'launch',
      name: `Node: ${resolved}`,
      program: resolved,
      console: 'integratedTerminal',
      stopOnEntry: false,
    });
  }

  async launchPython(scriptPath: string): Promise<void> {
    const resolved = this.resolveFilePath(scriptPath);
    await this.startDebugging({
      type: 'python',
      request: 'launch',
      name: `Python: ${resolved}`,
      program: resolved,
      console: 'integratedTerminal',
      stopOnEntry: false,
    });
  }

  async attachToProcess(pid: number): Promise<void> {
    const port = await this.findFreePort();
    await this.startDebugging({
      type: 'node',
      request: 'attach',
      name: `Attach PID: ${pid}`,
      port,
      host: 'localhost',
      program: '<attached>',
    });
  }

  getState(): DebugState {
    return this.state;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getConfig(): DebugConfig | null {
    return this.config;
  }

  getEvents(): DebugEvent[] {
    return [...this.events];
  }

  // ── DAP communication ───────────────────────────────────────────────

  private async sendRequest(command: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const seq = ++this.seq;
      const message: DapRequest = { seq, type: 'request', command, arguments: args };
      const payload = `Content-Length: ${Buffer.byteLength(JSON.stringify(message))}\r\n\r\n${JSON.stringify(message)}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(new Error(`DAP request '${command}' timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(seq, {
        resolve: (body) => { clearTimeout(timer); resolve(body); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      if (this.debuggeeSocket && !this.debuggeeSocket.destroyed) {
        this.debuggeeSocket.write(payload);
      } else if (this.debuggeeProcess?.stdin && !this.debuggeeProcess.stdin.destroyed) {
        this.debuggeeProcess.stdin.write(payload);
      } else {
        this.pendingRequests.delete(seq);
        clearTimeout(timer);
        reject(new Error('No DAP transport available'));
      }
    });
  }

  private handleDapMessage(raw: string): void {
    const contentLengthMatch = raw.match(/Content-Length:\s*(\d+)/);
    if (!contentLengthMatch) return;
    const contentLength = parseInt(contentLengthMatch[1], 10);
    const headerEnd = raw.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const bodyStr = raw.substring(headerEnd + 4, headerEnd + 4 + contentLength);
    if (bodyStr.length < contentLength) return;

    try {
      const msg: DapMessage = JSON.parse(bodyStr);
      if (msg.type === 'response') {
        const resp = msg as unknown as DapResponse;
        const pending = this.pendingRequests.get(resp.request_seq);
        if (pending) {
          this.pendingRequests.delete(resp.request_seq);
          if (resp.success) {
            pending.resolve(resp.body ?? {});
          } else {
            pending.reject(new Error(resp.message ?? `Request ${resp.command} failed`));
          }
        }
      } else if (msg.type === 'event') {
        this.handleDapEvent(msg as unknown as DapEvent);
      }
    } catch {
      // malformed message, ignore
    }
  }

  private handleDapEvent(event: DapEvent): void {
    const ebody = event.body ?? {};
    switch (event.event) {
      case 'initialized': {
        this.syncAllBreakpoints();
        break;
      }
      case 'stopped': {
        this.state = 'stopped';
        const reason = (ebody as Record<string, unknown>).reason as string | undefined;
        const tid = (ebody as Record<string, unknown>).threadId as number | undefined;
        const threadId = tid ?? 1;
        const thread = this.threads.get(threadId);
        if (thread) thread.state = 'stopped';
        const entries = Array.from(this.threads.entries());
        for (const [id, t] of entries) {
          if (id !== threadId && t.state === 'running') t.state = 'running';
        }
        this.recordEvent({ type: 'stopped', reason, threadId, timestamp: new Date() });
        this.emit('stopped', { reason, threadId });
        break;
      }
      case 'continued': {
        this.state = 'running';
        const ctid = (ebody as Record<string, unknown>).threadId as number | undefined;
        const ctidVal = ctid ?? 1;
        const threadsArr = Array.from(this.threads.values());
        for (const t of threadsArr) t.state = 'running';
        this.recordEvent({ type: 'continued', threadId: ctidVal, timestamp: new Date() });
        this.emit('continued');
        break;
      }
      case 'terminated': {
        this.state = 'terminated';
        this.recordEvent({ type: 'terminated', timestamp: new Date(), output: 'Debuggee terminated' });
        this.emit('terminated');
        break;
      }
      case 'output': {
        const output = (ebody as Record<string, unknown>).output as string | undefined;
        if (output) {
          this.recordEvent({ type: 'output', output, timestamp: new Date() });
          this.emit('output', output);
        }
        break;
      }
      case 'thread': {
        const threadState = (ebody as Record<string, unknown>).reason as string | undefined;
        const threadId = (ebody as Record<string, unknown>).threadId as number | undefined;
        if (threadId && threadState) {
          const thread = this.threads.get(threadId);
          if (thread) {
            thread.state = threadState === 'started' ? 'running' : threadState === 'exited' ? 'terminated' : 'running';
          }
        }
        break;
      }
      case 'exited': {
        this.state = 'terminated';
        this.recordEvent({ type: 'terminated', timestamp: new Date(), output: 'Debuggee exited' });
        break;
      }
    }
  }

  private handleDapData(data: Buffer): void {
    this.eventBuffer += data.toString();
    const HEADER_END = '\r\n\r\n';
    let idx: number;
    while ((idx = this.eventBuffer.indexOf(HEADER_END)) >= 0) {
      const header = this.eventBuffer.substring(0, idx);
      const match = header.match(/Content-Length:\s*(\d+)/);
      if (!match) break;
      const contentLength = parseInt(match[1], 10);
      const totalLen = idx + 4 + contentLength;
      if (this.eventBuffer.length < totalLen) break;
      const raw = this.eventBuffer.substring(0, totalLen);
      this.eventBuffer = this.eventBuffer.substring(totalLen);
      this.handleDapMessage(raw);
    }
  }

  // ── Process management ──────────────────────────────────────────────

  private async launchProcess(config: DebugConfig): Promise<void> {
    const args = this.buildLaunchArgs(config);
    const executable = this.getExecutable(config);
    const cwd = config.cwd || process.cwd();
    const env = { ...process.env, ...config.env };

    this.debuggeeProcess = spawn(executable, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    this.debuggeeProcess.stdout?.on('data', (data: Buffer) => this.handleDapData(data));
    this.debuggeeProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      this.recordEvent({ type: 'output', output: msg, timestamp: new Date() });
      this.emit('stderr', msg);
    });
    this.debuggeeProcess.on('error', (err) => {
      this.recordEvent({ type: 'error', output: err.message, timestamp: new Date() });
      this.emit('error', err);
    });
    this.debuggeeProcess.on('exit', (code) => {
      this.state = 'terminated';
      this.recordEvent({ type: 'terminated', timestamp: new Date(), output: `Process exited with code ${code}` });
      this.emit('terminated');
    });
  }

  private async attachToSocket(config: DebugConfig): Promise<void> {
    const port = config.port ?? 9229;
    const host = config.host ?? 'localhost';

    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ port, host }, () => {
        this.debuggeeSocket = socket;
        socket.on('data', (data: Buffer) => this.handleDapData(data));
        socket.on('error', (err) => {
          this.emit('error', err);
        });
        socket.on('close', () => {
          this.state = 'terminated';
          this.recordEvent({ type: 'terminated', timestamp: new Date(), output: 'Connection closed' });
        });
        resolve();
      });
      socket.on('error', (err) => reject(err));
      setTimeout(() => {
        socket.destroy();
        reject(new Error(`Failed to attach to ${host}:${port} within ${this.requestTimeout}ms`));
      }, this.requestTimeout);
    });
  }

  private async initializeDap(): Promise<void> {
    const args: Record<string, unknown> = {
      clientID: 'nova-ide',
      clientName: 'Nova IDE',
      adapterID: this.config?.type === 'node' ? 'node' : 'python',
      locale: 'en',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      supportsProgressReporting: true,
      supportsInvalidatedEvent: true,
    };
    const resp = await this.sendRequest('initialize', args);
    const body = resp as unknown as {
      supportsConditionalBreakpoints?: boolean;
      supportsConfigurationDoneRequest?: boolean;
    };
    if (body.supportsConfigurationDoneRequest) {
      await this.sendRequest('configurationDone', {});
    }
  }

  private async syncBreakpoints(file: string): Promise<void> {
    const bps = this.breakpoints.get(file) || [];
    const breakpoints = bps.filter((bp) => bp.enabled).map((bp) => ({
      line: bp.line,
      column: bp.column,
      condition: bp.condition,
      hitCondition: bp.hitCount ? String(bp.hitCount) : undefined,
    }));

    try {
      const resp = await this.sendRequest('setBreakpoints', {
        source: { path: file },
        breakpoints,
        sourceModified: true,
      });
      const responseBps = (resp as unknown as { breakpoints?: Array<{ id?: number; verified?: boolean; line?: number }> }).breakpoints;
      if (responseBps) {
        for (let i = 0; i < bps.length && i < responseBps.length; i++) {
          bps[i].verified = responseBps[i].verified ?? false;
          if (responseBps[i].id !== undefined) {
            bps[i].id = String(responseBps[i].id);
          }
        }
      }
    } catch {
      for (const bp of bps) {
        bp.verified = false;
      }
    }
  }

  private async syncAllBreakpoints(): Promise<void> {
    const files = Array.from(this.breakpoints.keys());
    for (const file of files) {
      await this.syncBreakpoints(file);
    }
  }

  private cleanup(): void {
    if (this.debuggeeProcess) {
      try {
        this.debuggeeProcess.kill('SIGTERM');
      } catch {
        // process may already be dead
      }
      this.debuggeeProcess = null;
    }
    if (this.debuggeeSocket) {
      try {
        this.debuggeeSocket.destroy();
      } catch {
        // ignore
      }
      this.debuggeeSocket = null;
    }
    const pendingArr = Array.from(this.pendingRequests.entries());
    for (const [, pending] of pendingArr) {
      pending.reject(new Error('Debug session ended'));
    }
    this.pendingRequests.clear();
    this.eventBuffer = '';
  }

  private buildLaunchArgs(config: DebugConfig): string[] {
    const args: string[] = [];
    const program = config.program ?? '';
    if (config.type === 'node') {
      args.push('--inspect-brk=0');
      if (config.stopOnEntry) args.push('--inspect-brk=0');
      args.push(program);
      if (config.args) args.push(...config.args);
    } else if (config.type === 'python') {
      args.push('-m', 'debugpy.adapter');
      args.push('--listen', `${config.host ?? 'localhost'}:${config.port ?? 5678}`);
      args.push('--wait-for-client');
      args.push(program);
      if (config.args) args.push(...config.args);
    }
    return args;
  }

  private getExecutable(config: DebugConfig): string {
    if (config.runtimeExecutable) return config.runtimeExecutable;
    if (config.type === 'node') return 'node';
    if (config.type === 'python') {
      if (process.platform === 'win32') return 'python';
      return 'python3';
    }
    throw new Error(`Unsupported debug type: ${config.type}`);
  }

  private async findFreePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          server.close(() => resolve(addr.port));
        } else {
          server.close(() => reject(new Error('Could not determine free port')));
        }
      });
      server.on('error', reject);
    });
  }

  private resolveFilePath(filePath: string): string {
    return filePath.replace(/\$\{workspaceFolder\}/g, process.cwd());
  }

  private ensureSessionActive(): void {
    if (this.state === 'idle' || this.state === 'terminated') {
      throw new Error('No active debug session');
    }
  }

  private getStoppedThreadId(): number {
    const entries = Array.from(this.threads.entries());
    for (const [id, thread] of entries) {
      if (thread.state === 'stopped') return id;
    }
    return 1;
  }

  private recordEvent(event: DebugEvent): void {
    this.events.push(event);
    this.emit('debugEvent', event);
  }
}
