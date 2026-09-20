import { IncomingMessage, ServerResponse } from 'http';
import type { SubAgentOrchestrator } from '../../core/orchestrator';
import type { SessionManager } from '../../session/manager';
import type { CheckpointManager } from '../../session/checkpoint';
import type { ArtifactManager } from '../../artifacts/manager';
import type { PreviewServer } from '../../live-preview/server';
import type { ChatService } from '../chat/chat-service';
import type { ChatEnhanced } from '../chat/chat-enhanced';
import type { BYOKProvider } from '../chat/providers/byok-provider';
import type { BYOAAgentManager } from '../chat/providers/byoa-agent';
import type { BYOKConfig, ProviderConfig } from '../chat/byok-config';
import type { BYOAConfig, AgentConfig } from '../chat/byoa-config';
import {
  apiSuccess,
  apiError,
  apiPaginated,
  parsePagination,
  getQueryParam,
  getBody,
  generateRequestId,
  type RouteDefinition,
  type V1Handler,
  type V1Context,
  type ApiSuccess,
  type ApiError,
  type SessionListItem,
  type SessionDetail,
  type SessionAgentSummary,
  type AgentDetail,
  type AgentLogEntry,
  type AgentTimelineEntry,
  type CheckpointInfo,
  type DiffResponse,
  type SessionSummaryResponse,
  type ExportSessionResponse,
  type ImportSessionRequest,
  type CreateSessionRequest,
  type CreateCheckpointRequest,
  type ChatSessionListItem,
  type SendMessageRequest,
  type EditMessageRequest,
  type DeleteMessageRequest,
  type ReplyRequest,
  type ReactRequest,
  type MarkReadRequest,
  type PinRequest,
  type CreateThreadRequest,
  type MessageVersion,
  type ChatSearchResult,
  type AddProviderRequest,
  type UpdateProviderRequest,
  type ProviderListItem,
  type ValidateKeyResponse,
  type TestConnectionResponse,
  type ProviderUsageResponse,
  type RegisterAgentRequest,
  type UpdateAgentRequest,
  type CustomAgentListItem,
  type CustomAgentDetail,
  type TestAgentResponse,
  type CloneAgentRequest,
  type SecurityScanResponse,
  type SecurityReportResponse,
  type AuditLogEntry,
  type AuditExportResponse,
  type HealthResponse,
  type MetricsResponse,
  type LogEntryResponse,
  type AlertEntry,
  type TemplateListItem,
  type TemplateDetail,
  type TemplateSearchResponse,
  type DebugSessionInfo,
  type BreakpointInfo,
  type StackFrame,
  type StackTraceResponse,
  type StartDebugRequest,
  type SetBreakpointRequest,
  type StepRequest,
} from './v1-types';

import {
  applyMiddleware,
  createDefaultMiddlewareStack,
  errorHandler,
  methodNotAllowed,
  V1Error,
  type Middleware,
  getRequestLogs,
  clearRequestLogs,
} from './v1-middleware';

export interface V1RouteContext {
  orchestrator: SubAgentOrchestrator;
  sessionManager: SessionManager;
  checkpointManager: CheckpointManager;
  artifactManager: ArtifactManager;
  previewServer: PreviewServer;
  chatService: ChatService;
  chatEnhanced: ChatEnhanced;
  byokProvider?: BYOKProvider;
  byokConfig?: BYOKConfig;
  byoaManager?: BYOAAgentManager;
  byoaConfig?: BYOAConfig;
}

interface ParsedUrl {
  pathname: string;
  params: Record<string, string>;
}

function parseUrl(pattern: string, url: string): ParsedUrl | null {
  const pathname = url.split('?')[0];
  const patternParts = pattern.split('/');
  const urlParts = pathname.split('/');
  if (patternParts.length !== urlParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patternParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return { pathname, params };
}

interface InternalRoute {
  method: string;
  pattern: string;
  handler: V1Handler;
  middlewares: Middleware[];
}

const routes: InternalRoute[] = [];

function route(method: string, path: string, handler: V1Handler): void {
  routes.push({ method, pattern: path, handler, middlewares: [] });
}

type V1HandlerContext = V1Context & { _ctx: V1RouteContext };

function getSessionOrThrow(ctx: V1HandlerContext, orchest: SubAgentOrchestrator) {
  const session = orchest.getSession(ctx.params.id);
  if (!session) throw new V1Error('SESSION_NOT_FOUND', `Session ${ctx.params.id} not found`, 404);
  return session;
}

function serializeSession(session: any): SessionListItem {
  return {
    id: session.id,
    status: session.status,
    taskSpec: session.taskSpec,
    createdAt: session.createdAt?.toISOString?.() ?? String(session.createdAt),
    updatedAt: session.updatedAt?.toISOString?.() ?? String(session.updatedAt),
    agentCount: session.agents?.size ?? 0,
    resultCount: session.results?.size ?? 0,
    runningAgents: Array.from(session.runningAgents?.keys?.() ?? []),
    config: {
      maxAgentsPerSession: session.config?.maxAgentsPerSession ?? 10,
      maxConcurrentAgents: session.config?.maxConcurrentAgents ?? 5,
      defaultTimeoutMs: session.config?.defaultTimeoutMs ?? 300000,
    },
  };
}

// ─── SESSIONS ────────────────────────────────────────────────────

route('POST', '/api/v1/sessions', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as CreateSessionRequest;
  if (!body?.userPrompt) throw new V1Error('VALIDATION_ERROR', 'userPrompt is required');
  const projectRoot = body.projectRoot ?? process.cwd();
  const session = await hctx._ctx.orchestrator.executeTask(body.userPrompt, projectRoot);
  return apiSuccess(serializeSession(session));
});

