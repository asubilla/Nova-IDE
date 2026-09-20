export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  metric: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  startedAt?: Date;
  completedAt?: Date;
  winner?: string;
  minSampleSize: number;
  confidenceLevel: number;
}

export interface ABVariant {
  id: string;
  name: string;
  agentConfig: any;
  traffic: number;
  impressions: number;
  conversions: number;
  totalValue: number;
}

export interface ABResult {
  testId: string;
  winner: string;
  confidence: number;
  lift: number;
  variants: { id: string; conversionRate: number; avgValue: number; significance: number }[];
}

export class ABTesting {
  private tests: Map<string, ABTest> = new Map();
  private assignments: Map<string, string> = new Map();

  createTest(test: Omit<ABTest, 'id' | 'status' | 'impressions'>): ABTest {
    const id = `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const full: ABTest = { ...test, id, status: 'draft' };
    this.tests.set(id, full);
    return full;
  }

  startTest(testId: string): boolean {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'draft') return false;
    test.status = 'running'; test.startedAt = new Date();
    return true;
  }

  assignVariant(testId: string, userId: string): string | null {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return null;
    const existing = this.assignments.get(`${testId}:${userId}`);
    if (existing) return existing;
    const rand = Math.random();
    let cumulative = 0;
    for (const variant of test.variants) {
      cumulative += variant.traffic;
      if (rand <= cumulative) { this.assignments.set(`${testId}:${userId}`, variant.id); return variant.id; }
    }
    return test.variants[test.variants.length - 1].id;
  }

  recordConversion(testId: string, userId: string, value: number): boolean {
    const variantId = this.assignments.get(`${testId}:${userId}`);
    if (!variantId) return false;
    const test = this.tests.get(testId);
    if (!test) return false;
    const variant = test.variants.find(v => v.id === variantId);
    if (!variant) return false;
    variant.conversions++; variant.totalValue += value;
    return true;
  }

  recordImpression(testId: string, userId: string): void {
    const variantId = this.assignments.get(`${testId}:${userId}`);
    if (!variantId) return;
    const test = this.tests.get(testId);
    if (!test) return;
    const variant = test.variants.find(v => v.id === variantId);
    if (variant) variant.impressions++;
  }

  analyzeTest(testId: string): ABResult | null {
    const test = this.tests.get(testId);
    if (!test) return null;
    const variants = test.variants.map(v => ({
      id: v.id,
      conversionRate: v.impressions > 0 ? v.conversions / v.impressions : 0,
      avgValue: v.conversions > 0 ? v.totalValue / v.conversions : 0,
      significance: this.calculateSignificance(v, test.variants[0]),
    }));
    variants.sort((a, b) => b.conversionRate - a.conversionRate);
    const best = variants[0];
    return { testId, winner: best.id, confidence: best.significance, lift: variants.length > 1 ? (best.conversionRate - variants[1].conversionRate) / (variants[1].conversionRate || 1) : 0, variants };
  }

  private calculateSignificance(variant: ABVariant, control: ABVariant): number {
    if (variant.impressions < 10 || control.impressions < 10) return 0;
    const p1 = control.conversions / control.impressions;
    const p2 = variant.conversions / variant.impressions;
    const pooled = (control.conversions + variant.conversions) / (control.impressions + variant.impressions);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.impressions + 1 / variant.impressions));
    if (se === 0) return 0;
    const z = Math.abs(p2 - p1) / se;
    return Math.min(0.99, 1 - Math.exp(-0.5 * z * z));
  }

  completeTest(testId: string): ABResult | null {
    const result = this.analyzeTest(testId);
    if (result) {
      const test = this.tests.get(testId);
      if (test) { test.status = 'completed'; test.completedAt = new Date(); test.winner = result.winner; }
    }
    return result;
  }

  pauseTest(testId: string): boolean { const t = this.tests.get(testId); if (t?.status === 'running') { t.status = 'paused'; return true; } return false; }
  resumeTest(testId: string): boolean { const t = this.tests.get(testId); if (t?.status === 'paused') { t.status = 'running'; return true; } return false; }
  getTest(id: string): ABTest | undefined { return this.tests.get(id); }
  getAllTests(): ABTest[] { return [...this.tests.values()]; }
  getRunningTests(): ABTest[] { return [...this.tests.values()].filter(t => t.status === 'running'); }

  getStats(): { totalTests: number; running: number; completed: number; avgConfidence: number } {
    const tests = [...this.tests.values()];
    const completed = tests.filter(t => t.status === 'completed');
    return { totalTests: tests.length, running: tests.filter(t => t.status === 'running').length, completed: completed.length, avgConfidence: completed.length ? completed.reduce((s, t) => { const r = this.analyzeTest(t.id); return s + (r?.confidence || 0); }, 0) / completed.length : 0 };
  }
}
