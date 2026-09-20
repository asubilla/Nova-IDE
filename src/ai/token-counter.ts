import { Message } from './llm-provider';

const MODEL_LIMITS: Map<string, number> = new Map([
  ['gpt-4', 8192],
  ['gpt-4-turbo', 128000],
  ['gpt-4o', 128000],
  ['gpt-4o-mini', 128000],
  ['gpt-3.5-turbo', 16384],
  ['claude-3-5-sonnet-20241022', 200000],
  ['claude-3-5-haiku-20241022', 200000],
  ['claude-3-opus-20240229', 200000],
  ['claude-3-haiku-20240307', 200000],
  ['gemini-2.0-flash', 1048576],
  ['gemini-1.5-pro', 2097152],
  ['gemini-1.5-flash', 1048576],
  ['llama3.1', 131072],
  ['codellama', 16384],
  ['deepseek-coder-v2', 131072],
]);

const CHARS_PER_TOKEN_ENGLISH = 4;
const CHARS_PER_TOKEN_CODE = 2;
const WORDS_PER_TOKEN = 0.75;

function isCodeContent(text: string): boolean {
  const codeIndicators = [
    /[{}\[\]();]/,
    /\b(function|const|let|var|class|import|export|return|if|else|for|while|async|await)\b/,
    /^\s*(\/\/|\/\*|#|<!--)/m,
    /=>/,
    /\bdef\b.*:/,
    /\bfunc\b/,
  ];
  let score = 0;
  for (const pattern of codeIndicators) {
    if (pattern.test(text)) score++;
  }
  return score >= 2;
}

export const TokenCounter = {
  count(text: string, model?: string): number {
    if (!text) return 0;
    const charsPerToken = isCodeContent(text) ? CHARS_PER_TOKEN_CODE : CHARS_PER_TOKEN_ENGLISH;
    return Math.ceil(text.length / charsPerToken);
  },

  estimateByChars(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN_ENGLISH);
  },

  estimateByWords(text: string): number {
    if (!text) return 0;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    return Math.ceil(words / WORDS_PER_TOKEN);
  },

  getModelLimit(model: string): number {
    return MODEL_LIMITS.get(model) || 8192;
  },

  getModelLimits(): Map<string, number> {
    return new Map(MODEL_LIMITS);
  },

  fitsInContext(text: string, model: string, usedSoFar: number): boolean {
    const textTokens = this.count(text);
    const limit = this.getModelLimit(model);
    return textTokens + usedSoFar <= limit;
  },

  getRemainingBudget(model: string, usedTokens: number): number {
    const limit = this.getModelLimit(model);
    return Math.max(0, limit - usedTokens);
  },

  countMessageTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.count(msg.content);
      total += 4;
    }
    return total;
  },

  estimateMessageTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateByChars(msg.content);
      total += 4;
    }
    return total;
  },
};
