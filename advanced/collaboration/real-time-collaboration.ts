import { EventEmitter } from 'events';

export interface CollaborationSession {
  id: string;
  name: string;
  participants: string[];
  status: 'active' | 'paused' | 'completed';
  sharedContext: Map<string, any>;
  createdAt: Date;
  lastActivity: Date;
}

export interface CollaborationMessage {
  id: string;
  sessionId: string;
  from: string;
  type: 'suggestion' | 'review' | 'approval' | 'rejection' | 'discussion' | 'decision';
  content: any;
  timestamp: Date;
  replyTo?: string;
}

export interface PairProgrammingAssignment {
  driver: string;
  navigator: string;
  task: string;
  status: 'active' | 'completed';
  turns: { agent: string; action: string; result: any; timestamp: Date }[];
}

export class RealTimeCollaboration extends EventEmitter {
  private sessions: Map<string, CollaborationSession> = new Map();
  private messages: Map<string, CollaborationMessage[]> = new Map();
  private pairAssignments: Map<string, PairProgrammingAssignment> = new Map();
  private agentSessions: Map<string, Set<string>> = new Map();

  createSession(name: string, participants: string[]): CollaborationSession {
    const id = `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: CollaborationSession = { id, name, participants, status: 'active', sharedContext: new Map(), createdAt: new Date(), lastActivity: new Date() };
    this.sessions.set(id, session);
    this.messages.set(id, []);
    for (const p of participants) { if (!this.agentSessions.has(p)) this.agentSessions.set(p, new Set()); this.agentSessions.get(p)!.add(id); }
    this.emit('session-created', { sessionId: id, participants });
    return session;
  }

  sendMessage(sessionId: string, from: string, type: CollaborationMessage['type'], content: any, replyTo?: string): CollaborationMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return null;
    const msg: CollaborationMessage = { id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, sessionId, from, type, content, timestamp: new Date(), replyTo };
    this.messages.get(sessionId)!.push(msg);
    session.lastActivity = new Date();
    this.emit('message', msg);
    return msg;
  }

  startPairProgramming(task: string, driver: string, navigator: string): PairProgrammingAssignment {
    const id = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const assignment: PairProgrammingAssignment = { driver, navigator, task, status: 'active', turns: [] };
    this.pairAssignments.set(id, assignment);
    this.emit('pair-started', { assignmentId: id, driver, navigator, task });
    return assignment;
  }

  recordTurn(assignmentId: string, agent: string, action: string, result: any): void {
    const assignment = this.pairAssignments.get(assignmentId);
    if (!assignment) return;
    assignment.turns.push({ agent, action, result, timestamp: new Date() });
    this.emit('pair-turn', { assignmentId, agent, action });
  }

  switchRoles(assignmentId: string): boolean {
    const assignment = this.pairAssignments.get(assignmentId);
    if (!assignment) return false;
    const temp = assignment.driver; assignment.driver = assignment.navigator; assignment.navigator = temp;
    this.emit('pair-roles-switched', { assignmentId, newDriver: assignment.driver, newNavigator: assignment.navigator });
    return true;
  }

  completePairProgramming(assignmentId: string): void {
    const assignment = this.pairAssignments.get(assignmentId);
    if (assignment) { assignment.status = 'completed'; this.emit('pair-completed', { assignmentId }); }
  }

  updateSharedContext(sessionId: string, key: string, value: any): void {
    const session = this.sessions.get(sessionId);
    if (session) { session.sharedContext.set(key, value); this.emit('context-updated', { sessionId, key }); }
  }

  getSharedContext(sessionId: string): Map<string, any> { return this.sessions.get(sessionId)?.sharedContext || new Map(); }
  getSessionMessages(sessionId: string): CollaborationMessage[] { return this.messages.get(sessionId) || []; }
  getAgentSessions(agentId: string): CollaborationSession[] { const ids = this.agentSessions.get(agentId); if (!ids) return []; return [...ids].map(id => this.sessions.get(id)!).filter(Boolean); }
  getSession(id: string): CollaborationSession | undefined { return this.sessions.get(id); }
  getAllSessions(): CollaborationSession[] { return [...this.sessions.values()]; }
  getActiveSessions(): CollaborationSession[] { return [...this.sessions.values()].filter(s => s.status === 'active'); }
  pauseSession(sessionId: string): boolean { const s = this.sessions.get(sessionId); if (s?.status === 'active') { s.status = 'paused'; return true; } return false; }
  resumeSession(sessionId: string): boolean { const s = this.sessions.get(sessionId); if (s?.status === 'paused') { s.status = 'active'; return true; } return false; }
  completeSession(sessionId: string): boolean { const s = this.sessions.get(sessionId); if (s) { s.status = 'completed'; return true; } return false; }

  getStats(): { activeSessions: number; totalMessages: number; activePairs: number; agentsInCollaboration: number } {
    const active = [...this.sessions.values()].filter(s => s.status === 'active');
    const activePairs = [...this.pairAssignments.values()].filter(p => p.status === 'active').length;
    const agents = new Set<string>();
    for (const s of active) for (const p of s.participants) agents.add(p);
    return { activeSessions: active.length, totalMessages: [...this.messages.values()].reduce((s, m) => s + m.length, 0), activePairs, agentsInCollaboration: agents.size };
  }

  destroy(): void { this.sessions.clear(); this.messages.clear(); this.pairAssignments.clear(); this.agentSessions.clear(); this.removeAllListeners(); }
}
