export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type ErrorCategory =
  | 'file-system'
  | 'network'
  | 'permission'
  | 'syntax'
  | 'type'
  | 'runtime'
  | 'api'
  | 'build'
  | 'unknown';

export interface ErrorContext {
  file?: string;
  line?: number;
  column?: number;
  operation?: string;
  timestamp?: Date;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface FormattedError {
  title: string;
  message: string;
  category: ErrorCategory;
  suggestion: string;
  context?: ErrorContext;
  stack?: string;
  timestamp: Date;
  severity: ErrorSeverity;
}

const SEVERITY_MAP: Record<string, ErrorSeverity> = {
  EACCES: 'fatal',
  ENOENT: 'error',
  EEXIST: 'error',
  ECONNREFUSED: 'error',
  ETIMEDOUT: 'error',
  ENOTFOUND: 'error',
  SyntaxError: 'error',
  TypeError: 'error',
  ReferenceError: 'error',
  RangeError: 'warning',
};

const CATEGORY_KEYWORDS: Record<ErrorCategory, string[]> = {
  'file-system': ['ENOENT', 'EACCES', 'EEXIST', 'ENOTDIR', 'EISDIR', 'EMFILE', 'file', 'directory', 'path', 'fs'],
  network: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'fetch', 'network', 'connect', 'timeout', 'socket'],
  permission: ['EACCES', 'EPERM', 'permission', 'denied', 'unauthorized', 'forbidden'],
  syntax: ['SyntaxError', 'unexpected token', 'unexpected end', 'invalid syntax', 'parse error'],
  type: ['TypeError', 'Type', 'cannot read', 'not a function', 'undefined is not'],
  runtime: ['ReferenceError', 'RangeError', 'stack', 'crash', 'segfault', 'heap'],
  api: ['api', 'provider', 'rate limit', 'quota', '401', '403', '429', '500'],
  build: ['build', 'compile', 'tsc', 'webpack', 'esbuild', 'rollup', 'vite'],
  unknown: [],
};

const SUGGESTIONS: Record<ErrorCategory, string> = {
  'file-system': 'Check that the file path exists and you have the necessary permissions.',
  network: 'Verify your network connection and that the target service is available.',
  permission: 'Run with appropriate permissions or check file/directory access rights.',
  syntax: 'Review the code around the indicated location for syntax errors.',
  type: 'Check the types of variables and ensure they match expected signatures.',
  runtime: 'Review the stack trace and check for null references or out-of-bounds access.',
  api: 'Check API credentials, rate limits, and endpoint availability.',
  build: 'Review build configuration and source files for compilation errors.',
  unknown: 'Check logs for additional details.',
};

export class ErrorFormatter {
  formatError(error: Error, context?: ErrorContext): FormattedError {
    const category = this.getErrorCategory(error);
    const severity = this.deriveSeverity(error);
    const suggestion = SUGGESTIONS[category] || SUGGESTIONS.unknown;

    return {
      title: error.name || 'Error',
      message: error.message,
      category,
      suggestion,
      context,
      stack: error.stack,
      timestamp: new Date(),
      severity,
    };
  }

