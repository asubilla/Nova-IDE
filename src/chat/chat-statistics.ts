import {
  ChatMessage,
  ChatMessageType,
  ChatReaction,
} from './chat-types';
import { ChatDatabase } from './chat-database';

export type StatsExportFormat = 'json' | 'csv' | 'html';

export interface SessionStats {
  sessionId: string;
  title?: string;
  participantCount: number;
  totalMessages: number;
  messagesByType: Record<ChatMessageType, number>;
  messagesByUser: Record<string, number>;
  averageMessageLength: number;
  firstMessageAt?: Date;
  lastMessageAt?: Date;
  sessionDurationMs: number;
  codeSnippetsShared: number;
  filesShared: number;
  threadsCreated: number;
  reactionsGiven: number;
}

export interface UserStats {
  userId: string;
  totalMessages: number;
  messagesByType: Record<ChatMessageType, number>;
  messagesBySession: Record<string, number>;
  averageMessageLength: number;
  totalReactionsGiven: number;
  totalReactionsReceived: number;
  totalAttachmentsShared: number;
  firstMessageAt?: Date;
  lastMessageAt?: Date;
}

export interface GlobalStats {
  totalSessions: number;
  totalMessages: number;
  totalParticipants: number;
  messagesByType: Record<ChatMessageType, number>;
  averageMessageLength: number;
  averageSessionDurationMs: number;
  busiestHours: number[];
  busiestDays: number[];
  mostActiveUsers: Array<{ userId: string; messageCount: number }>;
  mostUsedEmojis: Array<{ emoji: string; count: number }>;
  codeSnippetsShared: number;
  filesShared: number;
  threadsCreated: number;
  totalReactions: number;
}

export interface ActivityBucket {
  timestamp: Date;
  messageCount: number;
}

export interface ResponseTimeStats {
  averageMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  sampleSize: number;
}

export interface EngagementMetrics {
  sessionId: string;
  responseRate: number;
  averageResponseTimeMs: number;
  averageMessagesPerUser: number;
  uniqueParticipantsActive: number;
  reactionsPerMessage: number;
  threadCreationRate: number;
}

export interface EmojiCount {
  emoji: string;
  count: number;
}

export class ChatStatistics {
  private db: ChatDatabase;

  constructor(db: ChatDatabase) {
    this.db = db;
  }

  getSessionStats(sessionId: string): SessionStats | undefined {
    const session = this.db.getSession(sessionId);
    if (!session) return undefined;

    const allMessages = this.getAllSessionMessages(sessionId);
    if (allMessages.length === 0) {
      return {
        sessionId,
        title: session.title,
        participantCount: session.participants.length,
        totalMessages: 0,
        messagesByType: this.emptyTypeCounts(),
        messagesByUser: {},
        averageMessageLength: 0,
        sessionDurationMs: 0,
        codeSnippetsShared: 0,
        filesShared: 0,
        threadsCreated: 0,
        reactionsGiven: 0,
      };
    }

    const messagesByType = this.emptyTypeCounts();
    const messagesByUser: Record<string, number> = {};
    let totalLength = 0;
    let codeSnippets = 0;
    let files = 0;
    let threads = 0;
    let reactions = 0;

    for (const msg of allMessages) {
      messagesByType[msg.type]++;
      messagesByUser[msg.senderId] = (messagesByUser[msg.senderId] ?? 0) + 1;
      totalLength += msg.content.length;
      if (msg.type === ChatMessageType.Code) codeSnippets++;
      if (msg.type === ChatMessageType.File) files++;
      if (msg.replyTo) threads++;
      reactions += msg.reactions.length;
    }

    const firstMsg = allMessages[0];
    const lastMsg = allMessages[allMessages.length - 1];

    return {
      sessionId,
      title: session.title,
      participantCount: session.participants.length,
      totalMessages: allMessages.length,
      messagesByType,
      messagesByUser,
      averageMessageLength: totalLength / allMessages.length,
      firstMessageAt: firstMsg.createdAt,
      lastMessageAt: lastMsg.createdAt,
      sessionDurationMs: lastMsg.createdAt.getTime() - firstMsg.createdAt.getTime(),
      codeSnippetsShared: codeSnippets,
      filesShared: files,
      threadsCreated: threads,
      reactionsGiven: reactions,
    };
  }

