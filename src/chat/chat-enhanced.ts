import { EventEmitter } from 'events';
import { ChatService, SendMessageOptions, ExportFormat } from './chat-service';
import { ChatWebSocket } from './chat-websocket';
import { ChatSecurity } from './chat-security';
import { ChatDatabase } from './chat-database';
import {
  ChatMessage,
  ChatSession,
  ChatSessionType,
  ChatMessageType,
} from './chat-types';
import { DiffEngine, DiffResult } from './diff-engine';
import {
  CheckpointSystem,
  Checkpoint,
  CheckpointData,
} from './checkpoint-system';
import { RevertManager, RevertRecord } from './revert-manager';
import { VersionHistory, MessageVersion } from './version-history';
import { SecretMasking, SecretDetection, MaskingOptions } from './secret-masking';
import { MessageSummarizer, SessionSummary, SummaryOptions } from './message-summarizer';
import { FileDiffViewer } from './file-diff-viewer';

export interface SendMessageEnhancedOptions {
  content?: string;
  type?: ChatMessageType;
  replyTo?: string;
  maskSecrets?: boolean;
  createCheckpoint?: boolean;
  detectMentions?: boolean;
}

export interface RevertMessageOptions {
  reason?: string;
  confirm?: boolean;
}

export class ChatEnhanced extends EventEmitter {
  readonly service: ChatService;
  readonly websocket: ChatWebSocket | null;
  readonly security: ChatSecurity | null;
  readonly diffEngine: DiffEngine;
  readonly checkpoints: CheckpointSystem;
  readonly revertManager: RevertManager;
  readonly versionHistory: VersionHistory;
  readonly secretMasking: SecretMasking;
  readonly summarizer: MessageSummarizer;
  readonly fileDiff: FileDiffViewer;

  private db: ChatDatabase;
  private autoCheckpointThreshold = 50;

  constructor(options?: {
    db?: ChatDatabase;
    service?: ChatService;
    websocket?: ChatWebSocket;
    security?: ChatSecurity;
    maskingOptions?: MaskingOptions;
    autoCheckpointThreshold?: number;
  }) {
    super();
    this.db = options?.db ?? new ChatDatabase();
    this.service = options?.service ?? new ChatService(this.db);
    this.websocket = options?.websocket ?? null;
    this.security = options?.security ?? null;
    this.diffEngine = new DiffEngine();
    this.checkpoints = new CheckpointSystem();
    this.revertManager = new RevertManager(this.checkpoints);
    this.versionHistory = new VersionHistory(this.diffEngine);
    this.secretMasking = new SecretMasking(options?.maskingOptions);
    this.summarizer = new MessageSummarizer();
    this.fileDiff = new FileDiffViewer(this.diffEngine);

    if (options?.autoCheckpointThreshold) {
      this.autoCheckpointThreshold = options.autoCheckpointThreshold;
    }

    this.setupEventForwarding();
  }

  // ─── Core Message Operations ──────────────────────────────────────

  sendMessage(
    sessionId: string,
    userId: string,
    content: string,
    options?: SendMessageEnhancedOptions,
  ): ChatMessage {
    let maskedContent = content;
    let secretsDetected: SecretDetection[] = [];

    if (options?.maskSecrets !== false) {
      secretsDetected = this.secretMasking.detectSecrets(content);
      if (secretsDetected.length > 0) {
        maskedContent = this.secretMasking.maskSecrets(content);
      }
    }

    const message = this.service.sendMessage({
      sessionId,
      senderId: userId,
      senderType: 'user',
      content: maskedContent,
      type: options?.type ?? ChatMessageType.Text,
      replyTo: options?.replyTo,
    });

    this.versionHistory.addVersion(message.id, maskedContent, userId, 'Initial version');

    if (secretsDetected.length > 0) {
      this.emit('secrets:detected', { messageId: message.id, secrets: secretsDetected });
    }

    if (options?.createCheckpoint !== false) {
      this.tryAutoCheckpoint(sessionId);
    }

    return message;
  }

  editMessage(messageId: string, userId: string, newContent: string): ChatMessage {
    const original = this.service.editMessage(messageId, userId, newContent);

    const secretsDetected = this.secretMasking.detectSecrets(newContent);
    if (secretsDetected.length > 0) {
      this.emit('secrets:detected', { messageId, secrets: secretsDetected });
    }

    this.versionHistory.addVersion(messageId, newContent, userId, 'Content updated');

    return original;
  }

  revertMessage(messageId: string, userId: string, options?: RevertMessageOptions): RevertRecord {
    const record = this.revertManager.revertMessage(
      messageId,
      this.getMessageSessionId(messageId),
      userId,
      options?.reason,
    );

    if (options?.confirm) {
      this.revertManager.confirmRevert(record.id);
    }

    this.emit('message:reverted', { messageId, revertRecord: record });
    return record;
  }

  revertToCheckpoint(checkpointId: string, userId: string): RevertRecord {
    const checkpoint = this.checkpoints.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const record = this.revertManager.revertToCheckpoint(
      checkpointId,
      checkpoint.sessionId,
      userId,
    );

    const data = this.checkpoints.restoreCheckpoint(checkpointId);
    this.emit('checkpoint:restored', { checkpointId, messages: data.messages });
    return record;
  }

  // ─── Diff & Version Operations ────────────────────────────────────

