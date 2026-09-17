export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

export const models: ModelConfig[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    maxTokens: 8192,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0004,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    maxTokens: 8192,
    contextWindow: 2000000,
    supportsStreaming: true,
    supportsToolUse: true,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.005,
  },
  {
    id: 'llama3',
    name: 'Llama 3',
    provider: 'local',
    maxTokens: 4096,
    contextWindow: 8192,
    supportsStreaming: true,
    supportsToolUse: false,
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
  {
    id: 'codellama',
    name: 'Code Llama',
    provider: 'local',
    maxTokens: 4096,
    contextWindow: 16384,
    supportsStreaming: true,
    supportsToolUse: false,
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
];

export const getModelsByProvider = (provider: string): ModelConfig[] => {
  return models.filter((m) => m.provider === provider);
};

export const getModelById = (id: string): ModelConfig | undefined => {
  return models.find((m) => m.id === id);
};
