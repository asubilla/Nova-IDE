export interface LearningEntry {
  id: string;
  agentId: string;
  type: 'mistake' | 'success' | 'optimization' | 'correction';
  description: string;
  context: string;
  solution: string;
  confidence: number;
  appliedCount: number;
  successRate: number;
  createdAt: Date;
  lastApplied?: Date;
}

export interface LearningRule {
  id: string;
  pattern: string;
  action: string;
  priority: number;
  successRate: number;
  timesApplied: number;
}

export class LearningSystem {
  private entries: Map<string, LearningEntry> = new Map();
  private rules: LearningRule[] = [];
  private agentIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();

  constructor(private config?: { maxEntries?: number; minConfidence?: number }) {}

  learnFromMistake(agentId: string, mistake: string, context: string, solution: string): LearningEntry {
    return this.addEntry({ agentId, type: 'mistake', description: mistake, context, solution, confidence: 0.5 });
  }

  learnFromSuccess(agentId: string, success: string, context: string): LearningEntry {
    return this.addEntry({ agentId, type: 'success', description: success, context, solution: '', confidence: 0.8 });
  }

  learnFromOptimization(agentId: string, optimization: string, context: string): LearningEntry {
    return this.addEntry({ agentId, type: 'optimization', description: optimization, context, solution: '', confidence: 0.7 });
  }

  private addEntry(data: Omit<LearningEntry, 'id' | 'createdAt' | 'appliedCount' | 'successRate'>): LearningEntry {
    const id = `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const entry: LearningEntry = { ...data, id, createdAt: new Date(), appliedCount: 0, successRate: 0 };
    this.entries.set(id, entry);
    if (!this.agentIndex.has(data.agentId)) this.agentIndex.set(data.agentId, new Set());
    this.agentIndex.get(data.agentId)!.add(id);
    if (!this.typeIndex.has(data.type)) this.typeIndex.set(data.type, new Set());
    this.typeIndex.get(data.type)!.add(id);
    this.extractRules(entry);
    return entry;
  }

  private extractRules(entry: LearningEntry): void {
    if (entry.type === 'mistake' && entry.solution) {
      const existing = this.rules.find(r => r.pattern === entry.context);
      if (existing) { existing.successRate = (existing.successRate * existing.timesApplied + entry.confidence) / (existing.timesApplied + 1); }
      else { this.rules.push({ id: `rule_${Date.now()}`, pattern: entry.context, action: entry.solution, priority: entry.type === 'mistake' ? 1 : 2, successRate: entry.confidence, timesApplied: 0 }); }
    }
  }

  getRecommendations(agentId: string, context: string): LearningEntry[] {
    const agentEntries = this.agentIndex.get(agentId);
    if (!agentEntries) return [];
    const entries = [...agentEntries].map(id => this.entries.get(id)!).filter(Boolean);
    return entries.filter(e => context.includes(e.context) || e.context.includes(context)).sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  getRulesForContext(context: string): LearningRule[] { return this.rules.filter(r => context.includes(r.pattern)).sort((a, b) => b.priority - a.priority || b.successRate - a.successRate); }

  applyRule(ruleId: string, success: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) { rule.timesApplied++; rule.successRate = (rule.successRate * (rule.timesApplied - 1) + (success ? 1 : 0)) / rule.timesApplied; }
  }

  getMistakes(agentId?: string): LearningEntry[] { return this.getEntriesByType('mistake', agentId); }
  getSuccesses(agentId?: string): LearningEntry[] { return this.getEntriesByType('success', agentId); }

  private getEntriesByType(type: string, agentId?: string): LearningEntry[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    let entries = [...ids].map(id => this.entries.get(id)!).filter(Boolean);
    if (agentId) entries = entries.filter(e => e.agentId === agentId);
    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getEntry(id: string): LearningEntry | undefined { return this.entries.get(id); }
  getAllEntries(): LearningEntry[] { return [...this.entries.values()]; }
  getAllRules(): LearningRule[] { return [...this.rules]; }

  getStats(): { totalEntries: number; totalRules: number; byType: Record<string, number>; avgConfidence: number } {
    const byType: Record<string, number> = {}; let totalConf = 0;
    for (const e of this.entries.values()) { byType[e.type] = (byType[e.type] || 0) + 1; totalConf += e.confidence; }
    return { totalEntries: this.entries.size, totalRules: this.rules.length, byType, avgConfidence: this.entries.size ? totalConf / this.entries.size : 0 };
  }

  destroy(): void { this.entries.clear(); this.rules = []; this.agentIndex.clear(); this.typeIndex.clear(); }
}
