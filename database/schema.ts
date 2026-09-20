import {
  AgentType,
  TaskSpec,
  ProjectProfile,
  SessionConfig,
  AgentPrompt,
  ValidationResult,
  AgentError,
  FixLoopIteration,
  AgentOutput,
  AgentSummary,
} from '../core/types';

export interface SessionRecord {
  id: string;
  taskSpec: TaskSpec;
  projectProfile: ProjectProfile;
  config: SessionConfig;
  status: 'initializing' | 'planning' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface AgentRecord {
  id: string;
  sessionId: string;
  type: AgentType;
  name: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'paused' | 'cancelled';
  prompt: AgentPrompt;
  assignedFiles: string[];
  progress: number;
}

export interface ResultRecord {
  id: string;
  sessionId: string;
  agentId: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'paused' | 'cancelled';
  output: AgentOutput | null;
  summary: AgentSummary | null;
  validationResults: ValidationResult[];
  retryCount: number;
  startedAt: string;
  completedAt: string | null;
  error: AgentError | null;
  fixLoopHistory: FixLoopIteration[];
}

export interface ArtifactRecord {
  id: string;
  sessionId: string;
  agentId: string;
  name: string;
  type: string;
  data: any;
  version: number;
  createdAt: string;
}

export interface CheckpointRecord {
  id: string;
  sessionId: string;
  timestamp: string;
  completedAgents: string[];
  runningAgents: string[];
  queuedAgents: string[];
  sharedContext: Record<string, any>;
}

export interface EventRecord {
  id: string;
  sessionId: string;
  agentId: string | null;
  type: string;
  timestamp: string;
  data: any;
}
