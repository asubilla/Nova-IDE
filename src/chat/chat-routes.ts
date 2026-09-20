import { IncomingMessage, ServerResponse } from 'http';
import { ChatDatabase, CreateSessionInput, CreateMessageInput, GetMessagesOptions } from './chat-database';
import { ChatSessionStatus, ChatMessageType, ChatSessionType } from './chat-types';

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
) => Promise<void> | void;

export interface ChatRoute {
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
  routes: ChatRoute[],
): { handler: Handler; params: Record<string, string> } | null {
  const pathname = url.split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    return { handler: route.handler, params };
  }
  return null;
}

function getRequestBody(req: IncomingMessage): any {
  return (req as any).body;
}

function getQueryParam(url: string, key: string): string | null {
  const idx = url.indexOf('?');
  if (idx === -1) return null;
  const params = new URLSearchParams(url.slice(idx + 1));
  return params.get(key);
}

// ─── Session Handlers ──────────────────────────────────────────────

async function createSession(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  db: ChatDatabase,
): Promise<void> {
  const body = getRequestBody(req);
  if (!body?.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
    return error(res, 'participants array is required and must not be empty');
  }
  if (!body.type || !Object.values(ChatSessionType).includes(body.type)) {
    return error(res, `type must be one of: ${Object.values(ChatSessionType).join(', ')}`);
  }

  const input: CreateSessionInput = {
    participants: body.participants,
    type: body.type,
    title: body.title,
    metadata: body.metadata,
  };

  const session = db.createSession(input);
  json(res, serializeSession(session), 201);
}

function listSessions(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  db: ChatDatabase,
): void {
  const url = req.url ?? '/';
  const filters: {
    participant?: string;
    type?: ChatSessionType;
    status?: ChatSessionStatus;
  } = {};

  const participant = getQueryParam(url, 'participant');
  if (participant) filters.participant = participant;

  const type = getQueryParam(url, 'type') as ChatSessionType | null;
  if (type && Object.values(ChatSessionType).includes(type)) filters.type = type;

  const status = getQueryParam(url, 'status') as ChatSessionStatus | null;
  if (status && Object.values(ChatSessionStatus).includes(status)) filters.status = status;

  const sessions = db.listSessions(filters);
  json(res, sessions.map(serializeSession));
}

function getSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const session = db.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);
  json(res, serializeSession(session));
}

function deleteSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const existed = db.deleteSession(params.id);
  if (!existed) return error(res, 'Session not found', 404);
  json(res, { deleted: true });
}

// ─── Message Handlers ──────────────────────────────────────────────

async function sendMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): Promise<void> {
  const session = db.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const body = getRequestBody(req);
  if (!body?.senderId || typeof body.senderId !== 'string') {
    return error(res, 'senderId is required');
  }
  if (!body?.senderType || !['user', 'agent', 'system'].includes(body.senderType)) {
    return error(res, 'senderType must be one of: user, agent, system');
  }
  if (!body?.content || typeof body.content !== 'string') {
    return error(res, 'content is required');
  }
  if (body.type && !Object.values(ChatMessageType).includes(body.type)) {
    return error(res, `type must be one of: ${Object.values(ChatMessageType).join(', ')}`);
  }

  if (body.replyTo) {
    const replyMsg = db.getMessage(body.replyTo);
    if (!replyMsg || replyMsg.sessionId !== params.id) {
      return error(res, 'Reply target not found in this session', 404);
    }
  }

  const input: CreateMessageInput = {
    sessionId: params.id,
    senderId: body.senderId,
    senderType: body.senderType,
    content: body.content,
    type: body.type ?? ChatMessageType.Text,
    replyTo: body.replyTo,
  };

  const message = db.createMessage(input);
  json(res, serializeMessage(message), 201);
}

function getMessages(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const session = db.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const url = req.url ?? '/';
  const limit = Math.min(parseInt(getQueryParam(url, 'limit') ?? '50', 10), 200);
  const offset = Math.max(parseInt(getQueryParam(url, 'offset') ?? '0', 10), 0);
  const before = getQueryParam(url, 'before') ?? undefined;
  const after = getQueryParam(url, 'after') ?? undefined;

  const options: GetMessagesOptions = { limit, offset, before, after };
  const result = db.getMessagesBySession(params.id, options);

  json(res, {
    messages: result.messages.map(serializeMessage),
    total: result.total,
    hasMore: result.hasMore,
    limit,
    offset,
  });
}

function editMessage(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const body = getRequestBody(_req);
  if (!body?.content || typeof body.content !== 'string') {
    return error(res, 'content is required');
  }

  const message = db.updateMessage(params.id, { content: body.content });
  if (!message) return error(res, 'Message not found', 404);
  json(res, serializeMessage(message));
}

function deleteMessage(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const existed = db.deleteMessage(params.id);
  if (!existed) return error(res, 'Message not found', 404);
  json(res, { deleted: true });
}

async function replyToMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): Promise<void> {
  const parent = db.getMessage(params.id);
  if (!parent) return error(res, 'Message not found', 404);

  const body = getRequestBody(req);
  if (!body?.senderId || typeof body.senderId !== 'string') {
    return error(res, 'senderId is required');
  }
  if (!body?.senderType || !['user', 'agent', 'system'].includes(body.senderType)) {
    return error(res, 'senderType must be one of: user, agent, system');
  }
  if (!body?.content || typeof body.content !== 'string') {
    return error(res, 'content is required');
  }

  const input: CreateMessageInput = {
    sessionId: parent.sessionId,
    senderId: body.senderId,
    senderType: body.senderType,
    content: body.content,
    type: body.type ?? ChatMessageType.Text,
    replyTo: params.id,
  };

  const message = db.createMessage(input);
  json(res, serializeMessage(message), 201);
}

