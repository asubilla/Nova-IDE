import { type LogEntry, type LogLevel, type LogCategory, type LogFilter } from './system-logger';

export type AggregateGroupBy = 'level' | 'category' | 'time' | 'agent' | 'session';

export interface AggregatedBucket {
  key: string;
  count: number;
  entries: LogEntry[];
  percentage: number;
}

export interface AggregatedResult {
  groupBy: AggregateGroupBy;
  buckets: AggregatedBucket[];
  totalEntries: number;
}

export interface ErrorSummary {
  totalErrors: number;
  errorsByCategory: Record<string, number>;
  errorsByLevel: Record<string, number>;
  mostCommonErrors: Array<{ message: string; count: number; lastOccurrence: number }>;
  errorRate: number;
  errorTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface PerformanceSummary {
  requestStats: {
    total: number;
    avgDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    slowRequests: number;
    slowThreshold: number;
  };
  databaseStats: {
    total: number;
    avgDuration: number;
    failureCount: number;
    failureRate: number;
  };
  buildStats: {
    total: number;
    avgDuration: number;
    successRate: number;
  };
}

export interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  completedAgents: number;
  failedAgents: number;
  cancelledAgents: number;
  avgAgentDuration: number;
  agentActivity: Array<{
    agentId: string;
    events: number;
    status: 'active' | 'completed' | 'failed' | 'cancelled';
    firstSeen: number;
    lastSeen: number;
  }>;
}

export interface SessionSummary {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  avgSessionDuration: number;
  totalCheckpoints: number;
  totalReverts: number;
}

export interface ChatSummary {
  totalMessages: number;
  totalReplies: number;
  totalEdits: number;
  totalCodeExecutions: number;
  codeExecutionSuccessRate: number;
  activityPerMinute: number;
}

export interface SecuritySummary {
  totalEvents: number;
  eventsByLevel: Record<string, number>;
  recentEvents: LogEntry[];
}

export interface TimelineEvent {
  timestamp: number;
  event: string;
  category: LogCategory;
  level: LogLevel;
  data?: Record<string, unknown>;
}

export interface HeatmapData {
  hour: number;
  dayOfWeek: number;
  count: number;
  level: LogLevel;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
  label: string;
}

export interface Anomaly {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface Insight {
  category: string;
  type: 'info' | 'warning' | 'suggestion' | 'alert';
  message: string;
  data?: Record<string, unknown>;
}

export class LogAggregator {
  constructor() {}

  aggregate(logs: LogEntry[], groupBy: AggregateGroupBy): AggregatedResult {
    const buckets = new Map<string, LogEntry[]>();

    for (const entry of logs) {
      const key = this.getGroupKey(entry, groupBy);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key)!.push(entry);
    }

    const totalEntries = logs.length;
    const aggregatedBuckets: AggregatedBucket[] = [];

    for (const [key, entries] of buckets) {
      aggregatedBuckets.push({
        key,
        count: entries.length,
        entries,
        percentage: totalEntries > 0 ? (entries.length / totalEntries) * 100 : 0,
      });
    }

    aggregatedBuckets.sort((a, b) => b.count - a.count);

    return {
      groupBy,
      buckets: aggregatedBuckets,
      totalEntries,
    };
  }