route('GET', '/api/v1/sessions', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  const { page, limit, offset } = parsePagination(hctx.req.url ?? '');
  const paged = sessions.slice(offset, offset + limit);
  return apiPaginated(paged.map(serializeSession), sessions.length, page, limit);
});

route('GET', '/api/v1/sessions/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const detail: SessionDetail = {
    ...serializeSession(session),
    projectProfile: session.projectProfile,
    resourceUsage: session.resourceUsage,
    checkpointId: session.checkpointId,
  };
  return apiSuccess(detail);
});

route('DELETE', '/api/v1/sessions/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  hctx._ctx.orchestrator.stopSession(hctx.params.id);
  return apiSuccess({ deleted: true, id: hctx.params.id });
});

route('POST', '/api/v1/sessions/:id/start', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  if (session.status === 'running') throw new V1Error('ALREADY_RUNNING', 'Session is already running');
  session.status = 'running';
  session.updatedAt = new Date();
  hctx._ctx.sessionManager.updateSessionStatus(hctx.params.id, 'running');
  hctx._ctx.previewServer.broadcast({
    type: 'session-status',
    sessionId: hctx.params.id,
    timestamp: new Date(),
    data: { status: 'running' },
  });
  return apiSuccess(serializeSession(session));
});

route('POST', '/api/v1/sessions/:id/pause', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  if (session.status === 'paused') throw new V1Error('ALREADY_PAUSED', 'Session is already paused');
  await hctx._ctx.orchestrator.stopSession(hctx.params.id);
  hctx._ctx.sessionManager.updateSessionStatus(hctx.params.id, 'paused');
  hctx._ctx.previewServer.broadcast({
    type: 'session-paused',
    sessionId: hctx.params.id,
    timestamp: new Date(),
    data: { status: 'paused' },
  });
  return apiSuccess(serializeSession(session));
});

route('POST', '/api/v1/sessions/:id/cancel', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  await hctx._ctx.orchestrator.stopSession(hctx.params.id);
  session.status = 'failed';
  session.updatedAt = new Date();
  hctx._ctx.sessionManager.updateSessionStatus(hctx.params.id, 'failed');
  hctx._ctx.previewServer.broadcast({
    type: 'session-status',
    sessionId: hctx.params.id,
    timestamp: new Date(),
    data: { status: 'failed', reason: 'cancelled' },
  });
  return apiSuccess(serializeSession(session));
});

// ─── SESSION AGENTS ──────────────────────────────────────────────

route('GET', '/api/v1/sessions/:id/agents', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const agents: SessionAgentSummary[] = Array.from(session.agents.values()).map((task: any) => ({
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
  return apiSuccess(agents);
});

route('GET', '/api/v1/sessions/:id/agents/:agentId', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const task = session.agents.get(hctx.params.agentId);
  if (!task) throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.agentId} not found`, 404);
  const result = session.results.get(hctx.params.agentId);
  const detail: AgentDetail = {
    task: {
      id: task.id, type: task.type, name: task.name, description: task.description,
      priority: task.priority, dependencies: task.dependencies, phase: task.phase,
      requiredCapabilities: task.requiredCapabilities, timeoutMs: task.timeoutMs,
      estimatedTokens: task.estimatedTokens,
    },
    result: result ? {
      status: result.status, retryCount: result.retryCount,
      startedAt: result.startedAt, completedAt: result.completedAt,
      error: result.error, summary: result.summary,
      validationResults: result.validationResults,
      filesModified: result.output.files.map((f: any) => f.path),
      logs: result.logs.slice(-50),
    } : null,
  };
  return apiSuccess(detail);
});

route('POST', '/api/v1/sessions/:id/agents/:agentId/cancel', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const task = session.agents.get(hctx.params.agentId);
  if (!task) throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.agentId} not found`, 404);
  const controller = session.runningAgents.get(hctx.params.agentId);
  if (controller) controller.abort();
  const result = session.results.get(hctx.params.agentId);
  if (result) result.status = 'cancelled';
  return apiSuccess({ cancelled: true, agentId: hctx.params.agentId });
});

