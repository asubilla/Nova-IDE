import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AuditCategory = 'authentication' | 'authorization' | 'data-access' | 'system' | 'security';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  ip?: string;
  severity: AuditSeverity;
  category: AuditCategory;
}

export interface AuditFilter {
  userId?: string;
  action?: string;
  resource?: string;
  severity?: AuditSeverity;
  category?: AuditCategory;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface SecurityReport {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  bySeverity: Record<AuditSeverity, number>;
  failedLogins: number;
  suspiciousActivities: number;
  topUsers: Array<{ userId: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  timeRange: { start: Date; end: Date };
  riskScore: number;
  recommendations: string[];
}

// ─── AuditLogger ─────────────────────────────────────────────────────────────

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private logPath: string;
  private maxEntries: number;
  private flushInterval?: NodeJS.Timeout;

  constructor(logPath: string = './audit.log', maxEntries: number = 100000) {
    this.logPath = logPath;
    this.maxEntries = maxEntries;
  }

  logLogin(userId: string, success: boolean, ip?: string): AuditEntry {
    return this.log({
      userId,
      action: success ? 'login_success' : 'login_failure',
      resource: 'auth',
      details: { success, method: 'password' },
      ip,
      severity: success ? 'info' : 'warning',
      category: 'authentication',
    });
  }

  logLogout(userId: string): AuditEntry {
    return this.log({
      userId,
      action: 'logout',
      resource: 'auth',
      severity: 'info',
      category: 'authentication',
    });
  }

  logAction(userId: string, action: string, resource: string, details?: Record<string, unknown>): AuditEntry {
    return this.log({
      userId,
      action,
      resource,
      details,
      severity: 'info',
      category: this.inferCategory(action),
    });
  }

  logAccess(userId: string, resource: string, granted: boolean): AuditEntry {
    return this.log({
      userId,
      action: granted ? 'access_granted' : 'access_denied',
      resource,
      severity: granted ? 'info' : 'warning',
      category: 'authorization',
    });
  }

  logModification(userId: string, resource: string, changes: Record<string, unknown>): AuditEntry {
    return this.log({
      userId,
      action: 'modify',
      resource,
      details: { changes },
      severity: 'info',
      category: 'data-access',
    });
  }

  logDeletion(userId: string, resource: string): AuditEntry {
    return this.log({
      userId,
      action: 'delete',
      resource,
      severity: 'warning',
      category: 'data-access',
    });
  }

  logError(userId: string, error: Error | string, context?: Record<string, unknown>): AuditEntry {
    const errorMessage = typeof error === 'string' ? error : error.message;
    return this.log({
      userId,
      action: 'error',
      resource: 'system',
      details: { error: errorMessage, stack: typeof error === 'object' ? error.stack : undefined, ...context },
      severity: 'error',
      category: 'system',
    });
  }

  logSuspiciousActivity(activity: {
    userId?: string;
    description: string;
    ip?: string;
    details?: Record<string, unknown>;
  }): AuditEntry {
    return this.log({
      userId: activity.userId,
      action: 'suspicious_activity',
      resource: 'security',
      details: { description: activity.description, ...activity.details },
      ip: activity.ip,
      severity: 'critical',
      category: 'security',
    });
  }

  logSystemEvent(event: {
    action: string;
    details?: Record<string, unknown>;
    severity?: AuditSeverity;
  }): AuditEntry {
    return this.log({
      action: event.action,
      resource: 'system',
      details: event.details,
      severity: event.severity ?? 'info',
      category: 'system',
    });
  }

  queryLogs(filter: AuditFilter): AuditEntry[] {
    let results = [...this.entries];

    if (filter.userId) {
      results = results.filter(e => e.userId === filter.userId);
    }
    if (filter.action) {
      results = results.filter(e => e.action === filter.action);
    }
    if (filter.resource) {
      results = results.filter(e => e.resource === filter.resource);
    }
    if (filter.severity) {
      results = results.filter(e => e.severity === filter.severity);
    }
    if (filter.category) {
      results = results.filter(e => e.category === filter.category);
    }
    if (filter.startDate) {
      results = results.filter(e => e.timestamp >= filter.startDate!);
    }
    if (filter.endDate) {
      results = results.filter(e => e.timestamp <= filter.endDate!);
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  exportLogs(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(
        this.entries.map(e => ({ ...e, timestamp: e.timestamp.toISOString() })),
        null,
        2
      );
    }

    const headers = 'id,timestamp,userId,action,resource,severity,category,ip';
    const rows = this.entries.map(e => {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        escape(e.id),
        escape(e.timestamp.toISOString()),
        escape(e.userId ?? ''),
        escape(e.action),
        escape(e.resource),
        escape(e.severity),
        escape(e.category),
        escape(e.ip ?? ''),
      ].join(',');
    });

    return [headers, ...rows].join('\n');
  }

  generateSecurityReport(): SecurityReport {
    const byCategory = {} as Record<AuditCategory, number>;
    const bySeverity = {} as Record<AuditSeverity, number>;
    const userCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();

    for (const entry of this.entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;

      if (entry.userId) {
        userCounts.set(entry.userId, (userCounts.get(entry.userId) ?? 0) + 1);
      }
      actionCounts.set(entry.action, (actionCounts.get(entry.action) ?? 0) + 1);
    }

    const failedLogins = this.entries.filter(e => e.action === 'login_failure').length;
    const suspiciousActivities = this.entries.filter(e => e.action === 'suspicious_activity').length;

    const topUsers = [...userCounts.entries()]
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topActions = [...actionCounts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const timestamps = this.entries.map(e => e.timestamp.getTime());
    const timeRange = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date(),
    };

    const riskScore = this.calculateRiskScore();

    const recommendations: string[] = [];
    if (failedLogins > 10) {
      recommendations.push('High number of failed logins detected. Consider implementing account lockout.');
    }
    if (suspiciousActivities > 0) {
      recommendations.push('Suspicious activities detected. Review security logs immediately.');
    }
    if ((bySeverity['critical'] ?? 0) > 0) {
      recommendations.push('Critical severity events found. Immediate investigation required.');
    }
    if ((byCategory['authorization'] ?? 0) > 50) {
      recommendations.push('High number of authorization events. Review access control policies.');
    }

    return {
      totalEvents: this.entries.length,
      byCategory,
      bySeverity,
      failedLogins,
      suspiciousActivities,
      topUsers,
      topActions,
      timeRange,
      riskScore,
      recommendations,
    };
  }

  async flush(): Promise<void> {
    const data = this.entries.map(e => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    }));

