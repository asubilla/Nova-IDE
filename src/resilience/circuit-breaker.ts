import { EventEmitter } from 'events';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls: number;
}

export interface CircuitStats {
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  state: CircuitState;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttempt = 0;
  private totalCalls = 0;
  private successCalls = 0;
  private failureCalls = 0;

  constructor(private name: string, private config: CircuitBreakerConfig = { failureThreshold: 5, successThreshold: 3, timeout: 30000, halfOpenMaxCalls: 3 }) { super(); }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) throw new Error(`Circuit ${this.name} is OPEN`);
      this.state = 'half-open';
      this.emit('state-change', { name: this.name, state: this.state });
    }

    this.totalCalls++;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCalls++;
    this.lastSuccessTime = new Date();
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
        this.emit('state-change', { name: this.name, state: this.state });
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCalls++;
    this.lastFailureTime = new Date();
    this.failureCount++;
    if (this.state === 'half-open') {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.config.timeout;
      this.emit('state-change', { name: this.name, state: this.state });
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.config.timeout;
      this.emit('state-change', { name: this.name, state: this.state });
    }
  }

  getState(): CircuitState { return this.state; }
  getStats(): CircuitStats { return { totalCalls: this.totalCalls, successCalls: this.successCalls, failureCalls: this.failureCalls, lastFailureTime: this.lastFailureTime, lastSuccessTime: this.lastSuccessTime, state: this.state }; }
  reset(): void { this.state = 'closed'; this.failureCount = 0; this.successCount = 0; }
  forceOpen(): void { this.state = 'open'; this.nextAttempt = Date.now() + this.config.timeout; }
  forceClose(): void { this.state = 'closed'; this.failureCount = 0; this.successCount = 0; }
}
