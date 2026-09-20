import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export enum AuditEventType {
  AGENT_SPAWNED = 'agent_spawned',
  AGENT_COMPLETED = 'agent_completed',
  AGENT_FAILED = 'agent_failed',
  AGENT_KILLED = 'agent_killed',
  AGENT_TIMEOUT = 'agent_timeout',
  TOOL_INVOKED = 'tool_invoked',
  TOOL_DENIED = 'tool_denied',
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  BASH_EXECUTED = 'bash_executed',
  NETWORK_REQUEST = 'network_request',
  NETWORK_BLOCKED = 'network_blocked',
  SECRET_ACCESSED = 'secret_accessed',
  SECRET_DENIED = 'secret_denied',
  PERMISSION_CHECK = 'permission_check',
  VALIDATION_PASSED = 'validation_passed',
  VALIDATION_FAILED = 'validation_failed',
  ERROR_FIX_ATTEMPT = 'error_fix_attempt',
  CHECKPOINT_CREATED = 'checkpoint_created',
  SESSION_STARTED = 'session_started',
  SESSION_COMPLETED = 'session_completed',
  SESSION_FAILED = 'session_failed',
  RESOURCE_WARNING = 'resource_warning',
  RESOURCE_EXCEEDED = 'resource_exceeded',
  ANOMALY_DETECTED = 'anomaly_detected',
  CONFIG_CHANGED = 'config_changed'
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  sessionId: string;
  agentId?: string;
  agentType?: string;
  tool?: string;
  action?: string;
  target?: string;
  decision?: 'allowed' | 'denied' | 'error';
  reason?: string;
  metadata: Record<string, any>;
  duration?: number;
  resourceUsage?: { memoryMB: number; cpuPercent: number; tokens: number };
  riskScore?: number;
  parentEventId?: string;
}

export interface AuditQuery {
  startTime?: Date;
  endTime?: Date;
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  agentId?: string;
  agentType?: string;
  sessionId?: string;
  tool?: string;
  minRiskScore?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'severity' | 'riskScore';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStats {
  totalEvents: number;
  byEventType: Record<string, number>;
  bySeverity: Record<string, number>;
  byAgentType: Record<string, number>;
  averageRiskScore: number;
  highRiskEvents: number;
  failedOperations: number;
  averageDuration: number;
  timeRange: { start: Date; end: Date };
}

export interface RiskScoringRule {
  eventType: AuditEventType | '*';
  weight: number;
  condition?: (entry: AuditLogEntry) => boolean;
  description: string;
}

export interface Anomaly {
  type: 'frequency_spike' | 'unusual_pattern' | 'resource_abuse' | 'permission_violation' | 'time_anomaly';
  description: string;
  severity: AuditSeverity;
  affectedAgents: string[];
  timestamp: Date;
  details: Record<string, any>;
}

export interface AuditAlert {
  id: string;
  severity: AuditSeverity;
  message: string;
  eventType: AuditEventType;
  agentId?: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface AuditTimelineEntry {
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  summary: string;
  agentId?: string;
  duration?: number;
  decision?: string;
}

const DEFAULT_RISK_RULES: RiskScoringRule[] = [
  {
    eventType: AuditEventType.BASH_EXECUTED,
    weight: 3,
    description: 'Bash command execution carries elevated risk'
  },
  {
    eventType: AuditEventType.FILE_DELETE,
    weight: 2,
    description: 'File deletion is a destructive operation'
  },
  {
    eventType: AuditEventType.NETWORK_REQUEST,
    weight: 1,
    description: 'Network requests introduce external dependencies'
  },
  {
    eventType: AuditEventType.SECRET_ACCESSED,
    weight: 4,
    description: 'Secret access requires careful monitoring'
  },
  {
    eventType: AuditEventType.SECRET_DENIED,
    weight: 5,
    description: 'Denied secret access indicates potential unauthorized attempt',
    condition: (entry) => entry.decision === 'denied'
  },
  {
    eventType: AuditEventType.TOOL_DENIED,
    weight: 5,
    description: 'Tool permission denial indicates policy violation'
  },
  {
    eventType: AuditEventType.RESOURCE_EXCEEDED,
    weight: 3,
    description: 'Resource limit exceeded may indicate runaway process'
  },
  {
    eventType: AuditEventType.VALIDATION_FAILED,
    weight: 2,
    description: 'Validation failure may indicate malformed input or attack'
  },
  {
    eventType: AuditEventType.PERMISSION_CHECK,
    weight: 5,
    condition: (entry) => entry.decision === 'denied',
    description: 'Permission denial for any operation'
  },
  {
    eventType: AuditEventType.AGENT_FAILED,
    weight: 2,
    description: 'Agent failure may indicate systemic issues'
  },
  {
    eventType: AuditEventType.AGENT_TIMEOUT,
    weight: 2,
    description: 'Agent timeout may indicate resource contention'
  },
  {
    eventType: AuditEventType.NETWORK_BLOCKED,
    weight: 3,
    description: 'Blocked network request may indicate policy enforcement'
  },
  {
    eventType: AuditEventType.FILE_WRITE,
    weight: 1,
    condition: (entry) => {
      const target = entry.target || '';
      return target.includes('..') || target.includes('/') || target.includes('\\');
    },
    description: 'File write to potentially sensitive path'
  },
  {
    eventType: AuditEventType.CONFIG_CHANGED,
    weight: 4,
    description: 'Configuration changes can affect system behavior'
  }
];

export class RiskScorer {
  private rules: RiskScoringRule[];