  getErrorSummary(logs: LogEntry[]): ErrorSummary {
    const errors = logs.filter((e) => e.level === 'error');
    const warnings = logs.filter((e) => e.level === 'warn');
    const totalEntries = logs.length;

    const errorsByCategory: Record<string, number> = {};
    const errorsByLevel: Record<string, number> = {};
    const errorMessages = new Map<string, { count: number; lastOccurrence: number }>();

    for (const entry of errors) {
      errorsByCategory[entry.category] = (errorsByCategory[entry.category] || 0) + 1;
      errorsByLevel[entry.level] = (errorsByLevel[entry.level] || 0) + 1;

      const existing = errorMessages.get(entry.message);
      if (existing) {
        existing.count++;
        if (entry.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = entry.timestamp;
        }
      } else {
        errorMessages.set(entry.message, { count: 1, lastOccurrence: entry.timestamp });
      }
    }

    for (const entry of warnings) {
      errorsByLevel[entry.level] = (errorsByLevel[entry.level] || 0) + 1;
    }

    const mostCommonErrors = Array.from(errorMessages.entries())
      .map(([message, data]) => ({ message, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const errorRate = totalEntries > 0 ? (errors.length / totalEntries) * 100 : 0;

    const errorTrend = this.calculateErrorTrend(errors);

    return {
      totalErrors: errors.length,
      errorsByCategory,
      errorsByLevel,
      mostCommonErrors,
      errorRate,
      errorTrend,
    };
  }

  getPerformanceSummary(logs: LogEntry[]): PerformanceSummary {
    const perfLogs = logs.filter((e) => e.category === 'performance');
    const requestLogs = perfLogs.filter((e) => e.message.startsWith('HTTP '));
    const dbLogs = perfLogs.filter((e) => e.message.startsWith('DB '));
    const buildLogs = perfLogs.filter((e) => e.message.startsWith('Build'));

    const requestDurations = requestLogs
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!)
      .sort((a, b) => a - b);

    const dbDurations = dbLogs
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!)
      .sort((a, b) => a - b);

    const buildDurations = buildLogs
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!)
      .sort((a, b) => a - b);

    return {
      requestStats: {
        total: requestLogs.length,
        avgDuration: this.avg(requestDurations),
        p50Duration: this.percentile(requestDurations, 50),
        p95Duration: this.percentile(requestDurations, 95),
        p99Duration: this.percentile(requestDurations, 99),
        slowRequests: requestDurations.filter((d) => d > 1000).length,
        slowThreshold: 1000,
      },
      databaseStats: {
        total: dbLogs.length,
        avgDuration: this.avg(dbDurations),
        failureCount: dbLogs.filter((e) => e.message.includes('FAILED')).length,
        failureRate: dbLogs.length > 0
          ? (dbLogs.filter((e) => e.message.includes('FAILED')).length / dbLogs.length) * 100
          : 0,
      },
      buildStats: {
        total: buildLogs.length,
        avgDuration: this.avg(buildDurations),
        successRate: buildLogs.length > 0
          ? (buildLogs.filter((e) => e.message.includes('succeeded')).length / buildLogs.length) * 100
          : 0,
      },
    };
  }

