import { SystemLogger, type LogEntry } from './system-logger';

export interface TemplateLoadEntry {
  templateId: string;
  batch: boolean;
  timestamp: number;
  success: boolean;
  duration?: number;
}

export interface TemplateMatchEntry {
  templateId: string;
  score: number;
  query: string;
  timestamp: number;
}

export interface TemplateUseEntry {
  templateId: string;
  agentId: string;
  timestamp: number;
}

export interface TemplateStats {
  totalLoads: number;
  totalMatches: number;
  totalUses: number;
  totalErrors: number;
  avgMatchScore: number;
  mostUsedTemplates: { templateId: string; useCount: number }[];
  errorRate: number;
}

export class TemplateLogger {
  private loadEntries: TemplateLoadEntry[] = [];
  private matchEntries: TemplateMatchEntry[] = [];
  private useEntries: TemplateUseEntry[] = [];
  private errorCount = 0;
  private readonly maxEntries = 5000;

  constructor(private readonly systemLogger: SystemLogger) {}

  logTemplateLoad(templateId: string, batch: boolean): LogEntry {
    const entry: TemplateLoadEntry = {
      templateId,
      batch,
      timestamp: Date.now(),
      success: true,
    };
    this.loadEntries.push(entry);
    if (this.loadEntries.length > this.maxEntries) {
      this.loadEntries = this.loadEntries.slice(this.loadEntries.length - this.maxEntries);
    }

    return this.systemLogger.info('template', `Template loaded: ${templateId}${batch ? ' (batch)' : ''}`, {
      templateId,
      batch,
    });
  }

  logTemplateMatch(templateId: string, score: number, query: string): LogEntry {
    const entry: TemplateMatchEntry = {
      templateId,
      score,
      query,
      timestamp: Date.now(),
    };
    this.matchEntries.push(entry);
    if (this.matchEntries.length > this.maxEntries) {
      this.matchEntries = this.matchEntries.slice(this.matchEntries.length - this.maxEntries);
    }

    return this.systemLogger.debug('template', `Template match: ${templateId} (score: ${score.toFixed(3)}) for "${query}"`, {
      templateId,
      score,
      query,
    });
  }

  logTemplateUse(templateId: string, agentId: string): LogEntry {
    const entry: TemplateUseEntry = {
      templateId,
      agentId,
      timestamp: Date.now(),
    };
    this.useEntries.push(entry);
    if (this.useEntries.length > this.maxEntries) {
      this.useEntries = this.useEntries.slice(this.useEntries.length - this.maxEntries);
    }

    return this.systemLogger.info('template', `Template used: ${templateId} by agent ${agentId}`, {
      templateId,
      agentId,
    });
  }

  logTemplateError(templateId: string, error: Error | string): LogEntry {
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    this.errorCount++;

    return this.systemLogger.error('template', `Template error: ${templateId} - ${errorMsg}`, {
      templateId,
      error: errorMsg,
      stack,
    });
  }

  getTemplateStats(): TemplateStats {
    let totalScore = 0;
    for (const entry of this.matchEntries) {
      totalScore += entry.score;
    }

    const useCounts = new Map<string, number>();
    for (const entry of this.useEntries) {
      useCounts.set(entry.templateId, (useCounts.get(entry.templateId) ?? 0) + 1);
    }
    const mostUsed = [...useCounts.entries()]
      .map(([templateId, useCount]) => ({ templateId, useCount }))
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 10);

    return {
      totalLoads: this.loadEntries.length,
      totalMatches: this.matchEntries.length,
      totalUses: this.useEntries.length,
      totalErrors: this.errorCount,
      avgMatchScore: this.matchEntries.length > 0 ? totalScore / this.matchEntries.length : 0,
      mostUsedTemplates: mostUsed,
      errorRate: this.loadEntries.length > 0 ? this.errorCount / this.loadEntries.length : 0,
    };
  }
}
