import { SystemLogger, type LogEntry } from './system-logger';

export interface ExtensionStats {
  totalExtensionsLoaded: number;
  totalMCPConnections: number;
  totalLSPConnections: number;
  totalPluginsLoaded: number;
  totalMCPRequests: number;
  totalLSPRequests: number;
  avgMCPRequestDuration: number;
  avgLSPRequestDuration: number;
  mcpErrorCount: number;
  lspDiagnosticCount: number;
  extensionErrorCount: number;
}

export class ExtensionLogger {
  private mcpDurations: number[] = [];
  private lspDurations: number[] = [];

  constructor(private readonly systemLogger: SystemLogger) {}

  logExtensionLoad(extensionId: string, version: string): LogEntry {
    return this.systemLogger.info('extension', `Extension loaded: ${extensionId}@${version}`, {
      extensionId,
      version,
    });
  }

  logExtensionUnload(extensionId: string): LogEntry {
    return this.systemLogger.info('extension', `Extension unloaded: ${extensionId}`, {
      extensionId,
    });
  }

  logExtensionError(extensionId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    return this.systemLogger.error('extension', `Extension error: ${extensionId}: ${errorMsg}`, {
      extensionId,
      error: errorMsg,
      stack,
    });
  }

  logExtensionCommand(extensionId: string, command: string): LogEntry {
    return this.systemLogger.info('extension', `Extension command: ${extensionId} -> ${command}`, {
      extensionId,
      command,
    });
  }

  logMCPConnection(serverId: string, status: 'connected' | 'disconnected' | 'error'): LogEntry {
    const level = status === 'connected' ? 'info' : status === 'disconnected' ? 'warn' : 'error';
    return this.systemLogger[level]('mcp', `MCP ${status}: ${serverId}`, {
      serverId,
      status,
    });
  }

  logMCPRequest(serverId: string, method: string, duration: number): LogEntry {
    this.mcpDurations.push(duration);
    const entry = this.systemLogger.info('mcp', `MCP request: ${method} on ${serverId} (${duration}ms)`, {
      serverId,
      method,
      duration,
    });
    entry.duration = duration;
    return entry;
  }

  logMCPError(serverId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    return this.systemLogger.error('mcp', `MCP error: ${serverId}: ${errorMsg}`, {
      serverId,
      error: errorMsg,
      stack,
    });
  }

  logLSPConnection(serverId: string, language: string): LogEntry {
    return this.systemLogger.info('lsp', `LSP connected: ${serverId} (${language})`, {
      serverId,
      language,
    });
  }

  logLSPRequest(serverId: string, method: string, duration: number): LogEntry {
    this.lspDurations.push(duration);
    const entry = this.systemLogger.info('lsp', `LSP request: ${method} on ${serverId} (${duration}ms)`, {
      serverId,
      method,
      duration,
    });
    entry.duration = duration;
    return entry;
  }

  logLSPDiagnostic(serverId: string, diagnostics: Record<string, unknown>): LogEntry {
    return this.systemLogger.info('lsp', `LSP diagnostics: ${serverId}`, {
      serverId,
      diagnostics,
    });
  }

  logPluginLoad(pluginId: string): LogEntry {
    return this.systemLogger.info('plugin', `Plugin loaded: ${pluginId}`, {
      pluginId,
    });
  }

  logPluginExecute(pluginId: string, command: string, result?: Record<string, unknown>): LogEntry {
    return this.systemLogger.info('plugin', `Plugin executed: ${pluginId} -> ${command}`, {
      pluginId,
      command,
      result,
    });
  }

  logTemplateUse(templateId: string, agentId: string): LogEntry {
    return this.systemLogger.info('template', `Template used: ${templateId} by ${agentId}`, {
      templateId,
      agentId,
    });
  }

  getExtensionLogs(extensionId: string): LogEntry[] {
    return this.systemLogger.getLogs({ search: extensionId });
  }

  getExtensionStats(): ExtensionStats {
    const allLogs = this.systemLogger.getLogs();
    const extensionsLoaded = allLogs.filter((l) => l.message.startsWith('Extension loaded:'));
    const mcpConnections = allLogs.filter((l) => l.message.startsWith('MCP '));
    const lspConnections = allLogs.filter((l) => l.message.startsWith('LSP '));
    const pluginsLoaded = allLogs.filter((l) => l.message.startsWith('Plugin loaded:'));
    const mcpRequests = allLogs.filter((l) => l.message.startsWith('MCP request:'));
    const lspRequests = allLogs.filter((l) => l.message.startsWith('LSP request:'));
    const mcpErrors = allLogs.filter((l) => l.message.startsWith('MCP error:'));
    const lspDiags = allLogs.filter((l) => l.message.startsWith('LSP diagnostics:'));
    const extErrors = allLogs.filter((l) => l.message.startsWith('Extension error:'));

    return {
      totalExtensionsLoaded: extensionsLoaded.length,
      totalMCPConnections: mcpConnections.length,
      totalLSPConnections: lspConnections.length,
      totalPluginsLoaded: pluginsLoaded.length,
      totalMCPRequests: mcpRequests.length,
      totalLSPRequests: lspRequests.length,
      avgMCPRequestDuration: this.mcpDurations.length > 0
        ? this.mcpDurations.reduce((a, b) => a + b, 0) / this.mcpDurations.length
        : 0,
      avgLSPRequestDuration: this.lspDurations.length > 0
        ? this.lspDurations.reduce((a, b) => a + b, 0) / this.lspDurations.length
        : 0,
      mcpErrorCount: mcpErrors.length,
      lspDiagnosticCount: lspDiags.length,
      extensionErrorCount: extErrors.length,
    };
  }
}
