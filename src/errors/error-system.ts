export enum ErrorCode {
  // Agent errors (1xxx)
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_CRASHED = 'AGENT_CRASHED',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_BUSY = 'AGENT_BUSY',
  AGENT_RATE_LIMITED = 'AGENT_RATE_LIMITED',
  AGENT_PERMISSION_DENIED = 'AGENT_PERMISSION_DENIED',

  // Sandbox errors (2xxx)
  SANDBOX_VIOLATION = 'SANDBOX_VIOLATION',
  SANDBOX_MEMORY_EXCEEDED = 'SANDBOX_MEMORY_EXCEEDED',
  SANDBOX_NETWORK_BLOCKED = 'SANDBOX_NETWORK_BLOCKED',
  SANDBOX_FILE_ACCESS_DENIED = 'SANDBOX_FILE_ACCESS_DENIED',

  // Template errors (3xxx)
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_INVALID = 'TEMPLATE_INVALID',
  TEMPLATE_VALIDATION_FAILED = 'TEMPLATE_VALIDATION_FAILED',

  // Session errors (4xxx)
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_LIMIT_EXCEEDED = 'SESSION_LIMIT_EXCEEDED',

  // Security errors (5xxx)
  SECURITY_AUDIT_FAILED = 'SECURITY_AUDIT_FAILED',
  SECURITY_SECRET_ACCESS_DENIED = 'SECURITY_SECRET_ACCESS_DENIED',
  SECURITY_BUDGET_EXCEEDED = 'SECURITY_BUDGET_EXCEEDED',

  // Extension errors (6xxx)
  MCP_SERVER_ERROR = 'MCP_SERVER_ERROR',
  LSP_SERVER_ERROR = 'LSP_SERVER_ERROR',
  PLUGIN_ACTIVATION_FAILED = 'PLUGIN_ACTIVATION_FAILED',

  // System errors (9xxx)
  SYSTEM_INTERNAL_ERROR = 'SYSTEM_INTERNAL_ERROR',
  SYSTEM_OUT_OF_MEMORY = 'SYSTEM_OUT_OF_MEMORY',
  SYSTEM_DISK_FULL = 'SYSTEM_DISK_FULL',
  SYSTEM_CONFIG_INVALID = 'SYSTEM_CONFIG_INVALID',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  correlationId?: string;
  agentId?: string;
  sessionId?: string;
  retryable: boolean;
  stack?: string;
}

export class AppErrorFactory {
  static create(code: ErrorCode, message: string, details?: Record<string, any>): AppError {
    const error = new Error(message);
    return {
      code, message, details: details || {}, timestamp: new Date(), retryable: AppErrorFactory.isRetryable(code),
      stack: error.stack,
    };
  }

  static agentTimeout(agentId: string, timeoutMs: number): AppError {
    return AppErrorFactory.create(ErrorCode.AGENT_TIMEOUT, `Agent ${agentId} timed out after ${timeoutMs}ms`, { agentId, timeoutMs });
  }

  static agentCrashed(agentId: string, reason: string): AppError {
    return AppErrorFactory.create(ErrorCode.AGENT_CRASHED, `Agent ${agentId} crashed: ${reason}`, { agentId, reason });
  }

  static sandboxViolation(agentId: string, action: string): AppError {
    return AppErrorFactory.create(ErrorCode.SANDBOX_VIOLATION, `Agent ${agentId} violated sandbox: ${action}`, { agentId, action });
  }

  static templateNotFound(templateId: string): AppError {
    return AppErrorFactory.create(ErrorCode.TEMPLATE_NOT_FOUND, `Template not found: ${templateId}`, { templateId });
  }

  static sessionNotFound(sessionId: string): AppError {
    return AppErrorFactory.create(ErrorCode.SESSION_NOT_FOUND, `Session not found: ${sessionId}`, { sessionId });
  }

  static budgetExceeded(agentId: string, budget: number, actual: number): AppError {
    return AppErrorFactory.create(ErrorCode.SECURITY_BUDGET_EXCEEDED, `Budget exceeded for ${agentId}: ${actual}/${budget}`, { agentId, budget, actual });
  }

  static mcpServerError(serverName: string, error: string): AppError {
    return AppErrorFactory.create(ErrorCode.MCP_SERVER_ERROR, `MCP server ${serverName} error: ${error}`, { serverName, error });
  }

  static internalError(message: string, details?: Record<string, any>): AppError {
    return AppErrorFactory.create(ErrorCode.SYSTEM_INTERNAL_ERROR, message, details);
  }

  private static isRetryable(code: ErrorCode): boolean {
    const retryableCodes = [
      ErrorCode.AGENT_TIMEOUT, ErrorCode.AGENT_BUSY, ErrorCode.AGENT_RATE_LIMITED,
      ErrorCode.MCP_SERVER_ERROR, ErrorCode.LSP_SERVER_ERROR,
    ];
    return retryableCodes.includes(code);
  }
}

export class ErrorHandler {
  private errors: AppError[] = [];
  private maxErrors = 10000;
  private errorCounts: Map<ErrorCode, number> = new Map();

  handle(error: AppError): void {
    this.errors.push(error);
    if (this.errors.length > this.maxErrors) this.errors.shift();
    this.errorCounts.set(error.code, (this.errorCounts.get(error.code) || 0) + 1);
  }

  getRecentErrors(limit?: number): AppError[] { return this.errors.slice(-(limit || 100)); }
  getErrorCount(code: ErrorCode): number { return this.errorCounts.get(code) || 0; }
  getErrorStats(): Record<string, number> { return Object.fromEntries(this.errorCounts); }
  getRetryableErrors(): AppError[] { return this.errors.filter(e => e.retryable); }
  clear(): void { this.errors = []; this.errorCounts.clear(); }
}
