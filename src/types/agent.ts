export type AgentStatus = 'running' | 'done' | 'waiting' | 'error';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  task: string;
  progress: number;
  startTime: number;
}

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  createdAt: number;
}

export interface WorkflowNode {
  id: string;
  label: string;
  status: AgentStatus;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
