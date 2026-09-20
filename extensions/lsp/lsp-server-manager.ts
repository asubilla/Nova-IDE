import { EventEmitter } from 'events';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface LSPServerConfig {
  name: string;
  language: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  filePatterns: string[];
  initializationOptions?: any;
  settings?: any;
  capabilities?: LSPClientCapabilities;
  autoStart?: boolean;
  timeout?: number;
}

export interface LSPClientCapabilities {
  textDocument?: { completion?: any; hover?: any; definition?: any; references?: any; formatting?: any; diagnostics?: any; codeAction?: any; rename?: any };
  workspace?: { workspaceFolders?: any; configuration?: any; didChangeConfiguration?: any };
}

export interface LSPServerInstance {
  config: LSPServerConfig;
  status: 'stopped' | 'initializing' | 'running' | 'error';
  pid?: number;
  startedAt?: Date;
  serverCapabilities?: any;
  diagnostics: Map<string, LSPDiagnostic[]>;
}

export interface LSPDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: 1 | 2 | 3 | 4;
  source: string;
  message: string;
  code?: string | number;
}

export interface LSPPosition { line: number; character: number; }
export interface LSPRange { start: LSPPosition; end: LSPPosition; }

export interface LSPCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LSPHoverContents {
  kind: string;
  value: string;
}

export interface LSPDefinition {
  uri: string;
  range: LSPRange;
}

export interface LSPReference {
  uri: string;
  range: LSPRange;
}

export class LSPServerManager extends EventEmitter {
  private servers: Map<string, LSPServerInstance> = new Map();
  private languageIndex: Map<string, Set<string>> = new Map();
  private filePatternIndex: Map<string, string> = new Map();
  private configPaths: Set<string> = new Set();

  constructor() { super(); }

  loadFromJSON(jsonPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    try {
      const content = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      const servers: LSPServerConfig[] = data.lspServers || data.servers || (Array.isArray(data) ? data : [data]);
      for (const config of servers) {
        if (this.registerServer(config)) loaded++; else errors++;
      }
      this.configPaths.add(jsonPath);
    } catch (error) {
      this.emit('config-error', { path: jsonPath, error });
      errors++;
    }
    return { loaded, errors };
  }

  loadFromDirectory(dirPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    if (!existsSync(dirPath)) return { loaded: 0, errors: 1 };
    const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const result = this.loadFromJSON(join(dirPath, file));
      loaded += result.loaded; errors += result.errors;
    }
    return { loaded, errors };
  }

  loadFromObject(config: LSPServerConfig): boolean { return this.registerServer(config); }

  loadFromString(jsonString: string): { loaded: number; errors: number } {
    try {
      const data = JSON.parse(jsonString);
      const servers: LSPServerConfig[] = data.lspServers || data.servers || (Array.isArray(data) ? data : [data]);
      let loaded = 0, errors = 0;
      for (const config of servers) { if (this.registerServer(config)) loaded++; else errors++; }
      return { loaded, errors };
    } catch { return { loaded: 0, errors: 1 }; }
  }

  private registerServer(config: LSPServerConfig): boolean {
    if (!config.name || !config.language || !config.command) return false;
    const instance: LSPServerInstance = { config, status: 'stopped', diagnostics: new Map() };
    this.servers.set(config.name, instance);

    if (!this.languageIndex.has(config.language)) this.languageIndex.set(config.language, new Set());
    this.languageIndex.get(config.language)!.add(config.name);

    for (const pattern of config.filePatterns) {
      this.filePatternIndex.set(pattern, config.name);
    }

    this.emit('server-registered', { name: config.name, language: config.language });
    return true;
  }

  async startServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server || server.status === 'running') return false;

    server.status = 'initializing';
    this.emit('server-initializing', { name });

    try {
      // In real implementation, spawn LSP server process and send initialize request
      server.status = 'running';
      server.startedAt = new Date();
      server.pid = Math.floor(Math.random() * 100000);
      server.serverCapabilities = { completionProvider: true, hoverProvider: true, definitionProvider: true, referencesProvider: true, formattingProvider: true, diagnosticProvider: true };

      this.emit('server-initialized', { name, capabilities: server.serverCapabilities });
      return true;
    } catch (error) {
      server.status = 'error';
      this.emit('server-error', { name, error: (error as Error).message });
      return false;
    }
  }

  async stopServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return false;
    server.status = 'stopped';
    server.pid = undefined;
    this.emit('server-stopped', { name });
    return true;
  }

  getServerForFile(filePath: string): LSPServerInstance | null {
    for (const [pattern, serverName] of this.filePatternIndex) {
      if (this.matchGlob(filePath, pattern)) return this.servers.get(serverName) || null;
    }
    return null;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(filePath);
  }

  async completion(name: string, filePath: string, position: LSPPosition): Promise<LSPCompletionItem[]> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return [];
    this.emit('completion-request', { name, filePath, position });
    return [];
  }

  async hover(name: string, filePath: string, position: LSPPosition): Promise<LSPHoverContents | null> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return null;
    this.emit('hover-request', { name, filePath, position });
    return null;
  }

  async definition(name: string, filePath: string, position: LSPPosition): Promise<LSPDefinition[]> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return [];
    this.emit('definition-request', { name, filePath, position });
    return [];
  }

  async references(name: string, filePath: string, position: LSPPosition): Promise<LSPReference[]> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return [];
    this.emit('references-request', { name, filePath, position });
    return [];
  }

  async formatting(name: string, filePath: string): Promise<{ range: LSPRange; newText: string }[]> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return [];
    this.emit('formatting-request', { name, filePath });
    return [];
  }

  async diagnostics(name: string, filePath: string): Promise<LSPDiagnostic[]> {
    const server = this.servers.get(name);
    if (!server || server.status !== 'running') return [];
    return server.diagnostics.get(filePath) || [];
  }

  updateDiagnostics(name: string, filePath: string, diagnostics: LSPDiagnostic[]): void {
    const server = this.servers.get(name);
    if (server) {
      server.diagnostics.set(filePath, diagnostics);
      this.emit('diagnostics-updated', { name, filePath, count: diagnostics.length });
    }
  }

  getServersForLanguage(language: string): LSPServerInstance[] {
    const ids = this.languageIndex.get(language);
    if (!ids) return [];
    return [...ids].map(id => this.servers.get(id)!).filter(Boolean);
  }

  getServer(name: string): LSPServerInstance | undefined { return this.servers.get(name); }
  getAllServers(): LSPServerInstance[] { return [...this.servers.values()]; }
  getRunningServers(): LSPServerInstance[] { return [...this.servers.values()].filter(s => s.status === 'running'); }
  getSupportedLanguages(): string[] { return [...this.languageIndex.keys()]; }
  removeServer(name: string): boolean { return this.servers.delete(name); }

  exportConfig(): string {
    const servers = [...this.servers.values()].map(s => s.config);
    return JSON.stringify({ lspServers: servers }, null, 2);
  }

  getStats(): { totalServers: number; running: number; languages: string[]; totalDiagnostics: number } {
    let running = 0, totalDiagnostics = 0;
    for (const server of this.servers.values()) {
      if (server.status === 'running') running++;
      for (const diags of server.diagnostics.values()) totalDiagnostics += diags.length;
    }
    return { totalServers: this.servers.size, running, languages: [...this.languageIndex.keys()], totalDiagnostics };
  }

  destroy(): void {
    for (const server of this.servers.values()) server.status = 'stopped';
    this.servers.clear();
    this.languageIndex.clear();
    this.filePatternIndex.clear();
    this.removeAllListeners();
  }
}
