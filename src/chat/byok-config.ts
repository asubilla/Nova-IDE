import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

export enum ProviderType {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Google = 'google',
  AzureOpenAI = 'azure-openai',
  AWSBedrock = 'aws-bedrock',
  Cohere = 'cohere',
  HuggingFace = 'huggingface',
  Local = 'local',
}

export enum ProviderStatus {
  Active = 'active',
  Inactive = 'inactive',
  Invalid = 'invalid',
  RateLimited = 'rate-limited',
}

export interface ProviderRateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  models: string[];
  rateLimit: ProviderRateLimit;
  priority: number;
  status: ProviderStatus;
}

export interface KeyUsageStats {
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: Date | null;
  errorCount: number;
}

interface EncryptedKey {
  iv: string;
  data: string;
  salt: string;
}

export class BYOKConfig extends EventEmitter {
  private providers: Map<string, ProviderConfig> = new Map();
  private encryptedKeys: Map<string, EncryptedKey> = new Map();
  private usageStats: Map<string, KeyUsageStats> = new Map();
  private defaultProviderId: string | null = null;
  private readonly encryptionKey: string;

  constructor(encryptionKey?: string) {
    super();
    this.encryptionKey = encryptionKey ?? randomBytes(32).toString('hex');
  }

  addProvider(provider: ProviderConfig): ProviderConfig {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already exists`);
    }

    const validated = this.validateProviderConfig(provider);
    this.providers.set(validated.id, validated);
    this.encryptedKeys.set(validated.id, this.encryptKey(validated.apiKey));
    this.usageStats.set(validated.id, {
      totalRequests: 0,
      totalTokens: 0,
      lastUsedAt: null,
      errorCount: 0,
    });

    const sanitized = { ...validated, apiKey: '***' };
    this.emit('provider:added', sanitized);
    return sanitized;
  }

  removeProvider(providerId: string): boolean {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not found`);
    }

    this.providers.delete(providerId);
    this.encryptedKeys.delete(providerId);
    this.usageStats.delete(providerId);

    if (this.defaultProviderId === providerId) {
      this.defaultProviderId = null;
    }

    this.emit('provider:removed', { providerId });
    return true;
  }

  updateKey(providerId: string, apiKey: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not found`);
    }

    this.encryptedKeys.set(providerId, this.encryptKey(apiKey));

    const provider = this.providers.get(providerId)!;
    provider.apiKey = apiKey;
    this.providers.set(providerId, provider);

    this.emit('provider:key-updated', { providerId });
  }

  validateKey(providerId: string, key: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    switch (provider.type) {
      case ProviderType.OpenAI:
        return key.startsWith('sk-') && key.length > 20;
      case ProviderType.Anthropic:
        return key.startsWith('sk-ant-') && key.length > 20;
      case ProviderType.Google:
        return key.length > 10;
      case ProviderType.AzureOpenAI:
        return key.length > 10;
      case ProviderType.AWSBedrock:
        return key.length > 10;
      case ProviderType.Cohere:
        return key.length > 10;
      case ProviderType.HuggingFace:
        return key.startsWith('hf_') && key.length > 10;
      case ProviderType.Local:
        return true;
      default:
        return false;
    }
  }

  getKey(providerId: string): string {
    const encrypted = this.encryptedKeys.get(providerId);
    if (!encrypted) {
      throw new Error(`No key found for provider ${providerId}`);
    }
    return this.decryptKey(encrypted);
  }

  listProviders(): Array<Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      models: p.models,
      rateLimit: p.rateLimit,
      priority: p.priority,
      status: p.status,
      hasKey: this.encryptedKeys.has(p.id),
    }));
  }

  getDefaultProvider(): (Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean }) | null {
    if (!this.defaultProviderId) return null;
    const list = this.listProviders();
    return list.find((p) => p.id === this.defaultProviderId) ?? null;
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.defaultProviderId = providerId;
    this.emit('provider:default-changed', { providerId });
  }

  async testConnection(providerId: string): Promise<{ success: boolean; latency: number; error?: string }> {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const provider = this.providers.get(providerId)!;
    const start = Date.now();

    try {
      const url = `${provider.baseUrl}/models`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (provider.type === ProviderType.OpenAI || provider.type === ProviderType.AzureOpenAI) {
        headers['Authorization'] = `Bearer ${this.getKey(providerId)}`;
      } else if (provider.type === ProviderType.Anthropic) {
        headers['x-api-key'] = this.getKey(providerId);
        headers['anthropic-version'] = '2023-06-01';
      } else if (provider.type === ProviderType.Google) {
        headers['x-goog-api-key'] = this.getKey(providerId);
      } else {
        headers['Authorization'] = `Bearer ${this.getKey(providerId)}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!response.ok) {
        return { success: false, latency, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      this.emit('provider:test-success', { providerId, latency });
      return { success: true, latency };
    } catch (err) {
      const latency = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.emit('provider:test-failure', { providerId, error: message });
      return { success: false, latency, error: message };
    }
  }

  getKeyUsage(providerId: string): KeyUsageStats {
    const stats = this.usageStats.get(providerId);
    if (!stats) {
      throw new Error(`No usage stats for provider ${providerId}`);
    }
    return { ...stats };
  }

  recordUsage(providerId: string, tokens: number): void {
    const stats = this.usageStats.get(providerId);
    if (!stats) return;
    stats.totalRequests += 1;
    stats.totalTokens += tokens;
    stats.lastUsedAt = new Date();
    this.usageStats.set(providerId, stats);
  }

  recordError(providerId: string): void {
    const stats = this.usageStats.get(providerId);
    if (!stats) return;
    stats.errorCount += 1;
    this.usageStats.set(providerId, stats);
  }

  private encryptKey(key: string): EncryptedKey {
    const salt = randomBytes(16).toString('hex');
    const iv = randomBytes(16).toString('hex');
    const cipherKey = createHash('sha256').update(this.encryptionKey + salt).digest('hex');

    const keyBytes = Buffer.from(key, 'utf-8');
    const keyArray = new Uint8Array(keyBytes);
    const cipherKeyBytes = Buffer.from(cipherKey.slice(0, 32), 'hex');

    const encrypted = new Uint8Array(keyArray.length);
    for (let i = 0; i < keyArray.length; i++) {
      encrypted[i] = keyArray[i] ^ cipherKeyBytes[i % cipherKeyBytes.length];
    }

    return { iv, data: Buffer.from(encrypted).toString('hex'), salt };
  }

  private decryptKey(enc: EncryptedKey): string {
    const cipherKey = createHash('sha256').update(this.encryptionKey + enc.salt).digest('hex');
    const encrypted = Buffer.from(enc.data, 'hex');
    const cipherKeyBytes = Buffer.from(cipherKey.slice(0, 32), 'hex');

    const decrypted = Buffer.alloc(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ cipherKeyBytes[i % cipherKeyBytes.length];
    }

    return decrypted.toString('utf-8');
  }

  private validateProviderConfig(provider: ProviderConfig): ProviderConfig {
    if (!provider.id || !provider.name || !provider.type) {
      throw new Error('Provider must have id, name, and type');
    }
    if (!Object.values(ProviderType).includes(provider.type)) {
      throw new Error(`Unsupported provider type: ${provider.type}`);
    }
    return {
      ...provider,
      rateLimit: provider.rateLimit ?? { requestsPerMinute: 60, tokensPerMinute: 90000 },
      priority: provider.priority ?? 0,
      status: provider.status ?? ProviderStatus.Active,
    };
  }

  destroy(): void {
    this.providers.clear();
    this.encryptedKeys.clear();
    this.usageStats.clear();
    this.removeAllListeners();
  }
}
