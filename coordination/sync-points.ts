import type { AgentCoordinationMessage, Artifact } from '../core/types';

export interface SyncPointConfig {
  id: string;
  name: string;
  participants: string[];
  timeoutMs: number;
  phase: number;
}

export interface SyncPointState {
  id: string;
  arrived: Set<string>;
  startedAt: Date;
  resolved: boolean;
  timedOut: boolean;
}

export interface HandoffData {
  fromAgentId: string;
  toAgentId: string;
  artifacts: Artifact[];
  context: Record<string, any>;
  correlationId: string;
  timestamp: Date;
}

export interface PhaseConfig {
  phaseNumber: number;
  name: string;
  agentIds: string[];
  syncPointId?: string;
}

export class SyncPoint {
  private syncPoints: Map<string, SyncPointState> = new Map();
  private syncPointConfigs: Map<string, SyncPointConfig> = new Map();
  private syncPointCallbacks: Map<string, { resolve: () => void; reject: (err: Error) => void }> = new Map();
  private phases: PhaseConfig[] = [];
  private currentPhase = 0;
  private phaseCallbacks: Map<number, { resolve: () => void; reject: (err: Error) => void }> = new Map();
  private handoffRegistry: Map<string, HandoffData[]> = new Map();

  createSyncPoint(config: SyncPointConfig): SyncPointState {
    const state: SyncPointState = {
      id: config.id,
      arrived: new Set(),
      startedAt: new Date(),
      resolved: false,
      timedOut: false,
    };
    this.syncPointConfigs.set(config.id, config);
    this.syncPoints.set(config.id, state);
    return state;
  }

  arriveAtSyncPoint(syncPointId: string, agentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const state = this.syncPoints.get(syncPointId);
      const config = this.syncPointConfigs.get(syncPointId);

      if (!state || !config) {
        reject(new Error(`Sync point ${syncPointId} not found`));
        return;
      }

      if (state.resolved) {
        resolve();
        return;
      }

      state.arrived.add(agentId);

      if (state.arrived.size >= config.participants.length) {
        state.resolved = true;
        const cb = this.syncPointCallbacks.get(syncPointId);
        if (cb) {
          cb.resolve();
          this.syncPointCallbacks.delete(syncPointId);
        }
        resolve();
      } else {
        const existing = this.syncPointCallbacks.get(syncPointId);
        if (!existing) {
          const timer = setTimeout(() => {
            state.timedOut = true;
            state.resolved = true;
            const cb = this.syncPointCallbacks.get(syncPointId);
            if (cb) {
              cb.reject(new Error(
                `Sync point ${syncPointId} timed out after ${config.timeoutMs}ms. ` +
                `Arrived: ${[...state.arrived].join(', ')}. ` +
                `Missing: ${config.participants.filter(p => !state.arrived.has(p)).join(', ')}`
              ));
              this.syncPointCallbacks.delete(syncPointId);
            }
          }, config.timeoutMs);

          this.syncPointCallbacks.set(syncPointId, {
            resolve: () => {
              clearTimeout(timer);
              resolve();
            },
            reject: (err) => {
              clearTimeout(timer);
              reject(err);
            },
          });
        }
      }
    });
  }

  configurePhases(phases: PhaseConfig[]): void {
    this.phases = [...phases].sort((a, b) => a.phaseNumber - b.phaseNumber);
    this.currentPhase = 0;
  }

  async advanceToPhase(phaseNumber: number): Promise<void> {
    if (this.phases.length === 0) {
      throw new Error('No phases configured');
    }

    const phase = this.phases.find(p => p.phaseNumber === phaseNumber);
    if (!phase) {
      throw new Error(`Phase ${phaseNumber} not found`);
    }

    if (phase.syncPointId) {
      const config = this.syncPointConfigs.get(phase.syncPointId);
      if (config) {
        await this.arriveAtSyncPoint(phase.syncPointId, '__phase_gate__');
      }
    }

    this.currentPhase = phaseNumber;
  }

  waitForPhase(phaseNumber: number, timeoutMs?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const phase = this.phases.find(p => p.phaseNumber === phaseNumber);
      if (!phase) {
        reject(new Error(`Phase ${phaseNumber} not found`));
        return;
      }

      if (this.currentPhase >= phaseNumber) {
        resolve();
        return;
      }

      const timeout = timeoutMs ?? 60000;
      const timer = setTimeout(() => {
        this.phaseCallbacks.delete(phaseNumber);
        reject(new Error(`Phase ${phaseNumber} wait timed out after ${timeout}ms`));
      }, timeout);

      this.phaseCallbacks.set(phaseNumber, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  registerHandoff(data: HandoffData): void {
    const key = `${data.fromAgentId}->${data.toAgentId}`;
    const existing = this.handoffRegistry.get(key) || [];
    existing.push(data);
    this.handoffRegistry.set(key, existing);
  }

  getHandoffs(fromAgentId: string, toAgentId: string): HandoffData[] {
    const key = `${fromAgentId}->${toAgentId}`;
    return this.handoffRegistry.get(key) || [];
  }

  getReceivedHandoffs(agentId: string): HandoffData[] {
    const received: HandoffData[] = [];
    for (const [key, handoffs] of this.handoffRegistry) {
      if (key.endsWith(`->${agentId}`)) {
        received.push(...handoffs);
      }
    }
    return received;
  }

  getSyncPointState(syncPointId: string): SyncPointState | undefined {
    return this.syncPoints.get(syncPointId);
  }

  isSyncPointResolved(syncPointId: string): boolean {
    return this.syncPoints.get(syncPointId)?.resolved ?? false;
  }

  getSyncPointParticipants(syncPointId: string): string[] {
    const config = this.syncPointConfigs.get(syncPointId);
    return config ? [...config.participants] : [];
  }

  getSyncPointArrivals(syncPointId: string): string[] {
    const state = this.syncPoints.get(syncPointId);
    return state ? [...state.arrived] : [];
  }

  getCurrentPhase(): number {
    return this.currentPhase;
  }

  getPhases(): PhaseConfig[] {
    return [...this.phases];
  }

  createHandoffMessage(
    fromAgentId: string,
    toAgentId: string,
    artifacts: Artifact[],
    context: Record<string, any>
  ): AgentCoordinationMessage {
    const correlationId = `handoff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const handoffData: HandoffData = {
      fromAgentId,
      toAgentId,
      artifacts,
      context,
      correlationId,
      timestamp: new Date(),
    };
    this.registerHandoff(handoffData);

    return {
      fromAgentId,
      toAgentId,
      type: 'handoff',
      payload: { artifacts, context },
      timestamp: new Date(),
      correlationId,
    };
  }

  reset(): void {
    this.syncPoints.clear();
    this.syncPointConfigs.clear();
    for (const cb of this.syncPointCallbacks.values()) {
      cb.reject(new Error('Sync point system reset'));
    }
    this.syncPointCallbacks.clear();
    this.phases = [];
    this.currentPhase = 0;
    for (const cb of this.phaseCallbacks.values()) {
      cb.reject(new Error('Sync point system reset'));
    }
    this.phaseCallbacks.clear();
    this.handoffRegistry.clear();
  }
}
