import { EventEmitter } from 'events';

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'local';

export interface LLMProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'null';
  usage: TokenUsage;
  model: string;
}

export interface StreamChunk {
  delta: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'null';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage: TokenUsage;
}

interface ProviderEndpoints {
  completions: string;
  embeddings?: string;
  models?: string;
}

const PROVIDER_ENDPOINTS: Record<AIProvider, ProviderEndpoints> = {
  openai: {
    completions: 'https://api.openai.com/v1/chat/completions',
    embeddings: 'https://api.openai.com/v1/embeddings',
    models: 'https://api.openai.com/v1/models',
  },
  anthropic: {
    completions: 'https://api.anthropic.com/v1/messages',
  },
  google: {
    completions: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  azure: {
    completions: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview',
    embeddings: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/embeddings?api-version=2024-02-15-preview',
    models: 'https://{resource}.openai.azure.com/openai/models?api-version=2024-02-15-preview',
  },
  local: {
    completions: 'http://localhost:11434/api/chat',
    embeddings: 'http://localhost:11434/api/embeddings',
    models: 'http://localhost:11434/api/tags',
  },
};

const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai', maxTokens: 8192, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsEmbeddings: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsEmbeddings: true },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', maxTokens: 16384, supportsStreaming: true, supportsEmbeddings: true },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', maxTokens: 1048576, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', maxTokens: 2097152, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', maxTokens: 1048576, supportsStreaming: true, supportsEmbeddings: false },
  { id: 'llama3.1', name: 'Llama 3.1', provider: 'local', maxTokens: 131072, supportsStreaming: true, supportsEmbeddings: true },
  { id: 'codellama', name: 'Code Llama', provider: 'local', maxTokens: 16384, supportsStreaming: true, supportsEmbeddings: true },
  { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', provider: 'local', maxTokens: 131072, supportsStreaming: true, supportsEmbeddings: false },
];

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class LLMProvider extends EventEmitter {
  private config: Required<Pick<LLMProviderConfig, 'temperature' | 'maxTokens' | 'topP' | 'timeout' | 'maxRetries'>> & LLMProviderConfig;
  private usageHistory: TokenUsage[] = [];
  private totalRequests = 0;
  private failedRequests = 0;

  constructor(config: LLMProviderConfig) {
    super();
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      timeout: DEFAULT_TIMEOUT,
      maxRetries: DEFAULT_MAX_RETRIES,
      ...config,
    };
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const mergedOptions: CompletionOptions = {
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      topP: this.config.topP,
      ...options,
    };

    return this.requestWithRetry(async () => {
      const body = this.buildRequestBody(messages, mergedOptions);
      const headers = this.buildHeaders();
      const url = this.getEndpoint('completions');

      this.totalRequests++;
      this.emit('request', { url, provider: this.config.provider });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `LLM API error (${response.status}): ${errorText}`;

          if (response.status === 401) errorMessage = 'Invalid API key. Check your credentials.';
          else if (response.status === 429) errorMessage = 'Rate limit exceeded. Please wait and retry.';
          else if (response.status === 408 || response.status === 504) errorMessage = 'Request timed out. Try again.';
          else if (response.status >= 500) errorMessage = 'Server error. The API may be temporarily unavailable.';

          this.failedRequests++;
          this.emit('error', new Error(errorMessage));
          throw new Error(errorMessage);
        }

        const data = await response.json() as Record<string, unknown>;
        const result = this.parseResponse(data);

        this.usageHistory.push(result.usage);
        this.emit('usage', result.usage);
        this.emit('response', { model: result.model, tokens: result.usage.totalTokens });

        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  async *stream(
    messages: Message[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const mergedOptions: CompletionOptions = {
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      topP: this.config.topP,
      stream: true,
      ...options,
    };

    const body = this.buildRequestBody(messages, mergedOptions);
    const headers = this.buildHeaders();
    const url = this.getEndpoint('completions');

    this.totalRequests++;
    this.emit('request', { url, provider: this.config.provider, stream: true });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      this.failedRequests++;
      if ((err as Error).name === 'AbortError') {
        throw new Error('Stream request timed out');
      }
      throw err;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorText = await response.text();
      this.failedRequests++;
      throw new Error(`LLM stream error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      throw new Error('No response body for stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const parsed = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
            const chunk = this.parseStreamChunk(parsed);
            if (chunk) {
              totalContent += chunk.delta;
              yield chunk;
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      reader.releaseLock();
      this.emit('streamComplete', { contentLength: totalContent.length });
    }
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    const url = this.getEndpoint('embeddings');
    if (!url) throw new Error(`Embeddings not supported for provider: ${this.config.provider}`);

    return this.requestWithRetry(async () => {
      const headers = this.buildHeaders();
      const body = this.buildEmbeddingBody(text);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Embedding API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        return this.parseEmbeddingResponse(data);
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  getModels(): ModelInfo[] {
    return AVAILABLE_MODELS.filter(m => m.provider === this.config.provider);
  }

  async validateKey(): Promise<boolean> {
    try {
      switch (this.config.provider) {
        case 'openai': {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          return response.ok;
        }
        case 'anthropic': {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': this.config.apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: this.config.model,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
            signal: AbortSignal.timeout(10000),
          });
          return response.ok || response.status === 400;
        }
        case 'google': {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`,
            { signal: AbortSignal.timeout(10000) },
          );
          return response.ok;
        }
        case 'azure': {
          if (!this.config.baseUrl) return false;
          const resource = new URL(this.config.baseUrl).hostname.split('.')[0];
          const url = `https://${resource}.openai.azure.com/openai/models?api-version=2024-02-15-preview`;
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          return response.ok;
        }
        case 'local': {
          const response = await fetch('http://localhost:11434/api/tags', {
            signal: AbortSignal.timeout(5000),
          });
          return response.ok;
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  async getUsage(): Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }> {
    const total: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for (const usage of this.usageHistory) {
      total.promptTokens += usage.promptTokens;
      total.completionTokens += usage.completionTokens;
      total.totalTokens += usage.totalTokens;
    }
    return total;
  }

  getRequestStats(): { total: number; failed: number; successRate: number } {
    const success = this.totalRequests - this.failedRequests;
    return {
      total: this.totalRequests,
      failed: this.failedRequests,
      successRate: this.totalRequests > 0 ? success / this.totalRequests : 1,
    };
  }

  resetStats(): void {
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.usageHistory = [];
  }

  private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const isRetryable = lastError.message.includes('429') ||
          lastError.message.includes('500') ||
          lastError.message.includes('502') ||
          lastError.message.includes('503') ||
          lastError.message.includes('504') ||
          lastError.message.includes('timed out') ||
          lastError.message.includes('timeout');

        if (!isRetryable || attempt === this.config.maxRetries) {
          throw lastError;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        this.emit('retry', { attempt: attempt + 1, delay, error: lastError.message });
        await sleep(delay);
      }
    }
    throw lastError!;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (this.config.provider) {
      case 'openai':
      case 'azure':
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        break;
      case 'anthropic':
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'google':
        headers['x-goog-api-key'] = this.config.apiKey;
        break;
      case 'local':
        break;
    }

    return headers;
  }

  private buildRequestBody(messages: Message[], options: CompletionOptions): Record<string, unknown> {
    switch (this.config.provider) {
      case 'openai':
      case 'azure':
      case 'local':
        return {
          model: this.config.model,
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stop,
          stream: options.stream,
        };

      case 'anthropic': {
        const system = messages.find(m => m.role === 'system');
        const nonSystem = messages.filter(m => m.role !== 'system');
        return {
          model: this.config.model,
          messages: nonSystem,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          stop_sequences: options.stop,
          stream: options.stream,
          system: system?.content,
        };
      }

      case 'google': {
        const contents = messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));
        const systemInstruction = messages.find(m => m.role === 'system');
        return {
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
            topP: options.topP,
            stopSequences: options.stop,
          },
        };
      }

      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  private buildEmbeddingBody(text: string): Record<string, unknown> {
    switch (this.config.provider) {
      case 'openai':
      case 'azure':
        return { model: this.config.model, input: text };
      case 'google':
        return { content: { parts: [{ text }] } };
      case 'local':
        return { model: this.config.model, input: text };
      default:
        throw new Error(`Embeddings not supported for provider: ${this.config.provider}`);
    }
  }

  private parseResponse(data: Record<string, unknown>): CompletionResponse {
    switch (this.config.provider) {
      case 'openai':
      case 'azure':
      case 'local': {
        const choices = data.choices as Array<{ message?: { content?: string }; finish_reason?: string }>;
        const choice = choices?.[0];
        return {
          content: choice?.message?.content || '',
          finishReason: (choice?.finish_reason as CompletionResponse['finishReason']) || 'stop',
          usage: this.parseUsage(data.usage as Record<string, number> | undefined),
          model: (data.model as string) || this.config.model,
        };
      }

      case 'anthropic': {
        const content = data.content as Array<{ text?: string }>;
        return {
          content: content?.[0]?.text || '',
          finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
          usage: {
            promptTokens: (data.usage as Record<string, number>)?.input_tokens || 0,
            completionTokens: (data.usage as Record<string, number>)?.output_tokens || 0,
            totalTokens: ((data.usage as Record<string, number>)?.input_tokens || 0) + ((data.usage as Record<string, number>)?.output_tokens || 0),
          },
          model: (data.model as string) || this.config.model,
        };
      }

      case 'google': {
        const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        const candidate = candidates?.[0];
        return {
          content: candidate?.content?.parts?.[0]?.text || '',
          finishReason: candidate?.finishReason === 'STOP' ? 'stop' : 'length',
          usage: {
            promptTokens: (data.usageMetadata as Record<string, number>)?.promptTokenCount || 0,
            completionTokens: (data.usageMetadata as Record<string, number>)?.candidatesTokenCount || 0,
            totalTokens: (data.usageMetadata as Record<string, number>)?.totalTokenCount || 0,
          },
          model: (data.modelVersion as string) || this.config.model,
        };
      }

      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  private parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
    switch (this.config.provider) {
      case 'openai':
      case 'azure':
      case 'local': {
        const choices = data.choices as Array<{ delta?: { content?: string }; finish_reason?: string }>;
        const choice = choices?.[0];
        if (!choice) return null;
        return {
          delta: choice.delta?.content || '',
          finishReason: choice.finish_reason as StreamChunk['finishReason'] || undefined,
        };
      }

      case 'anthropic': {
        if (data.type === 'content_block_delta') {
          const delta = data.delta as { text?: string };
          return { delta: delta?.text || '' };
        }
        if (data.type === 'message_stop') {
          return { delta: '', finishReason: 'stop' };
        }
        return null;
      }

      case 'google': {
        const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        const candidate = candidates?.[0];
        return {
          delta: candidate?.content?.parts?.[0]?.text || '',
          finishReason: candidate?.finishReason === 'STOP' ? 'stop' : undefined,
        };
      }

      default:
        return null;
    }
  }

  private parseUsage(usage?: Record<string, number>): TokenUsage {
    if (!usage) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    return {
      promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
      completionTokens: usage.completion_tokens || usage.output_tokens || 0,
      totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    };
  }

  private parseEmbeddingResponse(data: Record<string, unknown>): EmbeddingResponse {
    switch (this.config.provider) {
      case 'openai':
      case 'azure':
      case 'local': {
        const embeddings = data.data as Array<{ embedding?: number[] }>;
        return {
          embedding: embeddings?.[0]?.embedding || [],
          model: (data.model as string) || this.config.model,
          usage: this.parseUsage(data.usage as Record<string, number> | undefined),
        };
      }

      case 'google': {
        const embeddings = data.embeddings as Array<{ values?: number[] }>;
        return {
          embedding: embeddings?.[0]?.values || [],
          model: this.config.model,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }

      default:
        throw new Error(`Embeddings not supported for provider: ${this.config.provider}`);
    }
  }

  private getEndpoint(type: keyof ProviderEndpoints): string {
    const endpoints = PROVIDER_ENDPOINTS[this.config.provider];
    let url = this.config.baseUrl
      ? `${this.config.baseUrl}/${type === 'completions' ? 'chat/completions' : type}`
      : endpoints[type];

    if (!url) throw new Error(`Endpoint ${type} not supported for provider: ${this.config.provider}`);

    if (this.config.provider === 'azure' && this.config.baseUrl) {
      const resource = new URL(this.config.baseUrl).hostname.split('.')[0];
      url = url.replace('{resource}', resource).replace('{deployment}', this.config.model);
    }

    if (this.config.provider === 'google' && type === 'completions') {
      url = `${url}/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    }

    return url;
  }
}
