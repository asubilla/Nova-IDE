export interface MCPTool {
  name: string;
  description: string;
  params: Record<string, string>;
}

export interface MCPServer {
  name: string;
  description: string;
  tools: MCPTool[];
  category: string;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: 'running' | 'success' | 'error';
  timing: { start: number; end?: number; duration?: number };
}
