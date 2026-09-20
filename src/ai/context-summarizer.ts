import { LLMProvider, Message } from './llm-provider';
import { TokenCounter } from './token-counter';

export class ContextSummarizer {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async summarizeMessages(messages: Message[]): Promise<string> {
    if (messages.length === 0) return 'No messages to summarize.';
    if (messages.length === 1) return messages[0].content;

    const prompt = this.buildSummaryPrompt(messages);
    const summaryMessages: Message[] = [
      { role: 'system', content: 'You are a precise summarizer. Condense the conversation into key points, decisions, and context. Be factual and concise.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.complete(summaryMessages, { temperature: 0.3, maxTokens: 1024 });
    return this.parseSummaryResponse(response.content);
  }

  async summarizeCodeContext(code: string, language: string): Promise<string> {
    if (!code.trim()) return 'No code provided.';

    const prompt = `Summarize this ${language} code. Include: purpose, key functions/classes, dependencies, and important logic.\n\n\`\`\`${language}\n${code}\n\`\`\``;
    const messages: Message[] = [
      { role: 'system', content: 'Summarize code concisely. Focus on purpose, structure, and key logic. Be technical and precise.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 512 });
    return this.parseSummaryResponse(response.content);
  }

  async summarizeConversation(messages: Message[]): Promise<string> {
    if (messages.length === 0) return 'No conversation to summarize.';

    const formatted = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const prompt = `Summarize this conversation. Include: topics discussed, decisions made, questions asked, and current state.\n\n${formatted}`;
    const summaryMessages: Message[] = [
      { role: 'system', content: 'Summarize the conversation flow. Include context needed to continue. Be concise.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.complete(summaryMessages, { temperature: 0.3, maxTokens: 768 });
    return this.parseSummaryResponse(response.content);
  }

  async extractKeyPoints(messages: Message[]): Promise<string[]> {
    if (messages.length === 0) return [];

    const formatted = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const prompt = `Extract key points from this conversation as a JSON array of strings. Include decisions, important facts, and critical context.\n\n${formatted}\n\nReturn ONLY a JSON array of strings, no explanation.`;
    const summaryMessages: Message[] = [
      { role: 'system', content: 'Extract key points as a JSON array. Be factual and concise. Return only the JSON array.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.complete(summaryMessages, { temperature: 0.2, maxTokens: 512 });
    return this.parseKeyPointsResponse(response.content);
  }

  async createActionItems(messages: Message[]): Promise<string[]> {
    if (messages.length === 0) return [];

    const formatted = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const prompt = `Extract action items and TODOs from this conversation as a JSON array of strings.\n\n${formatted}\n\nReturn ONLY a JSON array of strings, no explanation.`;
    const summaryMessages: Message[] = [
      { role: 'system', content: 'Extract action items as a JSON array. Be specific and actionable. Return only the JSON array.' },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.complete(summaryMessages, { temperature: 0.2, maxTokens: 512 });
    return this.parseKeyPointsResponse(response.content);
  }

  buildSummaryPrompt(messages: Message[]): string {
    const formatted = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    return `Summarize the following messages into a concise summary that preserves key context for continuing the conversation.\n\nMessages:\n${formatted}\n\nProvide a summary that includes:\n1. Main topics discussed\n2. Key decisions or conclusions\n3. Important context for continuation\n4. Any pending questions or tasks`;
  }

  parseSummaryResponse(response: string): string {
    let summary = response.trim();
    const markers = ['Summary:', 'Summary:', 'SUMMARY:', 'Here is the summary:', 'Here\'s a summary:'];
    for (const marker of markers) {
      if (summary.startsWith(marker)) {
        summary = summary.slice(marker.length).trim();
      }
    }
    return summary || response.trim();
  }

  private parseKeyPointsResponse(response: string): string[] {
    try {
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
      return [];
    } catch {
      const lines = response.split('\n').filter(l => l.trim().length > 0);
      const items: string[] = [];
      for (const line of lines) {
        const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
        if (cleaned.length > 0) {
          items.push(cleaned);
        }
      }
      return items;
    }
  }
}
