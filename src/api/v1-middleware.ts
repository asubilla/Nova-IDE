import { IncomingMessage, ServerResponse } from 'http';
import { apiError, generateRequestId, type ApiError } from './v1-types';

// ─── Rate Limiter Store ──────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 120,
};

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000);

// ─── API Key Store ───────────────────────────────────────────────

interface ApiKeyRecord {
  key: string;
  name: string;
  scopes: string[];
  rateLimit?: Partial<RateLimitConfig>;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const apiKeyStore = new Map<string, ApiKeyRecord>();

export function registerApiKey(key: string, name: string, scopes: string[] = ['*']): void {
  apiKeyStore.set(key, {
    key,
    name,
    scopes,
    createdAt: new Date(),
    lastUsedAt: null,
  });
}

export function revokeApiKey(key: string): boolean {
  return apiKeyStore.delete(key);
}

export function listApiKeys(): Array<Omit<ApiKeyRecord, 'key'> & { keyPreview: string }> {
  return Array.from(apiKeyStore.values()).map((k) => ({
    keyPreview: k.key.slice(0, 8) + '...' + k.key.slice(-4),
    name: k.name,
    scopes: k.scopes,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
  }));
}

// ─── Middleware: API Key Auth ─────────────────────────────────────

export function apiKeyAuth(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const url = req.url ?? '';

  // Allow health check without auth
  if (url === '/api/v1/health' || url.startsWith('/api/v1/health?')) {
    return next();
  }

  const authHeader = req.headers['authorization'] ?? '';
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const urlApiKey = (() => {
    const idx = url.indexOf('?');
    if (idx === -1) return null;
    const params = new URLSearchParams(url.slice(idx + 1));
    return params.get('api_key');
  })();

  let token: string | null = null;

  if (apiKeyHeader) {
    token = apiKeyHeader;
  } else if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (urlApiKey) {
    token = urlApiKey;
  }

  // If no key store is configured, allow all (development mode)
  if (apiKeyStore.size === 0) {
    return next();
  }

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('UNAUTHORIZED', 'API key required. Provide via Authorization: Bearer <key> or X-Api-Key header.')));
    return;
  }

  const record = apiKeyStore.get(token);
  if (!record) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('INVALID_API_KEY', 'Invalid API key.')));
    return;
  }

  record.lastUsedAt = new Date();

  // Attach key info to request for downstream use
  (req as any).__apiKey = {
    name: record.name,
    scopes: record.scopes,
  };

  next();
}

// ─── Middleware: Rate Limiting ────────────────────────────────────

export function rateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const apiKey = (req as any).__apiKey?.name as string | undefined;
  const key = apiKey ? `apikey:${apiKey}` : `ip:${ip}`;
  const now = Date.now();

  const config = DEFAULT_RATE_LIMIT;
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

  res.setHeader('X-RateLimit-Limit', config.maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetSeconds);

  if (entry.count > config.maxRequests) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(resetSeconds),
    });
    res.end(JSON.stringify(apiError('RATE_LIMITED', `Rate limit exceeded. Try again in ${resetSeconds}s.`)));
    return;
  }

  next();
}

// ─── Middleware: CORS ─────────────────────────────────────────────

const DEFAULT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Request-Id',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id',
  'Access-Control-Max-Age': '86400',
};

export function cors(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  // Set CORS headers on every response
  for (const [key, value] of Object.entries(DEFAULT_CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}

// ─── Middleware: Body Validation ──────────────────────────────────

export interface BodyValidationRules {
  required?: string[];
  optional?: string[];
  maxBodySize?: number;
}

const validationRules = new Map<string, BodyValidationRules>();

export function registerValidation(path: string, rules: BodyValidationRules): void {
  validationRules.set(path, rules);
}

export function validateBody(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') {
    return next();
  }

  const body = (req as any).body;

  if (body === undefined || body === null) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('INVALID_BODY', 'Request body is required.')));
    return;
  }

  const url = req.url ?? '';
  const path = url.split('?')[0];

  // Find matching validation rules
  for (const [pattern, rules] of validationRules.entries()) {
    if (matchPath(path, pattern)) {
      if (rules.required) {
        for (const field of rules.required) {
          if (body[field] === undefined || body[field] === null) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(apiError('MISSING_FIELD', `Required field '${field}' is missing.`)));
            return;
          }
        }
      }
      break;
    }
  }

  next();
}

