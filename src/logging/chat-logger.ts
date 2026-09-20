import { SystemLogger, type LogEntry } from './system-logger';

export interface ChatStats {
  sessionId: string;
  totalMessages: number;
  totalReplies: number;
  totalEdits: number;
  totalDeletes: number;
  totalReactions: number;
  totalMentions: number;
  totalSearches: number;
  totalFileUploads: number;
  totalCodeExecutions: number;
  codeExecutionSuccessRate: number;
}

export class ChatLogger {
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly systemLogger: SystemLogger) {}

  logMessage(messageId: string, senderId: string, sessionId: string): LogEntry {
    return this.systemLogger.info('chat', `Message sent: ${messageId}`, {
      messageId,
      senderId,
      sessionId,
    });
  }

  logReply(messageId: string, replyToId: string): LogEntry {
    return this.systemLogger.info('chat', `Reply sent: ${messageId} -> ${replyToId}`, {
      messageId,
      replyToId,
    });
  }

  logEdit(messageId: string, oldContent: string): LogEntry {
    return this.systemLogger.info('chat', `Message edited: ${messageId}`, {
      messageId,
      oldContent,
    });
  }

  logDelete(messageId: string): LogEntry {
    return this.systemLogger.warn('chat', `Message deleted: ${messageId}`, {
      messageId,
    });
  }

  logReaction(messageId: string, emoji: string, userId: string): LogEntry {
    return this.systemLogger.info('chat', `Reaction added: ${emoji} on ${messageId}`, {
      messageId,
      emoji,
      userId,
    });
  }

  logMention(messageId: string, mentionedUserId: string): LogEntry {
    return this.systemLogger.info('chat', `User mentioned: ${mentionedUserId} in ${messageId}`, {
      messageId,
      mentionedUserId,
    });
  }

  logTyping(userId: string, sessionId: string): LogEntry {
    return this.systemLogger.debug('chat', `User typing: ${userId}`, {
      userId,
      sessionId,
    });
  }

  logSearch(query: string, userId: string, resultCount: number): LogEntry {
    return this.systemLogger.info('chat', `Search: "${query}" (${resultCount} results)`, {
      query,
      userId,
      resultCount,
    });
  }

  logFileUpload(messageId: string, fileName: string, fileSize: number): LogEntry {
    return this.systemLogger.info('chat', `File uploaded: ${fileName} (${fileSize} bytes)`, {
      messageId,
      fileName,
      fileSize,
    });
  }

  logCodeExecution(messageId: string, language: string, duration: number, success: boolean): LogEntry {
    const entry = this.systemLogger.info('chat', `Code executed: ${language} (${success ? 'success' : 'failure'})`, {
      messageId,
      language,
      duration,
      success,
    });
    entry.duration = duration;
    return entry;
  }

  getChatLogs(sessionId: string): LogEntry[] {
    return this.systemLogger.getLogs({ category: 'chat', sessionId });
  }

  getChatStats(sessionId: string): ChatStats {
    const logs = this.getChatLogs(sessionId);
    let totalMessages = 0;
    let totalReplies = 0;
    let totalEdits = 0;
    let totalDeletes = 0;
    let totalReactions = 0;
    let totalMentions = 0;
    let totalSearches = 0;
    let totalFileUploads = 0;
    let totalCodeExecutions = 0;
    let codeExecSuccess = 0;
    let codeExecTotal = 0;

    for (const l of logs) {
      if (l.message.startsWith('Message sent:')) totalMessages++;
      else if (l.message.startsWith('Reply sent:')) totalReplies++;
      else if (l.message.startsWith('Message edited:')) totalEdits++;
      else if (l.message.startsWith('Message deleted:')) totalDeletes++;
      else if (l.message.startsWith('Reaction added:')) totalReactions++;
      else if (l.message.startsWith('User mentioned:')) totalMentions++;
      else if (l.message.startsWith('Search:')) totalSearches++;
      else if (l.message.startsWith('File uploaded:')) totalFileUploads++;
      else if (l.message.startsWith('Code executed:')) {
        totalCodeExecutions++;
        codeExecTotal++;
        if (l.data && typeof l.data === 'object' && 'success' in l.data && (l.data as Record<string, unknown>).success === true) {
          codeExecSuccess++;
        }
      }
    }

    return {
      sessionId,
      totalMessages,
      totalReplies,
      totalEdits,
      totalDeletes,
      totalReactions,
      totalMentions,
      totalSearches,
      totalFileUploads,
      totalCodeExecutions,
      codeExecutionSuccessRate: codeExecTotal > 0 ? codeExecSuccess / codeExecTotal : 0,
    };
  }
}
