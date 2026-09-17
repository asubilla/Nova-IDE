import { tauriInvoke } from './tauri';
import type { OrchestrationResult } from '../types/orchestration';
import type { PatternConfig } from '../types/orchestration';

export const orchestrationAPI = {
  listPatterns: () =>
    tauriInvoke<PatternConfig[]>('list_patterns'),

  execute: (patternId: string, task: string) =>
    tauriInvoke<string>('execute_pattern', { patternId, task }),

  getStatus: (executionId: string) =>
    tauriInvoke<OrchestrationResult>('get_pattern_status', { executionId }),
};
