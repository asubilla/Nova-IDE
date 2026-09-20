import { IncomingMessage, ServerResponse } from 'http';
import type {
  Session,
  SessionConfig,
  AgentTask,
  AgentResult,
  AgentError,
  AgentOutput,
  AgentSummary,
  ValidationResult,
  LogEntry,
  CheckpointData,
  ProjectProfile,
  ResourceProfile,
  QualityGateResult,
  AgentCoordinationMessage,
  TaskSpec,
} from '../../core/types';
import type {
  ChatSession,
  ChatMessage,
  ChatSessionType,
  ChatMessageType,
  ChatReaction,
  ChatReadReceipt,
  PaginatedMessages,
  MessageSearchResult,
} from '../chat/chat-types';
import type {
  ProviderConfig,
  ProviderType,
  ProviderStatus,
  ProviderRateLimit,
  KeyUsageStats,
} from '../chat/byok-config';
import type {
  AgentConfig,
  AgentType,
  AgentCapabilities,
  AgentTool,
  AgentTestResult,
} from '../chat/byoa-config';

// ─── API Envelope Types ───────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
  version: string;
  [key: string]: unknown;
}

export interface ApiPaginated<T> {
  data: T[];
  pagination: PaginationMeta;
  meta?: ApiMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  totalPages: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
  meta?: ApiMeta;
}

// ─── Request/Response: Sessions ──────────────────────────────────

export interface CreateSessionRequest {
  userPrompt: string;
  projectRoot?: string;
  config?: Partial<SessionConfig>;
}

export interface SessionListItem {
  id: string;
  status: Session['status'];
  taskSpec: TaskSpec;
  createdAt: string;
  updatedAt: string;
  agentCount: number;
  resultCount: number;
  runningAgents: string[];
  config: {
    maxAgentsPerSession: number;
    maxConcurrentAgents: number;
    defaultTimeoutMs: number;
  };
}

export interface SessionDetail extends SessionListItem {
  projectProfile?: ProjectProfile;
  resourceUsage?: Session['resourceUsage'];
  checkpointId?: string;
}

// ─── Request/Response: Agents ────────────────────────────────────

export interface SessionAgentSummary {
  id: string;
  type: string;
  name: string;
  description: string;
  priority: number;
  dependencies: string[];
  phase: string;
  status: AgentResult['status'];
  retryCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentDetail {
  task: {
    id: string;
    type: string;
    name: string;
    description: string;
    priority: number;
    dependencies: string[];
    phase: string;
    requiredCapabilities: string[];
    timeoutMs: number;
    estimatedTokens: number;
  };
  result: {
    status: AgentResult['status'];
    retryCount: number;
    startedAt: Date;
    completedAt?: Date;
    error?: AgentError;
    summary?: AgentSummary;
    validationResults: ValidationResult[];
    filesModified: string[];
    logs: LogEntry[];
  } | null;
}

export interface AgentLogEntry {
  timestamp: string;
  level: LogEntry['level'];
  message: string;
  data?: unknown;
}

export interface AgentTimelineEntry {
  timestamp: string;
  event: string;
  details?: Record<string, unknown>;
}

// ─── Request/Response: Checkpoints ───────────────────────────────

export interface CheckpointInfo {
  sessionId: string;
  timestamp: string;
  completedAgents: string[];
  runningAgents: string[];
  queuedAgents: string[];
}

export interface CreateCheckpointRequest {
  label?: string;
}

export interface RestoreCheckpointRequest {
  force?: boolean;
}

// ─── Request/Response: Diff / Summary / Export / Import ──────────

export interface DiffResponse {
  sessionId: string;
  files: Array<{
    path: string;
    oldContent?: string;
    newContent?: string;
    action: 'create' | 'modify' | 'delete';
  }>;
}

export interface SessionSummaryResponse {
  sessionId: string;
  overview: string;
  agentsCompleted: number;
  agentsFailed: number;
  totalFilesModified: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  durationMs: number;
}

export interface ExportSessionResponse {
  session: SessionDetail;
  agents: AgentDetail[];
  checkpoints: CheckpointInfo[];
  exportedAt: string;
  format: string;
}

export interface ImportSessionRequest {
  session: SessionDetail;
  agents?: AgentDetail[];
  checkpoints?: CheckpointInfo[];
  overwrite?: boolean;
}

// ─── Request/Response: Chat ──────────────────────────────────────

export interface CreateChatSessionRequest {
  participants: string[];
  type: ChatSessionType;
  metadata?: Record<string, unknown>;
  title?: string;
}

export interface ChatSessionListItem {
  id: string;
  participants: string[];
  type: ChatSessionType;
  status: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  senderId: string;
  senderType: 'user' | 'agent' | 'system';
  content: string;
  replyTo?: string;
  type?: ChatMessageType;
}

export interface EditMessageRequest {
  userId: string;
  content: string;
}

export interface DeleteMessageRequest {
  userId: string;
}

export interface ReplyRequest {
  senderId: string;
  senderType: 'user' | 'agent' | 'system';
  content: string;
}

export interface ReactRequest {
  userId: string;
  emoji: string;
}

export interface MarkReadRequest {
  userId: string;
}

export interface PinRequest {
  userId: string;
}

export interface CreateThreadRequest {
  senderId: string;
  senderType: 'user' | 'agent' | 'system';
  content: string;
}

export interface MessageVersion {
  versionId: string;
  messageId: string;
  content: string;
  editedBy: string;
  editedAt: string;
  reason?: string;
}

export interface ChatSearchResult {
  messageId: string;
  sessionId: string;
  senderId: string;
  content: string;
  score: number;
  createdAt: string;
}

// ─── Request/Response: BYOK Providers ────────────────────────────

export interface AddProviderRequest {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  models: string[];
  rateLimit?: ProviderRateLimit;
  priority?: number;
  status?: ProviderStatus;
}

export interface UpdateProviderRequest {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  rateLimit?: ProviderRateLimit;
  priority?: number;
  status?: ProviderStatus;
}

export interface ProviderListItem {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  models: string[];
  rateLimit: ProviderRateLimit;
  priority: number;
  status: ProviderStatus;
  hasKey: boolean;
}

export interface ValidateKeyRequest {
  key: string;
}

export interface ValidateKeyResponse {
  valid: boolean;
  providerType: ProviderType;
}

export interface TestConnectionResponse {
  success: boolean;
  latency: number;
  error?: string;
}

export interface ProviderUsageResponse {
  providerId: string;
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
  errorCount: number;
}

// ─── Request/Response: BYOA Agents ───────────────────────────────

export interface RegisterAgentRequest {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  capabilities?: AgentCapabilities;
  tools?: AgentTool[];
  enabled?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  type?: AgentType;
  description?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  capabilities?: AgentCapabilities;
  tools?: AgentTool[];
  enabled?: boolean;
}

export interface CustomAgentListItem {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  model: string;
  enabled: boolean;
}

export interface CustomAgentDetail extends CustomAgentListItem {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilities: AgentCapabilities;
  tools: AgentTool[];
}

export interface CloneAgentRequest {
  name: string;
}

export interface TestAgentResponse {
  success: boolean;
  responseTime: number;
  output?: string;
  error?: string;
}

// ─── Request/Response: Extensions ────────────────────────────────

export interface ExtensionListItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  installed: boolean;
}

