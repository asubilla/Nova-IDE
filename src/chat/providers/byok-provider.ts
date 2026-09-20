import { EventEmitter } from 'events';
import { BYOKConfig, ProviderType, ProviderStatus, ProviderConfig, KeyUsageStats } from '../byok-config';

export interface BYOKProviderOptions {
  encryptionKey?: string;
  defaultProvider?: string;
}

export class BYOKProvider extends EventEmitter {
  private config: BYOKConfig;
  private activeProviderId: string | null = null;

  constructor(options?: BYOKProviderOptions) {
    super();
    this.config = new BYOKConfig(options?.encryptionKey);
    this.setupEventForwarding();
  }

  addProvider(provider: ProviderConfig): ProviderConfig {
    const result = this.config.addProvider(provider);
    if (!this.activeProviderId) {
      this.activeProviderId = result.id;
    }
    return result;
  }

  removeProvider(providerId: string): boolean {
    return this.config.removeProvider(providerId);
  }

  updateApiKey(providerId: string, apiKey: string): void {
    this.config.updateKey(providerId, apiKey);
  }

  getApiKey(providerId: string): string {
    return this.config.getKey(providerId);
  }

  listProviders(): Array<Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean }> {
    return this.config.listProviders();
  }

  setActiveProvider(providerId: string): void {
    this.config.setDefaultProvider(providerId);
    this.activeProviderId = providerId;
  }

  getActiveProvider(): (Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean }) | null {
    return this.config.getDefaultProvider();
  }

  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  async testConnection(providerId: string): Promise<{ success: boolean; latency: number; error?: string }> {
    return this.config.testConnection(providerId);
  }

  getUsageStats(providerId: string): KeyUsageStats {
    return this.config.getKeyUsage(providerId);
  }

  recordUsage(providerId: string, tokens: number): void {
    this.config.recordUsage(providerId, tokens);
  }

  recordError(providerId: string): void {
    this.config.recordError(providerId);
  }

  validateApiKey(providerId: string, key: string): boolean {
    return this.config.validateKey(providerId, key);
  }

  private setupEventForwarding(): void {
    this.config.on('provider:added', (p) => this.emit('provider:added', p));
    this.config.on('provider:removed', (p) => this.emit('provider:removed', p));
    this.config.on('provider:key-updated', (p) => this.emit('provider:key-updated', p));
    this.config.on('provider:default-changed', (p) => this.emit('provider:default-changed', p));
    this.config.on('provider:test-success', (p) => this.emit('provider:test-success', p));
    this.config.on('provider:test-failure', (p) => this.emit('provider:test-failure', p));
  }

  destroy(): void {
    this.config.destroy();
    this.removeAllListeners();
  }
}
