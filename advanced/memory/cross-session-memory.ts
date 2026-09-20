export interface MemoryEntry {
  id: string;
  agentId: string;
  sessionId: string;
  type: 'decision' | 'outcome' | 'pattern' | 'preference' | 'error' | 'insight';
  key: string;
  value: any;
  confidence: number;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  tags: string[];
}

export class CrossSessionMemory {
  private memories: Map<string, MemoryEntry> = new Map();
  private agentIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private keyIndex: Map<string, Set<string>> = new Map();
  private maxMemoriesPerAgent = 1000;

  constructor(private config?: { decayRate?: number; maxMemories?: number }) {}

  store(agentId: string, sessionId: string, type: MemoryEntry['type'], key: string, value: any, options?: { confidence?: number; tags?: string[] }): MemoryEntry {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const entry: MemoryEntry = { id, agentId, sessionId, type, key, value, confidence: options?.confidence || 1.0, createdAt: new Date(), lastAccessed: new Date(), accessCount: 0, tags: options?.tags || [] };
    this.memories.set(id, entry);
    if (!this.agentIndex.has(agentId)) this.agentIndex.set(agentId, new Set());
    this.agentIndex.get(agentId)!.add(id);
    if (!this.typeIndex.has(type)) this.typeIndex.set(type, new Set());
    this.typeIndex.get(type)!.add(id);
    if (!this.keyIndex.has(key)) this.keyIndex.set(key, new Set());
    this.keyIndex.get(key)!.add(id);
    this.enforceMemoryLimit(agentId);
    return entry;
  }

  recall(agentId: string, query: { type?: string; key?: string; tags?: string[]; minConfidence?: number; limit?: number }): MemoryEntry[] {
    let candidates: MemoryEntry[] = [];
    const agentMemories = this.agentIndex.get(agentId);
    if (!agentMemories) return [];
    for (const id of agentMemories) { const m = this.memories.get(id); if (m) candidates.push(m); }
    if (query.type) candidates = candidates.filter(m => m.type === query.type);
    if (query.key) candidates = candidates.filter(m => m.key === query.key);
    if (query.tags) candidates = candidates.filter(m => query.tags!.some(t => m.tags.includes(t)));
    if (query.minConfidence) candidates = candidates.filter(m => m.confidence >= query.minConfidence!);
    candidates.sort((a, b) => (b.confidence * b.accessCount) - (a.confidence * a.accessCount));
    const results = candidates.slice(0, query.limit || 20);
    for (const m of results) { m.lastAccessed = new Date(); m.accessCount++; }
    return results;
  }

  getBestDecision(agentId: string, decisionKey: string): MemoryEntry | null {
    const decisions = this.recall(agentId, { type: 'decision', key: decisionKey, minConfidence: 0.5 });
    return decisions.length > 0 ? decisions[0] : null;
  }

  getSuccessfulPatterns(agentId: string): MemoryEntry[] { return this.recall(agentId, { type: 'pattern', minConfidence: 0.7, limit: 50 }); }

  getErrorHistory(agentId: string, errorKey?: string): MemoryEntry[] { return this.recall(agentId, { type: 'error', key: errorKey, limit: 50 }); }

  getAgentPreferences(agentId: string): MemoryEntry[] { return this.recall(agentId, { type: 'preference', limit: 50 }); }

  forget(agentId: string, memoryId: string): boolean {
    const entry = this.memories.get(memoryId);
    if (!entry || entry.agentId !== agentId) return false;
    this.agentIndex.get(agentId)?.delete(memoryId);
    this.typeIndex.get(entry.type)?.delete(memoryId);
    this.keyIndex.get(entry.key)?.delete(memoryId);
    this.memories.delete(memoryId);
    return true;
  }

  private enforceMemoryLimit(agentId: string): void {
    const agentMemories = this.agentIndex.get(agentId);
    if (!agentMemories || agentMemories.size <= this.maxMemoriesPerAgent) return;
    const entries = [...agentMemories].map(id => this.memories.get(id)!).filter(Boolean).sort((a, b) => a.accessCount - b.accessCount);
    const toRemove = entries.slice(0, entries.length - this.maxMemoriesPerAgent);
    for (const entry of toRemove) this.forget(agentId, entry.id);
  }

  mergeFrom(other: CrossSessionMemory): number {
    let merged = 0;
    for (const entry of other.memories.values()) {
      if (!this.memories.has(entry.id)) { this.memories.set(entry.id, entry); merged++; }
    }
    return merged;
  }

  getAllMemories(): MemoryEntry[] { return [...this.memories.values()]; }
  getAgentMemoryCount(agentId: string): number { return this.agentIndex.get(agentId)?.size || 0; }

  getStats(): { totalMemories: number; byAgent: Record<string, number>; byType: Record<string, number>; avgConfidence: number } {
    const byAgent: Record<string, number> = {}; const byType: Record<string, number> = {}; let totalConf = 0;
    for (const m of this.memories.values()) {
      byAgent[m.agentId] = (byAgent[m.agentId] || 0) + 1;
      byType[m.type] = (byType[m.type] || 0) + 1;
      totalConf += m.confidence;
    }
    return { totalMemories: this.memories.size, byAgent, byType, avgConfidence: this.memories.size ? totalConf / this.memories.size : 0 };
  }

  destroy(): void { this.memories.clear(); this.agentIndex.clear(); this.typeIndex.clear(); this.keyIndex.clear(); }
}
