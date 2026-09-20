export interface CostEntry {
  id: string;
  agentId: string;
  sessionId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  timestamp: Date;
  taskId: string;
}

export interface BudgetConfig {
  dailyLimit: number;
  monthlyLimit: number;
  perAgentLimit: number;
  perTaskLimit: number;
  alertThreshold: number;
}

export class CostOptimizer {
  private entries: CostEntry[] = [];
  private budgets: Map<string, BudgetConfig> = new Map();
  private agentCosts: Map<string, number> = new Map();
  private dailyCosts: Map<string, number> = new Map();
  private modelUsage: Map<string, { count: number; totalCost: number; avgQuality: number }> = new Map();

  constructor(private config?: BudgetConfig) {
    if (config) this.budgets.set('global', config);
  }

  recordCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): CostEntry {
    const fullEntry: CostEntry = { ...entry, id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date() };
    this.entries.push(fullEntry);

    this.agentCosts.set(entry.agentId, (this.agentCosts.get(entry.agentId) || 0) + entry.totalCost);
    const day = new Date().toISOString().split('T')[0];
    this.dailyCosts.set(day, (this.dailyCosts.get(day) || 0) + entry.totalCost);

    if (!this.modelUsage.has(entry.modelId)) this.modelUsage.set(entry.modelId, { count: 0, totalCost: 0, avgQuality: 0 });
    const usage = this.modelUsage.get(entry.modelId)!;
    usage.count++; usage.totalCost += entry.totalCost;

    return fullEntry;
  }

  checkBudget(agentId?: string): { withinBudget: boolean; dailyUsage: number; monthlyUsage: number; agentUsage: number; warnings: string[] } {
    const warnings: string[] = [];
    const day = new Date().toISOString().split('T')[0];
    const dailyUsage = this.dailyCosts.get(day) || 0;
    const monthlyUsage = this.getMonthlyCost();
    const agentUsage = agentId ? (this.agentCosts.get(agentId) || 0) : 0;

    const budget = this.budgets.get('global') || this.budgets.get(agentId || '');
    if (budget) {
      if (dailyUsage > budget.dailyLimit * budget.alertThreshold) warnings.push(`Daily usage ${dailyUsage.toFixed(4)} approaching limit ${budget.dailyLimit}`);
      if (monthlyUsage > budget.monthlyLimit * budget.alertThreshold) warnings.push(`Monthly usage ${monthlyUsage.toFixed(4)} approaching limit ${budget.monthlyLimit}`);
      if (agentId && agentUsage > budget.perAgentLimit * budget.alertThreshold) warnings.push(`Agent ${agentId} usage ${agentUsage.toFixed(4)} approaching limit ${budget.perAgentLimit}`);
    }

    return { withinBudget: warnings.length === 0, dailyUsage, monthlyUsage, agentUsage, warnings };
  }

  suggestCheaperModel(currentModelId: string, requirements: { complexity: string; capabilities: string[] }): string | null {
    const currentUsage = this.modelUsage.get(currentModelId);
    if (!currentUsage) return null;
    const avgCostPerCall = currentUsage.totalCost / currentUsage.count;

    const cheaperModels = [...this.modelUsage.entries()]
      .filter(([id, u]) => id !== currentModelId && (u.totalCost / u.count) < avgCostPerCall * 0.7)
      .sort((a, b) => (a[1].totalCost / a[1].count) - (b[1].totalCost / b[1].count));

    return cheaperModels.length > 0 ? cheaperModels[0][0] : null;
  }

  private getMonthlyCost(): number {
    const month = new Date().toISOString().substring(0, 7);
    return this.entries.filter(e => e.timestamp.toISOString().startsWith(month)).reduce((sum, e) => sum + e.totalCost, 0);
  }

  setBudget(key: string, budget: BudgetConfig): void { this.budgets.set(key, budget); }
  getCostByAgent(agentId: string): number { return this.agentCosts.get(agentId) || 0; }
  getCostByModel(modelId: string): number { const u = this.modelUsage.get(modelId); return u ? u.totalCost : 0; }
  getModelUsageStats(): Record<string, { count: number; totalCost: number; avgCostPerCall: number }> {
    const result: Record<string, { count: number; totalCost: number; avgCostPerCall: number }> = {};
    for (const [id, usage] of this.modelUsage) result[id] = { count: usage.count, totalCost: usage.totalCost, avgCostPerCall: usage.totalCost / usage.count };
    return result;
  }

  getStats(): { totalCost: number; todayCost: number; monthCost: number; entries: number; topAgents: { agentId: string; cost: number }[] } {
    const today = new Date().toISOString().split('T')[0];
    const topAgents = [...this.agentCosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([agentId, cost]) => ({ agentId, cost }));
    return { totalCost: this.entries.reduce((s, e) => s + e.totalCost, 0), todayCost: this.dailyCosts.get(today) || 0, monthCost: this.getMonthlyCost(), entries: this.entries.length, topAgents };
  }

  exportCosts(): CostEntry[] { return [...this.entries]; }
  clearHistory(): void { this.entries = []; this.agentCosts.clear(); this.dailyCosts.clear(); this.modelUsage.clear(); }
}
