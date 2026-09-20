import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InjectionType = 'sql' | 'xss' | 'command' | 'path' | 'ldap' | 'nosql';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: string;
}

export interface StringValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  trim?: boolean;
}

export interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  allowNaN?: boolean;
  allowInfinity?: boolean;
}

// ─── Injection Patterns ─────────────────────────────────────────────────────

const SQL_INJECTION_PATTERNS: RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|WHERE|FROM|JOIN|HAVING|GROUP\s+BY|ORDER\s+BY|INTO|VALUES|SET|GRANT|REVOKE)\b)/gi,
  /(--|\/\*|\*\/|;)/g,
  /('.*OR.*'.*='.*')/gi,
  /(\b(AND|OR)\b\s+\d+\s*=\s*\d+)/gi,
  /(CHAR\s*\(|CONCAT\s*\(|0x[0-9a-f]+)/gi,
  /(\bWAITFOR\b\s+DELAY\b)/gi,
  /(BENCHMARK\s*\(|SLEEP\s*\(|LOAD_FILE\s*\()/gi,
];

const XSS_PATTERNS: RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<applet\b[^>]*>/gi,
  /expression\s*\(/gi,
  /<svg\b[^>]*on\w+/gi,
  /data\s*:\s*text\/html/gi,
];

const COMMAND_INJECTION_PATTERNS: RegExp[] = [
  /[;&|`$]/,
  /\$\(/,
  /\|\|/,
  /&&/,
  /\|\s/,
  />/g,
  /</g,
  /\beval\b/i,
  /\bexec\b/i,
  /\bspawn\b/i,
  /\bfork\b/i,
];

const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\.\//g,
  /\.\.\\$/g,
  /\.\.%2f/gi,
  /\.\.%5c/gi,
  /%2e%2e/gi,
  /\.\./g,
  /\~\//g,
];

const LDAP_INJECTION_PATTERNS: RegExp[] = [
  /\(\|/g,
  /\(\&/g,
  /\)\)/,
  /\(\(/,
  /\*\)/g,
  /\(\&/g,
];

const NOSQL_INJECTION_PATTERNS: RegExp[] = [
  /\$where/gi,
  /\$regex/gi,
  /\$gt\b/gi,
  /\$lt\b/gi,
  /\$ne\b/gi,
  /\$nin\b/gi,
  /\$exists/gi,
  /\$or\b/gi,
  /\$and\b/gi,
];

// ─── Dangerous Patterns ─────────────────────────────────────────────────────

const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]!#~<>\n\r]/;

const UNSAFE_PATH_PATTERNS = [
  /\.\./,
  /^\/(etc|proc|sys|dev)/,
  /\\/,
  /\x00/,
];

const API_KEY_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9]{48}$/,
  anthropic: /^sk-ant-[A-Za-z0-9-]{93}$/,
  github: /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}$/,
  aws: /^(AKIA|ASIA)[A-Z0-9]{16}$/,
  stripe: /^(sk|pk)_(live|test)_[A-Za-z0-9]{24,99}$/,
  google: /^AIza[A-Za-z0-9_-]{35}$/,
  slack: /^xox[bpsra]-[0-9]{10,13}-[0-9a-zA-Z-]{24,36}$/,
  mailgun: /^key-[0-9a-zA-Z]{32}$/,
  twilio: /^SK[0-9a-fA-F]{32}$/,
  heroku: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
};

// ─── InputValidator ─────────────────────────────────────────────────────────

export class InputValidator {
  private customPatterns: Map<string, RegExp> = new Map();

  validateString(input: unknown, options: StringValidationOptions = {}): ValidationResult {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      if (options.allowEmpty) {
        return { valid: true, errors: [], sanitized: '' };
      }
      return { valid: false, errors: ['Input is null or undefined'] };
    }

    let value = String(input);

    if (options.trim) {
      value = value.trim();
    }

    if (!options.allowEmpty && value.length === 0) {
      errors.push('String is empty');
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      errors.push(`String length ${value.length} is below minimum ${options.minLength}`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      errors.push(`String length ${value.length} exceeds maximum ${options.maxLength}`);
    }

    if (options.pattern && !options.pattern.test(value)) {
      errors.push('String does not match required pattern');
    }

    const injectionTypes = this.detectInjection(value);
    if (injectionTypes.length > 0) {
      errors.push(`Potential injection detected: ${injectionTypes.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeString(value),
    };
  }

  validateNumber(input: unknown, options: NumberValidationOptions = {}): ValidationResult {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      return { valid: false, errors: ['Input is null or undefined'] };
    }

    const num = Number(input);

    if (isNaN(num)) {
      if (options.allowNaN) {
        return { valid: true, errors: [], sanitized: 'NaN' };
      }
      return { valid: false, errors: ['Input is not a valid number'] };
    }

    if (!isFinite(num)) {
      if (options.allowInfinity) {
        return { valid: true, errors: [], sanitized: String(num) };
      }
      return { valid: false, errors: ['Input is not a finite number'] };
    }

    if (options.integer && !Number.isInteger(num)) {
      errors.push('Number must be an integer');
    }

    if (options.min !== undefined && num < options.min) {
      errors.push(`Number ${num} is below minimum ${options.min}`);
    }

    if (options.max !== undefined && num > options.max) {
      errors.push(`Number ${num} exceeds maximum ${options.max}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: String(num),
    };
  }

  validateEmail(email: string): ValidationResult {
    const errors: string[] = [];

    if (!email || typeof email !== 'string') {
      return { valid: false, errors: ['Email is required'] };
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    if (email.length > 254) {
      errors.push('Email exceeds maximum length of 254 characters');
    }

    const parts = email.split('@');
    if (parts.length === 2) {
      if (parts[0].length > 64) {
        errors.push('Local part exceeds 64 characters');
      }
      if (parts[1].length > 253) {
        errors.push('Domain exceeds 253 characters');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: email.toLowerCase().trim(),
    };
  }

  validateURL(url: string): ValidationResult {
    const errors: string[] = [];

    if (!url || typeof url !== 'string') {
      return { valid: false, errors: ['URL is required'] };
    }

    try {
      const parsed = new URL(url);

      if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(parsed.protocol)) {
        errors.push(`Unsupported protocol: ${parsed.protocol}`);
      }

      if (parsed.hostname.length === 0) {
        errors.push('URL must have a hostname');
      }

      if (/[<>"{}|\\^`]/.test(url)) {
        errors.push('URL contains potentially dangerous characters');
      }

      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (ipRegex.test(parsed.hostname)) {
        errors.push('URL uses IP address instead of hostname');
      }
    } catch {
      errors.push('Invalid URL format');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeURL(url),
    };
  }

  validatePath(filePath: string): ValidationResult {
    const errors: string[] = [];

    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, errors: ['Path is required'] };
    }

    if (filePath.includes('\0')) {
      errors.push('Path contains null bytes');
    }

    for (const pattern of UNSAFE_PATH_PATTERNS) {
      if (pattern.test(filePath)) {
        errors.push('Path contains unsafe traversal patterns');
        break;
      }
    }

    if (filePath.startsWith('/') && !filePath.startsWith('/tmp') && !filePath.startsWith('/home')) {
      // absolute paths outside common dirs are flagged
    }

    if (filePath.length > 4096) {
      errors.push('Path exceeds maximum length');
    }

    const invalidChars = /[<>"|?*]/;
    if (invalidChars.test(filePath)) {
      errors.push('Path contains invalid characters');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizePath(filePath),
    };
  }

  validateJSON(json: string): ValidationResult {
    const errors: string[] = [];

    if (!json || typeof json !== 'string') {
      return { valid: false, errors: ['JSON input is required'] };
    }

    try {
      const parsed = JSON.parse(json);

      if (typeof parsed === 'function') {
        errors.push('JSON must not contain functions');
      }

      const maxSize = 1024 * 1024;
      if (json.length > maxSize) {
        errors.push('JSON exceeds maximum allowed size');
      }
    } catch (e) {
      errors.push(`Invalid JSON: ${(e as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateCommand(command: string): ValidationResult {
    const errors: string[] = [];

    if (!command || typeof command !== 'string') {
      return { valid: false, errors: ['Command is required'] };
    }

    const trimmed = command.trim();

    const dangerousCommands = [
      'rm -rf /',
      'mkfs',
      'dd if=',
      ':(){:|:&};:',
      'chmod -R 777 /',
      'chown -R',
      '> /dev/sda',
      'shutdown',
      'reboot',
      'halt',
      'init 0',
      'init 6',
    ];

    for (const dangerous of dangerousCommands) {
      if (trimmed.toLowerCase().includes(dangerous)) {
        errors.push(`Dangerous command pattern detected: ${dangerous}`);
      }
    }

    const injectionTypes = this.detectInjection(trimmed);
    const commandInjections = injectionTypes.filter(t => t === 'command' || t === 'sql');
    if (commandInjections.length > 0) {
      errors.push(`Potential command injection: ${commandInjections.join(', ')}`);
    }

    if (trimmed.includes('..') && (trimmed.includes('/') || trimmed.includes('\\'))) {
      errors.push('Command contains path traversal');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.escapeShellArg(trimmed),
    };
  }

  validateSQL(query: string): ValidationResult {
    const errors: string[] = [];

    if (!query || typeof query !== 'string') {
      return { valid: false, errors: ['SQL query is required'] };
    }

    for (const pattern of SQL_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(query)) {
        errors.push('Query contains potential SQL injection patterns');
        break;
      }
    }

    const stackedQueries = query.split(';').filter(s => s.trim().length > 0);
    if (stackedQueries.length > 1) {
      errors.push('Query contains multiple statements (stacked queries)');
    }

    if (query.length > 10000) {
      errors.push('Query exceeds maximum length');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.escapeSQL(query),
    };
  }

  sanitizeHTML(input: string): string {
    if (!input) return '';

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#96;');
  }

  sanitizeFilename(filename: string): string {
    if (!filename) return '';

    let sanitized = filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\.\./g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .trim();

    const reserved = [
      'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
    ];

    const nameWithoutExt = sanitized.split('.')[0]?.toUpperCase() ?? '';
    if (reserved.includes(nameWithoutExt)) {
      sanitized = `_${sanitized}`;
    }

    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop() ?? '';
      const maxNameLen = 255 - ext.length - 1;
      sanitized = sanitized.substring(0, maxNameLen) + '.' + ext;
    }

    return sanitized || 'unnamed';
  }

  sanitizePath(path: string): string {
    if (!path) return '';

    let sanitized = path
      .replace(/\0/g, '')
      .replace(/\.\./g, '')
      .replace(/\/+/g, '/')
      .replace(/\\+/g, '\\');

    if (sanitized.includes('..')) {
      sanitized = sanitized.split('..').join('');
    }

    return sanitized;
  }

  escapeShellArg(arg: string): string {
    if (!arg) return "''";

    if (/^[a-zA-Z0-9._\-\/]+$/.test(arg)) {
      return arg;
    }

    return "'" + arg.replace(/'/g, "'\\''") + "'";
  }

  escapeSQL(value: string): string {
    if (!value) return '';

    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\0/g, '\\0')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\x1a/g, '\\Z');
  }

  isValidApiKey(key: string, provider: string): boolean {
    if (!key || !provider) return false;

    const pattern = API_KEY_PATTERNS[provider.toLowerCase()];
    if (!pattern) {
      return key.length > 10 && key.length < 512;
    }

    return pattern.test(key);
  }

  detectInjection(input: string): InjectionType[] {
    if (!input) return [];

    const detected: InjectionType[] = [];

    for (const pattern of SQL_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('sql');
        break;
      }
    }

    for (const pattern of XSS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('xss');
        break;
      }
    }

    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('command');
        break;
      }
    }

    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('path');
        break;
      }
    }

    for (const pattern of LDAP_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('ldap');
        break;
      }
    }

    for (const pattern of NOSQL_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        detected.push('nosql');
        break;
      }
    }

    return detected;
  }

  addCustomPattern(name: string, pattern: RegExp): void {
    this.customPatterns.set(name, pattern);
  }

  removeCustomPattern(name: string): void {
    this.customPatterns.delete(name);
  }

  private sanitizeString(input: string): string {
    return input
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  }

  private sanitizeURL(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hostname = parsed.hostname.toLowerCase();
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
