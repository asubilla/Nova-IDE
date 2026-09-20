import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  maxConcurrent: number;
  blockDurationMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  blocked?: boolean;
}

export interface UsageInfo {
  key: string;
  count: number;
  firstRequest: Date;
  lastRequest: Date;
  blocked: boolean;
}

export interface RateLimitStats {
  totalKeys: number;
  blockedKeys: number;
  totalRequests: number;
  activeWindows: number;
  avgRequestsPerKey: number;
}

interface WindowEntry {
  count: number;
  windowStart: Date;
  firstRequest: Date;
  lastRequest: Date;
  concurrent: number;
}

interface BlockEntry {
  key: string;
  blockedAt: Date;
  expiresAt: Date;
  reason?: string;
}

// ─── RateLimiter ─────────────────────────────────────────────────────────────

export class RateLimiter {
  private config: RateLimitConfig;
  private windows: Map<string, WindowEntry> = new Map();
  private blocks: Map<string, BlockEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs ?? 60000,
      maxRequests: config.maxRequests ?? 100,
      maxConcurrent: config.maxConcurrent ?? 10,
      blockDurationMs: config.blockDurationMs ?? 300000,
    };

    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs);
  }

  check(key: string): RateLimitResult {
    const now = new Date();

    if (this.isBlocked(key)) {
      const block = this.blocks.get(key)!;
      return {
        allowed: false,
        remaining: 0,
        resetTime: block.expiresAt,
        blocked: true,
      };
    }

    const window = this.windows.get(key);
    const resetTime = new Date(now.getTime() + this.config.windowMs);

    if (!window) {
      this.windows.set(key, {
        count: 1,
        windowStart: now,
        firstRequest: now,
        lastRequest: now,
        concurrent: 1,
      });
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime,
      };
    }

    const elapsed = now.getTime() - window.windowStart.getTime();
    if (elapsed >= this.config.windowMs) {
      window.count = 1;
      window.windowStart = now;
      window.firstRequest = now;
      window.lastRequest = now;
      window.concurrent = 1;
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime,
      };
    }

    if (window.concurrent >= this.config.maxConcurrent) {
      return {
        allowed: false,
        remaining: Math.max(0, this.config.maxRequests - window.count),
        resetTime: new Date(window.windowStart.getTime() + this.config.windowMs),
      };
    }

    if (window.count >= this.config.maxRequests) {
      this.block(key, this.config.blockDurationMs, 'Rate limit exceeded');
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(window.windowStart.getTime() + this.config.windowMs),
        blocked: true,
      };
    }

    window.count++;
    window.concurrent++;
    window.lastRequest = now;

    return {
      allowed: true,
      remaining: this.config.maxRequests - window.count,
      resetTime: new Date(window.windowStart.getTime() + this.config.windowMs),
    };
  }

  increment(key: string): void {
    const now = new Date();
    const window = this.windows.get(key);

    if (!window || now.getTime() - window.windowStart.getTime() >= this.config.windowMs) {
      this.windows.set(key, {
        count: 1,
        windowStart: now,
        firstRequest: now,
        lastRequest: now,
        concurrent: 1,
      });
      return;
    }

    window.count++;
    window.lastRequest = now;
  }

  decrement(key: string): void {
    const window = this.windows.get(key);
    if (window && window.concurrent > 0) {
      window.concurrent--;
    }
  }

  reset(key: string): void {
    this.windows.delete(key);
    this.blocks.delete(key);
  }

  getUsage(key: string): UsageInfo {
    const window = this.windows.get(key);
    const blocked = this.isBlocked(key);

    if (!window) {
      return {
        key,
        count: 0,
        firstRequest: new Date(),
        lastRequest: new Date(),
        blocked,
      };
    }

    return {
      key,
      count: window.count,
      firstRequest: window.firstRequest,
      lastRequest: window.lastRequest,
      blocked,
    };
  }

  getTopUsers(limit: number = 10): UsageInfo[] {
    const entries: UsageInfo[] = [];

    for (const [key, window] of this.windows) {
      entries.push({
        key,
        count: window.count,
        firstRequest: window.firstRequest,
        lastRequest: window.lastRequest,
        blocked: this.isBlocked(key),
      });
    }

    entries.sort((a, b) => b.count - a.count);
    return entries.slice(0, limit);
  }

  block(key: string, durationMs?: number, reason?: string): void {
    const duration = durationMs ?? this.config.blockDurationMs;
    const now = new Date();

    this.blocks.set(key, {
      key,
      blockedAt: now,
      expiresAt: new Date(now.getTime() + duration),
      reason,
    });
  }

  unblock(key: string): void {
    this.blocks.delete(key);
  }

  isBlocked(key: string): boolean {
    const block = this.blocks.get(key);
    if (!block) return false;

    if (new Date() >= block.expiresAt) {
      this.blocks.delete(key);
      return false;
    }

    return true;
  }

  getBlockedKeys(): BlockEntry[] {
    const now = new Date();
    const active: BlockEntry[] = [];

    for (const [key, block] of this.blocks) {
      if (now < block.expiresAt) {
        active.push(block);
      } else {
        this.blocks.delete(key);
      }
    }

    return active;
  }

  getStats(): RateLimitStats {
    const now = new Date();
    let totalRequests = 0;
    let activeWindows = 0;

    for (const [, window] of this.windows) {
      const elapsed = now.getTime() - window.windowStart.getTime();
      if (elapsed < this.config.windowMs) {
        activeWindows++;
        totalRequests += window.count;
      }
    }

    const totalKeys = this.windows.size;
    let blockedKeys = 0;
    for (const [, block] of this.blocks) {
      if (now < block.expiresAt) {
        blockedKeys++;
      }
    }

    return {
      totalKeys,
      blockedKeys,
      totalRequests,
      activeWindows,
      avgRequestsPerKey: totalKeys > 0 ? totalRequests / totalKeys : 0,
    };
  }

  updateConfig(config: Partial<RateLimitConfig>): void {
    if (config.windowMs !== undefined) this.config.windowMs = config.windowMs;
    if (config.maxRequests !== undefined) this.config.maxRequests = config.maxRequests;
    if (config.maxConcurrent !== undefined) this.config.maxConcurrent = config.maxConcurrent;
    if (config.blockDurationMs !== undefined) this.config.blockDurationMs = config.blockDurationMs;
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  clear(): void {
    this.windows.clear();
    this.blocks.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }

  private cleanup(): void {
    const now = new Date();

    for (const [key, window] of this.windows) {
      if (now.getTime() - window.windowStart.getTime() >= this.config.windowMs * 2) {
        this.windows.delete(key);
      }
    }

    for (const [key, block] of this.blocks) {
      if (now >= block.expiresAt) {
        this.blocks.delete(key);
      }
    }
  }
}
