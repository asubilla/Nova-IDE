import { IncomingMessage, ServerResponse } from 'http';
import { ChatEnhanced } from './chat-enhanced';

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
  query: URLSearchParams,
) => Promise<void> | void;

interface EnhancedRoute {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, message: string, status = 400): void {
  json(res, { error: message, statusCode: status, timestamp: new Date().toISOString() }, status);
}

function parseRoute(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function matchRoute(
  method: string,
  url: string,
  routes: EnhancedRoute[],
): { handler: Handler; params: Record<string, string>; query: URLSearchParams } | null {
  const [pathname, qs] = url.split('?');
  const query = new URLSearchParams(qs ?? '');

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    return { handler: route.handler, params, query };
  }
  return null;
}

function getRequestBody(req: IncomingMessage): any {
  return (req as any).body;
}

// ─── Diff Routes ──────────────────────────────────────────────────

function getSessionDiff(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
  query: URLSearchParams,
): void {
  const v1 = query.get('v1');
  const v2 = query.get('v2');

  const messages = enhanced.service.getMessages(params.id, { limit: 10000 }).messages;
  if (messages.length < 2) {
    return error(res, 'Not enough messages for diff', 404);
  }

  const targetMsg = messages[messages.length - 1];
  const diff = enhanced.getDiff(targetMsg.id, v2 ?? undefined);
  if (!diff) {
    return error(res, 'Diff not available', 404);
  }

  json(res, { diff, stats: diff.stats, hunks: diff.hunks });
}

function getMessageDiff(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
  query: URLSearchParams,
): void {
  const versionId = query.get('v') ?? undefined;
  const diff = enhanced.getDiff(params.id, versionId);
  if (!diff) {
    return error(res, 'Diff not available', 404);
  }
  json(res, { diff, stats: diff.stats });
}

// ─── Revert Routes ────────────────────────────────────────────────

function revertMessage(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const body = getRequestBody(_req);
  const userId = body?.userId;
  if (!userId) return error(res, 'userId is required');

  const record = enhanced.revertMessage(params.id, userId, {
    reason: body?.reason,
    confirm: body?.confirm,
  });

  json(res, { revertRecord: record });
}

// ─── Checkpoint Routes ────────────────────────────────────────────

function createCheckpoint(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const body = getRequestBody(req);
  const checkpoint = enhanced.createCheckpoint(params.id, body?.label);
  json(res, { checkpoint }, 201);
}

function listCheckpoints(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const checkpoints = enhanced.listCheckpoints(params.id);
  json(res, { checkpoints, count: checkpoints.length });
}

function restoreCheckpoint(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  try {
    const data = enhanced.restoreCheckpoint(params.id);
    json(res, { data });
  } catch (err: any) {
    error(res, err.message, 404);
  }
}

// ─── Summary Route ────────────────────────────────────────────────

function getSummary(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
  query: URLSearchParams,
): void {
  const format = (query.get('format') as any) ?? 'standard';
  const summary = enhanced.getSummary(params.id, format);
  json(res, { summary });
}

// ─── Secrets Route ────────────────────────────────────────────────

function searchSecrets(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const secrets = enhanced.searchSecrets(params.id);
  json(res, { secrets, count: secrets.length, hasSecrets: secrets.length > 0 });
}

// ─── Pin Routes ───────────────────────────────────────────────────

function getPins(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const pins = enhanced.getPins(params.id);
  json(res, { pins, count: pins.length });
}

function pinMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _enhanced: ChatEnhanced,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) return error(res, 'userId is required');
  json(res, { success: true, messageId: params.id });
}

function unpinMessage(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _enhanced: ChatEnhanced,
): void {
  json(res, { success: true, messageId: params.id });
}

// ─── Bookmark Routes ──────────────────────────────────────────────

function getBookmarks(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const bookmarks = enhanced.getBookmarks(params.id);
  json(res, { bookmarks, count: bookmarks.length });
}

function addBookmark(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _enhanced: ChatEnhanced,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) return error(res, 'userId is required');
  json(res, { success: true, messageId: params.id }, 201);
}