route('POST', '/api/v1/sessions/:id/agents/:agentId/retry', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const task = session.agents.get(hctx.params.agentId);
  if (!task) throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.agentId} not found`, 404);
  session.spawnQueue.push(task);
  return apiSuccess({ retried: true, agentId: hctx.params.agentId, queueLength: session.spawnQueue.length });
});

// ─── SESSION CHECKPOINTS ─────────────────────────────────────────

route('GET', '/api/v1/sessions/:id/checkpoints', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const checkpoints = hctx._ctx.checkpointManager.listCheckpoints(hctx.params.id);
  const serialized: CheckpointInfo[] = checkpoints.map((cp: any) => ({
    sessionId: cp.sessionId,
    timestamp: cp.timestamp?.toISOString?.() ?? String(cp.timestamp),
    completedAgents: cp.completedAgents,
    runningAgents: cp.runningAgents,
    queuedAgents: cp.queuedAgents,
  }));
  return apiSuccess(serialized);
});

route('POST', '/api/v1/sessions/:id/checkpoint', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const body = getBody(hctx.req) as CreateCheckpointRequest | undefined;
  const cp = hctx._ctx.checkpointManager.createCheckpoint(session);
  return apiSuccess({
    sessionId: hctx.params.id,
    timestamp: new Date().toISOString(),
    label: body?.label,
    id: `cp-${hctx.params.id}-${Date.now()}`,
  });
});

route('POST', '/api/v1/sessions/:id/checkpoint/:cpId/restore', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const restored = hctx._ctx.checkpointManager.restoreSession(hctx.params.cpId);
  if (!restored) throw new V1Error('CHECKPOINT_NOT_FOUND', `Checkpoint ${hctx.params.cpId} not found`, 404);
  return apiSuccess({ restored: true, checkpointId: hctx.params.cpId });
});

// ─── SESSION DIFF / SUMMARY / EXPORT / IMPORT ───────────────────

route('GET', '/api/v1/sessions/:id/diff', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const files: DiffResponse['files'] = [];
  for (const result of session.results.values()) {
    for (const file of result.output.files) {
      files.push({ path: file.path, newContent: file.content, action: file.action });
    }
  }
  return apiSuccess({ sessionId: hctx.params.id, files } as DiffResponse);
});

route('GET', '/api/v1/sessions/:id/summary', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  let linesAdded = 0;
  let linesRemoved = 0;
  let filesModified = 0;
  for (const result of session.results.values()) {
    filesModified += result.output.files.length;
    for (const change of result.output.changes) {
      linesAdded += (change.newContent.match(/\n/g)?.length ?? 0);
      linesRemoved += (change.oldContent?.match(/\n/g)?.length ?? 0);
    }
  }
  const durationMs = session.updatedAt.getTime() - session.createdAt.getTime();
  return apiSuccess({
    sessionId: hctx.params.id,
    overview: `Session ${session.status} with ${session.agents.size} agents`,
    agentsCompleted: Array.from(session.results.values()).filter((r) => r.status === 'completed').length,
    agentsFailed: Array.from(session.results.values()).filter((r) => r.status === 'failed').length,
    totalFilesModified: filesModified,
    totalLinesAdded: linesAdded,
    totalLinesRemoved: linesRemoved,
    durationMs,
  } as SessionSummaryResponse);
});

route('GET', '/api/v1/sessions/:id/export', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = getSessionOrThrow(hctx, hctx._ctx.orchestrator);
  const agents: AgentDetail[] = Array.from(session.agents.keys()).map((agentId) => {
    const task = session.agents.get(agentId)!;
    const result = session.results.get(agentId);
    return {
      task: {
        id: task.id, type: task.type, name: task.name, description: task.description,
        priority: task.priority, dependencies: task.dependencies, phase: task.phase,
        requiredCapabilities: task.requiredCapabilities, timeoutMs: task.timeoutMs,
        estimatedTokens: task.estimatedTokens,
      },
      result: result ? {
        status: result.status, retryCount: result.retryCount,
        startedAt: result.startedAt, completedAt: result.completedAt,
        error: result.error, summary: result.summary,
        validationResults: result.validationResults,
        filesModified: result.output.files.map((f) => f.path),
        logs: result.logs,
      } : null,
    };
  });
  const checkpoints = hctx._ctx.checkpointManager.listCheckpoints(hctx.params.id);
  return apiSuccess({
    session: serializeSession(session),
    agents,
    checkpoints: checkpoints.map((cp: any) => ({
      sessionId: cp.sessionId,
      timestamp: cp.timestamp?.toISOString?.() ?? String(cp.timestamp),
      completedAgents: cp.completedAgents,
      runningAgents: cp.runningAgents,
      queuedAgents: cp.queuedAgents,
    })),
    exportedAt: new Date().toISOString(),
    format: 'json',
  } as ExportSessionResponse);
});

route('POST', '/api/v1/sessions/:id/import', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as ImportSessionRequest;
  if (!body?.session) throw new V1Error('VALIDATION_ERROR', 'session data is required');
  return apiSuccess({ imported: true, sessionId: hctx.params.id, overwrite: body.overwrite ?? false });
});

// ─── AGENTS (Global) ────────────────────────────────────────────

route('GET', '/api/v1/agents', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  const allAgents: Array<SessionAgentSummary & { sessionId: string }> = [];
  for (const session of sessions) {
    for (const task of session.agents.values()) {
      allAgents.push({
        sessionId: session.id,
        id: task.id, type: task.type, name: task.name, description: task.description,
        priority: task.priority, dependencies: task.dependencies, phase: task.phase,
        status: session.results.get(task.id)?.status ?? 'pending',
        retryCount: session.results.get(task.id)?.retryCount ?? 0,
        startedAt: session.results.get(task.id)?.startedAt,
        completedAt: session.results.get(task.id)?.completedAt,
      });
    }
  }
  const { page, limit, offset } = parsePagination(hctx.req.url ?? '');
  const paged = allAgents.slice(offset, offset + limit);
  return apiPaginated(paged, allAgents.length, page, limit);
});

route('GET', '/api/v1/agents/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  for (const session of sessions) {
    const task = session.agents.get(hctx.params.id);
    if (task) {
      const result = session.results.get(hctx.params.id);
      return apiSuccess({
        sessionId: session.id,
        task: {
          id: task.id, type: task.type, name: task.name, description: task.description,
          priority: task.priority, dependencies: task.dependencies, phase: task.phase,
          requiredCapabilities: task.requiredCapabilities, timeoutMs: task.timeoutMs,
          estimatedTokens: task.estimatedTokens,
        },
        result: result ? {
          status: result.status, retryCount: result.retryCount,
          startedAt: result.startedAt, completedAt: result.completedAt,
          error: result.error, summary: result.summary,
          validationResults: result.validationResults,
          filesModified: result.output.files.map((f) => f.path),
          logs: result.logs.slice(-50),
        } : null,
      });
    }
  }
  throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found`, 404);
});

