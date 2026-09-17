import { tauriInvoke } from './tauri';
import type { MCPServer } from '../types/mcp-registry';

export const mcpAPI = {
  search: (query: string) =>
    tauriInvoke<MCPServer[]>('search_mcp_tools', { query }),

  execute: (server: string, tool: string, args: unknown) =>
    tauriInvoke<unknown>('execute_mcp_tool', { server, tool, args }),

  categories: () =>
    tauriInvoke<string[]>('list_mcp_categories'),
};
