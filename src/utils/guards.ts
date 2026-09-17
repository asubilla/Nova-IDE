import type { Message } from '../types/ai';
import type { Agent } from '../types/agent';

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isMessage(value: unknown): value is Message {
  if (!isObject(value)) return false;
  const msg = value as Record<string, unknown>;
  return (
    isString(msg.id) &&
    isString(msg.role) &&
    ['user', 'assistant', 'system'].includes(msg.role) &&
    isString(msg.content) &&
    isNumber(msg.timestamp)
  );
}

export function isAIMessage(value: unknown): value is Message {
  return isMessage(value) && (value as Message).role === 'assistant';
}

export function isAgent(value: unknown): value is Agent {
  if (!isObject(value)) return false;
  const agent = value as Record<string, unknown>;
  return (
    isString(agent.id) &&
    isString(agent.name) &&
    isString(agent.status) &&
    ['running', 'done', 'waiting', 'error'].includes(agent.status) &&
    isString(agent.task) &&
    isNumber(agent.progress) &&
    isNumber(agent.startTime)
  );
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