  formatToolError(toolName: string, error: string, args: any): FormattedError {
    const category = this.categorizeMessage(error);
    return {
      title: `Tool Error: ${toolName}`,
      message: error,
      category,
      suggestion: this.getSuggestionForCategory(category),
      context: {
        operation: `Tool "${toolName}"`,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      severity: 'error',
    };
  }

  formatCommandError(command: string, stderr: string, exitCode: number): FormattedError {
    const category = this.categorizeMessage(stderr);
    const lines = stderr.split('\n').filter(Boolean);
    const firstLine = lines[0] || 'Command failed';

    return {
      title: `Command Failed (exit code ${exitCode})`,
      message: firstLine,
      category,
      suggestion: this.getSuggestionForCategory(category),
      context: {
        operation: command,
        timestamp: new Date(),
      },
      stack: lines.length > 1 ? lines.slice(1).join('\n') : undefined,
      timestamp: new Date(),
      severity: exitCode > 1 ? 'fatal' : 'error',
    };
  }

  formatApiError(provider: string, status: number, message: string): FormattedError {
    let severity: ErrorSeverity = 'error';
    let suggestion = `Verify your ${provider} API credentials and rate limits.`;

    if (status === 429) {
      severity = 'warning';
      suggestion = `Rate limited by ${provider}. Wait before retrying.`;
    } else if (status === 401 || status === 403) {
      severity = 'fatal';
      suggestion = `Invalid or expired ${provider} credentials. Re-authenticate.`;
    } else if (status >= 500) {
      suggestion = `${provider} is experiencing issues. Try again later.`;
    }

    return {
      title: `${provider} API Error (${status})`,
      message,
      category: 'api',
      suggestion,
      context: { operation: `${provider} API`, timestamp: new Date() },
      timestamp: new Date(),
      severity,
    };
  }

  formatValidationError(errors: ValidationError[]): FormattedError {
    const details = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    return {
      title: `Validation Failed (${errors.length} issue${errors.length > 1 ? 's' : ''})`,
      message: details,
      category: 'type',
      suggestion: 'Review the highlighted fields and correct the validation errors.',
      context: { timestamp: new Date() },
      timestamp: new Date(),
      severity: 'warning',
    };
  }

  formatBuildError(output: string): FormattedError {
    const lines = output.split('\n').filter(Boolean);
    const firstLine = lines[0] || 'Build failed';
    return {
      title: 'Build Error',
      message: firstLine,
      category: 'build',
      suggestion: 'Check the build output for compilation or configuration errors.',
      context: { operation: 'build', timestamp: new Date() },
      stack: lines.slice(1).join('\n') || undefined,
      timestamp: new Date(),
      severity: 'error',
    };
  }

  formatRuntimeError(error: string, stack?: string): FormattedError {
    return {
      title: 'Runtime Error',
      message: error,
      category: 'runtime',
      suggestion: 'Review the stack trace and the referenced source locations.',
      stack,
      context: { timestamp: new Date() },
      timestamp: new Date(),
      severity: 'error',
    };
  }

  getSuggestion(error: FormattedError): string {
    return error.suggestion;
  }

  getErrorCategory(error: Error): ErrorCategory {
    const text = `${error.name} ${error.message}`;
    return this.categorizeMessage(text);
  }

  renderError(error: FormattedError): string {
    const severityIcon = this.severityIcon(error.severity);
    const lines = [
      `${severityIcon} **${error.title}**`,
      '',
      error.message,
      '',
      `Category: \`${error.category}\``,
      '',
      `> Suggestion: ${error.suggestion}`,
    ];

    if (error.context?.file) {
      lines.push('', `File: \`${error.context.file}\``);
    }
    if (error.context?.line) {
      lines.push(`Line: ${error.context.line}${error.context.column ? `:${error.context.column}` : ''}`);
    }
    if (error.stack) {
      lines.push('', '<details><summary>Stack Trace</summary>', '', '```', error.stack, '```', '</details>');
    }

    return lines.join('\n');
  }

  renderErrorToast(error: FormattedError): string {
    const icon = this.severityIcon(error.severity);
    return `${icon} ${error.title}: ${error.message}`;
  }

  private deriveSeverity(error: Error): ErrorSeverity {
    return SEVERITY_MAP[error.name] ?? 'error';
  }

  private categorizeMessage(text: string): ErrorCategory {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ErrorCategory, string[]][]) {
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return category;
      }
    }
    return 'unknown';
  }

  private getSuggestionForCategory(category: ErrorCategory): string {
    return SUGGESTIONS[category] || SUGGESTIONS.unknown;
  }

  private severityIcon(severity: ErrorSeverity): string {
    switch (severity) {
      case 'fatal': return '\u274c';
      case 'error': return '\u26a0\ufe0f';
      case 'warning': return '\u26a0\ufe0f';
      case 'info': return '\u2139\ufe0f';
      default: return '\u26a0\ufe0f';
    }
  }
}