    const dir = path.dirname(this.logPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.logPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.logPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.entries = parsed.map((e: Record<string, unknown>) => ({
        ...e,
        timestamp: new Date(e.timestamp as string),
      })) as AuditEntry[];
    } catch {
      // file not found or invalid
    }
  }

  clear(): void {
    this.entries = [];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }

  private log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
    };

    this.entries.push(fullEntry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    return fullEntry;
  }

  private inferCategory(action: string): AuditCategory {
    if (action.includes('read') || action.includes('get') || action.includes('list')) {
      return 'data-access';
    }
    if (action.includes('write') || action.includes('create') || action.includes('update') || action.includes('modify')) {
      return 'data-access';
    }
    if (action.includes('delete') || action.includes('remove')) {
      return 'data-access';
    }
    if (action.includes('auth') || action.includes('login') || action.includes('token')) {
      return 'authentication';
    }
    if (action.includes('permission') || action.includes('access') || action.includes('role')) {
      return 'authorization';
    }
    return 'system';
  }

  private calculateRiskScore(): number {
    let score = 0;

    const criticalCount = this.entries.filter(e => e.severity === 'critical').length;
    const errorCount = this.entries.filter(e => e.severity === 'error').length;
    const warningCount = this.entries.filter(e => e.severity === 'warning').length;

    score += criticalCount * 10;
    score += errorCount * 5;
    score += warningCount * 2;

    const suspiciousCount = this.entries.filter(e => e.action === 'suspicious_activity').length;
    score += suspiciousCount * 20;

    const failedLoginCount = this.entries.filter(e => e.action === 'login_failure').length;
    score += failedLoginCount * 3;

    return Math.min(100, Math.round(score / Math.max(this.entries.length, 1) * 100));
  }
}