  constructor(rules?: RiskScoringRule[]) {
    this.rules = rules ? [...rules] : [...DEFAULT_RISK_RULES];
  }

  addRule(rule: RiskScoringRule): void {
    this.rules.push(rule);
  }

  calculateScore(entry: AuditLogEntry): number {
    let score = 0;

    for (const rule of this.rules) {
      const matchesType = rule.eventType === '*' || rule.eventType === entry.eventType;
      if (!matchesType) continue;

      if (rule.condition && !rule.condition(entry)) continue;

      score += rule.weight;
    }

    if (entry.decision === 'denied') {
      score += 1;
    }

    if (entry.decision === 'error') {
      score += 0.5;
    }

    if (entry.severity === AuditSeverity.CRITICAL) {
      score *= 1.5;
    } else if (entry.severity === AuditSeverity.ERROR) {
      score *= 1.25;
    } else if (entry.severity === AuditSeverity.WARNING) {
      score *= 1.1;
    }

    return Math.round(score * 100) / 100;
  }

  getRules(): RiskScoringRule[] {
    return [...this.rules];
  }
}

export class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private maxSize: number;
  private persistencePath?: string;
  private flushInterval?: NodeJS.Timeout;
  private listeners: Map<string, Function[]> = new Map();
  private riskScorer: RiskScorer;
  private alertRules: { severity: AuditSeverity; callback: Function }[] = [];

  constructor(options: {
    maxSize?: number;
    persistencePath?: string;
    flushIntervalMs?: number;
    riskScorer?: RiskScorer;
  } = {}) {
    this.maxSize = options.maxSize ?? 100000;
    this.persistencePath = options.persistencePath;
    this.riskScorer = options.riskScorer ?? new RiskScorer();

    if (options.flushIntervalMs && this.persistencePath) {
      this.flushInterval = setInterval(() => {
        this.flush().catch(() => {});
      }, options.flushIntervalMs);
    }
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
      riskScore: this.riskScorer.calculateScore(entry as AuditLogEntry)
    };

    this.entries.push(fullEntry);

    if (this.entries.length > this.maxSize) {
      const overflow = this.entries.length - this.maxSize;
      this.entries.splice(0, overflow);
    }

    this.emitEvent(fullEntry.eventType, fullEntry);
    this.emitEvent('log', fullEntry);

    return fullEntry;
  }

  logAgentEvent(
    eventType: AuditEventType,
    sessionId: string,
    agentId: string,
    agentType: string,
    metadata: Record<string, any> = {}
  ): AuditLogEntry {
    const severity = this.inferSeverityForEventType(eventType);
    return this.log({
      eventType,
      severity,
      sessionId,
      agentId,
      agentType,
      metadata
    });
  }

