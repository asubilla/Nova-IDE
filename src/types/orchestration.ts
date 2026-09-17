export type OrchestrationPattern =
  | 'sequential'
  | 'concurrent'
  | 'handoff'
  | 'group'
  | 'magentic';

export interface PatternConfig {
  id: string;
  name: string;
  description: string;
  participants: string[];
  pattern: OrchestrationPattern;
}

export type PatternStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface OrchestrationResult {
  id: string;
  pattern: PatternConfig;
  status: PatternStatus;
  output: string;
  timing: {
    startedAt: number;
    completedAt: number | null;
    duration: number | null;
  };
  steps: OrchestrationStep[];
}

export interface OrchestrationStep {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: string;
  status: PatternStatus;
  startedAt: number | null;
  completedAt: number | null;
}

export interface WorkflowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: PatternStatus;
  agentId?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  animated: boolean;
}
