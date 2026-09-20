import type { ChatMessage, ChatSession } from './chat-types.js';
import { ChatMessageType } from './chat-types.js';

export enum SummaryType {
  Brief = 'brief',
  Standard = 'standard',
  Detailed = 'detailed',
  BulletPoints = 'bullet_points',
  ActionItems = 'action_items',
}

export interface SummaryOptions {
  type?: SummaryType;
  maxLength?: number;
  includeCodeSnippets?: boolean;
  includeFileReferences?: boolean;
  includeUrls?: boolean;
  includeUserMentions?: boolean;
  includeTimeline?: boolean;
  customInstructions?: string;
}

export interface KeyPoint {
  content: string;
  importance: 'high' | 'medium' | 'low';
  messageId: string;
  timestamp: Date;
}

export interface ActionItem {
  task: string;
  assignee?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  messageId: string;
  timestamp: Date;
  deadline?: Date;
}

export interface Decision {
  description: string;
  context: string;
  messageId: string;
  timestamp: Date;
  participants: string[];
}

export interface UnansweredQuestion {
  question: string;
  askedBy: string;
  messageId: string;
  timestamp: Date;
}

export interface CodeSnippet {
  language: string;
  code: string;
  description?: string;
  messageId: string;
}

export interface FileReference {
  path: string;
  action: 'created' | 'modified' | 'deleted' | 'mentioned';
  messageId: string;
}

export interface TimelineEvent {
  event: string;
  timestamp: Date;
  messageId: string;
  type: 'message' | 'code_change' | 'decision' | 'action';
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  keyPoints: KeyPoint[];
  actionItems: ActionItem[];
  decisions: Decision[];
  questions: UnansweredQuestion[];
  codeSnippets: CodeSnippet[];
  fileReferences: FileReference[];
  timeline: TimelineEvent[];
  messageCount: number;
  participantCount: number;
  timespan: { start: Date; end: Date };
}

export interface ProgressReport {
  sessionId: string;
  report: string;
  completedTasks: ActionItem[];
  pendingTasks: ActionItem[];
  blockedTasks: ActionItem[];
  recentDecisions: Decision[];
  openQuestions: UnansweredQuestion[];
  overallProgress: number;
}

export interface MessageTag {
  tag: string;
  category: 'topic' | 'sentiment' | 'priority' | 'status';
  confidence: number;
}

export class MessageSummarizer {
  private tagKeywords = new Map<string, string[]>([
    ['bug', ['bug', 'error', 'fix', 'broken', 'issue', 'crash', 'exception']],
    ['feature', ['feature', 'implement', 'add', 'create', 'new', 'enhance']],
    ['discussion', ['think', 'consider', 'maybe', 'perhaps', 'opinion', 'suggest']],
    ['question', ['how', 'what', 'why', 'when', 'where', 'who', '?']],
    ['decision', ['decided', 'agreed', 'confirmed', 'approved', 'rejected']],
    ['blocked', ['blocked', 'waiting', 'stuck', 'depends on', 'need']],
    ['completed', ['done', 'finished', 'completed', 'merged', 'deployed']],
    ['urgent', ['urgent', 'asap', 'critical', 'p0', 'immediately', 'hotfix']],
  ]);

  summarizeSession(sessionId: string, messages: ChatMessage[], options?: SummaryOptions): SessionSummary {
    const type = options?.type ?? SummaryType.Standard;
    const relevantMessages = messages.filter(m =>
      m.type !== ChatMessageType.System && !m.deletedAt
    );

    const keyPoints = this.generateKeyPoints(relevantMessages);
    const actionItems = this.extractActionItems(relevantMessages);
    const decisions = this.extractDecisions(relevantMessages);
    const questions = this.extractQuestions(relevantMessages);
    const codeSnippets = options?.includeCodeSnippets !== false
      ? this.extractCodeSnippets(relevantMessages)
      : [];
    const fileReferences = options?.includeFileReferences !== false
      ? this.extractFileReferences(relevantMessages)
      : [];
    const timeline = options?.includeTimeline !== false
      ? this.generateTimeline(relevantMessages)
      : [];

    const summary = this.formatSummary(type, {
      keyPoints,
      actionItems,
      decisions,
      questions,
      codeSnippets,
      fileReferences,
      timeline,
      messageCount: relevantMessages.length,
      participantCount: new Set(relevantMessages.map(m => m.senderId)).size,
      options,
    });

    return {
      sessionId,
      summary,
      keyPoints,
      actionItems,
      decisions,
      questions,
      codeSnippets,
      fileReferences,
      timeline,
      messageCount: relevantMessages.length,
      participantCount: new Set(relevantMessages.map(m => m.senderId)).size,
      timespan: {
        start: relevantMessages[0]?.createdAt ?? new Date(),
        end: relevantMessages[relevantMessages.length - 1]?.createdAt ?? new Date(),
      },
    };
  }