  logToolEvent(
    tool: string,
    action: string,
    target: string,
    decision: string,
    sessionId: string,
    agentId?: string
  ): AuditLogEntry {
    const eventType = decision === 'denied'
      ? AuditEventType.TOOL_DENIED
      : AuditEventType.TOOL_INVOKED;
    const severity = decision === 'denied'
      ? AuditSeverity.WARNING
      : AuditSeverity.INFO;

    return this.log({
      eventType,
      severity,
      sessionId,
      agentId,
      tool,
      action,
      target,
      decision: decision as 'allowed' | 'denied' | 'error',
      metadata: { action, target }
    });
  }

  logSecurityEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    description: string,
    sessionId: string,
    agentId?: string,
    metadata: Record<string, any> = {}
  ): AuditLogEntry {
    return this.log({
      eventType,
      severity,
      sessionId,
      agentId,
      metadata: {
        ...metadata,
        description
      }
    });
  }

  logResourceEvent(
    eventType: AuditEventType,
    usage: { memoryMB: number; cpuPercent: number; tokens: number },
    sessionId: string,
    agentId?: string
  ): AuditLogEntry {
    const severity = eventType === AuditEventType.RESOURCE_EXCEEDED
      ? AuditSeverity.ERROR
      : AuditSeverity.WARNING;

    return this.log({
      eventType,
      severity,
      sessionId,
      agentId,
      resourceUsage: usage,
      metadata: { resourceUsage: usage }
    });
  }

  query(filter: AuditQuery): AuditLogEntry[] {
    let results = [...this.entries];

    if (filter.startTime) {
      results = results.filter(e => e.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter(e => e.timestamp <= filter.endTime!);
    }
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      const typeSet = new Set(filter.eventTypes);
      results = results.filter(e => typeSet.has(e.eventType));
    }
    if (filter.severities && filter.severities.length > 0) {
      const sevSet = new Set(filter.severities);
      results = results.filter(e => sevSet.has(e.severity));
    }
    if (filter.agentId) {
      results = results.filter(e => e.agentId === filter.agentId);
    }
    if (filter.agentType) {
      results = results.filter(e => e.agentType === filter.agentType);
    }
    if (filter.sessionId) {
      results = results.filter(e => e.sessionId === filter.sessionId);
    }
    if (filter.tool) {
      results = results.filter(e => e.tool === filter.tool);
    }
    if (filter.minRiskScore !== undefined) {
      results = results.filter(e => (e.riskScore ?? 0) >= filter.minRiskScore!);
    }

    const sortBy = filter.sortBy ?? 'timestamp';
    const sortOrder = filter.sortOrder ?? 'desc';

    results.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'timestamp') {
        cmp = a.timestamp.getTime() - b.timestamp.getTime();
      } else if (sortBy === 'severity') {
        cmp = this.severityWeight(a.severity) - this.severityWeight(b.severity);
      } else if (sortBy === 'riskScore') {
        cmp = (a.riskScore ?? 0) - (b.riskScore ?? 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;

    return results.slice(offset, offset + limit);
  }

  getEventsByAgent(agentId: string, limit: number = 100): AuditLogEntry[] {
    return this.query({ agentId, limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  getEventsBySession(sessionId: string, limit: number = 100): AuditLogEntry[] {
    return this.query({ sessionId, limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  getEventsByType(eventType: AuditEventType, limit: number = 100): AuditLogEntry[] {
    return this.query({ eventTypes: [eventType], limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  getHighRiskEvents(minRiskScore: number = 5, limit: number = 100): AuditLogEntry[] {
    return this.query({ minRiskScore, limit, sortBy: 'riskScore', sortOrder: 'desc' });
  }

  getFailedOperations(limit: number = 100): AuditLogEntry[] {
    return this.entries
      .filter(e =>
        e.decision === 'denied' ||
        e.decision === 'error' ||
        e.eventType === AuditEventType.AGENT_FAILED ||
        e.eventType === AuditEventType.AGENT_TIMEOUT ||
        e.eventType === AuditEventType.VALIDATION_FAILED
      )
      .slice(-limit)
      .reverse();
  }

  getTimeline(sessionId: string): AuditTimelineEntry[] {
    const sessionEvents = this.getEventsBySession(sessionId, 10000);
    return sessionEvents.map(e => ({
      timestamp: e.timestamp,
      eventType: e.eventType,
      severity: e.severity,
      summary: this.summarizeEvent(e),
      agentId: e.agentId,
      duration: e.duration,
      decision: e.decision
    }));
  }

  getStats(query?: AuditQuery): AuditStats {
    const entries = query ? this.query({ ...query, limit: Number.MAX_SAFE_INTEGER }) : [...this.entries];

    if (entries.length === 0) {
      return {
        totalEvents: 0,
        byEventType: {},
        bySeverity: {},
        byAgentType: {},
        averageRiskScore: 0,
        highRiskEvents: 0,
        failedOperations: 0,
        averageDuration: 0,
        timeRange: { start: new Date(), end: new Date() }
      };
    }

    const byEventType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byAgentType: Record<string, number> = {};

    let totalRiskScore = 0;
    let highRiskEvents = 0;
    let failedOperations = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const timestamps = entries.map(e => e.timestamp.getTime());

    for (const entry of entries) {
      byEventType[entry.eventType] = (byEventType[entry.eventType] ?? 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;

      if (entry.agentType) {
        byAgentType[entry.agentType] = (byAgentType[entry.agentType] ?? 0) + 1;
      }

      const risk = entry.riskScore ?? 0;
      totalRiskScore += risk;
      if (risk >= 5) highRiskEvents++;

      if (entry.decision === 'denied' || entry.decision === 'error' ||
          entry.eventType === AuditEventType.AGENT_FAILED ||
          entry.eventType === AuditEventType.AGENT_TIMEOUT) {
        failedOperations++;
      }

      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
        durationCount++;
      }
    }

    return {
      totalEvents: entries.length,
      byEventType,
      bySeverity,
      byAgentType,
      averageRiskScore: totalRiskScore / entries.length,
      highRiskEvents,
      failedOperations,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      timeRange: {
        start: new Date(Math.min(...timestamps)),
        end: new Date(Math.max(...timestamps))
      }
    };
  }

  getAgentStats(agentId: string): AuditStats {
    return this.getStats({ agentId });
  }

  getSessionStats(sessionId: string): AuditStats {
    return this.getStats({ sessionId });
  }

  calculateRiskScore(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'riskScore'>): number {
    return this.riskScorer.calculateScore(entry as AuditLogEntry);
  }

  detectAnomalies(timeWindowMs: number = 60000): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindowMs);
    const recentEvents = this.entries.filter(e => e.timestamp >= windowStart);

    if (recentEvents.length < 10) return anomalies;

    const agentEventCounts = new Map<string, number>();
    for (const e of recentEvents) {
      if (e.agentId) {
        agentEventCounts.set(e.agentId, (agentEventCounts.get(e.agentId) ?? 0) + 1);
      }
    }

    const averageCount = recentEvents.length / Math.max(agentEventCounts.size, 1);
    const frequencyThreshold = averageCount * 3;

    const affectedAgents: string[] = [];
    for (const [agentId, count] of agentEventCounts) {
      if (count > frequencyThreshold) {
        affectedAgents.push(agentId);
      }
    }

    if (affectedAgents.length > 0) {
      anomalies.push({
        type: 'frequency_spike',
        description: `Agents with unusually high event frequency detected in the last ${timeWindowMs / 1000}s`,
        severity: AuditSeverity.WARNING,
        affectedAgents,
        timestamp: now,
        details: {
          windowMs: timeWindowMs,
          threshold: frequencyThreshold,
          agentCounts: Object.fromEntries(agentEventCounts)
        }
      });
    }

    const permissionDenials = recentEvents.filter(
      e => e.eventType === AuditEventType.PERMISSION_CHECK && e.decision === 'denied'
    );
    if (permissionDenials.length >= 3) {
      const denialAgents = [...new Set(permissionDenials.map(e => e.agentId).filter(Boolean))] as string[];
      anomalies.push({
        type: 'permission_violation',
        description: `Multiple permission denials detected (${permissionDenials.length} in window)`,
        severity: AuditSeverity.ERROR,
        affectedAgents: denialAgents,
        timestamp: now,
        details: {
          denialCount: permissionDenials.length,
          events: permissionDenials.map(e => ({ id: e.id, agentId: e.agentId, target: e.target }))
        }
      });
    }

    const resourceEvents = recentEvents.filter(
      e => e.eventType === AuditEventType.RESOURCE_EXCEEDED || e.eventType === AuditEventType.RESOURCE_WARNING
    );
    if (resourceEvents.length >= 2) {
      const resourceAgents = [...new Set(resourceEvents.map(e => e.agentId).filter(Boolean))] as string[];
      anomalies.push({
        type: 'resource_abuse',
        description: `Multiple resource limit events detected (${resourceEvents.length} in window)`,
        severity: AuditSeverity.WARNING,
        affectedAgents: resourceAgents,
        timestamp: now,
        details: {
          eventCount: resourceEvents.length,
          events: resourceEvents.map(e => ({
            id: e.id,
            type: e.eventType,
            usage: e.resourceUsage
          }))
        }
      });
    }

    const highRiskEvents = recentEvents.filter(e => (e.riskScore ?? 0) >= 5);
    if (highRiskEvents.length >= 2) {
      const highRiskAgents = [...new Set(highRiskEvents.map(e => e.agentId).filter(Boolean))] as string[];
      anomalies.push({
        type: 'unusual_pattern',
        description: `Multiple high-risk events detected in short time window`,
        severity: AuditSeverity.WARNING,
        affectedAgents: highRiskAgents,
        timestamp: now,
        details: {
          eventCount: highRiskEvents.length,
          events: highRiskEvents.map(e => ({
            id: e.id,
            type: e.eventType,
            riskScore: e.riskScore
          }))
        }
      });
    }

    const deniedEvents = recentEvents.filter(e => e.decision === 'denied');
    const totalRecent = recentEvents.length;
    if (totalRecent >= 5 && deniedEvents.length / totalRecent > 0.5) {
      const deniedAgents = [...new Set(deniedEvents.map(e => e.agentId).filter(Boolean))] as string[];
      anomalies.push({
        type: 'permission_violation',
        description: `High denial rate: ${deniedEvents.length}/${totalRecent} events denied`,
        severity: AuditSeverity.ERROR,
        affectedAgents: deniedAgents,
        timestamp: now,
        details: {
          denialRate: deniedEvents.length / totalRecent,
          deniedCount: deniedEvents.length,
          totalCount: totalRecent
        }
      });
    }

    const timestamps = recentEvents.map(e => e.timestamp.getTime()).sort((a, b) => a - b);
    if (timestamps.length >= 5) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const maxInterval = Math.max(...intervals);

      if (maxInterval > avgInterval * 10 && avgInterval < 1000) {
        anomalies.push({
          type: 'time_anomaly',
          description: 'Unusual timing pattern detected in event stream',
          severity: AuditSeverity.INFO,
          affectedAgents: [],
          timestamp: now,
          details: {
            averageIntervalMs: avgInterval,
            maxIntervalMs: maxInterval,
            totalEvents: timestamps.length
          }
        });
      }
    }

    return anomalies;
  }

  onAlert(severity: AuditSeverity, callback: Function): void {
    this.alertRules.push({ severity, callback });
  }

  checkAlerts(): AuditAlert[] {
    const alerts: AuditAlert[] = [];
    const recent = this.entries.slice(-100);

    const deniedCount = recent.filter(e => e.decision === 'denied').length;
    if (deniedCount >= 5) {
      alerts.push({
        id: randomUUID(),
        severity: AuditSeverity.ERROR,
        message: `${deniedCount} denied operations in recent activity`,
        eventType: AuditEventType.TOOL_DENIED,
        timestamp: new Date(),
        acknowledged: false
      });
    }

    const criticalEvents = recent.filter(e => e.severity === AuditSeverity.CRITICAL);
    for (const event of criticalEvents) {
      alerts.push({
        id: randomUUID(),
        severity: AuditSeverity.CRITICAL,
        message: `Critical event: ${event.eventType} - ${event.reason ?? 'no reason provided'}`,
        eventType: event.eventType,
        agentId: event.agentId,
        timestamp: new Date(),
        acknowledged: false
      });
    }

    const highRisk = recent.filter(e => (e.riskScore ?? 0) >= 7);
    for (const event of highRisk) {
      alerts.push({
        id: randomUUID(),
        severity: AuditSeverity.WARNING,
        message: `High risk event detected (score: ${event.riskScore}): ${event.eventType}`,
        eventType: event.eventType,
        agentId: event.agentId,
        timestamp: new Date(),
        acknowledged: false
      });
    }

    for (const alert of alerts) {
      for (const rule of this.alertRules) {
        if (alert.severity === rule.severity) {
          rule.callback(alert);
        }
      }
    }

    return alerts;
  }

  getActiveAlerts(): AuditAlert[] {
    return this.checkAlerts();
  }

  async exportJSON(filePath: string): Promise<void> {
    const data = JSON.stringify(this.entries, (key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }, 2);

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, data, 'utf-8');
  }

  async exportCSV(filePath: string): Promise<void> {
    const headers = [
      'id', 'timestamp', 'eventType', 'severity', 'sessionId',
      'agentId', 'agentType', 'tool', 'action', 'target',
      'decision', 'reason', 'duration', 'riskScore',
      'memoryMB', 'cpuPercent', 'tokens'
    ];

    const rows = this.entries.map(e => [
      e.id,
      e.timestamp.toISOString(),
      e.eventType,
      e.severity,
      e.sessionId,
      e.agentId ?? '',
      e.agentType ?? '',
      e.tool ?? '',
      e.action ?? '',
      e.target ?? '',
      e.decision ?? '',
      e.reason ?? '',
      e.duration?.toString() ?? '',
      e.riskScore?.toString() ?? '',
      e.resourceUsage?.memoryMB?.toString() ?? '',
      e.resourceUsage?.cpuPercent?.toString() ?? '',
      e.resourceUsage?.tokens?.toString() ?? ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, csv, 'utf-8');
  }

  exportReport(sessionId?: string): string {
    const stats = sessionId ? this.getSessionStats(sessionId) : this.getStats();
    const entries = sessionId ? this.getEventsBySession(sessionId, 10000) : this.entries;
    const lines: string[] = [];

    lines.push('='.repeat(72));
    lines.push('AUDIT LOG REPORT');
    lines.push('='.repeat(72));
    lines.push(`Generated: ${new Date().toISOString()}`);
    if (sessionId) {
      lines.push(`Session:   ${sessionId}`);
    }
    lines.push('');

    lines.push('--- SUMMARY ---');
    lines.push(`Total Events:          ${stats.totalEvents}`);
    lines.push(`High Risk Events:      ${stats.highRiskEvents}`);
    lines.push(`Failed Operations:     ${stats.failedOperations}`);
    lines.push(`Avg Risk Score:        ${stats.averageRiskScore.toFixed(2)}`);
    lines.push(`Avg Duration (ms):     ${stats.averageDuration.toFixed(2)}`);
    lines.push(`Time Range:            ${stats.timeRange.start.toISOString()} to ${stats.timeRange.end.toISOString()}`);
    lines.push('');

    lines.push('--- EVENTS BY TYPE ---');
    const sortedTypes = Object.entries(stats.byEventType).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      lines.push(`  ${type.padEnd(30)} ${count}`);
    }
    lines.push('');

    lines.push('--- EVENTS BY SEVERITY ---');
    const sevOrder: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
    const sortedSev = Object.entries(stats.bySeverity).sort((a, b) =>
      (sevOrder[a[0]] ?? 4) - (sevOrder[b[0]] ?? 4)
    );
    for (const [sev, count] of sortedSev) {
      lines.push(`  ${sev.toUpperCase().padEnd(12)} ${count}`);
    }
    lines.push('');

    if (Object.keys(stats.byAgentType).length > 0) {
      lines.push('--- EVENTS BY AGENT TYPE ---');
      const sortedAgents = Object.entries(stats.byAgentType).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sortedAgents) {
        lines.push(`  ${type.padEnd(30)} ${count}`);
      }
      lines.push('');
    }

    const failed = entries.filter(e =>
      e.decision === 'denied' || e.decision === 'error' ||
      e.eventType === AuditEventType.AGENT_FAILED
    );
    if (failed.length > 0) {
      lines.push('--- FAILED/DENIED OPERATIONS (last 20) ---');
      const recentFailed = failed.slice(-20);
      for (const e of recentFailed) {
        lines.push(`  [${e.timestamp.toISOString()}] ${e.eventType} | ${e.decision ?? 'error'} | agent=${e.agentId ?? 'n/a'} | ${e.reason ?? e.target ?? ''}`);
      }
      lines.push('');
    }

    const highRisk = entries.filter(e => (e.riskScore ?? 0) >= 5);
    if (highRisk.length > 0) {
      lines.push('--- HIGH RISK EVENTS (score >= 5, last 20) ---');
      const recentHigh = highRisk.slice(-20);
      for (const e of recentHigh) {
        lines.push(`  [${e.timestamp.toISOString()}] score=${e.riskScore} | ${e.eventType} | agent=${e.agentId ?? 'n/a'} | ${e.target ?? ''}`);
      }
      lines.push('');
    }

    lines.push('='.repeat(72));
    lines.push('END OF REPORT');
    lines.push('='.repeat(72));

    return lines.join('\n');
  }

  async flush(): Promise<void> {
    if (!this.persistencePath) return;

    const data = JSON.stringify(this.entries, (key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }, 2);

    await fs.promises.mkdir(path.dirname(this.persistencePath), { recursive: true });
    await fs.promises.writeFile(this.persistencePath, data, 'utf-8');
  }

  async load(): Promise<void> {
    if (!this.persistencePath) return;

    try {
      const data = await fs.promises.readFile(this.persistencePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.entries = parsed.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp)
      }));
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  clear(): void {
    this.entries = [];
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }

  private severityWeight(severity: AuditSeverity): number {
    switch (severity) {
      case AuditSeverity.CRITICAL: return 4;
      case AuditSeverity.ERROR: return 3;
      case AuditSeverity.WARNING: return 2;
      case AuditSeverity.INFO: return 1;
      default: return 0;
    }
  }

  private inferSeverityForEventType(eventType: AuditEventType): AuditSeverity {
    switch (eventType) {
      case AuditEventType.AGENT_SPAWNED:
      case AuditEventType.AGENT_COMPLETED:
      case AuditEventType.TOOL_INVOKED:
      case AuditEventType.FILE_READ:
      case AuditEventType.VALIDATION_PASSED:
      case AuditEventType.CHECKPOINT_CREATED:
      case AuditEventType.SESSION_STARTED:
      case AuditEventType.SESSION_COMPLETED:
      case AuditEventType.PERMISSION_CHECK:
        return AuditSeverity.INFO;

      case AuditEventType.AGENT_TIMEOUT:
      case AuditEventType.TOOL_DENIED:
      case AuditEventType.NETWORK_BLOCKED:
      case AuditEventType.SECRET_DENIED:
      case AuditEventType.RESOURCE_WARNING:
      case AuditEventType.VALIDATION_FAILED:
      case AuditEventType.CONFIG_CHANGED:
        return AuditSeverity.WARNING;

      case AuditEventType.AGENT_FAILED:
      case AuditEventType.FILE_DELETE:
      case AuditEventType.NETWORK_REQUEST:
      case AuditEventType.SECRET_ACCESSED:
      case AuditEventType.ERROR_FIX_ATTEMPT:
      case AuditEventType.SESSION_FAILED:
        return AuditSeverity.ERROR;

      case AuditEventType.RESOURCE_EXCEEDED:
      case AuditEventType.ANOMALY_DETECTED:
        return AuditSeverity.CRITICAL;

      default:
        return AuditSeverity.INFO;
    }
  }

  private summarizeEvent(entry: AuditLogEntry): string {
    switch (entry.eventType) {
      case AuditEventType.AGENT_SPAWNED:
        return `Agent spawned (${entry.agentType})`;
      case AuditEventType.AGENT_COMPLETED:
        return `Agent completed${entry.duration ? ` in ${entry.duration}ms` : ''}`;
      case AuditEventType.AGENT_FAILED:
        return `Agent failed: ${entry.reason ?? 'unknown'}`;
      case AuditEventType.AGENT_KILLED:
        return `Agent killed: ${entry.reason ?? 'manual termination'}`;
      case AuditEventType.AGENT_TIMEOUT:
        return `Agent timed out after ${entry.duration ?? '?'}ms`;
      case AuditEventType.TOOL_INVOKED:
        return `Tool invoked: ${entry.tool} -> ${entry.action}`;
      case AuditEventType.TOOL_DENIED:
        return `Tool denied: ${entry.tool} -> ${entry.action} (${entry.reason ?? 'permission denied'})`;
      case AuditEventType.FILE_READ:
        return `File read: ${entry.target}`;
      case AuditEventType.FILE_WRITE:
        return `File write: ${entry.target}`;
      case AuditEventType.FILE_DELETE:
        return `File delete: ${entry.target}`;
      case AuditEventType.BASH_EXECUTED:
        return `Bash executed: ${entry.action}`;
      case AuditEventType.NETWORK_REQUEST:
        return `Network request: ${entry.target}`;
      case AuditEventType.NETWORK_BLOCKED:
        return `Network blocked: ${entry.target}`;
      case AuditEventType.SECRET_ACCESSED:
        return `Secret accessed: ${entry.target}`;
      case AuditEventType.SECRET_DENIED:
        return `Secret denied: ${entry.target}`;
      case AuditEventType.PERMISSION_CHECK:
        return `Permission ${entry.decision}: ${entry.target}`;
      case AuditEventType.VALIDATION_PASSED:
        return `Validation passed: ${entry.action}`;
      case AuditEventType.VALIDATION_FAILED:
        return `Validation failed: ${entry.action} - ${entry.reason ?? ''}`;
      case AuditEventType.ERROR_FIX_ATTEMPT:
        return `Error fix attempted: ${entry.reason ?? ''}`;
      case AuditEventType.CHECKPOINT_CREATED:
        return `Checkpoint created: ${entry.target}`;
      case AuditEventType.SESSION_STARTED:
        return 'Session started';
      case AuditEventType.SESSION_COMPLETED:
        return 'Session completed';
      case AuditEventType.SESSION_FAILED:
        return `Session failed: ${entry.reason ?? ''}`;
      case AuditEventType.RESOURCE_WARNING:
        return `Resource warning: memory=${entry.resourceUsage?.memoryMB ?? '?'}MB cpu=${entry.resourceUsage?.cpuPercent ?? '?'}%`;
      case AuditEventType.RESOURCE_EXCEEDED:
        return `Resource exceeded: memory=${entry.resourceUsage?.memoryMB ?? '?'}MB cpu=${entry.resourceUsage?.cpuPercent ?? '?'}%`;
      case AuditEventType.ANOMALY_DETECTED:
        return `Anomaly detected: ${entry.reason ?? ''}`;
      case AuditEventType.CONFIG_CHANGED:
        return `Config changed: ${entry.target}`;
      default:
        return `${entry.eventType}`;
    }
  }

  private emitEvent(eventName: string, data: any): void {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch {
          // listener errors are swallowed
        }
      }
    }
  }

  on(eventName: string, callback: Function): void {
    const existing = this.listeners.get(eventName) ?? [];
    existing.push(callback);
    this.listeners.set(eventName, existing);
  }

  off(eventName: string, callback: Function): void {
    const existing = this.listeners.get(eventName);
    if (existing) {
      const idx = existing.indexOf(callback);
      if (idx >= 0) existing.splice(idx, 1);
    }
  }
}
