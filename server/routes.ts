import { IncomingMessage, ServerResponse } from 'http';
import { SubAgentOrchestrator } from '../core/orchestrator';
import { SessionManager, SessionStats } from '../session/manager';
import { DashboardBuilder, SessionDashboard } from '../live-preview/dashboard';
import { ArtifactManager } from '../artifacts/manager';
import { CheckpointManager } from '../session/checkpoint';
import { PreviewServer } from '../live-preview/server';
import { Session, SessionConfig, AgentTask, AgentResult, LivePreviewEvent } from '../core/types';
import { ChatService } from '../src/chat/chat-service';
import { ChatWebSocket } from '../src/chat/chat-websocket';
import { ChatEnhanced } from '../src/chat/chat-enhanced';

export interface RouteContext {
  orchestrator: SubAgentOrchestrator;
  sessionManager: SessionManager;
  artifactManager: ArtifactManager;
  checkpointManager: CheckpointManager;
  previewServer: PreviewServer;
  dashboards: Map<string, DashboardBuilder>;
  chatService: ChatService;
  chatWebSocket: ChatWebSocket;
  chatEnhanced: ChatEnhanced;
}

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
) => Promise<void> | void;

export interface Route {
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
  routes: Route[],
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

// ─── SessionController ────────────────────────────────────────────

async function createSession(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): Promise<void> {
  const body = getRequestBody(req);
  if (!body?.userPrompt) {
    return error(res, 'userPrompt is required');
  }

  const projectRoot = body.projectRoot ?? process.cwd();
  const config: Partial<SessionConfig> = body.config ?? {};

  try {
    const session = await ctx.orchestrator.executeTask(body.userPrompt, projectRoot);
    json(res, serializeSession(session), 201);
  } catch (err: any) {
    error(res, err.message ?? 'Failed to create session', 500);
  }
}

function listSessions(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): void {
  const sessions = ctx.orchestrator.getAllSessions();
  json(res, sessions.map(serializeSession));
}

function getSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);
  json(res, serializeSession(session));
}

async function startSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): Promise<void> {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);
  if (session.status === 'running') return error(res, 'Session is already running');

  session.status = 'running';
  session.updatedAt = new Date();
  ctx.sessionManager.updateSessionStatus(params.id, 'running');

  ctx.previewServer.broadcast({
    type: 'session-status',
    sessionId: params.id,
    timestamp: new Date(),
    data: { status: 'running' },
  });

  json(res, serializeSession(session));
}

async function pauseSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): Promise<void> {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);
  if (session.status === 'paused') return error(res, 'Session is already paused');

  await ctx.orchestrator.stopSession(params.id);
  ctx.sessionManager.updateSessionStatus(params.id, 'paused');

  ctx.previewServer.broadcast({
    type: 'session-paused',
    sessionId: params.id,
    timestamp: new Date(),
    data: { status: 'paused' },
  });

  json(res, serializeSession(session));
}

async function cancelSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): Promise<void> {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  await ctx.orchestrator.stopSession(params.id);
  session.status = 'failed';
  session.updatedAt = new Date();
  ctx.sessionManager.updateSessionStatus(params.id, 'failed');

  ctx.previewServer.broadcast({
    type: 'session-status',
    sessionId: params.id,
    timestamp: new Date(),
    data: { status: 'failed', reason: 'cancelled' },
  });

  json(res, serializeSession(session));
}

// ─── AgentController ──────────────────────────────────────────────

function listAgents(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const agents = Array.from(session.agents.values()).map((task) => ({
    id: task.id,
    type: task.type,
    name: task.name,
    description: task.description,
    priority: task.priority,
    dependencies: task.dependencies,
    phase: task.phase,
    status: session.results.get(task.id)?.status ?? 'pending',
    retryCount: session.results.get(task.id)?.retryCount ?? 0,
    startedAt: session.results.get(task.id)?.startedAt,
    completedAt: session.results.get(task.id)?.completedAt,
  }));

  json(res, agents);
}