function toggleReaction(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const body = getRequestBody(_req);
  if (!body?.userId || typeof body.userId !== 'string') {
    return error(res, 'userId is required');
  }
  if (!body?.emoji || typeof body.emoji !== 'string') {
    return error(res, 'emoji is required');
  }

  const existing = db.getMessage(params.id);
  if (!existing) return error(res, 'Message not found', 404);

  const hasReaction = existing.reactions.some(
    (r) => r.userId === body.userId && r.emoji === body.emoji,
  );

  const message = hasReaction
    ? db.removeReaction(params.id, body.userId, body.emoji)
    : db.addReaction(params.id, body.userId, body.emoji);

  if (!message) return error(res, 'Failed to update reaction', 500);
  json(res, { message: serializeMessage(message), action: hasReaction ? 'removed' : 'added' });
}

// ─── Read Receipts ─────────────────────────────────────────────────

function markAsRead(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const body = getRequestBody(_req);
  if (!body?.userId || typeof body.userId !== 'string') {
    return error(res, 'userId is required');
  }

  const count = db.markAsRead(params.id, body.userId, body.messageIds);
  json(res, { markedCount: count });
}

// ─── Search ────────────────────────────────────────────────────────

function searchMessages(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  db: ChatDatabase,
): void {
  const url = req.url ?? '/';
  const query = getQueryParam(url, 'q');
  if (!query) return error(res, 'Search query (q) is required');

  const limit = Math.min(parseInt(getQueryParam(url, 'limit') ?? '20', 10), 100);
  const results = db.searchMessages(query, limit);

  json(res, {
    query,
    results: results.map((r) => ({
      message: serializeMessage(r.message),
      sessionTitle: r.sessionTitle,
      snippet: r.snippet,
    })),
    count: results.length,
  });
}

// ─── Export ────────────────────────────────────────────────────────

function exportChatHistory(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  db: ChatDatabase,
): void {
  const history = db.exportSessionHistory(params.id);
  if (!history) return error(res, 'Session not found', 404);

  json(res, {
    session: serializeSession(history.session),
    messages: history.messages.map(serializeMessage),
    attachments: history.attachments,
    exportedAt: new Date().toISOString(),
  });
}

// ─── Serializers ───────────────────────────────────────────────────

function serializeSession(session: any): Record<string, unknown> {
  return {
    id: session.id,
    participants: session.participants,
    type: session.type,
    status: session.status,
    title: session.title,
    metadata: session.metadata,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function serializeMessage(message: any): Record<string, unknown> {
  return {
    id: message.id,
    sessionId: message.sessionId,
    senderId: message.senderId,
    senderType: message.senderType,
    content: message.content,
    type: message.type,
    replyTo: message.replyTo,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    readBy: message.readBy,
    reactions: message.reactions,
  };
}

// ─── Router ────────────────────────────────────────────────────────

export function buildChatRoutes(): ChatRoute[] {
  const rawRoutes: Array<{ method: string; pattern: string; handler: Handler }> = [
    { method: 'POST', pattern: '/api/chat/sessions', handler: createSession },
    { method: 'GET', pattern: '/api/chat/sessions', handler: listSessions },
    { method: 'GET', pattern: '/api/chat/sessions/:id', handler: getSession },
    { method: 'DELETE', pattern: '/api/chat/sessions/:id', handler: deleteSession },

    { method: 'POST', pattern: '/api/chat/sessions/:id/messages', handler: sendMessage },
    { method: 'GET', pattern: '/api/chat/sessions/:id/messages', handler: getMessages },
    { method: 'PUT', pattern: '/api/chat/messages/:id', handler: editMessage },
    { method: 'DELETE', pattern: '/api/chat/messages/:id', handler: deleteMessage },
    { method: 'POST', pattern: '/api/chat/messages/:id/reply', handler: replyToMessage },
    { method: 'POST', pattern: '/api/chat/messages/:id/react', handler: toggleReaction },

    { method: 'POST', pattern: '/api/chat/sessions/:id/read', handler: markAsRead },

    { method: 'GET', pattern: '/api/chat/search', handler: searchMessages },

    { method: 'GET', pattern: '/api/chat/sessions/:id/export', handler: exportChatHistory },
  ];

  return rawRoutes.map((r) => {
    const { regex, paramNames } = parseRoute(r.pattern);
    return { method: r.method, pattern: regex, paramNames, handler: r.handler };
  });
}

export function createChatRouter(db: ChatDatabase) {
  const routes = buildChatRoutes();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    const matched = matchRoute(method, url, routes);
    if (!matched) {
      return error(res, 'Not Found', 404);
    }

    try {
      await matched.handler(req, res, matched.params, db);
    } catch (err: any) {
      console.error(`[ChatRouter] Unhandled error in ${method} ${url}:`, err);
      if (!res.headersSent) {
        error(res, err.message ?? 'Internal Server Error', 500);
      }
    }
  };
}