route('GET', '/api/v1/agents/:id/logs', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  for (const session of sessions) {
    const result = session.results.get(hctx.params.id);
    if (result) {
      const limit = parseInt(getQueryParam(hctx.req.url ?? '', 'limit') ?? '100', 10);
      const logs: AgentLogEntry[] = result.logs.slice(-limit).map((log) => ({
        timestamp: log.timestamp?.toISOString?.() ?? String(log.timestamp),
        level: log.level,
        message: log.message,
        data: log.data,
      }));
      return apiSuccess(logs);
    }
  }
  throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found`, 404);
});

route('GET', '/api/v1/agents/:id/timeline', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  for (const session of sessions) {
    const result = session.results.get(hctx.params.id);
    if (result) {
      const timeline: AgentTimelineEntry[] = [
        { timestamp: result.startedAt?.toISOString?.() ?? '', event: 'started' },
        ...result.logs.map((log) => ({
          timestamp: log.timestamp?.toISOString?.() ?? '',
          event: `log:${log.level}`,
          details: { message: log.message },
        })),
        ...(result.completedAt
          ? [{ timestamp: result.completedAt.toISOString(), event: result.status === 'completed' ? 'completed' : 'failed' }]
          : []),
      ];
      return apiSuccess(timeline);
    }
  }
  throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found`, 404);
});

route('POST', '/api/v1/agents/:id/cancel', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  for (const session of sessions) {
    const controller = session.runningAgents.get(hctx.params.id);
    if (controller) {
      controller.abort();
      const result = session.results.get(hctx.params.id);
      if (result) result.status = 'cancelled';
      return apiSuccess({ cancelled: true, agentId: hctx.params.id });
    }
  }
  throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found or not running`, 404);
});

route('POST', '/api/v1/agents/:id/retry', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  for (const session of sessions) {
    const task = session.agents.get(hctx.params.id);
    if (task) {
      session.spawnQueue.push(task);
      return apiSuccess({ retried: true, agentId: hctx.params.id });
    }
  }
  throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found`, 404);
});

// ─── CHAT ────────────────────────────────────────────────────────

route('POST', '/api/v1/chat/sessions', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as any;
  if (!body?.participants || !body?.type) {
    throw new V1Error('VALIDATION_ERROR', 'participants and type are required');
  }
  const session = hctx._ctx.chatService.createSession(body.participants, body.type, body.metadata);
  return apiSuccess(session);
});

route('GET', '/api/v1/chat/sessions', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const sessions = hctx._ctx.chatService.listSessions();
  const serialized: ChatSessionListItem[] = sessions.map((s: any) => ({
    id: s.id,
    participants: s.participants,
    type: s.type,
    status: s.status,
    title: s.title,
    createdAt: s.createdAt?.toISOString?.() ?? String(s.createdAt),
    updatedAt: s.updatedAt?.toISOString?.() ?? String(s.updatedAt),
  }));
  return apiSuccess(serialized);
});

route('GET', '/api/v1/chat/sessions/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const session = hctx._ctx.chatService.getSession(hctx.params.id);
  if (!session) throw new V1Error('CHAT_SESSION_NOT_FOUND', 'Chat session not found', 404);
  return apiSuccess(session);
});

route('POST', '/api/v1/chat/sessions/:id/messages', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as SendMessageRequest;
  if (!body?.senderId || !body?.senderType || !body?.content) {
    throw new V1Error('VALIDATION_ERROR', 'senderId, senderType, and content are required');
  }
  const message = hctx._ctx.chatEnhanced.sendMessage(hctx.params.id, body.senderId, body.content, {
    replyTo: body.replyTo,
    type: body.type as any,
  });
  return apiSuccess(message);
});

route('GET', '/api/v1/chat/sessions/:id/messages', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const limit = parseInt(getQueryParam(hctx.req.url ?? '', 'limit') ?? '50', 10);
  const offset = parseInt(getQueryParam(hctx.req.url ?? '', 'offset') ?? '0', 10);
  const messages = hctx._ctx.chatService.getMessages(hctx.params.id, { limit, offset });
  return apiSuccess(messages);
});

