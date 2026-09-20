import { describe, it, expect, beforeEach } from 'vitest';
import { AppErrorFactory, ErrorHandler, ErrorCode } from '../src/errors/error-system';

describe('AppErrorFactory', () => {
  it('should create error with code and message', () => {
    const error = AppErrorFactory.create(ErrorCode.AGENT_TIMEOUT, 'Agent timed out');
    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.message).toBe('Agent timed out');
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should create agent timeout error', () => {
    const error = AppErrorFactory.agentTimeout('agent-1', 5000);
    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('should create sandbox violation error', () => {
    const error = AppErrorFactory.sandboxViolation('agent-1', 'file access');
    expect(error.code).toBe('SANDBOX_VIOLATION');
    expect(error.retryable).toBe(false);
  });

  it('should create budget exceeded error', () => {
    const error = AppErrorFactory.budgetExceeded('agent-1', 100, 150);
    expect(error.code).toBe('SECURITY_BUDGET_EXCEEDED');
    expect(error.details?.budget).toBe(100);
    expect(error.details?.actual).toBe(150);
  });
});

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  it('should track errors', () => {
    const error = AppErrorFactory.agentTimeout('agent-1', 5000);
    handler.handle(error);
    expect(handler.getRecentErrors().length).toBe(1);
  });

  it('should count errors by code', () => {
    handler.handle(AppErrorFactory.agentTimeout('agent-1', 5000));
    handler.handle(AppErrorFactory.agentTimeout('agent-2', 5000));
    expect(handler.getErrorCount(ErrorCode.AGENT_TIMEOUT)).toBe(2);
  });

  it('should return retryable errors', () => {
    handler.handle(AppErrorFactory.agentTimeout('agent-1', 5000));
    handler.handle(AppErrorFactory.sandboxViolation('agent-1', 'file access'));
    expect(handler.getRetryableErrors().length).toBe(1);
  });

  it('should clear errors', () => {
    handler.handle(AppErrorFactory.agentTimeout('agent-1', 5000));
    handler.clear();
    expect(handler.getRecentErrors().length).toBe(0);
  });
});