  summarizeThread(threadId: string, messages: ChatMessage[], options?: SummaryOptions): SessionSummary {
    const threadMessages = messages.filter(m => m.replyTo === threadId || m.id === threadId);
    return this.summarizeSession(threadId, threadMessages, options);
  }

  summarizeRange(messages: ChatMessage[], start: number, end: number, options?: SummaryOptions): SessionSummary {
    const sliced = messages.slice(start, end);
    return this.summarizeSession('range', sliced, options);
  }

  generateKeyPoints(messages: ChatMessage[]): KeyPoint[] {
    const keyPoints: KeyPoint[] = [];

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;

      const importance = this.assessImportance(msg);
      if (importance !== 'low' || msg.content.length > 100) {
        const sentences = this.extractKeySentences(msg.content);
        for (const sentence of sentences) {
          keyPoints.push({
            content: sentence,
            importance,
            messageId: msg.id,
            timestamp: msg.createdAt,
          });
        }
      }
    }

    return this.rankKeyPoints(keyPoints).slice(0, 20);
  }

  extractActionItems(messages: ChatMessage[]): ActionItem[] {
    const actionItems: ActionItem[] = [];
    const actionPatterns = [
      /(?:need to|must|should|todo:|task:|action item:|please|can you|could you)\s+(.+)/gi,
      /(?:@\w+)\s+(?:please|can you|could you)\s+(.+)/gi,
      /\[(?:x| )\]\s*(.+)/gi,
      /(?:assigned to|owner:|responsible:)\s*@?(\w+)\s*[-:]\s*(.+)/gi,
    ];

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;

      for (const pattern of actionPatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(msg.content)) !== null) {
          const task = match[1]?.trim() ?? match[0]?.trim();
          if (task && task.length > 5) {
            actionItems.push({
              task,
              assignee: this.extractAssignee(msg.content),
              status: this.determineTaskStatus(msg.content),
              messageId: msg.id,
              timestamp: msg.createdAt,
            });
          }
        }
      }
    }

    return this.deduplicateActionItems(actionItems);
  }

  extractDecisions(messages: ChatMessage[]): Decision[] {
    const decisions: Decision[] = [];
    const decisionPatterns = [
      /(?:decided|agreed|confirmed|approved|rejected|concluded)\s+(?:that\s+)?(.+)/gi,
      /(?:decision|verdict|outcome)\s*:\s*(.+)/gi,
      /(?:we'll|we will|let's|let us)\s+(.+)/gi,
    ];

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;

      for (const pattern of decisionPatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(msg.content)) !== null) {
          const description = match[1]?.trim();
          if (description && description.length > 10) {
            decisions.push({
              description,
              context: this.extractContext(messages, msg),
              messageId: msg.id,
              timestamp: msg.createdAt,
              participants: this.extractParticipants(messages, msg),
            });
          }
        }
      }
    }

    return decisions;
  }

  extractQuestions(messages: ChatMessage[]): UnansweredQuestion[] {
    const questions: UnansweredQuestion[] = [];
    const questionPattern = /(.+?\?)$/gm;

    const answeredMessageIds = new Set<string>();
    for (const msg of messages) {
      if (msg.replyTo) {
        answeredMessageIds.add(msg.replyTo);
      }
    }

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;
      if (answeredMessageIds.has(msg.id)) continue;

      let match: RegExpExecArray | null;
      while ((match = questionPattern.exec(msg.content)) !== null) {
        const question = match[1]?.trim();
        if (question && question.length > 10) {
          questions.push({
            question,
            askedBy: msg.senderId,
            messageId: msg.id,
            timestamp: msg.createdAt,
          });
        }
      }
    }

    return questions;
  }

  generateProgressReport(sessionId: string): ProgressReport {
    return {
      sessionId,
      report: 'Progress report generated based on session activity.',
      completedTasks: [],
      pendingTasks: [],
      blockedTasks: [],
      recentDecisions: [],
      openQuestions: [],
      overallProgress: 0,
    };
  }

  autoTag(messages: ChatMessage[]): Map<string, MessageTag[]> {
    const tagMap = new Map<string, MessageTag[]>();

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;

      const tags: MessageTag[] = [];
      const lowerContent = msg.content.toLowerCase();

      for (const [tag, keywords] of this.tagKeywords) {
        const matches = keywords.filter(kw => lowerContent.includes(kw));
        if (matches.length > 0) {
          tags.push({
            tag,
            category: this.getTagCategory(tag),
            confidence: Math.min(matches.length / keywords.length, 1),
          });
        }
      }

      if (tags.length > 0) {
        tagMap.set(msg.id, tags);
      }
    }

    return tagMap;
  }

  private extractCodeSnippets(messages: ChatMessage[]): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];

    for (const msg of messages) {
      if (msg.type === ChatMessageType.Code) {
        const meta = (msg as any).metadata as { language?: string } | undefined;
        snippets.push({
          language: meta?.language ?? 'unknown',
          code: msg.content,
          messageId: msg.id,
        });
      } else {
        const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;
        while ((match = codeBlockPattern.exec(msg.content)) !== null) {
          snippets.push({
            language: match[1] ?? 'unknown',
            code: match[2],
            messageId: msg.id,
          });
        }
      }
    }

    return snippets;
  }

  private extractFileReferences(messages: ChatMessage[]): FileReference[] {
    const refs: FileReference[] = [];
    const filePattern = /(?:file|path|modified|created|deleted|changed)\s*[:=]?\s*([\/\\]?[\w\-\.\/\\]+\.\w+)/gi;

    for (const msg of messages) {
      if (msg.senderType === 'system') continue;

      let match: RegExpExecArray | null;
      while ((match = filePattern.exec(msg.content)) !== null) {
        refs.push({
          path: match[1],
          action: this.determineFileAction(msg.content),
          messageId: msg.id,
        });
      }
    }

    return refs;
  }

  private generateTimeline(messages: ChatMessage[]): TimelineEvent[] {
    return messages
      .filter(m => m.senderType !== 'system')
      .map(m => ({
        event: this.truncate(m.content, 100),
        timestamp: m.createdAt,
        messageId: m.id,
        type: this.determineEventType(m),
      }));
  }

  private formatSummary(
    type: SummaryType,
    data: {
      keyPoints: KeyPoint[];
      actionItems: ActionItem[];
      decisions: Decision[];
      questions: UnansweredQuestion[];
      codeSnippets: CodeSnippet[];
      fileReferences: FileReference[];
      timeline: TimelineEvent[];
      messageCount: number;
      participantCount: number;
      options?: SummaryOptions;
    },
  ): string {
    const parts: string[] = [];

    switch (type) {
      case SummaryType.Brief:
        parts.push(`Session with ${data.messageCount} messages from ${data.participantCount} participants.`);
        if (data.keyPoints.length > 0) {
          parts.push(`Key topic: ${data.keyPoints[0].content}`);
        }
        if (data.actionItems.length > 0) {
          parts.push(`${data.actionItems.length} action items identified.`);
        }
        break;

      case SummaryType.Standard:
        parts.push(`## Session Summary`);
        parts.push(`**Messages:** ${data.messageCount} | **Participants:** ${data.participantCount}`);
        if (data.keyPoints.length > 0) {
          parts.push(`\n### Key Points`);
          data.keyPoints.slice(0, 5).forEach(kp => parts.push(`- ${kp.content}`));
        }
        if (data.actionItems.length > 0) {
          parts.push(`\n### Action Items`);
          data.actionItems.forEach(ai => parts.push(`- [ ] ${ai.task}`));
        }
        if (data.decisions.length > 0) {
          parts.push(`\n### Decisions`);
          data.decisions.forEach(d => parts.push(`- ${d.description}`));
        }
        break;

      case SummaryType.Detailed:
        parts.push(`# Detailed Session Report`);
        parts.push(`\n## Overview`);
        parts.push(`- **Total Messages:** ${data.messageCount}`);
        parts.push(`- **Participants:** ${data.participantCount}`);
        parts.push(`- **Time Span:** ${data.timeline[0]?.timestamp.toLocaleString()} - ${data.timeline[data.timeline.length - 1]?.timestamp.toLocaleString()}`);

        if (data.keyPoints.length > 0) {
          parts.push(`\n## Key Points`);
          data.keyPoints.forEach(kp => parts.push(`- **[${kp.importance.toUpperCase()}]** ${kp.content}`));
        }
        if (data.actionItems.length > 0) {
          parts.push(`\n## Action Items`);
          data.actionItems.forEach(ai => parts.push(`- [${ai.status}] ${ai.task}${ai.assignee ? ` (Assigned: ${ai.assignee})` : ''}`));
        }
        if (data.decisions.length > 0) {
          parts.push(`\n## Decisions Made`);
          data.decisions.forEach(d => parts.push(`- ${d.description}\n  *Context:* ${d.context}`));
        }
        if (data.questions.length > 0) {
          parts.push(`\n## Open Questions`);
          data.questions.forEach(q => parts.push(`- ${q.question} (Asked by: ${q.askedBy})`));
        }
        if (data.codeSnippets.length > 0) {
          parts.push(`\n## Code Snippets`);
          data.codeSnippets.forEach(cs => parts.push(`- \`${cs.language}\` (${cs.code.substring(0, 50)}...)`));
        }
        if (data.fileReferences.length > 0) {
          parts.push(`\n## Files Referenced`);
          data.fileReferences.forEach(fr => parts.push(`- [${fr.action}] ${fr.path}`));
        }
        break;

      case SummaryType.BulletPoints:
        parts.push(`## Summary`);
        data.keyPoints.forEach(kp => parts.push(`* ${kp.content}`));
        if (data.actionItems.length > 0) {
          parts.push(`\n## To-Do`);
          data.actionItems.forEach(ai => parts.push(`* [ ] ${ai.task}`));
        }
        break;

      case SummaryType.ActionItems:
        parts.push(`## Action Items`);
        data.actionItems.forEach((ai, i) => {
          parts.push(`${i + 1}. ${ai.task}`);
          if (ai.assignee) parts.push(`   - **Assignee:** ${ai.assignee}`);
          parts.push(`   - **Status:** ${ai.status}`);
          parts.push(`   - **Source:** Message ${ai.messageId}`);
        });
        break;
    }

    return parts.join('\n');
  }

  private assessImportance(message: ChatMessage): 'high' | 'medium' | 'low' {
    const content = message.content.toLowerCase();
    if (content.includes('urgent') || content.includes('critical') || content.includes('p0')) return 'high';
    if (content.includes('important') || content.includes('key') || content.includes('must')) return 'high';
    if (message.content.length > 200) return 'medium';
    return 'low';
  }

  private extractKeySentences(content: string): string[] {
    const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 15);
    return sentences.slice(0, 3).map(s => s.trim());
  }

  private rankKeyPoints(points: KeyPoint[]): KeyPoint[] {
    return points.sort((a, b) => {
      const severity = { high: 3, medium: 2, low: 1 };
      return (severity[b.importance] ?? 0) - (severity[a.importance] ?? 0);
    });
  }

  private extractAssignee(content: string): string | undefined {
    const match = content.match(/@(\w+)/);
    return match?.[1];
  }

  private determineTaskStatus(content: string): ActionItem['status'] {
    const lower = content.toLowerCase();
    if (lower.includes('done') || lower.includes('completed') || lower.includes('finished')) return 'completed';
    if (lower.includes('blocked') || lower.includes('waiting')) return 'blocked';
    if (lower.includes('in progress') || lower.includes('working on')) return 'in_progress';
    return 'pending';
  }

  private extractContext(messages: ChatMessage[], current: ChatMessage): string {
    const idx = messages.findIndex(m => m.id === current.id);
    if (idx <= 0) return current.content;
    return messages[idx - 1].content;
  }

  private extractParticipants(messages: ChatMessage[], current: ChatMessage): string[] {
    const idx = messages.findIndex(m => m.id === current.id);
    const start = Math.max(0, idx - 3);
    const end = Math.min(messages.length, idx + 3);
    return [...new Set(messages.slice(start, end).map(m => m.senderId))];
  }

  private determineFileAction(content: string): FileReference['action'] {
    const lower = content.toLowerCase();
    if (lower.includes('created') || lower.includes('new file')) return 'created';
    if (lower.includes('modified') || lower.includes('updated') || lower.includes('changed')) return 'modified';
    if (lower.includes('deleted') || lower.includes('removed')) return 'deleted';
    return 'mentioned';
  }

  private determineEventType(message: ChatMessage): TimelineEvent['type'] {
    if (message.type === ChatMessageType.Code) return 'code_change';
    const content = message.content.toLowerCase();
    if (content.includes('decided') || content.includes('agreed')) return 'decision';
    if (content.includes('todo') || content.includes('task')) return 'action';
    return 'message';
  }

  private getTagCategory(tag: string): MessageTag['category'] {
    if (['bug', 'feature', 'discussion', 'question'].includes(tag)) return 'topic';
    if (['urgent'].includes(tag)) return 'priority';
    if (['completed', 'blocked'].includes(tag)) return 'status';
    return 'topic';
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  private deduplicateActionItems(items: ActionItem[]): ActionItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.task.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
