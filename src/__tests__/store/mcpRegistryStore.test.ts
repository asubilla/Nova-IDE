import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMCPRegistryStore } from '../../store/mcpRegistryStore';

let execUuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `exec-uuid-${++execUuidCounter}`),
});

beforeEach(() => {
  vi.useFakeTimers();
  execUuidCounter = 0;
  useMCPRegistryStore.setState({
    searchQuery: '',
    filteredServers: useMCPRegistryStore.getState().servers,
    executions: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mcpRegistryStore', () => {
  it('has correct initial state with preloaded servers', () => {
    const state = useMCPRegistryStore.getState();
    expect(state.servers.length).toBeGreaterThan(0);
    expect(state.filteredServers).toEqual(state.servers);
    expect(state.searchQuery).toBe('');
    expect(state.executions).toEqual([]);
  });

  it('searchTools filters servers by name', () => {
    act(() => {
      useMCPRegistryStore.getState().searchTools('GitHub');
    });
    const state = useMCPRegistryStore.getState();
    expect(state.searchQuery).toBe('GitHub');
    expect(state.filteredServers).toHaveLength(1);
    expect(state.filteredServers[0].name).toBe('GitHub MCP');
  });

  it('searchTools filters servers by tool name', () => {
    act(() => {
      useMCPRegistryStore.getState().searchTools('deploy');
    });
    const state = useMCPRegistryStore.getState();
    expect(state.filteredServers.length).toBeGreaterThan(0);
    const toolNames = state.filteredServers.flatMap((s) => s.tools.map((t) => t.name));
    expect(toolNames).toContain('deploy');
  });

  it('searchTools filters by category', () => {
    act(() => {
      useMCPRegistryStore.getState().searchTools('Database');
    });
    const state = useMCPRegistryStore.getState();
    expect(state.filteredServers.length).toBeGreaterThanOrEqual(2);
    const hasCategory = state.filteredServers.some((s) =>
      s.category.toLowerCase().includes('database') ||
      s.name.toLowerCase().includes('database') ||
      s.description.toLowerCase().includes('database')
    );
    expect(hasCategory).toBe(true);
  });

  it('searchTools with empty query restores all servers', () => {
    act(() => {
      useMCPRegistryStore.getState().searchTools('GitHub');
    });
    act(() => {
      useMCPRegistryStore.getState().searchTools('');
    });
    expect(useMCPRegistryStore.getState().filteredServers).toEqual(
      useMCPRegistryStore.getState().servers
    );
  });

  it('searchTools returns empty for no matches', () => {
    act(() => {
      useMCPRegistryStore.getState().searchTools('zzz_nonexistent_zzz');
    });
    expect(useMCPRegistryStore.getState().filteredServers).toHaveLength(0);
  });

  it('executeTool adds a running execution', () => {
    act(() => {
      useMCPRegistryStore.getState().executeTool('GitHub MCP', 'create_issue', { repo: 'test', title: 'Bug' });
    });
    const execs = useMCPRegistryStore.getState().executions;
    expect(execs).toHaveLength(1);
    expect(execs[0].toolName).toBe('GitHub MCP/create_issue');
    expect(execs[0].status).toBe('running');
    expect(execs[0].input).toEqual({ repo: 'test', title: 'Bug' });
    expect(execs[0].timing.start).toBeGreaterThan(0);
  });

  it('executeTool resolves after timeout', () => {
    act(() => {
      useMCPRegistryStore.getState().executeTool('GitHub', 'create_issue', {});
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const exec = useMCPRegistryStore.getState().executions[0];
    expect(exec.status).toMatch(/success|error/);
    expect(exec.timing.end).toBeGreaterThan(0);
    expect(exec.timing.duration).toBeGreaterThanOrEqual(0);
  });
});