function removeBookmark(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _enhanced: ChatEnhanced,
): void {
  json(res, { success: true, messageId: params.id });
}

// ─── Thread Routes ────────────────────────────────────────────────

function getThreads(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const threads = enhanced.getThreads(params.id);
  json(res, { threads, count: threads.length });
}

function createThread(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _enhanced: ChatEnhanced,
): void {
  const body = getRequestBody(req);
  if (!body?.content || !body?.senderId) {
    return error(res, 'content and senderId are required');
  }
  json(res, {
    threadId: `thread-${params.id}-${Date.now()}`,
    parentMessageId: params.id,
    content: body.content,
  }, 201);
}

// ─── Version History Route ────────────────────────────────────────

function getVersions(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  const versions = enhanced.getVersionHistory(params.id);
  json(res, { versions, count: versions.length });
}

// ─── Code Execution Route ─────────────────────────────────────────

function executeCode(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  enhanced: ChatEnhanced,
): void {
  enhanced.executeCode(params.id).then(
    (result) => json(res, result),
    (err) => error(res, err.message, 500),
  );
}

// ─── Router ───────────────────────────────────────────────────────

export function buildEnhancedChatRoutes(): EnhancedRoute[] {
  const rawRoutes: Array<{ method: string; pattern: string; handler: Handler }> = [
    { method: 'GET', pattern: '/api/chat/sessions/:id/diff', handler: getSessionDiff },
    { method: 'GET', pattern: '/api/chat/messages/:id/diff', handler: getMessageDiff },

    { method: 'POST', pattern: '/api/chat/messages/:id/revert', handler: revertMessage },

    { method: 'POST', pattern: '/api/chat/sessions/:id/checkpoint', handler: createCheckpoint },
    { method: 'GET', pattern: '/api/chat/sessions/:id/checkpoints', handler: listCheckpoints },
    { method: 'POST', pattern: '/api/chat/checkpoints/:id/restore', handler: restoreCheckpoint },

    { method: 'GET', pattern: '/api/chat/sessions/:id/summary', handler: getSummary },

    { method: 'GET', pattern: '/api/chat/sessions/:id/secrets', handler: searchSecrets },

    { method: 'GET', pattern: '/api/chat/sessions/:id/pins', handler: getPins },
    { method: 'POST', pattern: '/api/chat/messages/:id/pin', handler: pinMessage },
    { method: 'DELETE', pattern: '/api/chat/messages/:id/pin', handler: unpinMessage },

    { method: 'GET', pattern: '/api/chat/users/:id/bookmarks', handler: getBookmarks },
    { method: 'POST', pattern: '/api/chat/messages/:id/bookmark', handler: addBookmark },
    { method: 'DELETE', pattern: '/api/chat/messages/:id/bookmark', handler: removeBookmark },

    { method: 'GET', pattern: '/api/chat/sessions/:id/threads', handler: getThreads },
    { method: 'POST', pattern: '/api/chat/messages/:id/thread', handler: createThread },

    { method: 'GET', pattern: '/api/chat/messages/:id/versions', handler: getVersions },

    { method: 'POST', pattern: '/api/chat/messages/:id/execute', handler: executeCode },
  ];

  return rawRoutes.map((r) => {
    const { regex, paramNames } = parseRoute(r.pattern);
    return { method: r.method, pattern: regex, paramNames, handler: r.handler };
  });
}

export function createEnhancedChatRouter(enhanced: ChatEnhanced) {
  const routes = buildEnhancedChatRoutes();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    const matched = matchRoute(method, url, routes);
    if (!matched) {
      return error(res, 'Not Found', 404);
    }

    try {
      await matched.handler(req, res, matched.params, enhanced, matched.query);
    } catch (err: any) {
      console.error(`[EnhancedChatRouter] Unhandled error in ${method} ${url}:`, err);
      if (!res.headersSent) {
        error(res, err.message ?? 'Internal Server Error', 500);
      }
    }
  };
}
