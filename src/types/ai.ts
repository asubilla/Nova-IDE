export type MessageRole = 'user' | 'assistant' | 'system';

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface Provider {
  id: string;
  name: string;
  models: string[];
  apiKey?: string;
}

export interface ChatSession {
  id: string;
  messages: Message[];
  providerId: string;
  modelId: string;
}
