import { LLMProvider, Message } from './llm-provider';
import { TokenCounter } from './token-counter';
import { ContextSummarizer } from './context-summarizer';

export interface ContextReport {
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
  utilizationPercent: number;
  messageCount: number;
  needsTruncation: boolean;
  summaryMessageCount: number;
}

export class ContextManager {
  private maxTokens: number;
  private model: string;
  private llmProvider: LLMProvider | null;
  private summarizer: ContextSummarizer | null;
  private summaryCache: Map<string, string>;
  private static readonly SUMMARIZE_THRESHOLD = 0.85;
  private static readonly SUMMARY_TARGET = 0.5;

  constructor(maxTokens: number, model: string, llmProvider?: LLMProvider) {
    this.maxTokens = maxTokens;
    this.model = model;
    this.llmProvider = llmProvider || null;
    this.summarizer = llmProvider ? new ContextSummarizer(llmProvider) : null;
    this.summaryCache = new Map();
  }

  countTokens(text: string): number {
    return TokenCounter.count(text, this.model);
  }

  countMessageTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.countTokens(msg.content);
      total += 4;
    }
    return total;
  }

  isWithinLimit(messages: Message[]): boolean {
    return this.countMessageTokens(messages) <= this.maxTokens;
  }

  getRemainingTokens(messages: Message[]): number {
    const used = this.countMessageTokens(messages);
    return Math.max(0, this.maxTokens - used);
  }

  async summarizeIfNeeded(messages: Message[]): Promise<Message[]> {
    if (this.isWithinLimit(messages)) {
      return messages;
    }
    return this.smartTruncate(messages, Math.floor(this.maxTokens * ContextManager.SUMMARY_TARGET));
  }

  async smartTruncate(messages: Message[], targetTokens: number): Promise<Message[]> {
    if (messages.length === 0) return [];

    const systemMessages = this.preserveSystemPrompt(messages);
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemTokens = this.countMessageTokens(systemMessages);
    const availableTokens = targetTokens - systemTokens;

    if (availableTokens <= 0) {
      return systemMessages;
    }

    const keptMessages = this.preserveRecentMessages(nonSystemMessages, 2);
    const keptTokens = this.countMessageTokens(keptMessages);

    if (keptTokens >= availableTokens) {
      const truncated = keptMessages.slice(-2);
      return [...systemMessages, ...truncated];
    }

    const summaryCandidates = nonSystemMessages.slice(0, Math.max(0, nonSystemMessages.length - 2));

    if (summaryCandidates.length === 0) {
      return [...systemMessages, ...keptMessages];
    }

    let summaryText: string;

    if (this.summarizer) {
      summaryText = await this.summarizer.summarizeMessages(summaryCandidates);
    } else {
      summaryText = this.createSummary(summaryCandidates);
    }

    const summaryMessage: Message = {
      role: 'system',
      content: `[Conversation Summary]\n${summaryText}`,
    };

    return [...systemMessages, summaryMessage, ...keptMessages];
  }

  createSummary(messages: Message[]): string {
    const keyPoints: string[] = [];

    for (const msg of messages) {
      const lines = msg.content.split('\n').filter(l => l.trim());
      const significantLines = lines.filter(l =>
        l.includes('TODO') ||
        l.includes('decision') ||
        l.includes('decided') ||
        l.includes('important') ||
        l.includes('key') ||
        l.includes('error') ||
        l.includes('fix') ||
        l.includes('plan') ||
        l.length > 100
      );

      if (significantLines.length > 0) {
        keyPoints.push(`[${msg.role}] ${significantLines.slice(0, 3).join('; ')}`);
      }
    }

    if (keyPoints.length === 0) {
      const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
      return `Previous conversation with ${messages.length} messages (${totalLength} chars). Topics covered: ${messages.slice(0, 3).map(m => m.content.slice(0, 50)).join(', ')}`;
    }

    return keyPoints.join('\n');
  }

  preserveSystemPrompt(messages: Message[]): Message[] {
    return messages.filter(m => m.role === 'system');
  }

  preserveRecentMessages(messages: Message[], count: number): Message[] {
    if (messages.length <= count) return [...messages];
    return messages.slice(-count);
  }

  compressMessage(message: Message): Message {
    let content = message.content;
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.replace(/[ \t]{2,}/g, ' ');
    content = content.replace(/```[\s\S]*?```/g, (match) => {
      const lines = match.split('\n');
      if (lines.length <= 4) return match;
      return [lines[0], lines[1], '    [... truncated ...]', lines[lines.length - 1]].join('\n');
    });
    return { role: message.role, content };
  }

  getContextReport(messages: Message[]): ContextReport {
    const usedTokens = this.countMessageTokens(messages);
    const remainingTokens = Math.max(0, this.maxTokens - usedTokens);
    const utilizationPercent = (usedTokens / this.maxTokens) * 100;
    const summaryMessageCount = messages.filter(m =>
      m.content.startsWith('[Conversation Summary]') || m.content.startsWith('[Code Summary]')
    ).length;

    return {
      totalTokens: this.maxTokens,
      usedTokens,
      remainingTokens,
      utilizationPercent,
      messageCount: messages.length,
      needsTruncation: usedTokens > this.maxTokens * ContextManager.SUMMARIZE_THRESHOLD,
      summaryMessageCount,
    };
  }

  getOptimalChunkSize(): number {
    const report = this.getContextReport([]);
    const available = report.remainingTokens;

    if (available > 50000) return 8000;
    if (available > 20000) return 4000;
    if (available > 10000) return 2000;
    if (available > 5000) return 1000;
    return 500;
  }

  getMaxTokens(): number {
    return this.maxTokens;
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  clearCache(): void {
    this.summaryCache.clear();
  }

  getCacheSize(): number {
    return this.summaryCache.size;
  }
}