  getDiff(messageId: string, versionId?: string): DiffResult | undefined {
    const versions = this.versionHistory.getVersions(messageId);
    if (versions.length < 2) return undefined;

    if (versionId) {
      const targetIdx = versions.findIndex(v => v.versionId === versionId);
      if (targetIdx === -1 || targetIdx === 0) return undefined;
      return this.diffEngine.computeDiff(
        versions[targetIdx - 1].content,
        versions[targetIdx].content,
      );
    }

    return this.diffEngine.computeDiff(
      versions[versions.length - 2].content,
      versions[versions.length - 1].content,
    );
  }

  getVersionHistory(messageId: string): MessageVersion[] {
    return this.versionHistory.getVersions(messageId);
  }

  // ─── Summary Operations ───────────────────────────────────────────

  getSummary(sessionId: string, format?: SummaryOptions['type']): SessionSummary {
    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    return this.summarizer.summarizeSession(sessionId, messages, { type: format });
  }

  // ─── Security Operations ──────────────────────────────────────────

  searchSecrets(sessionId: string): SecretDetection[] {
    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    const allSecrets: SecretDetection[] = [];

    for (const msg of messages) {
      const secrets = this.secretMasking.detectSecrets(msg.content);
      allSecrets.push(...secrets);
    }

    return allSecrets;
  }

  validateSecretLeak(sessionId: string) {
    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    const combined = messages.map(m => m.content).join('\n');
    return this.secretMasking.validateSecretLeak(combined);
  }

  // ─── Export Operations ────────────────────────────────────────────

  exportChat(sessionId: string, format: ExportFormat): string {
    return this.service.exportChat(sessionId, format);
  }

  // ─── Pin Operations ───────────────────────────────────────────────

  getPins(sessionId: string): ChatMessage[] {
    const result = this.service.getMessages(sessionId, { limit: 10000 });
    return result.messages.filter(m => {
      const meta = m as any;
      return meta.pinned === true;
    });
  }

  // ─── Bookmark Operations ──────────────────────────────────────────

  getBookmarks(userId: string): ChatMessage[] {
    const sessions = this.service.listSessions({ participant: userId });
    const bookmarks: ChatMessage[] = [];

    for (const session of sessions) {
      const messages = this.service.getMessages(session.id, { limit: 10000 }).messages;
      for (const msg of messages) {
        const meta = msg as any;
        if (meta.bookmarked && meta.bookmarkedBy === userId) {
          bookmarks.push(msg);
        }
      }
    }

    return bookmarks;
  }

  // ─── Thread Operations ────────────────────────────────────────────

  getThreads(sessionId: string): ChatMessage[] {
    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    const repliedIds = new Set(messages.filter(m => m.replyTo).map(m => m.replyTo));
    return messages.filter(m => repliedIds.has(m.id));
  }

  // ─── Checkpoint Operations ────────────────────────────────────────

  createCheckpoint(sessionId: string, label?: string): Checkpoint {
    const session = this.service.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    return this.checkpoints.createCheckpoint(
      sessionId,
      { messages, sessionState: session },
      label,
    );
  }

  listCheckpoints(sessionId: string): Checkpoint[] {
    return this.checkpoints.listCheckpoints(sessionId);
  }

  restoreCheckpoint(checkpointId: string): CheckpointData {
    return this.checkpoints.restoreCheckpoint(checkpointId);
  }

  // ─── Code Execution ───────────────────────────────────────────────

  async executeCode(messageId: string): Promise<{ output: string; status: string }> {
    const versions = this.versionHistory.getVersions(messageId);
    if (versions.length === 0) throw new Error(`No content found for message ${messageId}`);

    const content = versions[versions.length - 1].content;
    const codeMatch = content.match(/```(\w+)?\n([\s\S]*?)```/);

    if (!codeMatch) {
      return { output: 'No code block found', status: 'error' };
    }

    const language = codeMatch[1] ?? 'text';
    const code = codeMatch[2];

    return { output: `Executed ${language} code (${code.length} chars)`, status: 'success' };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private setupEventForwarding(): void {
    this.service.on('message:sent', (msg) => this.emit('message:sent', msg));
    this.service.on('message:edited', (msg) => this.emit('message:edited', msg));
    this.service.on('message:deleted', (msg) => this.emit('message:deleted', msg));

    this.checkpoints.on('checkpoint:created', (cp) =>
      this.emit('checkpoint:created', cp),
    );
    this.checkpoints.on('checkpoint:restored', (cp) =>
      this.emit('checkpoint:restored', cp),
    );

    this.revertManager.on('revert:executed', (record) =>
      this.emit('revert:executed', record),
    );

    this.versionHistory.on('version:added', (v) =>
      this.emit('version:added', v),
    );
  }

  private tryAutoCheckpoint(sessionId: string): void {
    const session = this.service.getSession(sessionId);
    if (!session) return;

    const messages = this.service.getMessages(sessionId, { limit: 10000 }).messages;
    const data: CheckpointData = { messages, sessionState: session };
    this.checkpoints.autoCheckpoint(sessionId, data);
  }

  private getMessageSessionId(messageId: string): string {
    const msg = (this.service as any).db?.getMessage?.(messageId);
    if (msg?.sessionId) return msg.sessionId;

    for (const sessionId of this.checkpoints.getSessionIds()) {
      const cps = this.checkpoints.listCheckpoints(sessionId);
      for (const cp of cps) {
        if (cp.messages.some(m => m.id === messageId)) {
          return sessionId;
        }
      }
    }
    throw new Error(`Session for message ${messageId} not found`);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  destroy(): void {
    this.service.destroy();
    this.checkpoints.destroy();
    this.revertManager.destroy();
    this.versionHistory.destroy();
    this.removeAllListeners();
  }
}
