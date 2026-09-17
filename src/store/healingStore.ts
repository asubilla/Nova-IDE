import { create } from 'zustand';
import type { HealingEvent, CrashLog } from '../types/healing';

interface HealingState {
  events: HealingEvent[];
  crashLogs: CrashLog[];
  addEvent: (type: HealingEvent['type'], message: string, agentId: string) => void;
  recoverAgent: (crashLogId: string) => void;
}

const generateId = () => crypto.randomUUID();

export const useHealingStore = create<HealingState>((set) => ({
  events: [],
  crashLogs: [],

  addEvent: (type, message, agentId) => {
    const event: HealingEvent = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      message,
      agentId,
    };
    set((s) => ({ events: [event, ...s.events] }));

    if (type === 'error') {
      const crashLog: CrashLog = {
        id: generateId(),
        agentId,
        error: message,
        stacktrace: `Error: ${message}\n  at agent:${agentId}\n  at processTask (healing.ts:42)\n  at async execute (pipeline.ts:18)`,
        recovered: false,
      };
      set((s) => ({ crashLogs: [crashLog, ...s.crashLogs] }));

      setTimeout(() => {
        set((s) => ({
          events: [
            { id: generateId(), timestamp: Date.now(), type: 'retry', message: `Retrying agent ${agentId}...`, agentId },
            ...s.events,
          ],
        }));
      }, 500);

      setTimeout(() => {
        set((s) => ({
          events: [
            { id: generateId(), timestamp: Date.now(), type: 'fix', message: `Applied fix for ${message}`, agentId },
            ...s.events,
          ],
          crashLogs: s.crashLogs.map((cl) =>
            cl.id === crashLog.id ? { ...cl, recovered: true } : cl
          ),
        }));
      }, 1200);

      setTimeout(() => {
        set((s) => ({
          events: [
            { id: generateId(), timestamp: Date.now(), type: 'success', message: `Agent ${agentId} recovered successfully`, agentId },
            ...s.events,
          ],
        }));
      }, 2000);
    }
  },

  recoverAgent: (crashLogId) => {
    set((s) => ({
      crashLogs: s.crashLogs.map((cl) =>
        cl.id === crashLogId ? { ...cl, recovered: true } : cl
      ),
    }));
  },
}));
