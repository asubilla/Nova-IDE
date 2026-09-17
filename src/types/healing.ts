export interface HealingEvent {
  id: string;
  timestamp: number;
  type: 'error' | 'retry' | 'fix' | 'success';
  message: string;
  agentId: string;
}

export interface CrashLog {
  id: string;
  agentId: string;
  error: string;
  stacktrace: string;
  recovered: boolean;
}
