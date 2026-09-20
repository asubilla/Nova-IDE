import { Store } from './store';
import {
  SessionRecord,
  AgentRecord,
  ResultRecord,
  ArtifactRecord,
  CheckpointRecord,
  EventRecord,
} from './schema';

export class SessionRepository {
  constructor(private store: Store<SessionRecord>) {}

  create(record: SessionRecord): SessionRecord {
    return this.store.insert(record);
  }

  getById(id: string): SessionRecord | undefined {
    return this.store.get(id);
  }

  getAll(): SessionRecord[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<SessionRecord>): SessionRecord | undefined {
    return this.store.update(id, { ...updates, updatedAt: new Date().toISOString() });
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  queryByStatus(status: SessionRecord['status']): SessionRecord[] {
    return this.store.query((s) => s.status === status);
  }

  queryByDateRange(from: string, to: string): SessionRecord[] {
    return this.store.query(
      (s) => s.createdAt >= from && s.createdAt <= to,
    );
  }

  query(predicate: (record: SessionRecord) => boolean): SessionRecord[] {
    return this.store.query(predicate);
  }

  flush(): void {
    this.store.flush();
  }
}

export class AgentRepository {
  constructor(private store: Store<AgentRecord>) {}

  create(record: AgentRecord): AgentRecord {
    return this.store.insert(record);
  }

  getById(id: string): AgentRecord | undefined {
    return this.store.get(id);
  }

  getAll(): AgentRecord[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<AgentRecord>): AgentRecord | undefined {
    return this.store.update(id, updates);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  queryBySession(sessionId: string): AgentRecord[] {
    return this.store.query((a) => a.sessionId === sessionId);
  }

  queryByStatus(status: AgentRecord['status']): AgentRecord[] {
    return this.store.query((a) => a.status === status);
  }

  queryByType(type: AgentRecord['type']): AgentRecord[] {
    return this.store.query((a) => a.type === type);
  }

  queryBySessionAndStatus(sessionId: string, status: AgentRecord['status']): AgentRecord[] {
    return this.store.query((a) => a.sessionId === sessionId && a.status === status);
  }

  query(predicate: (record: AgentRecord) => boolean): AgentRecord[] {
    return this.store.query(predicate);
  }

  flush(): void {
    this.store.flush();
  }
}

export class ResultRepository {
  constructor(private store: Store<ResultRecord>) {}

  create(record: ResultRecord): ResultRecord {
    return this.store.insert(record);
  }

  getById(id: string): ResultRecord | undefined {
    return this.store.get(id);
  }

  getAll(): ResultRecord[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<ResultRecord>): ResultRecord | undefined {
    return this.store.update(id, updates);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  queryBySession(sessionId: string): ResultRecord[] {
    return this.store.query((r) => r.sessionId === sessionId);
  }

  queryByAgent(agentId: string): ResultRecord[] {
    return this.store.query((r) => r.agentId === agentId);
  }

  queryByStatus(status: ResultRecord['status']): ResultRecord[] {
    return this.store.query((r) => r.status === status);
  }

  queryBySessionAndAgent(sessionId: string, agentId: string): ResultRecord[] {
    return this.store.query((r) => r.sessionId === sessionId && r.agentId === agentId);
  }

  query(predicate: (record: ResultRecord) => boolean): ResultRecord[] {
    return this.store.query(predicate);
  }

  flush(): void {
    this.store.flush();
  }
}

export class ArtifactRepository {
  constructor(private store: Store<ArtifactRecord>) {}

  create(record: ArtifactRecord): ArtifactRecord {
    return this.store.insert(record);
  }

  getById(id: string): ArtifactRecord | undefined {
    return this.store.get(id);
  }

  getAll(): ArtifactRecord[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<ArtifactRecord>): ArtifactRecord | undefined {
    return this.store.update(id, updates);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  queryBySession(sessionId: string): ArtifactRecord[] {
    return this.store.query((a) => a.sessionId === sessionId);
  }

  queryByAgent(agentId: string): ArtifactRecord[] {
    return this.store.query((a) => a.agentId === agentId);
  }

  queryByType(type: string): ArtifactRecord[] {
    return this.store.query((a) => a.type === type);
  }

  queryBySessionAndAgent(sessionId: string, agentId: string): ArtifactRecord[] {
    return this.store.query((a) => a.sessionId === sessionId && a.agentId === agentId);
  }

  query(predicate: (record: ArtifactRecord) => boolean): ArtifactRecord[] {
    return this.store.query(predicate);
  }

  flush(): void {
    this.store.flush();
  }
}

export class CheckpointRepository {
  constructor(private store: Store<CheckpointRecord>) {}

  save(record: CheckpointRecord): CheckpointRecord {
    return this.store.upsert(record);
  }

  getById(id: string): CheckpointRecord | undefined {
    return this.store.get(id);
  }

  getBySession(sessionId: string): CheckpointRecord[] {
    return this.store.query((c) => c.sessionId === sessionId);
  }

  getLatestBySession(sessionId: string): CheckpointRecord | undefined {
    const checkpoints = this.getBySession(sessionId);
    if (checkpoints.length === 0) return undefined;
    return checkpoints.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  flush(): void {
    this.store.flush();
  }
}

export class EventRepository {
  constructor(private store: Store<EventRecord>) {}

  append(record: EventRecord): EventRecord {
    return this.store.insert(record);
  }

  getById(id: string): EventRecord | undefined {
    return this.store.get(id);
  }

  queryBySession(sessionId: string): EventRecord[] {
    return this.store
      .query((e) => e.sessionId === sessionId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  queryByAgent(agentId: string): EventRecord[] {
    return this.store
      .query((e) => e.agentId === agentId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  queryByType(type: string): EventRecord[] {
    return this.store.query((e) => e.type === type);
  }

  queryBySessionAndAgent(sessionId: string, agentId: string): EventRecord[] {
    return this.store
      .query((e) => e.sessionId === sessionId && e.agentId === agentId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  queryByTimeRange(from: string, to: string): EventRecord[] {
    return this.store
      .query((e) => e.timestamp >= from && e.timestamp <= to)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  queryBySessionAndTimeRange(sessionId: string, from: string, to: string): EventRecord[] {
    return this.store
      .query((e) => e.sessionId === sessionId && e.timestamp >= from && e.timestamp <= to)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  query(predicate: (record: EventRecord) => boolean): EventRecord[] {
    return this.store.query(predicate);
  }

  flush(): void {
    this.store.flush();
  }
}
