import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHealingStore } from '../../store/healingStore';

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `test-uuid-${++uuidCounter}`),
});

beforeEach(() => {
  vi.useFakeTimers();
  uuidCounter = 0;
  useHealingStore.setState({ events: [], crashLogs: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('healingStore', () => {
  it('has correct initial state', () => {
    const state = useHealingStore.getState();
    expect(state.events).toEqual([]);
    expect(state.crashLogs).toEqual([]);
  });

  it('addEvent adds a non-error event', () => {
    act(() => {
      useHealingStore.getState().addEvent('info', 'Agent started', 'agent-1');
    });
    const state = useHealingStore.getState();
    expect(state.events).toHaveLength(1);
    expect(state.events[0].eventType).toBe('info');
    expect(state.events[0].message).toBe('Agent started');
    expect(state.events[0].agentId).toBe('agent-1');
    expect(state.events[0].id).toBeDefined();
    expect(state.crashLogs).toHaveLength(0);
  });

  it('addEvent with error creates a crash log and schedules retries', () => {
    act(() => {
      useHealingStore.getState().addEvent('error', 'Agent crashed', 'agent-1');
    });

    expect(useHealingStore.getState().events).toHaveLength(1);
    expect(useHealingStore.getState().events[0].eventType).toBe('error');
    expect(useHealingStore.getState().crashLogs).toHaveLength(1);
    expect(useHealingStore.getState().crashLogs[0].error).toBe('Agent crashed');
    expect(useHealingStore.getState().crashLogs[0].recovered).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useHealingStore.getState().events).toHaveLength(2);
    expect(useHealingStore.getState().events[0].eventType).toBe('retry');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(useHealingStore.getState().events).toHaveLength(3);
    expect(useHealingStore.getState().events[0].eventType).toBe('fix');
    expect(useHealingStore.getState().crashLogs[0].recovered).toBe(true);

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(useHealingStore.getState().events).toHaveLength(4);
    expect(useHealingStore.getState().events[0].eventType).toBe('success');
  });

  it('recoverAgent marks a crash log as recovered', () => {
    let crashLogId = '';
    act(() => {
      useHealingStore.getState().addEvent('error', 'Failure', 'agent-2');
      crashLogId = useHealingStore.getState().crashLogs[0].id;
    });
    expect(useHealingStore.getState().crashLogs[0].recovered).toBe(false);

    act(() => {
      useHealingStore.getState().recoverAgent(crashLogId);
    });
    expect(useHealingStore.getState().crashLogs[0].recovered).toBe(true);
  });

  it('recoverAgent does not affect other crash logs', () => {
    let crashLog1Id = '';
    act(() => {
      useHealingStore.getState().addEvent('error', 'First', 'agent-1');
      crashLog1Id = useHealingStore.getState().crashLogs[0].id;
      useHealingStore.getState().addEvent('error', 'Second', 'agent-2');
    });

    act(() => {
      useHealingStore.getState().recoverAgent(crashLog1Id);
    });
    expect(useHealingStore.getState().crashLogs[0].recovered).toBe(false);
    expect(useHealingStore.getState().crashLogs[1].recovered).toBe(true);
  });
});