  getUserStats(userId: string): UserStats {
    const allMessages = this.getAllUserMessages(userId);
    const messagesByType = this.emptyTypeCounts();
    const messagesBySession: Record<string, number> = {};
    let totalLength = 0;
    let reactionsGiven = 0;
    let reactionsReceived = 0;
    let attachments = 0;

    for (const msg of allMessages) {
      messagesByType[msg.type]++;
      messagesBySession[msg.sessionId] = (messagesBySession[msg.sessionId] ?? 0) + 1;
      totalLength += msg.content.length;
      reactionsGiven += msg.reactions.length;
    }

    for (const msg of this.getAllMessages()) {
      if (msg.senderId !== userId) continue;
      for (const r of msg.reactions) {
        if (r.userId === userId) {
          reactionsReceived++;
        }
      }
    }

    for (const msg of allMessages) {
      const atts = this.db.getAttachmentsByMessage(msg.id);
      attachments += atts.length;
    }

    return {
      userId,
      totalMessages: allMessages.length,
      messagesByType,
      messagesBySession,
      averageMessageLength: allMessages.length > 0 ? totalLength / allMessages.length : 0,
      totalReactionsGiven: reactionsGiven,
      totalReactionsReceived: reactionsReceived,
      totalAttachmentsShared: attachments,
      firstMessageAt: allMessages.length > 0 ? allMessages[0].createdAt : undefined,
      lastMessageAt: allMessages.length > 0 ? allMessages[allMessages.length - 1].createdAt : undefined,
    };
  }

