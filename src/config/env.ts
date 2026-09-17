interface EnvConfig {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OLLAMA_BASE_URL: string;
  MCP_REGISTRY_URL: string;
  MCP_SANDBOX_PROVIDER: string;
  BROWSER_HEADLESS: boolean;
  BROWSER_EXECUTABLE_PATH?: string;
  NOVA_DEFAULT_THEME: string;
  NOVA_DEFAULT_PROVIDER: string;
  NOVA_DEFAULT_MODEL: string;
  VITE_API_URL: string;
  VITE_DEBUG: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

export const env: EnvConfig = {
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY as string | undefined,
  ANTHROPIC_API_KEY: import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined,
  GOOGLE_API_KEY: import.meta.env.VITE_GOOGLE_API_KEY as string | undefined,
  OLLAMA_BASE_URL: (import.meta.env.VITE_OLLAMA_BASE_URL as string) ?? 'http://localhost:11434',
  MCP_REGISTRY_URL:
    (import.meta.env.VITE_MCP_REGISTRY_URL as string) ??
    'https://toolsdk-ai.github.io/toolsdk-mcp-registry',
  MCP_SANDBOX_PROVIDER: (import.meta.env.VITE_MCP_SANDBOX_PROVIDER as string) ?? 'LOCAL',
  BROWSER_HEADLESS: parseBoolean(import.meta.env.VITE_BROWSER_HEADLESS as string, true),
  BROWSER_EXECUTABLE_PATH: import.meta.env.VITE_BROWSER_EXECUTABLE_PATH as string | undefined,
  NOVA_DEFAULT_THEME: (import.meta.env.VITE_NOVA_DEFAULT_THEME as string) ?? 'nova-dark',
  NOVA_DEFAULT_PROVIDER: (import.meta.env.VITE_NOVA_DEFAULT_PROVIDER as string) ?? 'openai',
  NOVA_DEFAULT_MODEL: (import.meta.env.VITE_NOVA_DEFAULT_MODEL as string) ?? 'gpt-4',
  VITE_API_URL: (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:1420',
  VITE_DEBUG: parseBoolean(import.meta.env.VITE_DEBUG as string, false),
};

export function getEnvVar(key: string): string | undefined {
  const value = import.meta.env[`VITE_${key}`] as string | undefined;
  return value ?? undefined;
}

export function requireEnvVar(key: string): string {
  const value = getEnvVar(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}. Add it to your .env file.`);
  }
  return value;
}
