import { act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '../../store/agentStore';

beforeEach(() => {
  useAgentStore.setState({ agents: [], tasks: [] });
});

describe('agentStore', () => {
  it('has correct initial state', () => {
    const state = useAgentStore.getState();
    expect(state.agents).toEqual([]);
    expect(state.tasks).toEqual([]);
  });

  it('spawnAgent adds an agent and returns its id', () => {
    let agentId = '';
    act(() => {
      agentId = useAgentStore.getState().spawnAgent('Nova-1', 'Fix bug');
    });
    const state = useAgentStore.getState();
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0].name).toBe('Nova-1');
    expect(state.agents[0].task).toBe('Fix bug');
    expect(state.agents[0].status).toBe('running');
    expect(state.agents[0].progress).toBe(0);
    expect(state.agents[0].id).toBe(agentId);
  });

  it('killAgent removes an agent by id', () => {
    let agentId = '';
    act(() => {
      agentId = useAgentStore.getState().spawnAgent('Nova-1', 'Fix bug');
    });
    act(() => {
      useAgentStore.getState().killAgent(agentId);
    });
    expect(useAgentStore.getState().agents).toHaveLength(0);
  });

  it('updateProgress sets agent progress clamped to 0-100', () => {
    let agentId = '';
    act(() => {
      agentId = useAgentStore.getState().spawnAgent('Nova-1', 'Fix bug');
    });
    act(() => {
      useAgentStore.getState().updateProgress(agentId, 75);
    });
    expect(useAgentStore.getState().agents[0].progress).toBe(75);

    act(() => {
      useAgentStore.getState().updateProgress(agentId, 150);
    });
    expect(useAgentStore.getState().agents[0].progress).toBe(100);

    act(() => {
      useAgentStore.getState().updateProgress(agentId, -10);
    });
    expect(useAgentStore.getState().agents[0].progress).toBe(0);
  });

  it('setAgentStatus updates the agent status', () => {
    let agentId = '';
    act(() => {
      agentId = useAgentStore.getState().spawnAgent('Nova-1', 'Fix bug');
    });
    act(() => {
      useAgentStore.getState().setAgentStatus(agentId, 'done');
    });
    expect(useAgentStore.getState().agents[0].status).toBe('done');
  });

  it('addTask adds a new task', () => {
    act(() => {
      useAgentStore.getState().addTask('New Task', 'Description');
    });
    const tasks = useAgentStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('New Task');
    expect(tasks[0].description).toBe('Description');
    expect(tasks[0].status).toBe('backlog');
  });

  it('moveTask changes task status', () => {
    let taskId = '';
    act(() => {
      taskId = useAgentStore.getState().addTask('Task');
    });
    act(() => {
      useAgentStore.getState().moveTask(taskId, 'done');
    });
    expect(useAgentStore.getState().tasks[0].status).toBe('done');
  });

  it('assignTask sets assignee on a task', () => {
    let taskId = '';
    act(() => {
      taskId = useAgentStore.getState().addTask('Task');
    });
    act(() => {
      useAgentStore.getState().assignTask(taskId, 'agent-1');
    });
    expect(useAgentStore.getState().tasks[0].assigneeId).toBe('agent-1');
  });

  it('removeTask removes a task by id', () => {
    let taskId = '';
    act(() => {
      taskId = useAgentStore.getState().addTask('Task');
    });
    act(() => {
      useAgentStore.getState().removeTask(taskId);
    });
    expect(useAgentStore.getState().tasks).toHaveLength(0);
  });
});
