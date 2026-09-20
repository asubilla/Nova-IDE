export type UserStatusType =
  | 'online'
  | 'away'
  | 'busy'
  | 'do-not-disturb'
  | 'custom'
  | 'in-call'
  | 'presenting'
  | 'offline';

export type StatusExpiryOption = '30min' | '1hr' | '2hr' | 'today' | 'custom';

export interface UserStatus {
  userId: string;
  status: UserStatusType;
  message: string;
  emoji: string;
  customEmoji?: string;
  expiresAt?: Date;
  updatedAt: Date;
}

export interface StatusHistoryEntry {
  userId: string;
  status: UserStatusType;
  message: string;
  emoji: string;
  changedAt: Date;
}

export type StatusChangeCallback = (userId: string, oldStatus: UserStatus | null, newStatus: UserStatus) => void;

const STATUS_COLORS: Record<UserStatusType, string> = {
  online: '#22c55e',
  away: '#eab308',
  busy: '#ef4444',
  'do-not-disturb': '#dc2626',
  custom: '#6366f1',
  'in-call': '#3b82f6',
  presenting: '#a855f7',
  offline: '#9ca3af',
};

const STATUS_LABELS: Record<UserStatusType, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  'do-not-disturb': 'Do Not Disturb',
  custom: 'Custom',
  'in-call': 'In a Call',
  presenting: 'Presenting',
  offline: 'Offline',
};

const EXPIRY_MS: Record<StatusExpiryOption, number> = {
  '30min': 30 * 60 * 1000,
  '1hr': 60 * 60 * 1000,
  '2hr': 2 * 60 * 60 * 1000,
  today: (() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() - now.getTime();
  })(),
  custom: 0,
};

const MAX_MESSAGE_LENGTH = 100;

export class StatusMessages {
  private statuses = new Map<string, UserStatus>();
  private history: StatusHistoryEntry[] = [];
  private callbacks: StatusChangeCallback[] = [];
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  setStatus(userId: string, status: UserStatusType, message?: string): UserStatus {
    const oldStatus = this.statuses.get(userId) ?? null;
    const truncatedMessage = (message ?? '').slice(0, MAX_MESSAGE_LENGTH);

    const userStatus: UserStatus = {
      userId,
      status,
      message: truncatedMessage,
      emoji: STATUS_COLORS[status],
      updatedAt: new Date(),
    };

    this.statuses.set(userId, userStatus);
    this.history.push({
      userId,
      status,
      message: truncatedMessage,
      emoji: userStatus.emoji,
      changedAt: new Date(),
    });

    this.notifyCallbacks(userId, oldStatus, userStatus);
    return userStatus;
  }

  getStatus(userId: string): UserStatus | undefined {
    const status = this.statuses.get(userId);
    if (status?.expiresAt && status.expiresAt.getTime() < Date.now()) {
      this.clearStatus(userId);
      return undefined;
    }
    return status;
  }

  getAllStatuses(): UserStatus[] {
    const now = Date.now();
    const active: UserStatus[] = [];
    for (const status of this.statuses.values()) {
      if (status.expiresAt && status.expiresAt.getTime() < now) {
        this.clearStatus(status.userId);
        continue;
      }
      active.push(status);
    }
    return active;
  }

  clearStatus(userId: string): UserStatus | undefined {
    const oldStatus = this.statuses.get(userId);
    if (!oldStatus) return undefined;

    this.clearExpiryTimer(userId);
    this.statuses.delete(userId);

    this.history.push({
      userId,
      status: 'offline',
      message: '',
      emoji: STATUS_COLORS.offline,
      changedAt: new Date(),
    });

    return oldStatus;
  }

  setStatusEmoji(userId: string, emoji: string): UserStatus | undefined {
    const status = this.statuses.get(userId);
    if (!status) return undefined;
    status.customEmoji = emoji;
    status.updatedAt = new Date();
    return status;
  }

  setStatusExpiry(userId: string, expiry: StatusExpiryOption, customMs?: number): UserStatus | undefined {
    const status = this.statuses.get(userId);
    if (!status) return undefined;

    this.clearExpiryTimer(userId);

    const durationMs = expiry === 'custom' ? (customMs ?? 0) : EXPIRY_MS[expiry];
    if (durationMs > 0) {
      status.expiresAt = new Date(Date.now() + durationMs);
      const timer = setTimeout(() => {
        this.clearStatus(userId);
      }, durationMs);
      this.expiryTimers.set(userId, timer);
    } else {
      status.expiresAt = undefined;
    }

    status.updatedAt = new Date();
    return status;
  }

  renderStatusIndicator(status: UserStatusType): string {
    const color = STATUS_COLORS[status];
    if (status === 'do-not-disturb') {
      return `<span class="status-indicator" style="background:${color}" title="${STATUS_LABELS[status]}">&#8212;</span>`;
    }
    return `<span class="status-indicator" style="background:${color}" title="${STATUS_LABELS[status]}"></span>`;
  }

  renderStatusMessage(status: UserStatus): string {
    const indicator = this.renderStatusIndicator(status.status);
    const label = STATUS_LABELS[status.status];
    const emoji = status.customEmoji ?? status.emoji;
    const messagePart = status.message ? ` - ${status.message}` : '';
    return `<span class="status-message">${indicator} ${emoji} ${label}${messagePart}</span>`;
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  getHistory(userId?: string): StatusHistoryEntry[] {
    if (userId) {
      return this.history.filter((h) => h.userId === userId);
    }
    return [...this.history];
  }

  destroy(): void {
    for (const timer of this.expiryTimers.values()) {
      clearTimeout(timer);
    }
    this.expiryTimers.clear();
    this.callbacks = [];
  }

  private clearExpiryTimer(userId: string): void {
    const timer = this.expiryTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(userId);
    }
  }

  private notifyCallbacks(userId: string, oldStatus: UserStatus | null, newStatus: UserStatus): void {
    for (const cb of this.callbacks) {
      cb(userId, oldStatus, newStatus);
    }
  }
}
