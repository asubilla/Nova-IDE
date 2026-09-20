import { EventEmitter } from 'events';
import { ChatAttachment, ChatSession, ChatMessage, ChatSessionStatus } from './chat-types';
import { ChatDatabase } from './chat-database';
import { PermissionManager, PermissionDecision } from '../../security/permissions';
import { AuditLogger, AuditEventType, AuditSeverity } from '../../security/audit-logger';
import { defaultLogger } from '../logging/logger';

export interface ChatAuditEvent {
  eventType: AuditEventType;
  userId: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface RateLimitConfig {
  messages: number;
  fileUploads: number;
  search: number;
  reactions: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messages: 30,
  fileUploads: 5,
  search: 10,
  reactions: 20,
  windowMs: 60_000,
};

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'application/json',
  'text/csv', 'text/markdown', 'application/zip',
  'application/octet-stream',
]);

export class ChatSecurity extends EventEmitter {
  private db: ChatDatabase;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private logger: typeof defaultLogger;
  private rateLimitConfig: RateLimitConfig;
  private rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

  constructor(
    db: ChatDatabase,
    permissionManager?: PermissionManager,
    auditLogger?: AuditLogger,
    rateLimitConfig?: Partial<RateLimitConfig>,
  ) {
    super();
    this.db = db;
    this.permissionManager = permissionManager ?? new PermissionManager();
    this.auditLogger = auditLogger ?? new AuditLogger();
    this.logger = defaultLogger.child('ChatSecurity');
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMITS, ...rateLimitConfig };
  }

  // ─── Permission Checks ─────────────────────────────────────────

  canCreateSession(userId: string, config: { type?: string; participants?: string[] }): boolean {
    const decision = this.permissionManager.checkPermission({
      agentId: userId,
      agentType: 'user',
      tool: 'chat',
      action: 'create_session',
      target: `session:${config.type ?? 'unknown'}`,
      context: { participants: config.participants ?? [] },
      timestamp: new Date(),
      riskScore: 1,
    });

    if (decision === PermissionDecision.DENY) {
      this.logChatAudit({
        eventType: AuditEventType.PERMISSION_CHECK,
        userId,
        action: 'create_session',
        metadata: { decision, type: config.type },
      });
      return false;
    }
    return true;
  }

  canSendMessage(sessionId: string, userId: string): boolean {
    const session = this.db.getSession(sessionId);
    if (!session) return false;
    if (!session.participants.includes(userId)) return false;
    if (session.status === ChatSessionStatus.Archived || session.status === ChatSessionStatus.Deleted) {
      return false;
    }
    return true;
  }

  canEditMessage(messageId: string, userId: string): boolean {
    const message = this.db.getMessage(messageId);
    if (!message) return false;
    if (message.senderId !== userId) return false;
    if (message.deletedAt) return false;
    return true;
  }

  canDeleteMessage(messageId: string, userId: string): boolean {
    const message = this.db.getMessage(messageId);
    if (!message) return false;
    if (message.senderId !== userId) return false;
    return true;
  }

  canViewSession(sessionId: string, userId: string): boolean {
    const session = this.db.getSession(sessionId);
    if (!session) return false;
    if (session.status === ChatSessionStatus.Deleted) return false;
    return session.participants.includes(userId);
  }

  canExportChat(sessionId: string, userId: string): boolean {
    const session = this.db.getSession(sessionId);
    if (!session) return false;
    return session.participants.includes(userId);
  }

  // ─── Content Sanitization ──────────────────────────────────────

  sanitizeMessage(content: string): string {
    if (!content) return '';

    let sanitized = content;

    // Strip HTML tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed\b[^<]*\/?>/gi, '');
    sanitized = sanitized.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Escape HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    // Neutralize javascript: URIs
    sanitized = sanitized.replace(/javascript\s*:/gi, '');

    // Neutralize data: URIs (except safe ones)
    sanitized = sanitized.replace(/data\s*:[^,]*;/gi, 'data:text/plain;');

    return sanitized;
  }

  // ─── Attachment Validation ─────────────────────────────────────

  validateAttachment(attachment: Pick<ChatAttachment, 'fileName' | 'fileType' | 'fileSize'>): {
    valid: boolean;
    error?: string;
  } {
    if (!attachment.fileName || attachment.fileName.trim().length === 0) {
      return { valid: false, error: 'File name is required' };
    }

    // Path traversal check
    if (attachment.fileName.includes('..') || attachment.fileName.includes('/') || attachment.fileName.includes('\\')) {
      return { valid: false, error: 'Invalid file name: path traversal detected' };
    }

    if (!attachment.fileType || attachment.fileType.trim().length === 0) {
      return { valid: false, error: 'File type is required' };
    }

    if (!ALLOWED_FILE_TYPES.has(attachment.fileType)) {
      return { valid: false, error: `File type not allowed: ${attachment.fileType}` };
    }

    if (attachment.fileSize <= 0) {
      return { valid: false, error: 'File size must be greater than zero' };
    }

    if (attachment.fileSize > MAX_FILE_SIZE) {
      return { valid: false, error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }

    return { valid: true };
  }

  // ─── Rate Limiting ─────────────────────────────────────────────

  checkRateLimit(userId: string, action: keyof Omit<RateLimitConfig, 'windowMs'>): boolean {
    const limit = this.rateLimitConfig[action];
    const windowMs = this.rateLimitConfig.windowMs;
    const key = `${userId}:${action}`;
    const now = Date.now();

    const bucket = this.rateLimitBuckets.get(key);

    if (!bucket || now - bucket.windowStart > windowMs) {
      this.rateLimitBuckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= limit) {
      this.logChatAudit({
        eventType: AuditEventType.PERMISSION_CHECK,
        userId,
        action: `rate_limit_exceeded:${action}`,
        metadata: { count: bucket.count, limit, windowMs },
      });
      return false;
    }

    bucket.count++;
    return true;
  }

  // ─── Audit Logging ─────────────────────────────────────────────

  logChatAudit(event: ChatAuditEvent): void {
    const severity = this.inferSeverity(event.eventType);
    this.auditLogger.log({
      eventType: event.eventType,
      severity,
      sessionId: 'chat',
      agentId: event.userId,
      tool: 'chat',
      action: event.action,
      target: event.target,
      metadata: {
        ...event.metadata,
        module: 'chat-security',
      },
    });

    this.logger.debug(`Chat audit: ${event.action} by ${event.userId}`, event.metadata);
  }

  // ─── Full Security Check for Message ───────────────────────────

  validateMessageContent(content: string): { valid: boolean; error?: string } {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: 'Message content cannot be empty' };
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` };
    }

    return { valid: true };
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  destroy(): void {
    this.rateLimitBuckets.clear();
    this.removeAllListeners();
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private inferSeverity(eventType: AuditEventType): AuditSeverity {
    switch (eventType) {
      case AuditEventType.PERMISSION_CHECK:
        return AuditSeverity.WARNING;
      case AuditEventType.VALIDATION_FAILED:
        return AuditSeverity.WARNING;
      case AuditEventType.TOOL_DENIED:
        return AuditSeverity.ERROR;
      default:
        return AuditSeverity.INFO;
    }
  }
}