function getAgent(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const task = session.agents.get(params.agentId);
  if (!task) return error(res, 'Agent not found', 404);

  const result = session.results.get(params.agentId);
  json(res, {
    task: {
      id: task.id,
      type: task.type,
      name: task.name,
      description: task.description,
      priority: task.priority,
      dependencies: task.dependencies,
      phase: task.phase,
      requiredCapabilities: task.requiredCapabilities,
      timeoutMs: task.timeoutMs,
      estimatedTokens: task.estimatedTokens,
    },
    result: result
      ? {
          status: result.status,
          retryCount: result.retryCount,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          error: result.error,
          summary: result.summary,
          validationResults: result.validationResults,
          filesModified: result.output.files.map((f) => f.path),
          logs: result.logs.slice(-50),
        }
      : null,
  });
}

// ─── ArtifactController ──────────────────────────────────────────

function listArtifacts(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const allArtifacts: any[] = [];
  for (const result of session.results.values()) {
    for (const artifact of result.artifactsProduced) {
      allArtifacts.push({
        name: artifact.name,
        type: artifact.type,
        producingAgent: result.taskId,
        agentType: result.agentType,
      });
    }
  }

  const managedArtifacts = ctx.artifactManager.list();
  json(res, {
    sessionArtifacts: allArtifacts,
    managedArtifacts: managedArtifacts.map((a) => ({
      name: a.artifact.name,
      type: a.artifact.type,
      version: a.version,
      producingAgentId: a.producingAgentId,
      producingAgentType: a.producingAgentType,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      sizeBytes: a.sizeBytes,
      tags: a.tags,
    })),
  });
}

// ─── CheckpointController ────────────────────────────────────────

function listCheckpoints(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  const checkpoints = ctx.checkpointManager.listCheckpoints(params.id);
  json(res, checkpoints);
}

// ─── DashboardController ─────────────────────────────────────────

function getDashboard(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.orchestrator.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);

  let dashboard = ctx.dashboards.get(params.id);
  if (!dashboard) {
    dashboard = new DashboardBuilder(params.id);
    ctx.dashboards.set(params.id, dashboard);
  }

  const sessionState = ctx.previewServer.getSessionSnapshot(params.id);
  if (sessionState?.recentEvents) {
    dashboard.processBatch(sessionState.recentEvents);
  }

  const dashboardData = dashboard.build();
  json(res, dashboardData);
}

// ─── MetricsController ───────────────────────────────────────────

function getMetrics(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): void {
  const sessionStats = ctx.sessionManager.getSessionStats();
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  json(res, {
    sessions: sessionStats,
    system: {
      uptime,
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
      activeConnections: ctx.previewServer.getClientCount(),
    },
    artifacts: {
      total: ctx.artifactManager.getCount(),
      sizeBytes: ctx.artifactManager.getSizeBytes(),
    },
    timestamp: new Date().toISOString(),
  });
}

function getHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  json(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

// ─── Serializer ──────────────────────────────────────────────────

function serializeSession(session: Session): Record<string, any> {
  return {
    id: session.id,
    status: session.status,
    taskSpec: session.taskSpec,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agentCount: session.agents.size,
    resultCount: session.results.size,
    runningAgents: Array.from(session.runningAgents.keys()),
    config: {
      maxAgentsPerSession: session.config.maxAgentsPerSession,
      maxConcurrentAgents: session.config.maxConcurrentAgents,
      defaultTimeoutMs: session.config.defaultTimeoutMs,
    },
  };
}

// ─── ChatController ─────────────────────────────────────────────

function createChatSession(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.participants || !body?.type) {
    return error(res, 'participants and type are required');
  }
  try {
    const session = ctx.chatService.createSession(body.participants, body.type, body.metadata);
    json(res, session, 201);
  } catch (err: any) {
    error(res, err.message ?? 'Failed to create chat session', 500);
  }
}

function listChatSessions(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): void {
  const sessions = ctx.chatService.listSessions();
  json(res, sessions);
}

function getChatSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const session = ctx.chatService.getSession(params.id);
  if (!session) return error(res, 'Chat session not found', 404);
  json(res, session);
}

function deleteChatSession(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const deleted = (ctx.chatService as any).deleteSession?.(params.id) ?? false;
  if (!deleted) return error(res, 'Chat session not found', 404);
  json(res, { success: true });
}

function sendChatMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.senderId || !body?.senderType || !body?.content) {
    return error(res, 'senderId, senderType, and content are required');
  }
  try {
    const message = ctx.chatEnhanced.sendMessage(
      params.id,
      body.senderId,
      body.content,
      {
        replyTo: body.replyTo,
      },
    );
    json(res, message, 201);
  } catch (err: any) {
    error(res, err.message ?? 'Failed to send message', 500);
  }
}

function getChatMessages(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const limit = parseInt(getQueryParam(req.url ?? '', 'limit') ?? '50', 10);
  const offset = parseInt(getQueryParam(req.url ?? '', 'offset') ?? '0', 10);
  const messages = ctx.chatService.getMessages(params.id, { limit, offset });
  json(res, messages);
}

function editChatMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId || !body?.content) {
    return error(res, 'userId and content are required');
  }
  const result = ctx.chatEnhanced.editMessage(params.id, body.userId, body.content);
  if (!result) return error(res, 'Message not found or unauthorized', 404);
  json(res, result);
}

function deleteChatMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) {
    return error(res, 'userId is required');
  }
  const deleted = ctx.chatService.deleteMessage(params.id, body.userId);
  if (!deleted) return error(res, 'Message not found or unauthorized', 404);
  json(res, { success: true });
}

function replyToChatMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.senderId || !body?.senderType || !body?.content) {
    return error(res, 'senderId, senderType, and content are required');
  }
  try {
    const message = ctx.chatService.replyToMessage(
      params.id,
      body.senderId,
      body.senderType,
      body.content,
    );
    json(res, message, 201);
  } catch (err: any) {
    error(res, err.message ?? 'Failed to reply', 500);
  }
}

function reactToMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId || !body?.emoji) {
    return error(res, 'userId and emoji are required');
  }
  const result = ctx.chatService.addReaction(params.id, body.userId, body.emoji);
  json(res, result);
}

function markAsRead(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) {
    return error(res, 'userId is required');
  }
  ctx.chatService.markAsRead(params.id, body.userId);
  json(res, { success: true });
}

function searchChatMessages(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  ctx: RouteContext,
): void {
  const query = getQueryParam(req.url ?? '', 'q');
  const sessionId = getQueryParam(req.url ?? '', 'sessionId');
  const userId = getQueryParam(req.url ?? '', 'userId') ?? 'anonymous';
  if (!query) return error(res, 'q parameter is required');
  const results = ctx.chatService.searchMessages(query, userId, sessionId ?? undefined);
  json(res, results);
}

function getChatDiff(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const v1 = getQueryParam(req.url ?? '', 'v1');
  const v2 = getQueryParam(req.url ?? '', 'v2');
  if (!v1 || !v2) return error(res, 'v1 and v2 parameters are required');
  const diff = ctx.chatEnhanced.getDiff(params.id, v2);
  json(res, diff);
}

function revertChatMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) {
    return error(res, 'userId is required');
  }
  const result = ctx.chatEnhanced.revertMessage(params.id, body.userId);
  if (!result) return error(res, 'Message not found or unauthorized', 404);
  json(res, result);
}

function createChatCheckpoint(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  const session = ctx.chatService.getSession(params.id);
  if (!session) return error(res, 'Session not found', 404);
  const checkpoint = ctx.chatEnhanced.checkpoints.createCheckpoint(
    params.id,
    { messages: ctx.chatService.getMessages(params.id, { limit: 1000 }).messages, sessionState: session },
    body?.label,
  );
  json(res, checkpoint, 201);
}