function matchPath(actual: string, pattern: string): boolean {
  const actualParts = actual.split('/');
  const patternParts = pattern.split('/');

  if (actualParts.length !== patternParts.length) return false;

  for (let i = 0; i < actualParts.length; i++) {
    if (patternParts[i].startsWith(':')) continue;
    if (actualParts[i] !== patternParts[i]) return false;
  }
  return true;
}

// ─── Middleware: Request Logging ──────────────────────────────────

export interface RequestLogEntry {
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  durationMs?: number;
  statusCode?: number;
  requestId: string;
}

const requestLogs: RequestLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

export function logRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const ip = req.socket.remoteAddress ?? 'unknown';

  const entry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    method: req.method ?? 'GET',
    url: req.url ?? '/',
    ip,
    userAgent: req.headers['user-agent'],
    requestId,
  };

  // Attach request ID to response
  res.setHeader('X-Request-Id', requestId);

  // Log on response finish
  const originalEnd = res.end;
  res.end = function (this: ServerResponse, ...args: any[]) {
    entry.durationMs = Date.now() - startTime;
    entry.statusCode = this.statusCode;

    requestLogs.unshift(entry);
    if (requestLogs.length > MAX_LOG_ENTRIES) {
      requestLogs.pop();
    }

    const statusColor = (this.statusCode ?? 500) >= 400 ? '\x1b[31m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(
      `[V1] ${statusColor}${this.statusCode}${reset} ${entry.method} ${entry.url} ${entry.durationMs}ms ${entry.requestId}`,
    );

    return originalEnd.apply(this, args as any);
  } as any;

  next();
}

export function getRequestLogs(limit = 100): RequestLogEntry[] {
  return requestLogs.slice(0, limit);
}

export function clearRequestLogs(): void {
  requestLogs.length = 0;
}

// ─── Middleware: Error Handler ────────────────────────────────────

export interface ApiErrorInfo {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  stack?: string;
}

export class V1Error extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'V1Error';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorHandler(
  err: Error,
  _req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): void {
  if (res.headersSent) {
    console.error('[V1] Error after headers sent:', err);
    return;
  }

  if (err instanceof V1Error) {
    res.writeHead(err.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError(err.code, err.message, err.details)));
    return;
  }

  // Check for known error patterns
  const message = err.message ?? 'Internal Server Error';

  if (message.includes('not found') || message.includes('not found')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('NOT_FOUND', message)));
    return;
  }

  if (message.includes('already exists')) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('CONFLICT', message)));
    return;
  }

  if (message.includes('unauthorized') || message.includes('forbidden')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiError('FORBIDDEN', message)));
    return;
  }

  console.error('[V1] Unhandled error:', err);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify(
      apiError('INTERNAL_ERROR', process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message),
    ),
  );
}

// ─── Middleware: Method Not Allowed ───────────────────────────────

export function methodNotAllowed(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET, POST, PUT, DELETE' });
  res.end(JSON.stringify(apiError('METHOD_NOT_ALLOWED', 'HTTP method not allowed for this endpoint.')));
}

// ─── Middleware Stack Builder ─────────────────────────────────────

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

export function applyMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  middlewares: Middleware[],
  final: () => void,
): void {
  let index = 0;

  function next(): void {
    if (index < middlewares.length) {
      const middleware = middlewares[index++];
      middleware(req, res, next);
    } else {
      final();
    }
  }

  next();
}

// ─── Default Middleware Stack ─────────────────────────────────────

export function createDefaultMiddlewareStack(): Middleware[] {
  return [cors, apiKeyAuth, rateLimit, logRequest, validateBody];
}
