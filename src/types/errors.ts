export class NovaError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'NovaError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
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

export function createNovaError(type: string, message: string, details?: unknown): NovaError {
  switch (type) {
    case 'AI_PROVIDER_ERROR':
      return new AIProviderError(message, 'unknown', undefined, details);
    case 'AGENT_ERROR':
      return new AgentError(message, 'unknown', details);
    case 'MCP_ERROR':
      return new MCPError(message, 'unknown', 'unknown', details);
    case 'BROWSER_ERROR':
      return new BrowserError(message, undefined, details);
    default:
      return new NovaError(message, type, details);
  }
}