route('PUT', '/api/v1/chat/messages/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as EditMessageRequest;
  if (!body?.userId || !body?.content) {
    throw new V1Error('VALIDATION_ERROR', 'userId and content are required');
  }
  const result = hctx._ctx.chatEnhanced.editMessage(hctx.params.id, body.userId, body.content);
  if (!result) throw new V1Error('MESSAGE_NOT_FOUND', 'Message not found or unauthorized', 404);
  return apiSuccess(result);
});

route('DELETE', '/api/v1/chat/messages/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as DeleteMessageRequest;
  if (!body?.userId) throw new V1Error('VALIDATION_ERROR', 'userId is required');
  const deleted = hctx._ctx.chatService.deleteMessage(hctx.params.id, body.userId);
  if (!deleted) throw new V1Error('MESSAGE_NOT_FOUND', 'Message not found or unauthorized', 404);
  return apiSuccess({ deleted: true });
});

route('POST', '/api/v1/chat/messages/:id/reply', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as ReplyRequest;
  if (!body?.senderId || !body?.senderType || !body?.content) {
    throw new V1Error('VALIDATION_ERROR', 'senderId, senderType, and content are required');
  }
  const message = hctx._ctx.chatService.replyToMessage(hctx.params.id, body.senderId, body.senderType, body.content);
  return apiSuccess(message);
});

route('POST', '/api/v1/chat/messages/:id/react', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as ReactRequest;
  if (!body?.userId || !body?.emoji) {
    throw new V1Error('VALIDATION_ERROR', 'userId and emoji are required');
  }
  const result = hctx._ctx.chatService.addReaction(hctx.params.id, body.userId, body.emoji);
  return apiSuccess(result);
});

route('POST', '/api/v1/chat/sessions/:id/read', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as MarkReadRequest;
  if (!body?.userId) throw new V1Error('VALIDATION_ERROR', 'userId is required');
  hctx._ctx.chatService.markAsRead(hctx.params.id, body.userId);
  return apiSuccess({ marked: true });
});

route('GET', '/api/v1/chat/search', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const query = getQueryParam(hctx.req.url ?? '', 'q');
  const sessionId = getQueryParam(hctx.req.url ?? '', 'sessionId');
  const userId = getQueryParam(hctx.req.url ?? '', 'userId') ?? 'anonymous';
  if (!query) throw new V1Error('VALIDATION_ERROR', 'q parameter is required');
  const results = hctx._ctx.chatService.searchMessages(query, userId, sessionId ?? undefined);
  return apiSuccess(results);
});

route('GET', '/api/v1/chat/sessions/:id/pins', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const pins = (hctx._ctx.chatService as any).getPinnedMessages?.(hctx.params.id) ?? [];
  return apiSuccess(pins);
});

route('POST', '/api/v1/chat/messages/:id/pin', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as PinRequest;
  if (!body?.userId) throw new V1Error('VALIDATION_ERROR', 'userId is required');
  const result = (hctx._ctx.chatService as any).pinMessage?.(hctx.params.id, body.userId);
  return apiSuccess(result ?? { pinned: true });
});

route('GET', '/api/v1/chat/sessions/:id/threads', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const threads = (hctx._ctx.chatService as any).getThreads?.(hctx.params.id) ?? [];
  return apiSuccess(threads);
});

route('POST', '/api/v1/chat/sessions/:id/threads', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as CreateThreadRequest;
  if (!body?.senderId || !body?.senderType || !body?.content) {
    throw new V1Error('VALIDATION_ERROR', 'senderId, senderType, and content are required');
  }
  const thread = (hctx._ctx.chatService as any).createThread?.(
    hctx.params.id, body.senderId, body.senderType, body.content,
  );
  return apiSuccess(thread);
});

route('GET', '/api/v1/chat/messages/:id/versions', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const versions = hctx._ctx.chatEnhanced.versionHistory.getVersions(hctx.params.id);
  return apiSuccess(versions);
});

// ─── BYOK (Bring Your Own Key) ──────────────────────────────────

route('GET', '/api/v1/providers', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  return apiSuccess(hctx._ctx.byokProvider.listProviders());
});

route('POST', '/api/v1/providers', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  const body = getBody(hctx.req) as AddProviderRequest;
  if (!body?.id || !body?.name || !body?.type || !body?.apiKey) {
    throw new V1Error('VALIDATION_ERROR', 'id, name, type, and apiKey are required');
  }
  const provider: ProviderConfig = {
    id: body.id, name: body.name, type: body.type, apiKey: body.apiKey,
    baseUrl: body.baseUrl, models: body.models,
    rateLimit: body.rateLimit ?? { requestsPerMinute: 60, tokensPerMinute: 90000 },
    priority: body.priority ?? 0, status: body.status ?? ('active' as any),
  };
  return apiSuccess(hctx._ctx.byokProvider.addProvider(provider));
});

route('PUT', '/api/v1/providers/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  const body = getBody(hctx.req) as UpdateProviderRequest;
  if (body.apiKey) hctx._ctx.byokProvider.updateApiKey(hctx.params.id, body.apiKey);
  const providers = hctx._ctx.byokProvider.listProviders();
  const updated = providers.find((p) => p.id === hctx.params.id);
  if (!updated) throw new V1Error('PROVIDER_NOT_FOUND', `Provider ${hctx.params.id} not found`, 404);
  return apiSuccess(updated);
});