  getAgentSummary(logs: LogEntry[]): AgentSummary {
    const agentLogs = logs.filter((e) => e.category === 'agent');
    const agentMap = new Map<string, {
      events: number;
      status: 'active' | 'completed' | 'failed' | 'cancelled';
      firstSeen: number;
      lastSeen: number;
      startTime?: number;
      totalDuration: number;
      durationCount: number;
    }>();

    for (const entry of agentLogs) {
      if (!entry.data || typeof entry.data !== 'object') continue;
      const agentId = (entry.data as Record<string, unknown>).agentId;
      if (typeof agentId !== 'string') continue;

      let agent = agentMap.get(agentId);
      if (!agent) {
        agent = {
          events: 0,
          status: 'active',
          firstSeen: entry.timestamp,
          lastSeen: entry.timestamp,
          totalDuration: 0,
          durationCount: 0,
        };
        agentMap.set(agentId, agent);
      }

      agent.events++;
      if (entry.timestamp > agent.lastSeen) agent.lastSeen = entry.timestamp;

      if (entry.message.includes('spawned') || entry.message.includes('started')) {
        agent.status = 'active';
        agent.startTime = entry.timestamp;
      } else if (entry.message.includes('completed')) {
        agent.status = 'completed';
      } else if (entry.message.includes('error')) {
        agent.status = 'failed';
      } else if (entry.message.includes('cancelled')) {
        agent.status = 'cancelled';
      }

      if (entry.duration !== undefined) {
        agent.totalDuration += entry.duration;
        agent.durationCount++;
      }
    }

    const agentActivity = Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        ...data,
      }))
      .sort((a, b) => b.events - a.events);

    const active = agentActivity.filter((a) => a.status === 'active').length;
    const completed = agentActivity.filter((a) => a.status === 'completed').length;
    const failed = agentActivity.filter((a) => a.status === 'failed').length;
    const cancelled = agentActivity.filter((a) => a.status === 'cancelled').length;

    const allDurations = agentActivity
      .filter((a) => a.durationCount > 0)
      .map((a) => a.totalDuration / a.durationCount);
    const avgDuration = this.avg(allDurations);

    return {
      totalAgents: agentActivity.length,
      activeAgents: active,
      completedAgents: completed,
      failedAgents: failed,
      cancelledAgents: cancelled,
      avgAgentDuration: avgDuration,
      agentActivity,
    };
  }

  getSessionSummary(logs: LogEntry[]): SessionSummary {
    const sessionLogs = logs.filter((e) => e.category === 'session');
    const sessionMap = new Map<string, { startTime?: number; status: string }>();

    let checkpoints = 0;
    let reverts = 0;

    for (const entry of sessionLogs) {
      if (!entry.data || typeof entry.data !== 'object') continue;
      const sessionId = (entry.data as Record<string, unknown>).sessionId;
      if (typeof sessionId !== 'string') continue;

      let session = sessionMap.get(sessionId);
      if (!session) {
        session = { status: 'unknown' };
        sessionMap.set(sessionId, session);
      }

      if (entry.message.includes('created') || entry.message.includes('started')) {
        session.startTime = entry.timestamp;
        session.status = 'active';
      } else if (entry.message.includes('ended')) {
        session.status = 'completed';
      }

      if (entry.message.includes('Checkpoint')) checkpoints++;
      if (entry.message.includes('reverted')) reverts++;
    }

    const sessions = Array.from(sessionMap.values());
    const active = sessions.filter((s) => s.status === 'active').length;
    const completed = sessions.filter((s) => s.status === 'completed').length;

    const durations = sessions
      .filter((s) => s.startTime !== undefined)
      .map((s) => {
        const lastLog = sessionLogs
          .filter((e) => {
            if (!e.data || typeof e.data !== 'object') return false;
            return (e.data as Record<string, unknown>).sessionId === s.startTime;
          })
          .pop();
        return lastLog ? lastLog.timestamp - s.startTime! : 0;
      })
      .filter((d) => d > 0);

    return {
      totalSessions: sessions.length,
      activeSessions: active,
      completedSessions: completed,
      avgSessionDuration: this.avg(durations),
      totalCheckpoints: checkpoints,
      totalReverts: reverts,
    };
  }

  getChatSummary(logs: LogEntry[]): ChatSummary {
    const chatLogs = logs.filter((e) => e.category === 'chat');
    let messages = 0;
    let replies = 0;
    let edits = 0;
    let codeExecutions = 0;
    let codeExecSuccess = 0;

    for (const entry of chatLogs) {
      if (entry.message.startsWith('Message sent:')) messages++;
      else if (entry.message.startsWith('Reply sent:')) replies++;
      else if (entry.message.startsWith('Message edited:')) edits++;
      else if (entry.message.startsWith('Code executed:')) {
        codeExecutions++;
        if (entry.data && typeof entry.data === 'object' && 'success' in entry.data) {
          if ((entry.data as Record<string, unknown>).success === true) {
            codeExecSuccess++;
          }
        }
      }
    }

    const timeSpan = chatLogs.length > 0
      ? (chatLogs[chatLogs.length - 1].timestamp - chatLogs[0].timestamp) / 60_000
      : 1;
    const activityPerMinute = chatLogs.length / Math.max(timeSpan, 1);

    return {
      totalMessages: messages,
      totalReplies: replies,
      totalEdits: edits,
      totalCodeExecutions: codeExecutions,
      codeExecutionSuccessRate: codeExecutions > 0 ? (codeExecSuccess / codeExecutions) * 100 : 0,
      activityPerMinute,
    };
  }

  getSecuritySummary(logs: LogEntry[]): SecuritySummary {
    const secLogs = logs.filter((e) => e.category === 'security');
    const eventsByLevel: Record<string, number> = {};

    for (const entry of secLogs) {
      eventsByLevel[entry.level] = (eventsByLevel[entry.level] || 0) + 1;
    }

    return {
      totalEvents: secLogs.length,
      eventsByLevel,
      recentEvents: secLogs.slice(-20),
    };
  }

  getTimeline(logs: LogEntry[]): TimelineEvent[] {
    return logs
      .map((e) => ({
        timestamp: e.timestamp,
        event: e.message,
        category: e.category,
        level: e.level,
        data: e.data,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getHeatmap(logs: LogEntry[]): HeatmapData[] {
    const heatmap = new Map<string, { hour: number; dayOfWeek: number; count: number; levels: Map<LogLevel, number> }>();

    for (let hour = 0; hour < 24; hour++) {
      for (let day = 0; day < 7; day++) {
        heatmap.set(`${hour}-${day}`, { hour, dayOfWeek: day, count: 0, levels: new Map() });
      }
    }

    for (const entry of logs) {
      const date = new Date(entry.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      const key = `${hour}-${day}`;
      const cell = heatmap.get(key);
      if (cell) {
        cell.count++;
        cell.levels.set(entry.level, (cell.levels.get(entry.level) || 0) + 1);
      }
    }

    const result: HeatmapData[] = [];
    for (const cell of heatmap.values()) {
      let dominantLevel: LogLevel = 'info';
      let maxCount = 0;
      for (const [level, count] of cell.levels) {
        if (count > maxCount) {
          maxCount = count;
          dominantLevel = level;
        }
      }
      result.push({
        hour: cell.hour,
        dayOfWeek: cell.dayOfWeek,
        count: cell.count,
        level: dominantLevel,
      });
    }

    return result;
  }

  getTrends(logs: LogEntry[]): TrendPoint[] {
    if (logs.length === 0) return [];

    const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
    const windowSize = Math.max(1, Math.floor(sorted.length / 20));
    const trends: TrendPoint[] = [];

    for (let i = 0; i < sorted.length; i += windowSize) {
      const window = sorted.slice(i, i + windowSize);
      const errorCount = window.filter((e) => e.level === 'error').length;
      const midIndex = Math.floor(window.length / 2);
      trends.push({
        timestamp: window[midIndex].timestamp,
        value: errorCount,
        label: `Errors in window ${Math.floor(i / windowSize) + 1}`,
      });
    }

    return trends;
  }

  getAnomalies(logs: LogEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const errors = logs.filter((e) => e.level === 'error');

    const errorRate = logs.length > 0 ? errors.length / logs.length : 0;
    if (errorRate > 0.1) {
      anomalies.push({
        type: 'high_error_rate',
        description: `Error rate is ${((errorRate * 100).toFixed(1))}% (${errors.length}/${logs.length})`,
        severity: errorRate > 0.25 ? 'high' : 'medium',
        timestamp: Date.now(),
      });
    }

    const errorGroups = new Map<string, number>();
    for (const err of errors) {
      const pattern = err.message.replace(/\d+/g, 'N').substring(0, 50);
      errorGroups.set(pattern, (errorGroups.get(pattern) || 0) + 1);
    }

    for (const [pattern, count] of errorGroups) {
      if (count > 5) {
        anomalies.push({
          type: 'repeated_error',
          description: `Repeated error pattern (${count} occurrences): ${pattern}`,
          severity: count > 20 ? 'high' : count > 10 ? 'medium' : 'low',
          timestamp: Date.now(),
        });
      }
    }

    const perfLogs = logs.filter((e) => e.category === 'performance');
    const slowRequests = perfLogs.filter(
      (e) => e.duration !== undefined && e.duration > 5000,
    );
    if (slowRequests.length > 3) {
      anomalies.push({
        type: 'slow_requests',
        description: `${slowRequests.length} requests took over 5 seconds`,
        severity: 'medium',
        timestamp: Date.now(),
      });
    }

    const secLogs = logs.filter((e) => e.category === 'security' && e.level === 'error');
    if (secLogs.length > 3) {
      anomalies.push({
        type: 'security_errors',
        description: `${secLogs.length} security errors detected`,
        severity: 'high',
        timestamp: Date.now(),
      });
    }

    return anomalies;
  }

  generateInsights(logs: LogEntry[]): Insight[] {
    const insights: Insight[] = [];
    const errorSummary = this.getErrorSummary(logs);
    const perfSummary = this.getPerformanceSummary(logs);
    const agentSummary = this.getAgentSummary(logs);

    if (errorSummary.totalErrors > 0) {
      insights.push({
        category: 'errors',
        type: errorSummary.errorRate > 10 ? 'alert' : 'warning',
        message: `${errorSummary.totalErrors} errors detected (${errorSummary.errorRate.toFixed(1)}% error rate). Trend: ${errorSummary.errorTrend}.`,
        data: { errorRate: errorSummary.errorRate, trend: errorSummary.errorTrend },
      });
    }

    if (errorSummary.mostCommonErrors.length > 0) {
      insights.push({
        category: 'errors',
        type: 'info',
        message: `Most common error: "${errorSummary.mostCommonErrors[0].message}" (${errorSummary.mostCommonErrors[0].count} times).`,
      });
    }

    if (perfSummary.requestStats.slowRequests > 0) {
      insights.push({
        category: 'performance',
        type: perfSummary.requestStats.slowRequests > 10 ? 'alert' : 'warning',
        message: `${perfSummary.requestStats.slowRequests} slow requests detected (>{perfSummary.requestStats.slowThreshold}ms). P95 latency: ${perfSummary.requestStats.p95Duration}ms.`,
      });
    }

    if (perfSummary.databaseStats.failureRate > 5) {
      insights.push({
        category: 'database',
        type: 'alert',
        message: `Database failure rate: ${perfSummary.databaseStats.failureRate.toFixed(1)}%. ${perfSummary.databaseStats.failureCount} failed operations.`,
      });
    }

    if (agentSummary.failedAgents > 0) {
      insights.push({
        category: 'agents',
        type: 'warning',
        message: `${agentSummary.failedAgents} agents failed out of ${agentSummary.totalAgents} total.`,
      });
    }

    if (agentSummary.avgAgentDuration > 30000) {
      insights.push({
        category: 'agents',
        type: 'suggestion',
        message: `Average agent duration is ${((agentSummary.avgAgentDuration / 1000).toFixed(1))}s. Consider optimizing agent tasks.`,
      });
    }

    const anomalies = this.getAnomalies(logs);
    for (const anomaly of anomalies) {
      insights.push({
        category: anomaly.type,
        type: anomaly.severity === 'high' ? 'alert' : 'warning',
        message: anomaly.description,
        data: anomaly.data,
      });
    }

    return insights;
  }

  renderSummary(logs: LogEntry[]): string {
    const lines: string[] = [];
    const errorSummary = this.getErrorSummary(logs);
    const perfSummary = this.getPerformanceSummary(logs);
    const agentSummary = this.getAgentSummary(logs);
    const sessionSummary = this.getSessionSummary(logs);
    const chatSummary = this.getChatSummary(logs);
    const secSummary = this.getSecuritySummary(logs);

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                  LOG AGGREGATION SUMMARY                    ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Total Logs: ${logs.length.toString().padEnd(46)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  ERRORS                                                     ║');
    lines.push(`║    Total: ${errorSummary.totalErrors.toString().padEnd(50)}║`);
    lines.push(`║    Rate: ${(errorSummary.errorRate.toFixed(2) + '%').padEnd(51)}║`);
    lines.push(`║    Trend: ${errorSummary.errorTrend.padEnd(49)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  PERFORMANCE                                                ║');
    lines.push(`║    Requests: ${perfSummary.requestStats.total.toString().padEnd(47)}║`);
    lines.push(`║    Avg Duration: ${(perfSummary.requestStats.avgDuration.toFixed(1) + 'ms').padEnd(43)}║`);
    lines.push(`║    P95 Duration: ${(perfSummary.requestStats.p95Duration.toFixed(1) + 'ms').padEnd(43)}║`);
    lines.push(`║    DB Failures: ${(perfSummary.databaseStats.failureCount.toString()).padEnd(44)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  AGENTS                                                     ║');
    lines.push(`║    Total: ${agentSummary.totalAgents.toString().padEnd(50)}║`);
    lines.push(`║    Active: ${agentSummary.activeAgents.toString().padEnd(49)}║`);
    lines.push(`║    Failed: ${agentSummary.failedAgents.toString().padEnd(49)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  SESSIONS                                                   ║');
    lines.push(`║    Total: ${sessionSummary.totalSessions.toString().padEnd(50)}║`);
    lines.push(`║    Active: ${sessionSummary.activeSessions.toString().padEnd(49)}║`);
    lines.push(`║    Checkpoints: ${sessionSummary.totalCheckpoints.toString().padEnd(44)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  CHAT                                                       ║');
    lines.push(`║    Messages: ${chatSummary.totalMessages.toString().padEnd(47)}║`);
    lines.push(`║    Replies: ${chatSummary.totalReplies.toString().padEnd(48)}║`);
    lines.push(`║    Code Exec Success: ${(chatSummary.codeExecutionSuccessRate.toFixed(1) + '%').padEnd(38)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  SECURITY                                                   ║');
    lines.push(`║    Events: ${secSummary.totalEvents.toString().padEnd(49)}║`);
    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  exportSummary(logs: LogEntry[], format: 'json' | 'csv' | 'text'): string {
    if (format === 'json') {
      return JSON.stringify({
        totalLogs: logs.length,
        errors: this.getErrorSummary(logs),
        performance: this.getPerformanceSummary(logs),
        agents: this.getAgentSummary(logs),
        sessions: this.getSessionSummary(logs),
        chat: this.getChatSummary(logs),
        security: this.getSecuritySummary(logs),
        insights: this.generateInsights(logs),
        anomalies: this.getAnomalies(logs),
      }, null, 2);
    }

    if (format === 'csv') {
      const header = 'category,count,percentage\n';
      const aggregated = this.aggregate(logs, 'category');
      const rows = aggregated.buckets
        .map((b) => `${b.key},${b.count},${b.percentage.toFixed(2)}%`)
        .join('\n');
      return header + rows;
    }

    return this.renderSummary(logs);
  }

  private getGroupKey(entry: LogEntry, groupBy: AggregateGroupBy): string {
    switch (groupBy) {
      case 'level':
        return entry.level;
      case 'category':
        return entry.category;
      case 'time': {
        const date = new Date(entry.timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
      }
      case 'agent': {
        if (entry.data && typeof entry.data === 'object' && 'agentId' in entry.data) {
          return String((entry.data as Record<string, unknown>).agentId);
        }
        return 'unknown';
      }
      case 'session': {
        if (entry.data && typeof entry.data === 'object' && 'sessionId' in entry.data) {
          return String((entry.data as Record<string, unknown>).sessionId);
        }
        return 'unknown';
      }
      default:
        return 'unknown';
    }
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateErrorTrend(errors: LogEntry[]): 'increasing' | 'decreasing' | 'stable' {
    if (errors.length < 2) return 'stable';

    const now = Date.now();
    const halfHour = 30 * 60 * 1000;

    const recent = errors.filter((e) => now - e.timestamp < halfHour).length;
    const older = errors.filter((e) => now - e.timestamp >= halfHour && now - e.timestamp < halfHour * 2).length;

    if (recent > older * 1.2) return 'increasing';
    if (recent < older * 0.8) return 'decreasing';
    return 'stable';
  }
}
