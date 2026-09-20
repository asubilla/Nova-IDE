export type BackupFormat = 'json' | 'markdown' | 'html' | 'csv';

export interface ChatBackupConfig {
  autoBackupInterval?: number;
  maxBackups?: number;
  onBackupCreated?: (backup: BackupMetadata) => void;
  onBackupRestored?: (backupId: string) => void;
  onBackupDeleted?: (backupId: string) => void;
}

export interface BackupMetadata {
  id: string;
  sessionId: string;
  format: BackupFormat;
  size: number;
  messageCount: number;
  createdAt: Date;
  label?: string;
}

export interface BackupData {
  metadata: BackupMetadata;
  messages: BackupMessage[];
  sessions: BackupSession[];
}

export interface BackupMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: string;
  content: string;
  type: string;
  replyTo?: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  deletedAt?: string;
  reactions: Array<{ emoji: string; userId: string; createdAt: string }>;
}

export interface BackupSession {
  id: string;
  participants: string[];
  type: string;
  status: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

interface BackupState {
  backups: Map<string, BackupData>;
  autoBackupTimer: ReturnType<typeof setInterval> | null;
}

export class ChatBackup {
  private config: Required<ChatBackupConfig>;
  private state: BackupState;
  private backupIdCounter = 0;
  private sessionStore: Map<string, BackupSession> = new Map();
  private messageStore: Map<string, BackupMessage[]> = new Map();

  constructor(config?: ChatBackupConfig) {
    this.config = {
      autoBackupInterval: config?.autoBackupInterval ?? 0,
      maxBackups: config?.maxBackups ?? 50,
      onBackupCreated: config?.onBackupCreated ?? (() => {}),
      onBackupRestored: config?.onBackupRestored ?? (() => {}),
      onBackupDeleted: config?.onBackupDeleted ?? (() => {}),
    };
    this.state = { backups: new Map(), autoBackupTimer: null };
    if (this.config.autoBackupInterval > 0) {
      this.scheduleAutoBackup(this.config.autoBackupInterval);
    }
  }

  exportChat(sessionId: string, format: BackupFormat, dateRange?: DateRange): BackupData {
    let messages = this.messageStore.get(sessionId) ?? [];
    if (dateRange) {
      messages = messages.filter((m) => {
        const d = new Date(m.createdAt);
        return d >= dateRange.from && d <= dateRange.to;
      });
    }
    const sessions = sessionId === 'all'
      ? Array.from(this.sessionStore.values())
      : Array.from(this.sessionStore.values()).filter((s) => s.id === sessionId);

    const metadata: BackupMetadata = {
      id: `backup-${++this.backupIdCounter}`,
      sessionId,
      format,
      size: 0,
      messageCount: messages.length,
      createdAt: new Date(),
    };
    const data: BackupData = { metadata, messages, sessions };
    metadata.size = new Blob([JSON.stringify(data)]).size;
    this.state.backups.set(metadata.id, data);
    this.enforceMaxBackups();
    this.config.onBackupCreated(metadata);
    return data;
  }

  importChat(data: string, format: BackupFormat): BackupData | null {
    try {
      const parsed = this.deserialize(data, format);
      if (!parsed) return null;
      const metadata: BackupMetadata = {
        ...parsed.metadata,
        id: `backup-${++this.backupIdCounter}`,
        createdAt: new Date(),
      };
      const imported: BackupData = { metadata, messages: parsed.messages, sessions: parsed.sessions };
      this.state.backups.set(metadata.id, imported);
      this.enforceMaxBackups();
      this.config.onBackupCreated(metadata);
      return imported;
    } catch {
      return null;
    }
  }

  backupAll(): BackupData[] {
    return Array.from(this.sessionStore.keys()).map((sid) => this.exportChat(sid, 'json'));
  }

