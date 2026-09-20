import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', { failureThreshold: 3, successThreshold: 2, timeout: 1000, halfOpenMaxCalls: 3 });
  });

  it('should start in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('should open after failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.call(() => Promise.reject(new Error('fail'))); } catch {}
    }
    expect(breaker.getState()).toBe('open');
  });

  it('should reject calls when open', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.call(() => Promise.reject(new Error('fail'))); } catch {}
    }
    await expect(breaker.call(() => Promise.resolve('ok'))).rejects.toThrow('Circuit test is OPEN');
  });

  it('should move to half-open after timeout', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.call(() => Promise.reject(new Error('fail'))); } catch {}
    }
    expect(breaker.getState()).toBe('open');
    await new Promise(r => setTimeout(r, 1100));
    await breaker.call(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('half-open');
  });

  it('should close after success threshold in half-open', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.call(() => Promise.reject(new Error('fail'))); } catch {}
    }
    await new Promise(r => setTimeout(r, 1100));
    await breaker.call(() => Promise.resolve('ok'));
    await breaker.call(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('closed');
  });

  it('should reset failure count on success', async () => {
    await breaker.call(() => Promise.resolve('ok'));
    const stats = breaker.getStats();
    expect(stats.successCalls).toBe(1);
  });
});
