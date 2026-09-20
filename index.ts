export {
  AgentType, AgentPrompt, AgentCapability,
  Session, SessionConfig,
  Issue, FileChange,
  ValidationResult, ValidationRule,
  ProjectProfile, ProjectStructure,
  ToolPermission,
  RetryPolicy,
  OutputSchema,
  ContextFile,
  ResourceProfile,
  ErrorFixLoopConfig, FixStrategy,
  AgentResult, AgentSpawnConfig, AgentTask,
  LanguageInfo, FrameworkInfo,
  DistributionPlan, DistributionPhase, ResourceAllocation,
  RiskAssessment, RiskFactor, Mitigation, Bottleneck,
  ProjectAwareDistributionResult,
  LivePreviewEvent,
  OutputFile, AgentOutput, AgentSummary,
  TaskSpec, AgentError, QualityGate,
} from './core/types';
export * from './advanced/index';
export * from './extensions/index';

export { PROMPT_TEMPLATES, PromptTemplate } from './templates/prompt-templates';
export { BATCH1_API } from './templates/templates-batch1-api';
export { BATCH2_DDD } from './templates/templates-batch2-ddd';
export { BATCH3_SECURITY } from './templates/templates-batch3-security';
export { BATCH4_TESTING } from './templates/templates-batch4-testing';
export { BATCH5_DEVOPS } from './templates/templates-batch5-devops';
export { BATCH6_FRONTEND } from './templates/templates-batch6-frontend';
export { BATCH7_MONITORING } from './templates/templates-batch7-monitoring';
export { BATCH8_MOBILE_AI } from './templates/templates-batch8-mobile-ai';
export { BATCH9_SPECIALIZED } from './templates/templates-batch9-specialized';
export { DynamicTemplateLoader } from './templates/template-loader';
export { TemplateMatcher } from './templates/template-matcher';
export { UserTemplateSchema, UserTemplateDefinition, TemplateMatchResult, TemplateValidationResult, TemplateValidationError, TemplateValidationWarning } from './templates/template-schema';

export { AgentRegistry, defaultRegistry, AgentRegistration } from './registry/agent-registry';

export { LivePreviewManager, PreviewEventEmitter, PreviewState, AgentPreviewState, PreviewEvent } from './preview/live-preview';

export { ErrorFixTestLoop, ErrorClassifier, FixStrategySelector, DEFAULT_FIX_STRATEGIES, DEFAULT_LOOP_CONFIG } from './loops/error-fix-test-loop';

export { ProjectAwareDistributor, TaskDecomposer, DependencyResolver, ProjectAnalysis as DistributionProjectAnalysis, DistributionPlan as DistributionDistributionPlan, DecomposedTask, ResolvedDependencyGraph } from './agents/project-aware-distributor';

export { EnhancedSubAgentOrchestrator, createOrchestrator } from './core/enhanced-orchestrator';

export { ProjectAnalyzer } from './context/analyzer';

export { SessionManager, SessionManagerOptions, SessionStats } from './session/manager';

export { CoordinationBus } from './coordination/bus';
export { CrossSessionCoordinator } from './coordination/cross-session';
export { DependencyGraph } from './coordination/dependency-graph';
export { FileLockManager } from './coordination/file-lock';
export { GitIntegration } from './coordination/git-integration';
export { ResourceQuotaManager } from './coordination/resource-quota';
export { SyncPoint, PhaseConfig } from './coordination/sync-points';

export { initializeDatabase, migrate, getSchemaVersion, setSchemaVersion, ensureIndexes } from './database/migrations';
export { AgentRepository } from './database/repository';
export { Store, createStore, StoreOptions } from './database/store';

export { CapabilityRegistry } from './distribution/capability-registry';
export { ProjectAwareDistributor as DistributionProjectAwareDistributor } from './distribution/distributor';
export { ProjectDeepAnalyzer as DistributionProjectAnalyzer } from './distribution/project-analyzer';
export { ResourceMonitor } from './distribution/resource-monitor';
export { AgentScheduler } from './distribution/scheduler';

export { ErrorFixLoop as LoopErrorFixLoop } from './error-fix-loop/loop';
export { ValidationRunner, ValidationAggregator, ValidationResultAnalyzer } from './error-fix-loop/validator';
export { selectBestStrategy, buildFixPromptFromContext } from './error-fix-loop/strategies';
export { EscalationManager } from './error-fix-loop/escalation';

