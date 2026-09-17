import { tauriInvoke } from './tauri';
import type { HealingEvent } from '../types/healing';

export interface HealingStats {
  totalEvents: number;
  errorCount: number;
  retryCount: number;
  fixCount: number;
  successCount: number;
}

export const healingAPI = {
  getLog: () =>
    tauriInvoke<HealingEvent[]>('get_healing_log'),

  triggerHeal: (agentId: string) =>
    tauriInvoke<string>('trigger_heal', { agentId }),

  getStats: () =>
    tauriInvoke<HealingStats>('get_healing_stats'),
};
