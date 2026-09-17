export class NovaError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'NovaError';
    this.code = code;
    this.details = details;
  }
}

export class AIProviderError extends NovaError {
  provider: string;
  statusCode?: number;

  constructor(message: string, provider: string, statusCode?: number, details?: unknown) {
    super(message, 'AI_PROVIDER_ERROR', details);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class AgentError extends NovaError {
  agentId: string;

  constructor(message: string, agentId: string, details?: unknown) {
    super(message, 'AGENT_ERROR', details);
    this.name = 'AgentError';
    this.agentId = agentId;
  }
}

export class MCPError extends NovaError {
  serverName: string;
  toolName: string;

  constructor(message: string, serverName: string, toolName: string, details?: unknown) {
    super(message, 'MCP_ERROR', details);
    this.name = 'MCPError';
    this.serverName = serverName;
    this.toolName = toolName;
  }
}

export class BrowserError extends NovaError {
  url?: string;

  constructor(message: string, url?: string, details?: unknown) {
    super(message, 'BROWSER_ERROR', details);
    this.name = 'BrowserError';
    this.url = url;
  }
}
