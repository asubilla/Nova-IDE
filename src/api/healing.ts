import { tauriInvoke } from './tauri';
import type { HealingEvent } from '../types/healing';

export interface HealingStats {
  totalEvents: number;
  successfulHeals: number;
  failedHeals: number;
  autoHeals: number;
  manualHeals: number;
  uptimeSeconds: number;
  healthScore: number;
}

export const healingAPI = {
  getLog: () =>
    tauriInvoke<HealingEvent[]>('get_healing_log'),

  triggerHeal: (agentId: string) =>
    tauriInvoke<string>('trigger_heal', { agent_id: agentId }),

  getStats: () =>
    tauriInvoke<HealingStats>('get_healing_stats'),
};
