import { create } from 'zustand';
import type { Agent, AgentStatus, Task, TaskStatus } from '../types/agent';

const uid = () => Math.random().toString(36).slice(2, 10);

interface AgentState {
  agents: Agent[];
  tasks: Task[];
  spawnAgent: (name: string, task: string) => string;
  killAgent: (id: string) => void;
  updateProgress: (id: string, progress: number) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  addTask: (title: string, description?: string) => string;
  moveTask: (id: string, status: TaskStatus) => void;
  assignTask: (taskId: string, agentId: string | null) => void;
  removeTask: (id: string) => void;
}

const initialTasks: Task[] = [
  { id: uid(), title: 'Refactor auth module', description: 'Clean up legacy auth code', status: 'backlog', assigneeId: null, createdAt: Date.now() },
  { id: uid(), title: 'Add unit tests', description: 'Cover core utils', status: 'todo', assigneeId: null, createdAt: Date.now() },
  { id: uid(), title: 'Deploy to staging', description: 'Push latest build', status: 'in-progress', assigneeId: null, createdAt: Date.now() },
  { id: uid(), title: 'Update README', description: '', status: 'done', assigneeId: null, createdAt: Date.now() },
];

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  tasks: initialTasks,

  spawnAgent: (name, task) => {
    const id = uid();
    set((s) => ({
      agents: [
        ...s.agents,
        { id, name, status: 'running', task, progress: 0, startTime: Date.now() },
      ],
    }));
    return id;
  },

  killAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
    })),

  updateProgress: (id, progress) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, progress: Math.min(100, Math.max(0, progress)) } : a,
      ),
    })),

  setAgentStatus: (id, status) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),

  addTask: (title, description = '') => {
    const id = uid();
    set((s) => ({
      tasks: [...s.tasks, { id, title, description, status: 'backlog', assigneeId: null, createdAt: Date.now() }],
    }));
    return id;
  },

  moveTask: (id, status) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  assignTask: (taskId, agentId) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, assigneeId: agentId } : t)),
    })),

  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
    })),
}));