export { ArtifactManager } from './artifacts/manager';

export { QualityGateRunner } from './quality/gates';

export { PreviewServer } from './live-preview/server';
export { DashboardBuilder } from './live-preview/dashboard';

export { ApiServer } from './server/server';
export { createRouter } from './server/routes';
export { WsHandler } from './server/ws-handler';

export { AgentSandbox, DEFAULT_SANDBOX_CONFIG } from './security/sandbox';
export { PermissionManager, DEFAULT_PERMISSIONS } from './security/permissions';
export { SecretsVault } from './security/secrets-vault';
export { AuditLogger } from './security/audit-logger';
export { BudgetLimiter, DEFAULT_BUDGET_CONFIG } from './security/budget-limiter';

export { CheckpointManager } from './session/checkpoint';

export const SUBAGENT_SYSTEM_VERSION = '3.0.0';
export const DEFAULT_CONFIG = {
  maxAgentsPerSession: 100,
  maxConcurrentAgents: 20,
  defaultTimeoutMs: 300000,
  enableLivePreview: true,
  previewPort: 3001,
};

// ─── Chat System ─────────────────────────────────────────────────
export { ChatService, SendMessageOptions, PaginationOptions, ExportFormat } from './src/chat/chat-service';
export {
  ChatMessage, ChatSession, ChatSessionType, ChatMessageType,
  ChatSessionStatus, ChatReaction, ChatReadReceipt,
  ChatTypingIndicator, ChatPresence, ChatAttachment,
  PaginatedMessages, MessageSearchResult,
} from './src/chat/chat-types';
export { ChatWebSocket, WSEventType, WSPayload, ConnectedClient, ReconnectionState } from './src/chat/chat-websocket';
export { ChatAgentBridge, AgentBridgeConfig, TemplateMatch, AgentMessage, AgentError as ChatAgentError, StreamingChunk } from './src/chat/chat-agent-bridge';
export { ChatSecurity, ChatAuditEvent, RateLimitConfig } from './src/chat/chat-security';
export { ChatIntegration, ChatMetrics, HealthChecker, Orchestrator, MessageBus, KnowledgeBase, LearningSystem, MetricsCollector } from './src/chat/chat-integration';
export { createChatSecurityMiddleware, chainMiddleware, authMiddleware, rateLimitMiddleware, corsMiddleware, validationMiddleware, auditMiddleware, compressionMiddleware, MiddlewareContext } from './src/chat/chat-middleware';
export { ChatEnhanced, SendMessageEnhancedOptions, RevertMessageOptions } from './src/chat/chat-enhanced';

// ─── Chat Database ───────────────────────────────────────────────
export { ChatDatabase, CreateSessionInput, CreateMessageInput, CreateAttachmentInput, GetMessagesOptions } from './src/chat/chat-database';

// ─── Chat Routes ─────────────────────────────────────────────────
export { ChatRoute, buildChatRoutes, createChatRouter } from './src/chat/chat-routes';
export { buildEnhancedChatRoutes, createEnhancedChatRouter } from './src/chat/chat-enhanced-routes';