  restoreBackup(backupId: string): BackupData | null {
    const data = this.state.backups.get(backupId);
    if (!data) return null;
    for (const session of data.sessions) {
      this.sessionStore.set(session.id, session);
    }
    for (const msg of data.messages) {
      const existing = this.messageStore.get(msg.sessionId) ?? [];
      if (!existing.find((m) => m.id === msg.id)) {
        existing.push(msg);
      }
      this.messageStore.set(msg.sessionId, existing);
    }
    this.config.onBackupRestored(backupId);
    return data;
  }

  getBackupList(): BackupMetadata[] {
    return Array.from(this.state.backups.values())
      .map((d) => d.metadata)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  deleteBackup(backupId: string): boolean {
    if (!this.state.backups.has(backupId)) return false;
    this.state.backups.delete(backupId);
    this.config.onBackupDeleted(backupId);
    return true;
  }

  scheduleAutoBackup(intervalMs: number): void {
    this.clearAutoBackup();
    this.state.autoBackupTimer = setInterval(() => this.backupAll(), intervalMs);
  }

  clearAutoBackup(): void {
    if (this.state.autoBackupTimer) {
      clearInterval(this.state.autoBackupTimer);
      this.state.autoBackupTimer = null;
    }
  }

  getBackupSize(backupId: string): number {
    const data = this.state.backups.get(backupId);
    if (!data) return 0;
    return new Blob([JSON.stringify(data)]).size;
  }

  resolveConflicts(existing: BackupData, imported: BackupData, strategy: 'keep-existing' | 'use-imported' | 'merge'): BackupData {
    const merged = [...existing.messages];
    for (const msg of imported.messages) {
      const idx = merged.findIndex((m) => m.id === msg.id);
      if (idx === -1) {
        merged.push(msg);
      } else if (strategy === 'use-imported') {
        merged[idx] = msg;
      } else if (strategy === 'merge' && new Date(msg.updatedAt) > new Date(merged[idx].updatedAt)) {
        merged[idx] = msg;
      }
    }
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const sessionMap = new Map<string, BackupSession>();
    for (const s of [...existing.sessions, ...imported.sessions]) sessionMap.set(s.id, s);
    return {
      metadata: { ...existing.metadata, messageCount: merged.length, createdAt: new Date(), size: 0 },
      messages: merged,
      sessions: Array.from(sessionMap.values()),
    };
  }

  loadSession(sessionId: string, session: BackupSession): void {
    this.sessionStore.set(sessionId, session);
  }

  loadMessages(sessionId: string, messages: BackupMessage[]): void {
    this.messageStore.set(sessionId, [...messages]);
  }

  destroy(): void {
    this.clearAutoBackup();
    this.state.backups.clear();
    this.sessionStore.clear();
    this.messageStore.clear();
  }

  private serialize(data: BackupData, format: BackupFormat): string {
    switch (format) {
      case 'json': return JSON.stringify(data, null, 2);
      case 'markdown': return this.toMarkdown(data);
      case 'html': return this.toHtml(data);
      case 'csv': return this.toCsv(data);
      default: return JSON.stringify(data, null, 2);
    }
  }

  private deserialize(raw: string, format: BackupFormat): BackupData | null {
    switch (format) {
      case 'json': return JSON.parse(raw) as BackupData;
      case 'markdown': return this.fromMarkdown(raw);
      case 'html': return this.fromHtml(raw);
      case 'csv': return this.fromCsv(raw);
      default: return JSON.parse(raw) as BackupData;
    }
  }

  private toMarkdown(data: BackupData): string {
    const lines: string[] = [`# Chat Backup - ${data.metadata.sessionId}`, ''];
    for (const msg of data.messages) {
      const time = new Date(msg.createdAt).toLocaleString();
      lines.push(`**${msg.senderId}** (${time}):`);
      lines.push(msg.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  private toHtml(data: BackupData): string {
    const rows = data.messages.map((m) =>
      `<tr><td>${this.esc(m.senderId)}</td><td>${this.esc(new Date(m.createdAt).toLocaleString())}</td><td>${this.esc(m.content)}</td></tr>`
    ).join('\n');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chat Backup</title>
<style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style>
</head><body><h1>Chat Backup - ${this.esc(data.metadata.sessionId)}</h1>
<table><thead><tr><th>Sender</th><th>Time</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  private toCsv(data: BackupData): string {
    const header = 'senderId,createdAt,type,content';
    const rows = data.messages.map((m) =>
      `"${this.esc(m.senderId)}","${this.esc(m.createdAt)}","${this.esc(m.type)}","${this.esc(m.content)}"`
    );
    return [header, ...rows].join('\n');
  }

  private fromMarkdown(raw: string): BackupData | null {
    const lines = raw.split('\n');
    const messages: BackupMessage[] = [];
    let current: Partial<BackupMessage> | null = null;
    for (const line of lines) {
      const msgMatch = line.match(/^\*\*(.+?)\*\*\s*\((.+?)\):/);
      if (msgMatch) {
        if (current?.id) messages.push(current as BackupMessage);
        current = {
          id: `imported-${messages.length}`,
          sessionId: 'imported',
          senderId: msgMatch[1],
          senderType: 'user',
          content: '',
          type: 'text',
          createdAt: msgMatch[2],
          updatedAt: msgMatch[2],
          reactions: [],
        };
      } else if (current && line.trim()) {
        current.content = (current.content ? current.content + '\n' : '') + line;
      }
    }
    if (current?.id) messages.push(current as BackupMessage);
    return this.buildImportedData(messages);
  }

  private fromHtml(raw: string): BackupData | null {
    const messages: BackupMessage[] = [];
    const regex = /<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      messages.push({
        id: `imported-${messages.length}`,
        sessionId: 'imported',
        senderId: match[1],
        senderType: 'user',
        content: match[3],
        type: 'text',
        createdAt: match[2],
        updatedAt: match[2],
        reactions: [],
      });
    }
    return this.buildImportedData(messages);
  }

  private fromCsv(raw: string): BackupData | null {
    const lines = raw.split('\n').slice(1);
    const messages: BackupMessage[] = [];
    for (const line of lines) {
      const parts = line.match(/(".*?"|[^",]+)(?=,|$)/g) ?? [];
      if (parts.length >= 4) {
        messages.push({
          id: `imported-${messages.length}`,
          sessionId: 'imported',
          senderId: this.unesc(parts[0]!),
          senderType: 'user',
          content: this.unesc(parts[3]),
          type: this.unesc(parts[2]),
          createdAt: this.unesc(parts[1]),
          updatedAt: this.unesc(parts[1]),
          reactions: [],
        });
      }
    }
    return this.buildImportedData(messages);
  }

  private buildImportedData(messages: BackupMessage[]): BackupData {
    return {
      metadata: {
        id: '',
        sessionId: 'imported',
        format: 'json',
        size: 0,
        messageCount: messages.length,
        createdAt: new Date(),
      },
      messages,
      sessions: [],
    };
  }

  private getMessagesForSession(sessionId: string, dateRange?: DateRange): BackupMessage[] {
    let messages = this.messageStore.get(sessionId) ?? [];
    if (dateRange) {
      messages = messages.filter((m) => {
        const d = new Date(m.createdAt);
        return d >= dateRange.from && d <= dateRange.to;
      });
    }
    return messages;
  }

  private getSessionsForExport(sessionId: string): BackupSession[] {
    if (sessionId === 'all') return Array.from(this.sessionStore.values());
    const s = this.sessionStore.get(sessionId);
    return s ? [s] : [];
  }

  private getAllSessionIds(): string[] {
    return Array.from(this.sessionStore.keys());
  }

  private enforceMaxBackups(): void {
    if (this.state.backups.size <= this.config.maxBackups) return;
    const sorted = this.getBackupList();
    while (sorted.length > this.config.maxBackups) {
      const oldest = sorted.pop();
      if (oldest) this.state.backups.delete(oldest.id);
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private unesc(s: string): string {
    return s.replace(/^"|"$/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  }
}
