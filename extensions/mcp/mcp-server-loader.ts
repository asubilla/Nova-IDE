import { EventEmitter } from 'events';
import { readFileSync, readdirSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join, resolve } from 'path';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  restartOnFailure?: boolean;
  maxRestarts?: number;
  autoStart?: boolean;
  tools?: MCPToolDefinition[];
  resources?: MCPResourceDefinition[];
  prompts?: MCPPromptDefinition[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  annotations?: Record<string, any>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface MCPServerInstance {
  config: MCPServerConfig;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'restarting';
  pid?: number;
  startedAt?: Date;
  restartCount: number;
  lastError?: string;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
  prompts: MCPPromptDefinition[];
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export class MCPServerLoader extends EventEmitter {
  private servers: Map<string, MCPServerInstance> = new Map();
  private configPaths: Set<string> = new Set();
  private watchTimers: NodeJS.Timeout[] = [];
  private requestId = 0;

  constructor(private config?: { autoReload?: boolean; watchIntervalMs?: number }) { super(); }

  loadFromJSON(jsonPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    try {
      const content = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      const servers: MCPServerConfig[] = data.mcpServers || data.servers || (Array.isArray(data) ? data : [data]);
      for (const serverConfig of servers) {
        const result = this.registerServer(serverConfig);
        if (result) loaded++; else errors++;
      }
      this.configPaths.add(jsonPath);
      if (this.config?.autoReload) this.watchConfig(jsonPath);
    } catch (error) {
      this.emit('config-error', { path: jsonPath, error });
      errors++;
    }
    return { loaded, errors };
  }

  loadFromDirectory(dirPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    if (!existsSync(dirPath)) return { loaded: 0, errors: 1 };
    const files = readdirSync(dirPath).filter(f => f.endsWith('.json') || f.endsWith('.jsonc'));
    for (const file of files) {
      const result = this.loadFromJSON(join(dirPath, file));
      loaded += result.loaded; errors += result.errors;
    }
    return { loaded, errors };
  }

  loadFromObject(config: MCPServerConfig): boolean {
    return this.registerServer(config);
  }

  loadFromString(jsonString: string): { loaded: number; errors: number } {
    try {
      const data = JSON.parse(jsonString);
      const servers: MCPServerConfig[] = data.mcpServers || data.servers || (Array.isArray(data) ? data : [data]);
      let loaded = 0, errors = 0;
      for (const serverConfig of servers) {
        if (this.registerServer(serverConfig)) loaded++; else errors++;
      }
      return { loaded, errors };
    } catch (error) {
      return { loaded: 0, errors: 1 };
    }
  }

  private registerServer(config: MCPServerConfig): boolean {
    if (!config.name || !config.command) return false;
    if (this.servers.has(config.name)) {
      this.emit('server-overwrite', { name: config.name });
    }
    const instance: MCPServerInstance = {
      config, status: 'stopped', restartCount: 0,
      tools: config.tools || [], resources: config.resources || [], prompts: config.prompts || [],
    };
    this.servers.set(config.name, instance);
    this.emit('server-registered', { name: config.name });
    return true;
  }

  async startServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server) return false;
    if (server.status === 'running') return true;

    server.status = 'starting';
    this.emit('server-starting', { name });

    try {
      // In real implementation, this would spawn the MCP server process
      // For now, we simulate the connection
      server.status = 'running';
      server.startedAt = new Date();
      server.pid = Math.floor(Math.random() * 100000);

      // Discover tools from the server
      await this.discoverServerCapabilities(server);

      this.emit('server-started', { name, pid: server.pid });
      return true;
    } catch (error) {
      server.status = 'error';
      server.lastError = (error as Error).message;
      this.emit('server-error', { name, error: server.lastError });

      if (server.config.restartOnFailure && server.restartCount < (server.config.maxRestarts || 3)) {
        await this.restartServer(name);
      }
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

  async restartServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server) return false;

    server.status = 'restarting';
    server.restartCount++;
    this.emit('server-restarting', { name, restartCount: server.restartCount });

    await this.stopServer(name);
    await new Promise(r => setTimeout(r, 1000));
    return this.startServer(name);
  }

  private async discoverServerCapabilities(server: MCPServerInstance): Promise<void> {
    // In real implementation, this would send MCP initialize request
    // and then tools/list, resources/list, prompts/list
    // For now, we use the config-defined tools
    this.emit('capabilities-discovered', {
      name: server.config.name,
      tools: server.tools.length,
      resources: server.resources.length,
      prompts: server.prompts.length,
    });
  }

  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') throw new Error(`Server ${serverName} not running`);

    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found on server ${serverName}`);

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    this.emit('tool-call', { serverName, toolName, args, requestId: request.id });

    // In real implementation, this would send to the MCP server process
    // For now, simulate response
    return { content: [{ type: 'text', text: `Result from ${toolName}` }] };
  }

  async readResource(serverName: string, uri: string): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') throw new Error(`Server ${serverName} not running`);

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'resources/read',
      params: { uri },
    };

    this.emit('resource-read', { serverName, uri, requestId: request.id });
    return { contents: [{ uri, mimeType: 'text/plain', text: 'Resource content' }] };
  }

  async getPrompt(serverName: string, promptName: string, args?: Record<string, string>): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') throw new Error(`Server ${serverName} not running`);

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'prompts/get',
      params: { name: promptName, arguments: args },
    };

    this.emit('prompt-get', { serverName, promptName, requestId: request.id });
    return { description: `Prompt: ${promptName}`, messages: [] };
  }

  private watchConfig(jsonPath: string): void {
    const timer = setInterval(() => {
      if (existsSync(jsonPath)) {
        this.loadFromJSON(jsonPath);
      }
    }, this.config?.watchIntervalMs || 10000);
    this.watchTimers.push(timer);
  }

  getServer(name: string): MCPServerInstance | undefined { return this.servers.get(name); }
  getAllServers(): MCPServerInstance[] { return [...this.servers.values()]; }
  getRunningServers(): MCPServerInstance[] { return [...this.servers.values()].filter(s => s.status === 'running'); }
  getServerNames(): string[] { return [...this.servers.keys()]; }

  getAllTools(): { server: string; tool: MCPToolDefinition }[] {
    const tools: { server: string; tool: MCPToolDefinition }[] = [];
    for (const [name, server] of this.servers) {
      for (const tool of server.tools) tools.push({ server: name, tool });
    }
    return tools;
  }

  findTool(toolName: string): { server: string; tool: MCPToolDefinition } | null {
    for (const [name, server] of this.servers) {
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) return { server: name, tool };
    }
    return null;
  }

  getAllResources(): { server: string; resource: MCPResourceDefinition }[] {
    const resources: { server: string; resource: MCPResourceDefinition }[] = [];
    for (const [name, server] of this.servers) {
      for (const resource of server.resources) resources.push({ server: name, resource });
    }
    return resources;
  }

  getAllPrompts(): { server: string; prompt: MCPPromptDefinition }[] {
    const prompts: { server: string; prompt: MCPPromptDefinition }[] = [];
    for (const [name, server] of this.servers) {
      for (const prompt of server.prompts) prompts.push({ server: name, prompt });
    }
    return prompts;
  }

  removeServer(name: string): boolean {
    const server = this.servers.get(name);
    if (server) {
      if (server.status === 'running') this.stopServer(name);
      this.servers.delete(name);
      this.emit('server-removed', { name });
      return true;
    }
    return false;
  }

  exportConfig(): string {
    const servers = [...this.servers.values()].map(s => s.config);
    return JSON.stringify({ mcpServers: servers }, null, 2);
  }

  getStats(): { totalServers: number; running: number; stopped: number; error: number; totalTools: number; totalResources: number; totalPrompts: number } {
    let running = 0, stopped = 0, error = 0, totalTools = 0, totalResources = 0, totalPrompts = 0;
    for (const server of this.servers.values()) {
      if (server.status === 'running') running++;
      else if (server.status === 'error') error++;
      else stopped++;
      totalTools += server.tools.length;
      totalResources += server.resources.length;
      totalPrompts += server.prompts.length;
    }
    return { totalServers: this.servers.size, running, stopped, error, totalTools, totalResources, totalPrompts };
  }

  destroy(): void {
    for (const timer of this.watchTimers) clearInterval(timer);
    this.watchTimers = [];
    for (const server of this.servers.values()) {
      if (server.status === 'running') server.status = 'stopped';
    }
    this.servers.clear();
    this.configPaths.clear();
    this.removeAllListeners();
  }
}
