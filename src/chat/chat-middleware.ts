import { IncomingMessage, ServerResponse } from 'http';
import { ChatSecurity } from './chat-security';
import { AuditLogger, AuditEventType, AuditSeverity } from '../../security/audit-logger';
import { defaultLogger } from '../logging/logger';

const logger = defaultLogger.child('ChatMiddleware');

export interface MiddlewareContext {
  userId?: string;
  sessionId?: string;
  startTime: number;
}

const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

export function authMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  const token = req.headers['authorization'] as string | undefined;

  if (!userId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required', statusCode: 401 }));
    return;
  }

  if (token && token.startsWith('Bearer ')) {
    // In production: validate JWT token here
  }

  const ctx: MiddlewareContext = { userId, startTime: Date.now() };
  (req as any)._chatCtx = ctx;

  next();
}

export function rateLimitMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const ctx: MiddlewareContext | undefined = (req as any)._chatCtx;
  const userId = ctx?.userId ?? req.headers['x-user-id'] as string ?? 'anonymous';
  const method = req.method ?? 'GET';
  const key = `${userId}:${method}`;
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = method === 'POST' ? 30 : method === 'DELETE' ? 10 : 60;

  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
  } else if (bucket.count >= maxRequests) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.ceil((bucket.windowStart + windowMs) / 1000)),
    });
    res.end(JSON.stringify({
      error: 'Rate limit exceeded',
      statusCode: 429,
      retryAfter,
      timestamp: new Date().toISOString(),
    }));
    return;
  } else {
    bucket.count++;
  }

  next();
}

export function corsMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '*').split(',');

  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}

export function validationMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const contentType = req.headers['content-type'];

  if (req.method === 'POST' || req.method === 'PUT') {
    if (contentType && !contentType.includes('application/json')) {
      // Allow missing content type for some endpoints
      const url = req.url ?? '';
      if (url.includes('/messages') && req.method === 'POST') {
        // Will be validated in the handler
      }
    }

    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
    if (contentLength > 10 * 1024 * 1024) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Request body too large',
        statusCode: 413,
        timestamp: new Date().toISOString(),
      }));
      return;
    }
  }

  next();
}

export function auditMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const ctx: MiddlewareContext | undefined = (req as any)._chatCtx;
  const userId = ctx?.userId ?? 'unknown';
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  const originalEnd = res.end.bind(res);
  const startTime = Date.now();

  (res as any).end = function (...args: unknown[]) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode ?? 200;
    const eventType = statusCode >= 400
      ? AuditEventType.VALIDATION_FAILED
      : AuditEventType.TOOL_INVOKED;
    const severity = statusCode >= 500
      ? AuditSeverity.ERROR
      : statusCode >= 400
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO;

    const auditLogger = new AuditLogger();
    auditLogger.log({
      eventType,
      severity,
      sessionId: 'chat',
      agentId: userId,
      tool: 'chat-http',
      action: method,
      target: url,
      decision: statusCode >= 400 ? 'denied' : 'allowed',
      duration,
      metadata: {
        statusCode,
        userAgent: req.headers['user-agent'],
        ip: req.socket.remoteAddress,
      },
    });

    return originalEnd(...args as Parameters<typeof originalEnd>);
  } as typeof res.end;

  next();
}

export function compressionMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const acceptEncoding = req.headers['accept-encoding'] ?? '';
  if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
  } else if (acceptEncoding.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate');
  }

  next();
}

export function createChatSecurityMiddleware(chatSecurity: ChatSecurity) {
  return function securityMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void {
    const ctx: MiddlewareContext | undefined = (req as any)._chatCtx;
    const userId = ctx?.userId;
    if (!userId) {
      next();
      return;
    }

    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (url.match(/\/api\/chat\/sessions$/) && method === 'POST') {
      if (!chatSecurity.checkRateLimit(userId, 'messages')) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded', statusCode: 429 }));
        return;
      }
    }

    if (url.includes('/export') && method === 'GET') {
      const sessionId = url.split('/sessions/')[1]?.split('/')[0];
      if (sessionId && !chatSecurity.canExportChat(sessionId, userId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied', statusCode: 403 }));
        return;
      }
    }

    next();
  };
}

export function chainMiddleware(
  middlewares: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void>,
  finalHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let index = 0;

    const runNext = (): void => {
      if (index >= middlewares.length) {
        finalHandler(req, res);
        return;
      }

      const middleware = middlewares[index++];
      middleware(req, res, runNext);
    };

    runNext();
  };
}