function listChatCheckpoints(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const checkpoints = ctx.chatEnhanced.checkpoints.listCheckpoints(params.id);
  json(res, checkpoints);
}

function restoreChatCheckpoint(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const result = ctx.chatEnhanced.revertToCheckpoint(params.id, params.checkpointId);
  if (!result) return error(res, 'Checkpoint not found', 404);
  json(res, result);
}

function getChatSummary(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const format = getQueryParam(req.url ?? '', 'format') ?? 'standard';
  const messages = ctx.chatService.getMessages(params.id, { limit: 1000 });
  const summary = ctx.chatEnhanced.summarizer.summarizeSession(params.id, messages.messages);
  json(res, summary);
}

function searchChatSecrets(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const messages = ctx.chatService.getMessages(params.id, { limit: 1000 });
  const secrets = messages.messages.flatMap((m) => {
    const detected = ctx.chatEnhanced.secretMasking.detectSecrets(m.content);
    return detected.map((s) => ({ messageId: m.id, ...s }));
  });
  json(res, { secrets, total: secrets.length });
}

function getPinnedMessages(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const pins = (ctx.chatService as any).getPinnedMessages(params.id);
  json(res, pins);
}

function pinMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) return error(res, 'userId is required');
  const result = (ctx.chatService as any).pinMessage(params.id, body.userId);
  json(res, result);
}

function unpinMessage(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const result = (ctx.chatService as any).unpinMessage(params.id);
  json(res, result);
}

function getUserBookmarks(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const bookmarks = (ctx.chatService as any).getUserBookmarks(params.userId);
  json(res, bookmarks);
}

function addBookmark(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) return error(res, 'userId is required');
  const result = (ctx.chatService as any).addBookmark(params.id, body.userId, body.note, body.tags);
  json(res, result, 201);
}

function removeBookmark(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.userId) return error(res, 'userId is required');
  const result = (ctx.chatService as any).removeBookmark(params.id, body.userId);
  json(res, result);
}

function getThreads(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const threads = (ctx.chatService as any).getThreads(params.id);
  json(res, threads);
}

function createThread(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const body = getRequestBody(req);
  if (!body?.senderId || !body?.senderType || !body?.content) {
    return error(res, 'senderId, senderType, and content are required');
  }
  const thread = (ctx.chatService as any).createThread(
    params.id,
    body.senderId,
    body.senderType,
    body.content,
  );
  json(res, thread, 201);
}

function getMessageVersions(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const versions = ctx.chatEnhanced.versionHistory.getVersions(params.id);
  json(res, versions);
}

function exportChatHistory(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: RouteContext,
): void {
  const format = getQueryParam(req.url ?? '', 'format') ?? 'json';
  const messages = ctx.chatService.getMessages(params.id, { limit: 10000 });
  const session = ctx.chatService.getSession(params.id);
  json(res, {
    session,
    messages,
    exportedAt: new Date().toISOString(),
    format,
  });
}

// ─── Router ──────────────────────────────────────────────────────

