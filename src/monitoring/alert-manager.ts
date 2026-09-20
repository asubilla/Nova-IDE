import { EventEmitter } from 'events';
import { MetricsSnapshot } from './metrics-collector';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: MetricsSnapshot) => boolean;
  severity: AlertSeverity;
  message: string;
  cooldown: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'log';
  config: Record<string, unknown>;
}

export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 500) {
    super();
    this.maxHistorySize = maxHistorySize;
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('ruleAdded', rule);
  }

  removeRule(ruleId: string): boolean {
    const result = this.rules.delete(ruleId);
    if (result) {
      this.emit('ruleRemoved', ruleId);
    }
    return result;
  }

  checkAlerts(metrics: MetricsSnapshot): Alert[] {
    const triggeredAlerts: Alert[] = [];

    for (const [ruleId, rule] of Array.from(this.rules.entries())) {
      const cooldownEnd = this.cooldowns.get(ruleId) || 0;
      if (Date.now() < cooldownEnd) {
        continue;
      }

      try {
        if (rule.condition(metrics)) {
          const alert = this.createAlert(rule);
          triggeredAlerts.push(alert);
          this.cooldowns.set(ruleId, Date.now() + rule.cooldown);
        }
      } catch (error) {
        this.emit('ruleError', ruleId, error);
      }
    }

    return triggeredAlerts;
  }

  private createAlert(rule: AlertRule): Alert {
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    this.emit('alertCreated', alert);
    return alert;
  }

  fireAlert(alert: Alert): void {
    if (!this.activeAlerts.has(alert.id)) {
      this.activeAlerts.set(alert.id, alert);
      this.alertHistory.push(alert);
      if (this.alertHistory.length > this.maxHistorySize) {
        this.alertHistory.shift();
      }
    }

    this.emit('alertFired', alert);
    this.notifyAlert(alert);
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.activeAlerts.delete(alertId);
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(): Alert[] {
    return [...this.alertHistory];
  }

  addNotificationChannel(channel: NotificationChannel): string {
    const id = this.generateChannelId();
    this.notificationChannels.set(id, channel);
    this.emit('channelAdded', id, channel);
    return id;
  }

  removeNotificationChannel(channelId: string): boolean {
    const result = this.notificationChannels.delete(channelId);
    if (result) {
      this.emit('channelRemoved', channelId);
    }
    return result;
  }

  async notify(alert: Alert, channels?: string[]): Promise<void> {
    const targetChannels = channels
      ? Array.from(this.notificationChannels.entries()).filter(([id]) =>
          channels.includes(id)
        )
      : Array.from(this.notificationChannels.entries());

    for (const [, channel] of targetChannels) {
      try {
        await this.sendNotification(alert, channel);
      } catch (error) {
        this.emit('notificationError', alert, channel, error);
      }
    }
  }

  private async notifyAlert(alert: Alert): Promise<void> {
    for (const channel of Array.from(this.notificationChannels.values())) {
      try {
        await this.sendNotification(alert, channel);
      } catch (error) {
        this.emit('notificationError', alert, channel, error);
      }
    }
  }

  private async sendNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    switch (channel.type) {
      case 'log':
        this.logNotification(alert, channel);
        break;
      case 'webhook':
        await this.webhookNotification(alert, channel);
        break;
      case 'email':
        await this.emailNotification(alert, channel);
        break;
    }
  }

  private logNotification(alert: Alert, channel: NotificationChannel): void {
    const logLevel = alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info';
    const message = `[${logLevel.toUpperCase()}] Alert: ${alert.message} (${alert.severity})`;
    console.log(message);
    this.emit('logNotification', alert, message);
  }

  private async webhookNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    const url = channel.config.url as string;
    if (!url) {
      throw new Error('Webhook URL not configured');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: {
            id: alert.id,
            severity: alert.severity,
            message: alert.message,
            timestamp: alert.timestamp,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned status ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Webhook notification failed: ${(error as Error).message}`);
    }
  }

  private async emailNotification(alert: Alert, channel: NotificationChannel): Promise<void>
  {
    const emailConfig = channel.config as { to: string; from: string };
    if (!emailConfig.to || !emailConfig.from) {
      throw new Error('Email configuration incomplete');
    }

    this.emit('emailNotification', alert, emailConfig);
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateChannelId(): string {
    return `channel-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  clearHistory(): void {
    this.alertHistory = [];
    this.emit('historyCleared');
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getChannels(): NotificationChannel[] {
    return Array.from(this.notificationChannels.values());
  }
}
