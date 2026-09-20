import * as fs from 'fs';
import * as path from 'path';

export interface NovaConfig {
  name: string;
  version: string;
  server: {
    port: number;
    host: string;
  };
  agents: {
    maxPerSession: number;
    maxConcurrent: number;
  };
  chat: {
    enabled: boolean;
    features: {
      richText: boolean;
      codePlayground: boolean;
      mermaid: boolean;
    };
  };
  providers: {
    openai: { enabled: boolean; apiKey: string };
    anthropic: { enabled: boolean; apiKey: string };
  };
  plugins: string[];
  theme: string;
}

const CONFIG_FILE = 'nova.config.json';

export function getDefaultConfig(): NovaConfig {
  return {
    name: 'nova-project',
    version: '1.0.0',
    server: { port: 3001, host: '127.0.0.1' },
    agents: { maxPerSession: 100, maxConcurrent: 20 },
    chat: {
      enabled: true,
      features: { richText: true, codePlayground: true, mermaid: true },
    },
    providers: {
      openai: { enabled: false, apiKey: '' },
      anthropic: { enabled: false, apiKey: '' },
    },
    plugins: [],
    theme: 'dark',
  };
}

export function loadConfig(): NovaConfig {
  const configPath = path.resolve(CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return getDefaultConfig();
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as NovaConfig;
}

export function saveConfig(config: NovaConfig): void {
  const configPath = path.resolve(CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const keys = key.split('.');
  let current: unknown = config;
  for (const k of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }
  return current;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const keys = key.split('.');
  let current = config as unknown as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];

  if (value === 'true') current[lastKey] = true;
  else if (value === 'false') current[lastKey] = false;
  else if (!isNaN(Number(value))) current[lastKey] = Number(value);
  else current[lastKey] = value;

  saveConfig(config);
}

export function validateConfig(config: NovaConfig): string[] {
  const errors: string[] = [];
  if (!config.name || typeof config.name !== 'string') errors.push('name must be a string');
  if (!config.version || typeof config.version !== 'string') errors.push('version must be a string');
  if (!config.server || typeof config.server !== 'object') errors.push('server must be an object');
  else {
    if (typeof config.server.port !== 'number') errors.push('server.port must be a number');
    if (typeof config.server.host !== 'string') errors.push('server.host must be a string');
  }
  if (!config.agents || typeof config.agents !== 'object') errors.push('agents must be an object');
  if (!config.chat || typeof config.chat !== 'object') errors.push('chat must be an object');
  if (!Array.isArray(config.plugins)) errors.push('plugins must be an array');
  return errors;
}
