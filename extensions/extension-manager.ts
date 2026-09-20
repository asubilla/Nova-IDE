import { EventEmitter } from 'events';
import { readFileSync, readdirSync, existsSync, watch } from 'fs';
import { join, resolve } from 'path';
import { MCPServerLoader, MCPServerConfig } from './mcp/mcp-server-loader';
import { LSPServerManager, LSPServerConfig } from './lsp/lsp-server-manager';
import { PluginJSONLoader, PluginJSONConfig } from './plugins/plugin-json-loader';

export interface ExtensionsConfig {
  mcpServers?: MCPServerConfig[];
  lspServers?: LSPServerConfig[];
  plugins?: PluginJSONConfig[];
}

export interface ExtensionStatus {
  mcp: { total: number; running: number; error: number };
  lsp: { total: number; running: number; error: number };
  plugins: { total: number; activated: number; error: number };
}

export class ExtensionManager extends EventEmitter {
  private mcpLoader: MCPServerLoader;
  private lspManager: LSPServerManager;
  private pluginLoader: PluginJSONLoader;
  private watchTimers: NodeJS.Timeout[] = [];
  private loadedDirs: Set<string> = new Set();
  private masterConfigPath?: string;

  constructor(private config?: { autoReload?: boolean; watchIntervalMs?: number }) {
    super();
    this.mcpLoader = new MCPServerLoader(config);
    this.lspManager = new LSPServerManager();
    this.pluginLoader = new PluginJSONLoader();

    // Forward events from sub-managers
    this.mcpLoader.on('server-started', (e) => this.emit('mcp-server-started', e));
    this.mcpLoader.on('server-error', (e) => this.emit('mcp-server-error', e));
    this.lspManager.on('server-initialized', (e) => this.emit('lsp-server-initialized', e));
    this.lspManager.on('diagnostics-updated', (e) => this.emit('lsp-diagnostics', e));
    this.pluginLoader.on('plugin-activated', (e) => this.emit('plugin-activated', e));
    this.pluginLoader.on('plugin-error', (e) => this.emit('plugin-error', e));
  }

  // ─── Load from master JSON config ─────────────────────────────────────────

  loadMasterConfig(configPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    try {
      const content = readFileSync(configPath, 'utf-8');
      const data: ExtensionsConfig = JSON.parse(content);

      if (data.mcpServers) {
        for (const server of data.mcpServers) {
          if (this.mcpLoader.loadFromObject(server)) loaded++; else errors++;
        }
      }
      if (data.lspServers) {
        for (const server of data.lspServers) {
          if (this.lspManager.loadFromObject(server)) loaded++; else errors++;
        }
      }
      if (data.plugins) {
        for (const plugin of data.plugins) {
          if (this.pluginLoader.loadFromObject(plugin)) loaded++; else errors++;
        }
      }

      this.masterConfigPath = configPath;
      this.emit('master-config-loaded', { path: configPath, loaded, errors });
    } catch (error) {
      this.emit('master-config-error', { path: configPath, error });
      errors++;
    }
    return { loaded, errors };
  }

  // ─── Load from directories ────────────────────────────────────────────────

  loadMCPFromDirectory(dirPath: string): { loaded: number; errors: number } {
    return this.mcpLoader.loadFromDirectory(dirPath);
  }

  loadLSPFromDirectory(dirPath: string): { loaded: number; errors: number } {
    return this.lspManager.loadFromDirectory(dirPath);
  }

  loadPluginsFromDirectory(dirPath: string): { loaded: number; errors: number } {
    return this.pluginLoader.loadFromDirectory(dirPath);
  }

  loadAllFromDirectory(dirPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    const mcpDir = join(dirPath, 'mcp');
    const lspDir = join(dirPath, 'lsp');
    const pluginsDir = join(dirPath, 'plugins');

    if (existsSync(mcpDir)) { const r = this.mcpLoader.loadFromDirectory(mcpDir); loaded += r.loaded; errors += r.errors; }
    if (existsSync(lspDir)) { const r = this.lspManager.loadFromDirectory(lspDir); loaded += r.loaded; errors += r.errors; }
    if (existsSync(pluginsDir)) { const r = this.pluginLoader.loadFromDirectory(pluginsDir); loaded += r.loaded; errors += r.errors; }

    this.loadedDirs.add(dirPath);
    return { loaded, errors };
  }

  // ─── Load from JSON string ────────────────────────────────────────────────

  loadMCPFromString(json: string): { loaded: number; errors: number } { return this.mcpLoader.loadFromString(json); }
  loadLSPFromString(json: string): { loaded: number; errors: number } { return this.lspManager.loadFromString(json); }
  loadPluginsFromString(json: string): { loaded: number; errors: number } { return this.pluginLoader.loadFromString(json); }

