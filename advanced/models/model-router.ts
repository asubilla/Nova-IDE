export interface AIModel {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  latencyMs: number;
  capabilities: string[];
  qualityScore: number;
  available: boolean;
}

export interface ModelRoute {
  modelId: string;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
}

export interface TaskRequirements {
  complexity: 'low' | 'medium' | 'high' | 'expert';
  maxTokens?: number;
  requiredCapabilities?: string[];
  maxCost?: number;
  maxLatencyMs?: number;
  qualityThreshold?: number;
}

export class AIModelRouter {
  private models: Map<string, AIModel> = new Map();
  private routingHistory: { taskId: string; modelId: string; cost: number; latency: number; quality: number }[] = [];

  constructor() { this.registerDefaultModels(); }

  private registerDefaultModels(): void {
    this.registerModel({ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', maxTokens: 128000, inputCostPer1k: 0.005, outputCostPer1k: 0.015, latencyMs: 2000, capabilities: ['code', 'reasoning', 'creative', 'analysis', 'multimodal'], qualityScore: 0.95, available: true });
    this.registerModel({ id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', maxTokens: 128000, inputCostPer1k: 0.00015, outputCostPer1k: 0.0006, latencyMs: 1000, capabilities: ['code', 'reasoning', 'analysis'], qualityScore: 0.85, available: true });
    this.registerModel({ id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', maxTokens: 200000, inputCostPer1k: 0.003, outputCostPer1k: 0.015, latencyMs: 1500, capabilities: ['code', 'reasoning', 'creative', 'analysis', 'safety'], qualityScore: 0.93, available: true });
    this.registerModel({ id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic', maxTokens: 200000, inputCostPer1k: 0.00025, outputCostPer1k: 0.00125, latencyMs: 500, capabilities: ['code', 'reasoning', 'analysis'], qualityScore: 0.80, available: true });
    this.registerModel({ id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', provider: 'google', maxTokens: 2000000, inputCostPer1k: 0.00125, outputCostPer1k: 0.005, latencyMs: 1800, capabilities: ['code', 'reasoning', 'creative', 'analysis', 'multimodal'], qualityScore: 0.92, available: true });
    this.registerModel({ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', maxTokens: 1000000, inputCostPer1k: 0.000075, outputCostPer1k: 0.0003, latencyMs: 400, capabilities: ['code', 'reasoning', 'analysis'], qualityScore: 0.82, available: true });
  }

  registerModel(model: AIModel): void { this.models.set(model.id, model); }

  routeModel(taskRequirements: TaskRequirements): ModelRoute {
    const candidates = [...this.models.values()].filter(m => m.available);
    const scored = candidates.map(model => {
      let score = 0;
      const complexityMap: Record<string, number> = { low: 0.3, medium: 0.6, high: 0.85, expert: 1.0 };
      const modelFit = model.qualityScore >= complexityMap[taskRequirements.complexity] ? 1 : model.qualityScore / complexityMap[taskRequirements.complexity];
      score += modelFit * 40;

      if (taskRequirements.requiredCapabilities) {
        const capMatch = taskRequirements.requiredCapabilities.filter(c => model.capabilities.includes(c)).length / taskRequirements.requiredCapabilities.length;
        score += capMatch * 30;
      }

      const cost = (model.inputCostPer1k * 1000 + model.outputCostPer1k * 500) / 1000;
      if (taskRequirements.maxCost && cost > taskRequirements.maxCost) score -= 50;
      score += (1 - Math.min(cost / 0.1, 1)) * 20;

      if (taskRequirements.maxLatencyMs && model.latencyMs > taskRequirements.maxLatencyMs) score -= 30;
      score += (1 - model.latencyMs / 5000) * 10;

      return { model, score, estimatedCost: cost, estimatedLatency: model.latencyMs };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    return { modelId: best.model.id, reason: `Best fit: quality=${best.model.qualityScore}, cost=$${best.estimatedCost.toFixed(4)}, latency=${best.estimatedLatency}ms`, estimatedCost: best.estimatedCost, estimatedLatency: best.estimatedLatency, confidence: best.score / 100 };
  }

  recordRouting(taskId: string, modelId: string, cost: number, latency: number, quality: number): void {
    this.routingHistory.push({ taskId, modelId, cost, latency, quality });
    if (this.routingHistory.length > 10000) this.routingHistory.shift();
  }

  getModel(id: string): AIModel | undefined { return this.models.get(id); }
  getAllModels(): AIModel[] { return [...this.models.values()]; }
  getAvailableModels(): AIModel[] { return [...this.models.values()].filter(m => m.available); }

  getModelPerformance(modelId: string): { avgCost: number; avgLatency: number; avgQuality: number; usageCount: number } {
    const history = this.routingHistory.filter(h => h.modelId === modelId);
    if (history.length === 0) return { avgCost: 0, avgLatency: 0, avgQuality: 0, usageCount: 0 };
    return {
      avgCost: history.reduce((s, h) => s + h.cost, 0) / history.length,
      avgLatency: history.reduce((s, h) => s + h.latency, 0) / history.length,
      avgQuality: history.reduce((s, h) => s + h.quality, 0) / history.length,
      usageCount: history.length,
    };
  }

  getStats(): { totalModels: number; availableModels: number; totalRoutings: number; avgCost: number } {
    const models = [...this.models.values()];
    return {
      totalModels: models.length, availableModels: models.filter(m => m.available).length,
      totalRoutings: this.routingHistory.length,
      avgCost: this.routingHistory.length ? this.routingHistory.reduce((s, h) => s + h.cost, 0) / this.routingHistory.length : 0,
    };
  }
}
