import * as fs from "fs";

interface EdgeCaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  userMessage: string;
  retryable: boolean;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(private threshold: number, private resetMs: number = 60000) {}

  canExecute(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && Date.now() - this.lastFailureTime >= this.resetMs) {
      this.state = "half-open";
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getState(): string {
    return this.state;
  }
}

export class EdgeCaseHandler {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private bulkheadSlots: Map<string, number> = new Map();
  private fileLocks: Map<string, boolean> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();

  async handleNetworkTimeout<T>(
    operation: string,
    retryFn: () => Promise<T>,
    maxRetries: number = 3,
    timeoutMs: number = 10000
  ): Promise<EdgeCaseResult<T>> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          retryFn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Network timeout: ${operation}`)), timeoutMs)
          ),
        ]);
        this.consecutiveErrors.set(operation, 0);
        return { success: true, data: result, userMessage: `${operation} completed successfully.`, retryable: false };
      } catch (err: any) {
        const attempts = (this.consecutiveErrors.get(operation) || 0) + 1;
        this.consecutiveErrors.set(operation, attempts);

        if (attempt === maxRetries) {
          return {
            success: false,
            error: err.message,
            userMessage: `Network timeout for ${operation} after ${maxRetries + 1} attempts. Check your network connection and try again.`,
            retryable: true,
          };
        }

        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    return {
      success: false,
      userMessage: `Network timeout for ${operation}.`,
      retryable: true,
    };
  }

  async handleRateLimit<T>(
    retryAfter: number,
    fn: () => Promise<T>
  ): Promise<EdgeCaseResult<T>> {
    const waitMs = Math.min(retryAfter * 1000, 120000);

    await new Promise((r) => setTimeout(r, waitMs));

    try {
      const result = await fn();
      return { success: true, data: result, userMessage: "Rate limit passed. Request completed.", retryable: false };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `Still rate-limited after waiting ${waitMs / 1000}s. Try again later.`,
        retryable: true,
      };
    }
  }

  async handleDiskFull(path: string): Promise<EdgeCaseResult<void>> {
    try {
      const stats = fs.statfsSync(path);
      const freeBytes = stats.bfree * stats.bsize;
      const freeMB = freeBytes / (1024 * 1024);

      if (freeMB < 10) {
        return {
          success: false,
          userMessage: `Disk is critically low on space (${freeMB.toFixed(1)}MB free). Please free up space at ${path}.`,
          retryable: false,
        };
      }

      return { success: true, userMessage: "Disk space is available.", retryable: false };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `Unable to check disk space at ${path}. The path may not exist.`,
        retryable: false,
      };
    }
  }

  async handlePermissionDenied(path: string): Promise<EdgeCaseResult<void>> {
    try {
      fs.accessSync(path, fs.constants.W_OK);
      return { success: true, userMessage: `Write access to ${path} is available.`, retryable: false };
    } catch {
      return {
        success: false,
        userMessage: `Permission denied for ${path}. Run as administrator or check file permissions.`,
        retryable: false,
      };
    }
  }

  async handleFileLock<T>(path: string, fn: () => Promise<T>): Promise<EdgeCaseResult<T>> {
    if (this.fileLocks.get(path)) {
      return {
        success: false,
        userMessage: `File ${path} is locked by another process. Wait and try again.`,
        retryable: true,
      };
    }

    this.fileLocks.set(path, true);
    try {
      const result = await fn();
      return { success: true, data: result, userMessage: `File operation on ${path} completed.`, retryable: false };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `File lock operation failed for ${path}: ${err.message}`,
        retryable: true,
      };
    } finally {
      this.fileLocks.delete(path);
    }
  }

  async handleConcurrentEdit<T>(
    path: string,
    edit: () => Promise<T>,
    conflictResolution: "retry" | "merge" | "fail" = "retry"
  ): Promise<EdgeCaseResult<T>> {
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await edit();
        this.consecutiveErrors.delete(`edit:${path}`);
        return { success: true, data: result, userMessage: `Edit to ${path} applied successfully.`, retryable: false };
      } catch (err: any) {
        const isConflict = err.message.includes("conflict") || err.message.includes("modified");

        if (isConflict && conflictResolution === "retry" && attempt < maxRetries - 1) {
          const backoff = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        if (isConflict && conflictResolution === "fail") {
          return {
            success: false,
            error: err.message,
            userMessage: `Concurrent edit conflict on ${path}. File was modified by another process.`,
            retryable: false,
          };
        }

        return {
          success: false,
          error: err.message,
          userMessage: `Failed to apply edit to ${path} after ${maxRetries} attempts.`,
          retryable: true,
        };
      }
    }

    return {
      success: false,
      userMessage: `Concurrent edit failed for ${path}.`,
      retryable: true,
    };
  }

  async handleCorruptedData<T>(
    data: string,
    recoverFn: (corrupted: string) => T | null
  ): Promise<EdgeCaseResult<T>> {
    try {
      const result = recoverFn(data);
      if (result !== null) {
        return { success: true, data: result, userMessage: "Corrupted data recovered successfully.", retryable: false };
      }
    } catch {}

    try {
      const cleaned = data
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
        .replace(/\uFFFD/g, "");
      const result = recoverFn(cleaned);
      if (result !== null) {
        return { success: true, data: result, userMessage: "Data cleaned and recovered.", retryable: false };
      }
    } catch {}

    return {
      success: false,
      userMessage: "Data is corrupted and could not be recovered. A backup may be needed.",
      retryable: false,
    };
  }

  async handleMemoryPressure(): Promise<EdgeCaseResult<void>> {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / (1024 * 1024);
    const heapTotalMB = mem.heapTotal / (1024 * 1024);
    const utilization = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;

    if (utilization > 90) {
      if (global.gc) {
        global.gc();
        const afterMem = process.memoryUsage();
        const afterMB = afterMem.heapUsed / (1024 * 1024);

        if (afterMB < heapUsedMB * 0.8) {
          return {
            success: true,
            userMessage: `Memory pressure relieved. Freed ${(heapUsedMB - afterMB).toFixed(1)}MB via garbage collection.`,
            retryable: false,
          };
        }
      }

      return {
        success: false,
        userMessage: `High memory usage (${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB, ${utilization.toFixed(1)}%). Consider reducing open tabs or restarting the application.`,
        retryable: true,
      };
    }

    return {
      success: true,
      userMessage: `Memory usage is normal (${heapUsedMB.toFixed(1)}MB, ${utilization.toFixed(1)}%).`,
      retryable: false,
    };
  }

  async handleInvalidInput<T>(
    input: unknown,
    validate: (input: unknown) => T | null,
    fieldName: string
  ): Promise<EdgeCaseResult<T>> {
    if (input === null || input === undefined) {
      return {
        success: false,
        userMessage: `Invalid input for ${fieldName}: value is required.`,
        retryable: false,
      };
    }

    if (typeof input === "string" && input.trim().length === 0) {
      return {
        success: false,
        userMessage: `Invalid input for ${fieldName}: value cannot be empty.`,
        retryable: false,
      };
    }

    try {
      const result = validate(input);
      if (result !== null) {
        return { success: true, data: result, userMessage: `${fieldName} is valid.`, retryable: false };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `Invalid input for ${fieldName}: ${err.message}`,
        retryable: false,
      };
    }

    return {
      success: false,
      userMessage: `Invalid input for ${fieldName}. Please check the format and try again.`,
      retryable: false,
    };
  }

  async handleGracefulDegradation<T>(
    feature: string,
    fallback: () => T
  ): Promise<EdgeCaseResult<T>> {
    try {
      const result = fallback();
      return {
        success: true,
        data: result,
        userMessage: `${feature} is unavailable. Using degraded mode with reduced functionality.`,
        retryable: false,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `${feature} failed and fallback is unavailable. Please check your configuration.`,
        retryable: false,
      };
    }
  }

  async handleCircuitBreaker<T>(
    name: string,
    fn: () => Promise<T>,
    threshold: number = 5,
    resetMs: number = 60000
  ): Promise<EdgeCaseResult<T>> {
    let breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(threshold, resetMs);
      this.circuitBreakers.set(name, breaker);
    }

    if (!breaker.canExecute()) {
      return {
        success: false,
        userMessage: `Service "${name}" is temporarily unavailable (circuit breaker open). It will retry automatically.`,
        retryable: true,
      };
    }

    try {
      const result = await fn();
      breaker.recordSuccess();
      return { success: true, data: result, userMessage: `${name} completed successfully.`, retryable: false };
    } catch (err: any) {
      breaker.recordFailure();
      return {
        success: false,
        error: err.message,
        userMessage: `${name} failed: ${err.message}`,
        retryable: true,
      };
    }
  }

  async handleBulkhead<T>(
    name: string,
    fn: () => Promise<T>,
    limit: number = 5
  ): Promise<EdgeCaseResult<T>> {
    const current = this.bulkheadSlots.get(name) || 0;

    if (current >= limit) {
      return {
        success: false,
        userMessage: `Too many concurrent operations for "${name}" (${current}/${limit}). Please wait.`,
        retryable: true,
      };
    }

    this.bulkheadSlots.set(name, current + 1);
    try {
      const result = await fn();
      return { success: true, data: result, userMessage: `${name} operation completed.`, retryable: false };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        userMessage: `${name} operation failed: ${err.message}`,
        retryable: true,
      };
    } finally {
      this.bulkheadSlots.set(name, (this.bulkheadSlots.get(name) || 1) - 1);
    }
  }

  getStats(): {
    circuitBreakers: Record<string, string>;
    bulkheadSlots: Record<string, number>;
    fileLocks: string[];
  } {
    const circuitBreakers: Record<string, string> = {};
    for (const [name, breaker] of this.circuitBreakers) {
      circuitBreakers[name] = breaker.getState();
    }

    const bulkheadSlots: Record<string, number> = {};
    for (const [name, count] of this.bulkheadSlots) {
      bulkheadSlots[name] = count;
    }

    return {
      circuitBreakers,
      bulkheadSlots,
      fileLocks: Array.from(this.fileLocks.keys()),
    };
  }
}
