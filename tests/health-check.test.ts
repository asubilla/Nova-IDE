import { describe, it, expect, beforeEach } from 'vitest';
import { HealthChecker } from '../src/health/health-check';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker('1.0.0');
  });

  it('should return healthy status with no checks', async () => {
    const status = await checker.runChecks();
    expect(status.status).toBe('healthy');
    expect(status.version).toBe('1.0.0');
  });

  it('should register and run checks', async () => {
    checker.registerCheck('test', async () => ({ status: 'pass', message: 'OK', duration: 0 }));
    const status = await checker.runChecks();
    expect(status.checks['test']?.status).toBe('pass');
  });

  it('should detect failing checks', async () => {
    checker.registerCheck('failing', async () => ({ status: 'fail', message: 'Failed', duration: 0 }));
    const status = await checker.runChecks();
    expect(status.status).toBe('unhealthy');
  });

  it('should track metrics', () => {
    checker.counter('requests', 5);
    checker.gauge('connections', 10);
    checker.histogram('latency', 100);
    const metrics = checker.getMetrics();
    expect(metrics.counters['requests']).toBe(5);
    expect(metrics.gauges['connections']).toBe(10);
    expect(metrics.histograms['latency']?.count).toBe(1);
  });
});