export function buildRoutes(): Route[] {
  const rawRoutes: Array<{ method: string; pattern: string; handler: Handler }> = [
    { method: 'GET', pattern: '/api/health', handler: getHealth },
    { method: 'GET', pattern: '/api/metrics', handler: getMetrics },

    { method: 'POST', pattern: '/api/sessions', handler: createSession },
    { method: 'GET', pattern: '/api/sessions', handler: listSessions },
    { method: 'GET', pattern: '/api/sessions/:id', handler: getSession },
    { method: 'POST', pattern: '/api/sessions/:id/start', handler: startSession },
    { method: 'POST', pattern: '/api/sessions/:id/pause', handler: pauseSession },
    { method: 'POST', pattern: '/api/sessions/:id/cancel', handler: cancelSession },

    { method: 'GET', pattern: '/api/sessions/:id/agents', handler: listAgents },
    { method: 'GET', pattern: '/api/sessions/:id/agents/:agentId', handler: getAgent },

    { method: 'GET', pattern: '/api/sessions/:id/artifacts', handler: listArtifacts },
    { method: 'GET', pattern: '/api/sessions/:id/checkpoints', handler: listCheckpoints },
    { method: 'GET', pattern: '/api/sessions/:id/dashboard', handler: getDashboard },

    // Chat Routes
    { method: 'POST', pattern: '/api/chat/sessions', handler: createChatSession },
    { method: 'GET', pattern: '/api/chat/sessions', handler: listChatSessions },
    { method: 'GET', pattern: '/api/chat/sessions/:id', handler: getChatSession },
    { method: 'DELETE', pattern: '/api/chat/sessions/:id', handler: deleteChatSession },
    { method: 'POST', pattern: '/api/chat/sessions/:id/messages', handler: sendChatMessage },
    { method: 'GET', pattern: '/api/chat/sessions/:id/messages', handler: getChatMessages },
    { method: 'PUT', pattern: '/api/chat/messages/:id', handler: editChatMessage },
    { method: 'DELETE', pattern: '/api/chat/messages/:id', handler: deleteChatMessage },
    { method: 'POST', pattern: '/api/chat/messages/:id/reply', handler: replyToChatMessage },
    { method: 'POST', pattern: '/api/chat/messages/:id/react', handler: reactToMessage },
    { method: 'POST', pattern: '/api/chat/sessions/:id/read', handler: markAsRead },
    { method: 'GET', pattern: '/api/chat/search', handler: searchChatMessages },
    { method: 'GET', pattern: '/api/chat/sessions/:id/diff', handler: getChatDiff },
    { method: 'POST', pattern: '/api/chat/messages/:id/revert', handler: revertChatMessage },
    { method: 'POST', pattern: '/api/chat/sessions/:id/checkpoint', handler: createChatCheckpoint },
    { method: 'GET', pattern: '/api/chat/sessions/:id/checkpoints', handler: listChatCheckpoints },
    { method: 'POST', pattern: '/api/chat/checkpoints/:checkpointId/restore', handler: restoreChatCheckpoint },
    { method: 'GET', pattern: '/api/chat/sessions/:id/summary', handler: getChatSummary },
    { method: 'GET', pattern: '/api/chat/sessions/:id/secrets', handler: searchChatSecrets },
    { method: 'GET', pattern: '/api/chat/sessions/:id/pins', handler: getPinnedMessages },
    { method: 'POST', pattern: '/api/chat/messages/:id/pin', handler: pinMessage },
    { method: 'DELETE', pattern: '/api/chat/messages/:id/pin', handler: unpinMessage },
    { method: 'GET', pattern: '/api/chat/users/:userId/bookmarks', handler: getUserBookmarks },
    { method: 'POST', pattern: '/api/chat/messages/:id/bookmark', handler: addBookmark },
    { method: 'DELETE', pattern: '/api/chat/messages/:id/bookmark', handler: removeBookmark },
    { method: 'GET', pattern: '/api/chat/sessions/:id/threads', handler: getThreads },
    { method: 'POST', pattern: '/api/chat/sessions/:id/threads', handler: createThread },
    { method: 'GET', pattern: '/api/chat/messages/:id/versions', handler: getMessageVersions },
    { method: 'GET', pattern: '/api/chat/sessions/:id/export', handler: exportChatHistory },
  ];

  return rawRoutes.map((r) => {
    const { regex, paramNames } = parseRoute(r.pattern);
    return { method: r.method, pattern: regex, paramNames, handler: r.handler };
  });
}

export function createRouter(ctx: RouteContext) {
  const routes = buildRoutes();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    const matched = matchRoute(method, url, routes);
    if (!matched) {
      return error(res, 'Not Found', 404);
    }

    try {
      await matched.handler(req, res, matched.params, ctx);
    } catch (err: any) {
      console.error(`[Router] Unhandled error in ${method} ${url}:`, err);
      if (!res.headersSent) {
        error(res, err.message ?? 'Internal Server Error', 500);
      }
    }
  };
}
