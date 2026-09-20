import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface SystemConfig {
  server: { port: number; host: string; corsOrigins: string[]; rateLimitWindowMs: number; rateLimitMaxRequests: number };
  agents: { maxPerSession: number; maxConcurrent: number; defaultTimeoutMs: number; spawnStrategy: string };
  security: { sandboxEnabled: boolean; permissionsEnabled: boolean; auditEnabled: boolean; budgetEnabled: boolean; encryptionKey: string };
  logging: { level: string; format: 'json' | 'text'; outputs: string[] };
  database: { enabled: boolean; path: string };
  mcp: { autoStart: boolean; configPath?: string };
  lsp: { autoStart: boolean; configPath?: string };
  plugins: { autoActivate: boolean; configPath?: string };
  monitoring: { enabled: boolean; metricsPort: number; healthCheckPath: string };
}

const DEFAULT_CONFIG: SystemConfig = {
  server: { port: 3001, host: '127.0.0.1', corsOrigins: ['*'], rateLimitWindowMs: 60000, rateLimitMaxRequests: 100 },
  agents: { maxPerSession: 100, maxConcurrent: 20, defaultTimeoutMs: 300000, spawnStrategy: 'dependency-aware' },
  security: { sandboxEnabled: true, permissionsEnabled: true, auditEnabled: true, budgetEnabled: true, encryptionKey: 'change-in-production' },
  logging: { level: 'info', format: 'json', outputs: ['console'] },
  database: { enabled: false, path: './data/agents.db' },
  mcp: { autoStart: true },
  lsp: { autoStart: true },
  plugins: { autoActivate: true },
  monitoring: { enabled: true, metricsPort: 9090, healthCheckPath: '/health' },
};

export class ConfigManager {
  private config: SystemConfig;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): SystemConfig {
    let config = { ...DEFAULT_CONFIG };
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        config = this.mergeConfig(config, userConfig);
      } catch (e) { /* ignore */ }
    }
    config = this.applyEnvOverrides(config);
    this.validateConfig(config);
    return config;
  }

  private mergeConfig(base: SystemConfig, override: Partial<SystemConfig>): SystemConfig {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof SystemConfig)[]) {
      if (typeof result[key] === 'object' && !Array.isArray(result[key])) {
        (result as any)[key] = { ...(result as any)[key], ...(override as any)[key] };
      } else {
        (result as any)[key] = (override as any)[key];
      }
    }
    return result;
  }

  private applyEnvOverrides(config: SystemConfig): SystemConfig {
    if (process.env.PORT) config.server.port = parseInt(process.env.PORT);
    if (process.env.HOST) config.server.host = process.env.HOST;
    if (process.env.LOG_LEVEL) config.logging.level = process.env.LOG_LEVEL;
    if (process.env.ENCRYPTION_KEY) config.security.encryptionKey = process.env.ENCRYPTION_KEY;
    if (process.env.DATABASE_PATH) config.database.path = process.env.DATABASE_PATH;
    if (process.env.METRICS_PORT) config.monitoring.metricsPort = parseInt(process.env.METRICS_PORT);
    return config;
  }

  private validateConfig(config: SystemConfig): void {
    if (config.server.port < 1 || config.server.port > 65535) throw new Error('Invalid server port');
    if (config.agents.maxPerSession < 1) throw new Error('maxPerSession must be >= 1');
    if (config.agents.maxConcurrent < 1) throw new Error('maxConcurrent must be >= 1');
  }

  get(): SystemConfig { return this.config; }
  getSection<K extends keyof SystemConfig>(section: K): SystemConfig[K] { return this.config[section]; }
  set<K extends keyof SystemConfig>(key: K, value: SystemConfig[K]): void { this.config[key] = value; }
  getAll(): SystemConfig { return { ...this.config }; }
  export(): string { return JSON.stringify(this.config, null, 2); }
}