// ─── Chat UI ─────────────────────────────────────────────────────
export { ChatWindow } from './src/chat/ui/chat-window';
export type { ChatWindowConfig } from './src/chat/ui/chat-window';
export { EnhancedChatWindow } from './src/chat/ui/chat-enhanced-window';
export { MessageRenderer } from './src/chat/ui/message-renderer';
export type { MessageRendererConfig } from './src/chat/ui/message-renderer';
export { ChatSidebar } from './src/chat/ui/chat-sidebar';
export type { ChatSidebarConfig } from './src/chat/ui/chat-sidebar';
export { CodeHighlighter } from './src/chat/ui/code-highlighter';
export type { SupportedLanguage, HighlightToken, CodeBlockConfig } from './src/chat/ui/code-highlighter';
export { LivePreview as ChatLivePreview } from './src/chat/ui/live-preview';
export type { PreviewConfig, PreviewFormat, DiffSegment } from './src/chat/ui/live-preview';
export { CodeExecutor } from './src/chat/ui/code-executor';
export type { ExecutionResult, ExecutionConfig, ExecutionHistoryEntry, ExecutionStatus } from './src/chat/ui/code-executor';
export { BoxRenderer } from './src/chat/ui/boxes';
export type { BoxConfig, BoxType } from './src/chat/ui/boxes';
export { CopyButton } from './src/chat/ui/copy-button';
export type { CopyButtonConfig, CopyButtonInstance } from './src/chat/ui/copy-button';
export { MentionSystem } from './src/chat/ui/mention-system';
export type { Mention, MentionType, MentionSuggestion, MentionNotification } from './src/chat/ui/mention-system';
export { ThreadView } from './src/chat/ui/thread-view';
export type { Thread, ThreadRenderOptions, ThreadConfig } from './src/chat/ui/thread-view';
export { PinSystem } from './src/chat/ui/pin-system';
export type { PinnedMessage, PinSystemConfig, PinRenderOptions } from './src/chat/ui/pin-system';
export { BookmarkSystem } from './src/chat/ui/bookmark-system';
export type { Bookmark, BookmarkConfig, BookmarkRenderOptions, ExportFormat as BookmarkExportFormat } from './src/chat/ui/bookmark-system';

// ─── Chat Diff & Versioning ──────────────────────────────────────
export { DiffEngine } from './src/chat/diff-engine';
export type { DiffResult, DiffLine, DiffStats, DiffHunk, DiffLineType, DiffFormat, Patch, PatchHunk } from './src/chat/diff-engine';
export { CheckpointSystem } from './src/chat/checkpoint-system';
export type { Checkpoint, CheckpointData, CheckpointMetadata, CheckpointComparison } from './src/chat/checkpoint-system';
export { RevertManager } from './src/chat/revert-manager';
export type { RevertRecord, RevertPreview, RevertType, CreateRevertPointInput } from './src/chat/revert-manager';
export { FileDiffViewer } from './src/chat/file-diff-viewer';
export type { FileDiffOptions, FileDiffResult, FileTreeChange, FileTree } from './src/chat/file-diff-viewer';
export { VersionHistory } from './src/chat/version-history';
export type { MessageVersion, VersionComparison } from './src/chat/version-history';

// ─── Chat Security & Privacy ─────────────────────────────────────
export { SecretMasking } from './src/chat/secret-masking';
export type { SecretDetection, MaskingStrategy, SecretPolicy, SecretType, MaskingOptions } from './src/chat/secret-masking';

// ─── Chat Intelligence ───────────────────────────────────────────
export { MessageSummarizer } from './src/chat/message-summarizer';
export type { SessionSummary, SummaryOptions, SummaryType, KeyPoint, ActionItem, Decision, UnansweredQuestion, CodeSnippet, FileReference, TimelineEvent, ProgressReport, MessageTag } from './src/chat/message-summarizer';

// ─── Chat Rich Text & Code ──────────────────────────────────────
export { RichTextEditor } from './src/chat/ui/rich-text-editor';
export { CodePlayground } from './src/chat/ui/code-playground';
export { MermaidRenderer } from './src/chat/ui/mermaid-renderer';
export { LatexRenderer } from './src/chat/ui/latex-renderer';

// ─── Chat Previews ──────────────────────────────────────────────
export { LinkPreview } from './src/chat/ui/link-preview';
export { ImagePreview } from './src/chat/ui/image-preview';
export { FilePreview } from './src/chat/ui/file-preview';
export { VoiceMessage } from './src/chat/ui/voice-message';

// ─── Chat Statistics & Status ───────────────────────────────────
export { ChatStatistics } from './src/chat/chat-statistics';
export { StatusMessages } from './src/chat/status-messages';
export { MessageQueue } from './src/chat/message-queue';
export { SearchFilters } from './src/chat/search-filters';

// ─── Chat UX ────────────────────────────────────────────────────
export { DragDrop } from './src/chat/ui/drag-drop';
export { TaskCards } from './src/chat/ui/task-cards';
export { AccessibilityManager } from './src/chat/ui/accessibility';
export { MessageAnimations } from './src/chat/ui/message-animations';
export { SoundEffects } from './src/chat/ui/sound-effects';
export { ChatBackup } from './src/chat/chat-backup';