export interface InstallExtensionRequest {
  id: string;
  version?: string;
}

export interface MarketplaceSearchResult {
  extensions: ExtensionListItem[];
  total: number;
}

// ─── Request/Response: Security ──────────────────────────────────

export interface SecurityScanRequest {
  paths?: string[];
  rules?: string[];
}

export interface SecurityScanResponse {
  scanId: string;
  status: 'running' | 'completed' | 'failed';
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  startedAt: string;
  completedAt?: string;
}

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  fix?: string;
}

export interface SecurityReportResponse {
  lastScan?: SecurityScanResponse;
  totalScans: number;
  lastScanAt?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditExportResponse {
  entries: AuditLogEntry[];
  total: number;
  exportedAt: string;
  format: string;
}

// ─── Request/Response: Monitoring ────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  components: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: 'ok' | 'error' | 'unknown';
  latencyMs?: number;
  error?: string;
}

export interface MetricsResponse {
  sessions: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
  system: {
    uptime: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    activeConnections: number;
    cpuUsage?: NodeJS.CpuUsage;
  };
  artifacts: {
    total: number;
    sizeBytes: number;
  };
  timestamp: string;
}

export interface LogEntryResponse {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
  data?: unknown;
}

export interface AlertEntry {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface AcknowledgeAlertRequest {
  userId: string;
}

// ─── Request/Response: Templates ─────────────────────────────────

export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
}

export interface TemplateDetail extends TemplateListItem {
  config: Record<string, unknown>;
  readme?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSearchResponse {
  templates: TemplateListItem[];
  total: number;
}

// ─── Request/Response: Debug ─────────────────────────────────────

export interface StartDebugRequest {
  sessionId: string;
  entryPoint?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface DebugSessionInfo {
  debugId: string;
  sessionId: string;
  status: 'starting' | 'running' | 'paused' | 'stopped';
  startedAt: string;
}

export interface SetBreakpointRequest {
  file: string;
  line: number;
  condition?: string;
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
}

export interface StepRequest {
  type: 'into' | 'over' | 'out';
}

export interface StackFrame {
  id: string;
  name: string;
  file: string;
  line: number;
  column: number;
  locals?: Record<string, unknown>;
}

export interface StackTraceResponse {
  frames: StackFrame[];
  totalFrames: number;
}

// ─── V1 Handler Types ────────────────────────────────────────────

export interface V1Context {
  body: unknown;
  params: Record<string, string>;
  query: URLSearchParams;
  req: IncomingMessage;
  res: ServerResponse;
}

export type V1Handler = (ctx: V1Context) => Promise<ApiSuccess<unknown>> | ApiSuccess<unknown>;

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: V1Handler;
  description?: string;
  rateLimit?: number;
}

// ─── Utility Types ───────────────────────────────────────────────

export interface RequestId {
  requestId: string;
}

export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function apiSuccess<T>(data: T, meta?: Partial<ApiMeta>): ApiSuccess<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1',
      ...meta,
    },
  };
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    error: { code, message, details },
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1',
    },
  };
}

export function apiPaginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiPaginated<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      hasMore: page < totalPages,
      totalPages,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1',
    },
  };
}

// ─── Pagination Query Parameters ─────────────────────────────────

export interface PaginationQuery {
  page: number;
  limit: number;
  offset: number;
}

export function parsePagination(url: string, defaultLimit = 20): PaginationQuery {
  const searchParams = new URLSearchParams(url.split('?')[1] ?? '');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(defaultLimit), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function getQueryParam(url: string, key: string): string | null {
  const searchParams = new URLSearchParams(url.split('?')[1] ?? '');
  return searchParams.get(key);
}

export function getBody(req: IncomingMessage): unknown {
  return (req as any).body;
}

// ─── Provider/Agent Config Helpers ───────────────────────────────

export function sanitizeProvider(p: ProviderConfig): Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean } {
  const { apiKey, ...rest } = p;
  return { ...rest, hasKey: !!apiKey };
}

export function sanitizeAgent(a: AgentConfig): CustomAgentListItem {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description,
    model: a.model,
    enabled: a.enabled,
  };
}
