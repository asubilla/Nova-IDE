import { EventEmitter } from 'events';
import { LivePreviewEvent } from '../core/types';
import { EventFilter, EventFilterOptions, ProgressCalculator } from './events';

const MAX_RECENT_EVENTS = 500;
const DEFAULT_RATE_LIMIT_MS = 50;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

interface PreviewClient {
  id: string;
  rooms: Set<string>;
  lastPong: number;
  alive: boolean;
}

interface BroadcastOptions {
  rooms?: string[];
  filter?: EventFilterOptions;
}

interface SessionState {
  sessionId: string;
  events: LivePreviewEvent[];
  progress: ProgressCalculator;
  startedAt: Date;
  lastEventAt: Date;
}

export class PreviewServer extends EventEmitter {
  private clients: Map<string, PreviewClient> = new Map();
  private sessions: Map<string, SessionState> = new Map();
  private broadcastQueue: LivePreviewEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private rateLimitMs: number;
  private lastBroadcast = 0;
  private nextClientId = 1;

  constructor(private port: number, options: { rateLimitMs?: number } = {}) {
    super();
    this.rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  }

  async start(): Promise<void> {
    this.flushTimer = setInterval(() => this.flushQueue(), this.rateLimitMs);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.emit('listening', { port: this.port });
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const client of this.clients.values()) {
      client.alive = false;
    }
    this.clients.clear();
    this.emit('closed');
  }

  handleConnection(clientId?: string): string {
    const id = clientId ?? `client-${this.nextClientId++}`;
    const client: PreviewClient = {
      id,
      rooms: new Set(),
      lastPong: Date.now(),
      alive: true,
    };
    this.clients.set(id, client);
    this.emit('client-connected', { clientId: id });
    return id;
  }

  handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.clear();
      this.clients.delete(clientId);
      this.emit('client-disconnected', { clientId });
    }
  }

  handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPong = Date.now();
      client.alive = true;
    }
  }

  joinRoom(clientId: string, room: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.rooms.add(room);

    const state = this.sessions.get(room);
    if (state) {
      const recentEvents = state.events.slice(-MAX_RECENT_EVENTS);
      this.sendToClient(clientId, {
        type: 'room-joined',
        sessionId: room,
        timestamp: new Date(),
        data: { replayEvents: recentEvents },
      } as any);
    }

    this.emit('client-joined-room', { clientId, room });
    return true;
  }

  leaveRoom(clientId: string, room: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.rooms.delete(room);
    this.emit('client-left-room', { clientId, room });
    return true;
  }

  broadcast(event: LivePreviewEvent, options?: BroadcastOptions): void {
    this.broadcastQueue.push(event);

    let state = this.sessions.get(event.sessionId);
    if (!state) {
      state = {
        sessionId: event.sessionId,
        events: [],
        progress: new ProgressCalculator(),
        startedAt: event.timestamp,
        lastEventAt: event.timestamp,
      };
      this.sessions.set(event.sessionId, state);
    }

    state.events.push(event);
    if (state.events.length > MAX_RECENT_EVENTS) {
      state.events = state.events.slice(-MAX_RECENT_EVENTS);
    }
    state.progress.updateFromEvent(event);
    state.lastEventAt = event.timestamp;
  }

  private flushQueue(): void {
    if (this.broadcastQueue.length === 0) return;

    const now = Date.now();
    if (now - this.lastBroadcast < this.rateLimitMs && this.broadcastQueue.length < 10) {
      return;
    }

    const events = this.broadcastQueue.splice(0);
    this.lastBroadcast = now;

    const serialized = JSON.stringify(
      events.length === 1 ? events[0] : { type: 'batch', events }
    );

    for (const client of this.clients.values()) {
      if (!client.alive) continue;

      for (const event of events) {
        if (client.rooms.size === 0 || client.rooms.has(event.sessionId)) {
          this.sendRaw(client.id, serialized);
          break;
        }
      }
    }

    this.emit('broadcast', { eventCount: events.length, clientCount: this.clients.size });
  }

  private heartbeat(): void {
    const now = Date.now();
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      if (now - client.lastPong > HEARTBEAT_INTERVAL_MS + PONG_TIMEOUT_MS) {
        deadClients.push(id);
        continue;
      }

      client.alive = false;
      this.sendToClient(id, { type: 'ping', timestamp: new Date() } as any);
    }

    for (const id of deadClients) {
      this.handleDisconnection(id);
    }
  }

  private sendToClient(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client || !client.alive) return;
    this.sendRaw(clientId, JSON.stringify(data));
  }

  private sendRaw(clientId: string, data: string): void {
    this.emit('send', { clientId, data });
  }

  getSessionState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionSnapshot(sessionId: string): Record<string, any> | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;

    return {
      sessionId: state.sessionId,
      eventCount: state.events.length,
      progress: state.progress.calculate(),
      startedAt: state.startedAt,
      lastEventAt: state.lastEventAt,
      recentEvents: state.events.slice(-50),
    };
  }

  getAllSessionSnapshots(): Record<string, any>[] {
    return Array.from(this.sessions.keys()).map(id => this.getSessionSnapshot(id)!);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getRoomClients(room: string): string[] {
    const result: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.rooms.has(room)) result.push(id);
    }
    return result;
  }

  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