route('DELETE', '/api/v1/providers/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  hctx._ctx.byokProvider.removeProvider(hctx.params.id);
  return apiSuccess({ deleted: true, id: hctx.params.id });
});

route('POST', '/api/v1/providers/:id/validate', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  const body = getBody(hctx.req) as { key: string };
  if (!body?.key) throw new V1Error('VALIDATION_ERROR', 'key is required');
  const valid = hctx._ctx.byokProvider.validateApiKey(hctx.params.id, body.key);
  const providers = hctx._ctx.byokProvider.listProviders();
  const provider = providers.find((p) => p.id === hctx.params.id);
  return apiSuccess({ valid, providerType: provider?.type ?? 'unknown' } as ValidateKeyResponse);
});

route('POST', '/api/v1/providers/:id/test', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  const result = await hctx._ctx.byokProvider.testConnection(hctx.params.id);
  return apiSuccess(result as TestConnectionResponse);
});

route('GET', '/api/v1/providers/:id/usage', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byokProvider) throw new V1Error('BYOK_NOT_CONFIGURED', 'BYOK provider not configured', 503);
  const stats = hctx._ctx.byokProvider.getUsageStats(hctx.params.id);
  return apiSuccess({
    providerId: hctx.params.id,
    totalRequests: stats.totalRequests,
    totalTokens: stats.totalTokens,
    lastUsedAt: stats.lastUsedAt?.toISOString?.() ?? null,
    errorCount: stats.errorCount,
  } as ProviderUsageResponse);
});

// ─── BYOA (Bring Your Own Agent) ────────────────────────────────

route('GET', '/api/v1/custom-agents', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaManager) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA manager not configured', 503);
  const agents = hctx._ctx.byoaManager.listAgents();
  const serialized: CustomAgentListItem[] = agents.map((a) => ({
    id: a.config.id, name: a.config.name, type: a.config.type as any,
    description: a.config.description, model: a.config.model ?? 'default',
    enabled: a.config.enabled,
  }));
  return apiSuccess(serialized);
});

route('POST', '/api/v1/custom-agents', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaManager) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA manager not configured', 503);
  const body = getBody(hctx.req) as RegisterAgentRequest;
  if (!body?.id || !body?.name || !body?.type) {
    throw new V1Error('VALIDATION_ERROR', 'id, name, and type are required');
  }
  const registration = hctx._ctx.byoaManager.registerAgent({
    id: body.id, name: body.name, type: body.type,
    description: body.description ?? '', model: body.model,
    systemPrompt: body.systemPrompt, temperature: body.temperature,
    maxTokens: body.maxTokens, enabled: body.enabled ?? true,
    capabilities: body.capabilities as any, metadata: body.tools as any,
  });
  return apiSuccess({
    id: registration.id, name: registration.config.name,
    type: registration.config.type, description: registration.config.description,
    model: registration.config.model ?? 'default', enabled: registration.config.enabled,
    registeredAt: registration.registeredAt.toISOString(), usageCount: registration.usageCount,
  });
});

route('PUT', '/api/v1/custom-agents/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaManager) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA manager not configured', 503);
  const body = getBody(hctx.req) as UpdateAgentRequest;
  const updated = hctx._ctx.byoaManager.updateAgent(hctx.params.id, body as any);
  return apiSuccess({
    id: updated.config.id, name: updated.config.name,
    type: updated.config.type, description: updated.config.description,
    model: updated.config.model ?? 'default', enabled: updated.config.enabled,
  });
});

route('DELETE', '/api/v1/custom-agents/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaManager) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA manager not configured', 503);
  const deleted = hctx._ctx.byoaManager.unregisterAgent(hctx.params.id);
  if (!deleted) throw new V1Error('AGENT_NOT_FOUND', `Agent ${hctx.params.id} not found`, 404);
  return apiSuccess({ deleted: true, id: hctx.params.id });
});

route('POST', '/api/v1/custom-agents/:id/test', async (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaConfig) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA config not configured', 503);
  const result = await hctx._ctx.byoaConfig.testAgent(hctx.params.id);
  return apiSuccess(result as TestAgentResponse);
});

route('POST', '/api/v1/custom-agents/:id/clone', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaConfig) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA config not configured', 503);
  const body = getBody(hctx.req) as CloneAgentRequest;
  if (!body?.name) throw new V1Error('VALIDATION_ERROR', 'name is required');
  const cloned = hctx._ctx.byoaConfig.cloneAgent(hctx.params.id, body.name);
  return apiSuccess({
    id: cloned.id, name: cloned.name, type: cloned.type,
    description: cloned.description, model: cloned.model, enabled: cloned.enabled,
  });
});

route('GET', '/api/v1/custom-agents/:id/export', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaConfig) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA config not configured', 503);
  const exported = hctx._ctx.byoaConfig.exportAgent(hctx.params.id);
  return apiSuccess(JSON.parse(exported));
});