  getGlobalStats(): GlobalStats {
    const allMessages = this.getAllMessages();
    const allSessions = this.db.listSessions();
    const messagesByType = this.emptyTypeCounts();
    const userMessageCounts: Record<string, number> = {};
    const emojiCounts: Record<string, number> = {};
    let totalLength = 0;
    let codeSnippets = 0;
    let files = 0;
    let threads = 0;
    let totalReactions = 0;
    const hourCounts = new Array(24).fill(0) as number[];
    const dayCounts = new Array(7).fill(0) as number[];
    const participantSet = new Set<string>();

    for (const msg of allMessages) {
      messagesByType[msg.type]++;
      userMessageCounts[msg.senderId] = (userMessageCounts[msg.senderId] ?? 0) + 1;
      totalLength += msg.content.length;
      if (msg.type === ChatMessageType.Code) codeSnippets++;
      if (msg.type === ChatMessageType.File) files++;
      if (msg.replyTo) threads++;
      totalReactions += msg.reactions.length;
      hourCounts[msg.createdAt.getHours()]++;
      dayCounts[msg.createdAt.getDay()]++;
      participantSet.add(msg.senderId);

      for (const r of msg.reactions) {
        emojiCounts[r.emoji] = (emojiCounts[r.emoji] ?? 0) + 1;
      }
    }

    const mostActiveUsers = Object.entries(userMessageCounts)
      .map(([userId, messageCount]) => ({ userId, messageCount }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    const mostUsedEmojis = Object.entries(emojiCounts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    let totalSessionDuration = 0;
    for (const session of allSessions) {
      totalSessionDuration += session.updatedAt.getTime() - session.createdAt.getTime();
    }

    return {
      totalSessions: allSessions.length,
      totalMessages: allMessages.length,
      totalParticipants: participantSet.size,
      messagesByType,
      averageMessageLength: allMessages.length > 0 ? totalLength / allMessages.length : 0,
      averageSessionDurationMs: allSessions.length > 0 ? totalSessionDuration / allSessions.length : 0,
      busiestHours: hourCounts,
      busiestDays: dayCounts,
      mostActiveUsers,
      mostUsedEmojis,
      codeSnippetsShared: codeSnippets,
      filesShared: files,
      threadsCreated: threads,
      totalReactions,
    };
  }

  getMessageStats(sessionId: string): {
    totalCount: number;
    byType: Record<ChatMessageType, number>;
    byUser: Record<string, number>;
  } | undefined {
    const session = this.db.getSession(sessionId);
    if (!session) return undefined;

    const allMessages = this.getAllSessionMessages(sessionId);
    const byType = this.emptyTypeCounts();
    const byUser: Record<string, number> = {};

    for (const msg of allMessages) {
      byType[msg.type]++;
      byUser[msg.senderId] = (byUser[msg.senderId] ?? 0) + 1;
    }

    return { totalCount: allMessages.length, byType, byUser };
  }

  getActivityTimeline(sessionId: string, periodMs: number): ActivityBucket[] | undefined {
    const session = this.db.getSession(sessionId);
    if (!session) return undefined;

    const allMessages = this.getAllSessionMessages(sessionId);
    if (allMessages.length === 0) return [];

    const startTime = allMessages[0].createdAt.getTime();
    const endTime = allMessages[allMessages.length - 1].createdAt.getTime();
    const buckets: ActivityBucket[] = [];

    for (let t = startTime; t <= endTime; t += periodMs) {
      const bucketEnd = t + periodMs;
      const count = allMessages.filter(
        (m) => m.createdAt.getTime() >= t && m.createdAt.getTime() < bucketEnd,
      ).length;
      buckets.push({ timestamp: new Date(t), messageCount: count });
    }

    return buckets;
  }

  getResponseTimeStats(sessionId: string): ResponseTimeStats | undefined {
    const session = this.db.getSession(sessionId);
    if (!session) return undefined;

    const allMessages = this.getAllSessionMessages(sessionId);
    const responseTimes: number[] = [];

    for (let i = 1; i < allMessages.length; i++) {
      const prev = allMessages[i - 1];
      const curr = allMessages[i];
      if (prev.senderId !== curr.senderId) {
        responseTimes.push(curr.createdAt.getTime() - prev.createdAt.getTime());
      }
    }

    if (responseTimes.length === 0) {
      return { averageMs: 0, medianMs: 0, minMs: 0, maxMs: 0, sampleSize: 0 };
    }

    responseTimes.sort((a, b) => a - b);
    const sum = responseTimes.reduce((acc, v) => acc + v, 0);
    const mid = Math.floor(responseTimes.length / 2);

    return {
      averageMs: sum / responseTimes.length,
      medianMs: responseTimes.length % 2 === 0
        ? (responseTimes[mid - 1] + responseTimes[mid]) / 2
        : responseTimes[mid],
      minMs: responseTimes[0],
      maxMs: responseTimes[responseTimes.length - 1],
      sampleSize: responseTimes.length,
    };
  }

  getEngagementMetrics(sessionId: string): EngagementMetrics | undefined {
    const session = this.db.getSession(sessionId);
    if (!session) return undefined;

    const allMessages = this.getAllSessionMessages(sessionId);
    const participantMessageCounts: Record<string, number> = {};
    let totalReactions = 0;
    let threads = 0;

    for (const msg of allMessages) {
      participantMessageCounts[msg.senderId] = (participantMessageCounts[msg.senderId] ?? 0) + 1;
      totalReactions += msg.reactions.length;
      if (msg.replyTo) threads++;
    }

    const activeParticipants = Object.keys(participantMessageCounts);
    const totalParticipantMessages = Object.values(participantMessageCounts).reduce((a, b) => a + b, 0);
    const usersWhoResponded = new Set<string>();

    for (let i = 1; i < allMessages.length; i++) {
      if (allMessages[i].senderId !== allMessages[i - 1].senderId) {
        usersWhoResponded.add(allMessages[i].senderId);
      }
    }

    return {
      sessionId,
      responseRate: activeParticipants.length > 0 ? usersWhoResponded.size / activeParticipants.length : 0,
      averageResponseTimeMs: this.getResponseTimeStats(sessionId)?.averageMs ?? 0,
      averageMessagesPerUser: activeParticipants.length > 0 ? totalParticipantMessages / activeParticipants.length : 0,
      uniqueParticipantsActive: activeParticipants.length,
      reactionsPerMessage: allMessages.length > 0 ? totalReactions / allMessages.length : 0,
      threadCreationRate: allMessages.length > 0 ? threads / allMessages.length : 0,
    };
  }

  exportStats(sessionId: string, format: StatsExportFormat): string {
    const stats = this.getSessionStats(sessionId);
    if (!stats) throw new Error(`Session ${sessionId} not found`);

    switch (format) {
      case 'json':
        return JSON.stringify(stats, null, 2);
      case 'csv':
        return this.statsToCsv(stats);
      case 'html':
        return this.statsToHtml(stats);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private statsToCsv(stats: SessionStats): string {
    const lines: string[] = [];
    lines.push('Metric,Value');
    lines.push(`Session ID,${stats.sessionId}`);
    lines.push(`Title,"${stats.title ?? ''}"`);
    lines.push(`Participants,${stats.participantCount}`);
    lines.push(`Total Messages,${stats.totalMessages}`);
    lines.push(`Average Message Length,${stats.averageMessageLength.toFixed(1)}`);
    lines.push(`Code Snippets,${stats.codeSnippetsShared}`);
    lines.push(`Files Shared,${stats.filesShared}`);
    lines.push(`Threads Created,${stats.threadsCreated}`);
    lines.push(`Reactions Given,${stats.reactionsGiven}`);
    lines.push('');
    lines.push('Message Type,Count');
    for (const [type, count] of Object.entries(stats.messagesByType)) {
      lines.push(`${type},${count}`);
    }
    lines.push('');
    lines.push('User,Message Count');
    for (const [userId, count] of Object.entries(stats.messagesByUser)) {
      lines.push(`${userId},${count}`);
    }
    return lines.join('\n');
  }

  private statsToHtml(stats: SessionStats): string {
    const typeRows = Object.entries(stats.messagesByType)
      .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
      .join('\n');
    const userRows = Object.entries(stats.messagesByUser)
      .map(([userId, count]) => `<tr><td>${userId}</td><td>${count}</td></tr>`)
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head><title>Chat Statistics - ${stats.title ?? stats.sessionId}</title>
<style>
  body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1, h2 { color: #333; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f4f4f4; }
  .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
  .metric-value { font-weight: bold; }
</style>
</head>
<body>
<h1>Chat Statistics</h1>
<h2>${stats.title ?? stats.sessionId}</h2>
<div class="metric"><span>Participants</span><span class="metric-value">${stats.participantCount}</span></div>
<div class="metric"><span>Total Messages</span><span class="metric-value">${stats.totalMessages}</span></div>
<div class="metric"><span>Avg Message Length</span><span class="metric-value">${stats.averageMessageLength.toFixed(1)}</span></div>
<div class="metric"><span>Code Snippets</span><span class="metric-value">${stats.codeSnippetsShared}</span></div>
<div class="metric"><span>Files Shared</span><span class="metric-value">${stats.filesShared}</span></div>
<div class="metric"><span>Threads</span><span class="metric-value">${stats.threadsCreated}</span></div>
<div class="metric"><span>Reactions</span><span class="metric-value">${stats.reactionsGiven}</span></div>
<h2>Messages by Type</h2>
<table><tr><th>Type</th><th>Count</th></tr>${typeRows}</table>
<h2>Messages by User</h2>
<table><tr><th>User</th><th>Count</th></tr>${userRows}</table>
</body></html>`;
  }

  private getAllSessionMessages(sessionId: string): ChatMessage[] {
    const result = this.db.getMessagesBySession(sessionId, { limit: 10000, offset: 0 });
    return result.messages;
  }

  private getAllUserMessages(userId: string): ChatMessage[] {
    const sessions = this.db.listSessions({ participant: userId });
    const messages: ChatMessage[] = [];
    for (const session of sessions) {
      const result = this.db.getMessagesBySession(session.id, { limit: 10000, offset: 0 });
      for (const msg of result.messages) {
        if (msg.senderId === userId) messages.push(msg);
      }
    }
    return messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private getAllMessages(): ChatMessage[] {
    const sessions = this.db.listSessions();
    const messages: ChatMessage[] = [];
    for (const session of sessions) {
      const result = this.db.getMessagesBySession(session.id, { limit: 10000, offset: 0 });
      messages.push(...result.messages);
    }
    return messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private emptyTypeCounts(): Record<ChatMessageType, number> {
    return {
      [ChatMessageType.Text]: 0,
      [ChatMessageType.Image]: 0,
      [ChatMessageType.File]: 0,
      [ChatMessageType.Code]: 0,
      [ChatMessageType.System]: 0,
      [ChatMessageType.AgentResponse]: 0,
    };
  }
}
