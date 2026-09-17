import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAgents: never[] = [];
const mockTasks: never[] = [];

vi.mock('../../store/agentStore', () => ({
  useAgentStore: Object.assign(
    (selector: (state: { agents: typeof mockAgents; tasks: typeof mockTasks }) => unknown) =>
      selector({ agents: mockAgents, tasks: mockTasks }),
    {
      getState: () => ({ agents: mockAgents, tasks: mockTasks }),
    },
  ),
}));

import AgentMonitor from '../../components/agents/AgentMonitor';
import { useAgentStore } from '../../store/agentStore';

const setMockData = (agents: typeof mockAgents, tasks: typeof mockTasks) => {
  Object.assign(mockAgents, agents);
  Object.assign(mockTasks, tasks);
};

beforeEach(() => {
  vi.clearAllMocks();
  (mockAgents as unknown[]).length = 0;
  (mockTasks as unknown[]).length = 0;
});

describe('AgentMonitor', () => {
  it('renders the task monitor header', () => {
    render(<AgentMonitor />);
    expect(screen.getByText('TASK MONITOR')).toBeInTheDocument();
  });

  it('shows empty state when no agents', () => {
    render(<AgentMonitor />);
    expect(screen.getByText('Spawn agents to begin')).toBeInTheDocument();
  });

  it('renders agent list with names and tasks', () => {
    setMockData(
      [
        { id: 'a1', name: 'Nova-1', status: 'running', task: 'Fix bug', progress: 60, startTime: Date.now() },
        { id: 'a2', name: 'Nova-2', status: 'done', task: 'Write tests', progress: 100, startTime: Date.now() },
      ],
      [],
    );
    render(<AgentMonitor />);
    expect(screen.getByText('Nova-1')).toBeInTheDocument();
    expect(screen.getByText('Nova-2')).toBeInTheDocument();
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('shows status labels with correct text', () => {
    setMockData(
      [
        { id: 'a1', name: 'Nova-1', status: 'running', task: 'Task A', progress: 50, startTime: Date.now() },
      ],
      [],
    );
    render(<AgentMonitor />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('shows task list when tasks exist', () => {
    setMockData(
      [],
      [
        { id: 't1', title: 'Deploy', description: '', status: 'todo', assigneeId: null, createdAt: Date.now() },
      ],
    );
    render(<AgentMonitor />);
    expect(screen.getByText('TASKS')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });
});
