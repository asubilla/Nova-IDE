import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HealingEvent, CrashLog } from '../types/healing';

interface HealingState {
  events: HealingEvent[];
  crashLogs: CrashLog[];
  addEvent: (eventType: HealingEvent['eventType'], message: string, agentId: string) => void;
  recoverAgent: (crashLogId: string) => void;
}

const generateId = () => crypto.randomUUID();

export const useHealingStore = create<HealingState>()(
  persist(
    (set) => ({
      events: [],
      crashLogs: [],

  addEvent: (eventType, message, agentId) => {
    const now = new Date().toISOString();
    const event: HealingEvent = {
      id: generateId(),
      timestamp: now,
      eventType,
      message,
      agentId,
      createdAt: now,
      logs: [],
    };
    set((s) => ({ events: [event, ...s.events] }));

    if (eventType === 'error') {
      const crashLog: CrashLog = {
        id: generateId(),
        agentId,
        error: message,
        stacktrace: `Error: ${message}\n  at agent:${agentId}\n  at processTask (healing.ts:42)\n  at async execute (pipeline.ts:18)`,
        recovered: false,
      };
      set((s) => ({ crashLogs: [crashLog, ...s.crashLogs] }));

      setTimeout(() => {
        const ts = new Date().toISOString();
        set((s) => ({
          events: [
            { id: generateId(), timestamp: ts, eventType: 'retry', message: `Retrying agent ${agentId}...`, agentId, createdAt: ts, logs: [] },
            ...s.events,
          ],
        }));
      }, 500);

      setTimeout(() => {
        const ts = new Date().toISOString();
        set((s) => ({
          events: [
            { id: generateId(), timestamp: ts, eventType: 'fix', message: `Applied fix for ${message}`, agentId, createdAt: ts, logs: [] },
            ...s.events,
          ],
          crashLogs: s.crashLogs.map((cl) =>
            cl.id === crashLog.id ? { ...cl, recovered: true } : cl
          ),
        }));
      }, 1200);

      setTimeout(() => {
        const ts = new Date().toISOString();
        set((s) => ({
          events: [
            { id: generateId(), timestamp: ts, eventType: 'success', message: `Agent ${agentId} recovered successfully`, agentId, createdAt: ts, logs: [] },
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
}),
    {
      name: 'nova-healing-store',
      partialize: (state) => ({
        events: state.events,
        crashLogs: state.crashLogs,
      }),
    },
  )
);
