import { tauriInvoke } from './tauri';
import type { Agent } from '../types/agent';

export const agentsAPI = {
  spawn: (name: string, task: string) =>
    tauriInvoke<Agent>('spawn_agent', { name, task }),

  kill: (agentId: string) =>
    tauriInvoke<void>('kill_agent', { agentId }),

  list: () =>
    tauriInvoke<Agent[]>('list_agents'),

  executeWorkflow: (path: string) =>
    tauriInvoke<string>('execute_workflow', { path }),

  getLogs: (agentId: string) =>
    tauriInvoke<string[]>('get_agent_logs', { agentId }),
};
