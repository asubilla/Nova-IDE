import { EventEmitter } from 'events';

export type BYOAAgentType = 'review' | 'debug' | 'docs' | 'test' | 'optimize' | 'custom';

export interface BYOAAgentConfig {
  id: string;
  name: string;
  type: BYOAAgentType;
  description: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentRegistration {
  id: string;
  config: BYOAAgentConfig;
  registeredAt: Date;
  usageCount: number;
}

export interface AgentRegistryOptions {
  maxAgents?: number;
}

export class BYOAAgentManager extends EventEmitter {
  private agents: Map<string, AgentRegistration> = new Map();
  private maxAgents: number;

  constructor(options?: AgentRegistryOptions) {
    super();
    this.maxAgents = options?.maxAgents ?? 50;
  }

  registerAgent(config: BYOAAgentConfig): AgentRegistration {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent limit (${this.maxAgents}) reached`);
    }

    if (this.agents.has(config.id)) {
      throw new Error(`Agent ${config.id} already registered`);
    }

    const registration: AgentRegistration = {
      id: config.id,
      config: { ...config },
      registeredAt: new Date(),
      usageCount: 0,
    };

    this.agents.set(config.id, registration);
    this.emit('agent:registered', registration);
    return registration;
  }

  unregisterAgent(agentId: string): boolean {
    const existed = this.agents.delete(agentId);
    if (existed) {
      this.emit('agent:unregistered', { agentId });
    }
    return existed;
  }

  updateAgent(agentId: string, updates: Partial<BYOAAgentConfig>): AgentRegistration {
    const registration = this.agents.get(agentId);
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`);
    }

    registration.config = { ...registration.config, ...updates };
    this.emit('agent:updated', registration);
    return registration;
  }

  getAgent(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  listAgents(filters?: { type?: BYOAAgentType; enabled?: boolean }): AgentRegistration[] {
    let results = Array.from(this.agents.values());
    if (filters?.type) {
      results = results.filter((a) => a.config.type === filters.type);
    }
    if (filters?.enabled !== undefined) {
      results = results.filter((a) => a.config.enabled === filters.enabled);
    }
    return results;
  }

  getEnabledAgents(): AgentRegistration[] {
    return this.listAgents({ enabled: true });
  }

  recordUsage(agentId: string): void {
    const registration = this.agents.get(agentId);
    if (registration) {
      registration.usageCount++;
    }
  }

  enableAgent(agentId: string): void {
    this.updateAgent(agentId, { enabled: true });
  }

  disableAgent(agentId: string): void {
    this.updateAgent(agentId, { enabled: false });
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getAgentByType(type: BYOAAgentType): AgentRegistration[] {
    return this.listAgents({ type });
  }

  destroy(): void {
    this.agents.clear();
    this.removeAllListeners();
  }
}
