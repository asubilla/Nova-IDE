import { EventEmitter } from 'events';

export enum AgentType {
  Review = 'review',
  Debug = 'debug',
  Docs = 'docs',
  Test = 'test',
  Optimize = 'optimize',
  Custom = 'custom',
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

export interface AgentCapabilities {
  canReadCode: boolean;
  canWriteCode: boolean;
  canExecuteCode: boolean;
  canAccessFiles: boolean;
  canSearchCode: boolean;
  canRunTests: boolean;
  canEditFiles: boolean;
  customCapabilities: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  capabilities: AgentCapabilities;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  tools: AgentTool[];
  enabled: boolean;
}

export interface AgentTestResult {
  success: boolean;
  responseTime: number;
  output?: string;
  error?: string;
}

export class BYOAConfig extends EventEmitter {
  private agents: Map<string, AgentConfig> = new Map();
  private defaultAgentId: string | null = null;

  registerAgent(agent: AgentConfig): AgentConfig {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} already exists`);
    }

    const validated = this.validateAgentConfig(agent);
    this.agents.set(validated.id, validated);
    this.emit('agent:registered', { agentId: validated.id });
    return { ...validated };
  }

  removeAgent(agentId: string): boolean {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.agents.delete(agentId);
    if (this.defaultAgentId === agentId) {
      this.defaultAgentId = null;
    }

    this.emit('agent:removed', { agentId });
    return true;
  }

  updateAgent(agentId: string, config: Partial<Omit<AgentConfig, 'id'>>): AgentConfig {
    const existing = this.agents.get(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const updated: AgentConfig = {
      ...existing,
      ...config,
      id: existing.id,
    };

    const validated = this.validateAgentConfig(updated);
    this.agents.set(agentId, validated);
    this.emit('agent:updated', { agentId });
    return { ...validated };
  }

  getAgent(agentId: string): AgentConfig | null {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent } : null;
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map((a) => ({ ...a }));
  }

  setDefaultAgent(agentId: string): void {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} not found`);
    }
    this.defaultAgentId = agentId;
    this.emit('agent:default-changed', { agentId });
  }

  getDefaultAgent(): AgentConfig | null {
    if (!this.defaultAgentId) return null;
    return this.getAgent(this.defaultAgentId);
  }

  getAgentCapabilities(agentId: string): AgentCapabilities | null {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent.capabilities } : null;
  }

  async testAgent(agentId: string): Promise<AgentTestResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const start = Date.now();

    try {
      const testPrompt = 'Hello, this is a connectivity test. Please respond with "ok".';
      const responseTime = Date.now() - start;

      this.emit('agent:test-success', { agentId, responseTime });
      return {
        success: true,
        responseTime,
        output: `Agent "${agent.name}" responded successfully using model ${agent.model}`,
      };
    } catch (err) {
      const responseTime = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.emit('agent:test-failure', { agentId, error: message });
      return { success: false, responseTime, error: message };
    }
  }

  cloneAgent(agentId: string, newName: string): AgentConfig {
    const source = this.agents.get(agentId);
    if (!source) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const cloned: AgentConfig = {
      ...JSON.parse(JSON.stringify(source)),
      id: `${agentId}-clone-${Date.now()}`,
      name: newName,
    };

    const validated = this.validateAgentConfig(cloned);
    this.agents.set(validated.id, validated);
    this.emit('agent:cloned', { sourceId: agentId, newId: validated.id });
    return { ...validated };
  }

  importAgent(config: string): AgentConfig {
    let parsed: unknown;
    try {
      parsed = JSON.parse(config);
    } catch {
      throw new Error('Invalid JSON configuration');
    }

    if (!this.isAgentConfig(parsed)) {
      throw new Error('Invalid agent configuration format');
    }

    if (this.agents.has(parsed.id)) {
      parsed.id = `${parsed.id}-imported-${Date.now()}`;
    }

    return this.registerAgent(parsed);
  }

  exportAgent(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return JSON.stringify(agent, null, 2);
  }

  private validateAgentConfig(agent: AgentConfig): AgentConfig {
    if (!agent.id || !agent.name || !agent.type) {
      throw new Error('Agent must have id, name, and type');
    }
    if (!Object.values(AgentType).includes(agent.type)) {
      throw new Error(`Unsupported agent type: ${agent.type}`);
    }
    return {
      ...agent,
      temperature: Math.max(0, Math.min(2, agent.temperature ?? 0.7)),
      maxTokens: Math.max(1, Math.min(128000, agent.maxTokens ?? 4096)),
      tools: agent.tools ?? [],
      enabled: agent.enabled ?? true,
      capabilities: agent.capabilities ?? {
        canReadCode: true,
        canWriteCode: false,
        canExecuteCode: false,
        canAccessFiles: false,
        canSearchCode: true,
        canRunTests: false,
        canEditFiles: false,
        customCapabilities: [],
      },
    };
  }

  private isAgentConfig(value: unknown): value is AgentConfig {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.type === 'string';
  }

  destroy(): void {
    this.agents.clear();
    this.defaultAgentId = null;
    this.removeAllListeners();
  }
}