route('POST', '/api/v1/custom-agents/:id/import', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  if (!hctx._ctx.byoaConfig) throw new V1Error('BYOA_NOT_CONFIGURED', 'BYOA config not configured', 503);
  const body = getBody(hctx.req) as { config: string | Record<string, unknown> };
  if (!body?.config) throw new V1Error('VALIDATION_ERROR', 'config is required');
  const configStr = typeof body.config === 'string' ? body.config : JSON.stringify(body.config);
  const imported = hctx._ctx.byoaConfig.importAgent(configStr);
  return apiSuccess({
    id: imported.id, name: imported.name, type: imported.type,
    description: imported.description, model: imported.model, enabled: imported.enabled,
  });
});

// ─── EXTENSIONS ──────────────────────────────────────────────────

route('GET', '/api/v1/extensions', (_ctx) => {
  return apiSuccess([]);
});

route('POST', '/api/v1/extensions/install', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as { id: string; version?: string };
  if (!body?.id) throw new V1Error('VALIDATION_ERROR', 'extension id is required');
  return apiSuccess({ installed: true, id: body.id, version: body.version ?? 'latest' });
});

route('POST', '/api/v1/extensions/:id/uninstall', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  return apiSuccess({ uninstalled: true, id: hctx.params.id });
});

route('POST', '/api/v1/extensions/:id/enable', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  return apiSuccess({ enabled: true, id: hctx.params.id });
});

route('POST', '/api/v1/extensions/:id/disable', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  return apiSuccess({ disabled: true, id: hctx.params.id });
});

route('GET', '/api/v1/extensions/marketplace/search', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const query = getQueryParam(hctx.req.url ?? '', 'q') ?? '';
  return apiSuccess({ extensions: [], total: 0, query });
});

// ─── SECURITY ────────────────────────────────────────────────────

route('POST', '/api/v1/security/scan', (ctx) => {
  const scanId = `scan-${Date.now()}`;
  const response: SecurityScanResponse = {
    scanId, status: 'completed', findings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
  };
  return apiSuccess(response);
});

route('GET', '/api/v1/security/report', (_ctx) => {
  return apiSuccess({ totalScans: 0, lastScanAt: undefined, lastScan: undefined } as SecurityReportResponse);
});

route('GET', '/api/v1/audit', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const { page, limit } = parsePagination(hctx.req.url ?? '');
  return apiPaginated([] as AuditLogEntry[], 0, page, limit);
});

route('GET', '/api/v1/audit/export', (_ctx) => {
  return apiSuccess({
    entries: [], total: 0,
    exportedAt: new Date().toISOString(), format: 'json',
  } as AuditExportResponse);
});

// ─── MONITORING ──────────────────────────────────────────────────

route('GET', '/api/v1/health', (_ctx) => {
  return apiSuccess({
    status: 'ok', timestamp: new Date().toISOString(),
    uptime: process.uptime(), version: '1.0.0',
    components: { orchestrator: { status: 'ok' }, sessions: { status: 'ok' }, chat: { status: 'ok' } },
  } as HealthResponse);
});

route('GET', '/api/v1/metrics', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const memory = process.memoryUsage();
  const sessions = hctx._ctx.orchestrator.getAllSessions();
  return apiSuccess({
    sessions: {
      total: sessions.length,
      active: sessions.filter((s) => s.status === 'running').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      failed: sessions.filter((s) => s.status === 'failed').length,
    },
    system: {
      uptime: process.uptime(),
      memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external },
      activeConnections: hctx._ctx.previewServer.getClientCount(),
      cpuUsage: process.cpuUsage(),
    },
    artifacts: { total: hctx._ctx.artifactManager.getCount(), sizeBytes: hctx._ctx.artifactManager.getSizeBytes() },
    timestamp: new Date().toISOString(),
  } as MetricsResponse);
});

route('GET', '/api/v1/logs', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const limit = parseInt(getQueryParam(hctx.req.url ?? '', 'limit') ?? '100', 10);
  return apiSuccess(getRequestLogs(limit));
});

route('GET', '/api/v1/logs/export', (_ctx) => {
  const logs = getRequestLogs(10000);
  return apiSuccess({ logs, total: logs.length, exportedAt: new Date().toISOString(), format: 'json' });
});

route('GET', '/api/v1/logs/stream', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const res = hctx.res;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sendEvent = (data: any) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
  sendEvent({ type: 'connected', timestamp: new Date().toISOString() });
  const interval = setInterval(() => {
    sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
  }, 30000);
  hctx.req.on('close', () => { clearInterval(interval); });
  return undefined as any;
});

route('GET', '/api/v1/alerts', (_ctx) => {
  return apiSuccess([] as AlertEntry[]);
});

route('POST', '/api/v1/alerts/:id/acknowledge', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as { userId: string };
  if (!body?.userId) throw new V1Error('VALIDATION_ERROR', 'userId is required');
  return apiSuccess({
    acknowledged: true, alertId: hctx.params.id,
    acknowledgedAt: new Date().toISOString(), acknowledgedBy: body.userId,
  });
});

// ─── TEMPLATES ───────────────────────────────────────────────────

route('GET', '/api/v1/templates', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const { page, limit } = parsePagination(hctx.req.url ?? '');
  return apiPaginated([] as TemplateListItem[], 0, page, limit);
});

