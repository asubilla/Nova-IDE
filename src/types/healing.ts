export interface HealingEvent {
  id: string;
  timestamp: string;
  eventType: string;
  message: string;
  agentId: string;
  createdAt: string;
  logs: string[];
}

export interface CrashLog {
  id: string;
  agentId: string;
  error: string;
  stacktrace: string;
  recovered: boolean;
}