  loadFromString(json: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    try {
      const data: ExtensionsConfig = JSON.parse(json);
      if (data.mcpServers) { for (const s of data.mcpServers) { if (this.mcpLoader.loadFromObject(s)) loaded++; else errors++; } }
      if (data.lspServers) { for (const s of data.lspServers) { if (this.lspManager.loadFromObject(s)) loaded++; else errors++; } }
      if (data.plugins) { for (const p of data.plugins) { if (this.pluginLoader.loadFromObject(p)) loaded++; else errors++; } }
    } catch { errors++; }
    return { loaded, errors };
  }

  // ─── Start/Stop servers ───────────────────────────────────────────────────

  async startAllMCPServers(): Promise<{ started: number; failed: number }> {
    let started = 0, failed = 0;
    for (const server of this.mcpLoader.getAllServers()) {
      if (server.config.autoStart !== false) {
        if (await this.mcpLoader.startServer(server.config.name)) started++; else failed++;
      }
    }
    return { started, failed };
  }

  async startAllLSPServers(): Promise<{ started: number; failed: number }> {
    let started = 0, failed = 0;
    for (const server of this.lspManager.getAllServers()) {
      if (server.config.autoStart !== false) {
        if (await this.lspManager.startServer(server.config.name)) started++; else failed++;
      }
    }
    return { started, failed };
  }

  async activateAllPlugins(): Promise<{ activated: number; failed: number }> {
    let activated = 0, failed = 0;
    for (const plugin of this.pluginLoader.getAllPlugins()) {
      if (plugin.status === 'registered') {
        if (await this.pluginLoader.activatePlugin(plugin.config.name)) activated++; else failed++;
      }
    }
    return { activated, failed };
  }

  async startAll(): Promise<void> {
    await this.startAllMCPServers();
    await this.startAllLSPServers();
    await this.activateAllPlugins();
    this.emit('all-started');
  }

  async stopAll(): Promise<void> {
    for (const server of this.mcpLoader.getRunningServers()) await this.mcpLoader.stopServer(server.config.name);
    for (const server of this.lspManager.getRunningServers()) await this.lspManager.stopServer(server.config.name);
    for (const plugin of this.pluginLoader.getActivatedPlugins()) await this.pluginLoader.deactivatePlugin(plugin.config.name);
    this.emit('all-stopped');
  }

  // ─── Hot reload ───────────────────────────────────────────────────────────

  async reloadAll(): Promise<void> {
    await this.stopAll();
    this.mcpLoader.destroy();
    this.lspManager.destroy();
    this.pluginLoader.destroy();
    for (const dir of this.loadedDirs) this.loadAllFromDirectory(dir);
    if (this.masterConfigPath) this.loadMasterConfig(this.masterConfigPath);
    await this.startAll();
    this.emit('all-reloaded');
  }

  // ─── Query methods ────────────────────────────────────────────────────────

  getStatus(): ExtensionStatus {
    const mcpStats = this.mcpLoader.getStats();
    const lspStats = this.lspManager.getStats();
    const pluginStats = this.pluginLoader.getStats();
    return {
      mcp: { total: mcpStats.totalServers, running: mcpStats.running, error: mcpStats.error },
      lsp: { total: lspStats.totalServers, running: lspStats.running, error: 0 },
      plugins: { total: pluginStats.totalPlugins, activated: pluginStats.activated, error: pluginStats.error },
    };
  }

  getAllTools(): { source: string; name: string; type: 'mcp' | 'lsp' | 'plugin'; description: string }[] {
    const tools: { source: string; name: string; type: 'mcp' | 'lsp' | 'plugin'; description: string }[] = [];
    for (const { server, tool } of this.mcpLoader.getAllTools()) {
      tools.push({ source: server, name: tool.name, type: 'mcp', description: tool.description });
    }
    return tools;
  }

  findTool(toolName: string): { source: string; type: string } | null {
    const mcpTool = this.mcpLoader.findTool(toolName);
    if (mcpTool) return { source: mcpTool.server, type: 'mcp' };
    return null;
  }

  getServerForFile(filePath: string): { type: 'mcp' | 'lsp'; name: string } | null {
    const lspServer = this.lspManager.getServerForFile(filePath);
    if (lspServer) return { type: 'lsp', name: lspServer.config.name };
    return null;
  }

  getMCPLoader(): MCPServerLoader { return this.mcpLoader; }
  getLSPManager(): LSPServerManager { return this.lspManager; }
  getPluginLoader(): PluginJSONLoader { return this.pluginLoader; }

  exportConfig(): string {
    return JSON.stringify({
      mcpServers: [...this.mcpLoader.getAllServers()].map(s => s.config),
      lspServers: [...this.lspManager.getAllServers()].map(s => s.config),
      plugins: [...this.pluginLoader.getAllPlugins()].map(p => p.config),
    }, null, 2);
  }

  destroy(): void {
    this.mcpLoader.destroy();
    this.lspManager.destroy();
    this.pluginLoader.destroy();
    for (const timer of this.watchTimers) clearInterval(timer);
    this.watchTimers = [];
    this.loadedDirs.clear();
    this.removeAllListeners();
  }
}