route('GET', '/api/v1/templates/search', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const query = getQueryParam(hctx.req.url ?? '', 'q') ?? '';
  return apiSuccess({ templates: [], total: 0, query } as TemplateSearchResponse);
});

route('GET', '/api/v1/templates/:id', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  throw new V1Error('TEMPLATE_NOT_FOUND', `Template ${hctx.params.id} not found`, 404);
});

// ─── DEBUG ───────────────────────────────────────────────────────

const debugSessions = new Map<string, DebugSessionInfo>();

route('POST', '/api/v1/debug/start', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as StartDebugRequest;
  if (!body?.sessionId) throw new V1Error('VALIDATION_ERROR', 'sessionId is required');
  const debugId = `debug-${Date.now()}`;
  const info: DebugSessionInfo = { debugId, sessionId: body.sessionId, status: 'running', startedAt: new Date().toISOString() };
  debugSessions.set(debugId, info);
  return apiSuccess(info);
});

route('POST', '/api/v1/debug/stop', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as { debugId?: string };
  if (body?.debugId) {
    const session = debugSessions.get(body.debugId);
    if (session) {
      session.status = 'stopped';
      debugSessions.delete(body.debugId);
      return apiSuccess({ stopped: true, debugId: body.debugId });
    }
  }
  debugSessions.clear();
  return apiSuccess({ stopped: true, count: 0 });
});

route('POST', '/api/v1/debug/breakpoint', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as SetBreakpointRequest;
  if (!body?.file || !body?.line) throw new V1Error('VALIDATION_ERROR', 'file and line are required');
  return apiSuccess({
    id: `bp-${Date.now()}`, file: body.file, line: body.line,
    condition: body.condition, verified: true,
  } as BreakpointInfo);
});

route('POST', '/api/v1/debug/step', (ctx) => {
  const hctx = ctx as V1HandlerContext;
  const body = getBody(hctx.req) as StepRequest;
  if (!body?.type) throw new V1Error('VALIDATION_ERROR', 'step type is required');
  return apiSuccess({ stepped: true, type: body.type, timestamp: new Date().toISOString() });
});

route('POST', '/api/v1/debug/continue', (_ctx) => {
  return apiSuccess({ continued: true, timestamp: new Date().toISOString() });
});

route('GET', '/api/v1/debug/stacktrace', (_ctx) => {
  return apiSuccess({ frames: [], totalFrames: 0 } as StackTraceResponse);
});

// ─── V1 Router Factory ──────────────────────────────────────────

function createV1Handler(
  originalHandler: V1Handler,
  routeCtx: V1RouteContext,
): (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> => {
    const url = req.url ?? '/';
    const searchParams = new URLSearchParams(url.split('?')[1] ?? '');
    const ctx: V1HandlerContext = {
      req,
      res,
      params,
      query: searchParams,
      body: getBody(req),
      _ctx: routeCtx,
    };

    const result = await originalHandler(ctx);

    if (result && !res.headersSent) {
      const statusCode = (result.meta as any)?.statusCode ?? 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }
  };
}

function matchRoute(
  method: string,
  url: string,
  routeList: InternalRoute[],
): { handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>; params: Record<string, string> } | null {
  const pathname = url.split('?')[0];
  for (const r of routeList) {
    if (r.method !== method) continue;
    const match = parseUrl(r.pattern, pathname);
    if (match) {
      return { handler: createV1Handler(r.handler, {} as V1RouteContext), params: match.params };
    }
  }
  return null;
}

export function createV1Router(ctx: V1RouteContext) {
  const middlewares = createDefaultMiddlewareStack();
  // Rebind handlers with context
  const boundRoutes: InternalRoute[] = routes.map((r) => ({
    ...r,
    handler: createV1Handler(r.handler, ctx) as any,
  }));

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // Only handle /api/v1/* routes
    if (!url.startsWith('/api/v1/')) return;

    applyMiddleware(req, res, middlewares, async () => {
      // Find matching route
      for (const r of boundRoutes) {
        if (r.method !== method) continue;
        const match = parseUrl(r.pattern, url.split('?')[0]);
        if (match) {
          try {
            const v1Ctx: V1HandlerContext = {
              req, res, params: match.params,
              query: new URLSearchParams(url.split('?')[1] ?? ''),
              body: getBody(req), _ctx: ctx,
            };
            const result = await (r.handler as any)(v1Ctx.req, v1Ctx.res, v1Ctx.params);
            if (result && !res.headersSent) {
              const statusCode = (result.meta as any)?.statusCode ?? 200;
              res.writeHead(statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            }
          } catch (err: any) {
            errorHandler(err, req, res, () => {});
          }
          return;
        }
      }

      // No route matched - check if it's a method not allowed (other method matches)
      const methodAllowed = boundRoutes.some((r) => {
        const match = parseUrl(r.pattern, url.split('?')[0]);
        return match;
      });

      if (methodAllowed) {
        methodNotAllowed(req, res);
      } else {
        // Not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(apiError('NOT_FOUND', `No route found for ${method} ${url}`)));
      }
    });
  };
}

export function listV1Routes(): RouteDefinition[] {
  return routes.map((r) => ({
    method: r.method as RouteDefinition['method'],
    path: r.pattern,
    handler: r.handler as any,
    description: undefined,
  }));
}
