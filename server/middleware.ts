import { IncomingMessage, ServerResponse } from 'http';

export type MiddlewareFn = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RATE_LIMIT: RateLimiterOptions = {
  windowMs: 60_000,
  maxRequests: 100,
};

export function corsMiddleware(allowedOrigins: string[] = ['*']): MiddlewareFn {
  return (req, res, next) => {
    const origin = req.headers.origin ?? '*';
    const allowed =
      allowedOrigins.includes('*') || allowedOrigins.includes(origin);

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    next();
  };
}

export function jsonBodyParser(): MiddlewareFn {
  return (req, res, next) => {
    if (
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS'
    ) {
      (req as any).body = null;
      next();
      return;
    }

    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      (req as any).body = null;
      next();
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BODY_SIZE = 1024 * 1024;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large' }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (totalBytes === 0) {
        (req as any).body = null;
        next();
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        (req as any).body = JSON.parse(raw);
        next();
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });

    req.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read request body' }));
    });
  };
}

export function requestLogger(): MiddlewareFn {
  return (req, res, next) => {
    const start = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    res.setHeader('X-Request-Id', requestId);

    const originalEnd = res.end;
    res.end = function (this: ServerResponse, ...args: any[]) {
      const duration = Date.now() - start;
      const method = req.method ?? 'UNKNOWN';
      const url = req.url ?? '/';
      const statusCode = res.statusCode;
      const contentLength = res.getHeader('content-length') ?? 0;

      console.log(
        `[${new Date().toISOString()}] ${method} ${url} ${statusCode} ${duration}ms (${contentLength}b) [${requestId}]`,
      );

      return originalEnd.apply(this, args as any);
    } as any;

    next();
  };
}

export function errorHandler(): (err: any, req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (err: any, req: IncomingMessage, res: ServerResponse, _next: () => void) => {
    const statusCode = err.statusCode ?? err.status ?? 500;
    const message = err.message ?? 'Internal Server Error';

    console.error(`[ERROR] ${req.method} ${req.url} - ${statusCode}: ${message}`);
    if (err.stack) {
      console.error(err.stack);
    }

    if (res.headersSent) {
      return;
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: message,
        statusCode,
        timestamp: new Date().toISOString(),
      }),
    );
  };
}

export function rateLimiter(
  options: Partial<RateLimiterOptions> = {},
): MiddlewareFn {
  const opts = { ...DEFAULT_RATE_LIMIT, ...options };
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) {
        hits.delete(key);
      }
    }
  }, opts.windowMs);

  return (req, res, next) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';

    const now = Date.now();
    let entry = hits.get(clientIp);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(clientIp, entry);
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', opts.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > opts.maxRequests) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((entry.resetAt - now) / 1000).toString(),
      });
      res.end(
        JSON.stringify({
          error: 'Too Many Requests',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        }),
      );
      return;
    }

    next();
  };
}
