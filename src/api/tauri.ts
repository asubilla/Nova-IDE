import { invoke } from '@tauri-apps/api/core';
import { NovaError } from '../types/errors';

interface CommandErrorResponse {
  code?: string;
  message?: string;
}

function parseError(error: unknown): NovaError {
  if (typeof error === 'string') {
    const match = error.match(/^\[(\w+)\]\s*(.*)/);
    if (match) {
      return new NovaError(match[2] ?? error, match[1] ?? 'UNKNOWN_ERROR');
    }
    return new NovaError(error, 'TAURI_ERROR');
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const err = error as CommandErrorResponse;
    return new NovaError(err.message || 'Unknown error', err.code || 'UNKNOWN_ERROR', error);
  }
  return new NovaError(String(error), 'UNKNOWN_ERROR');
}

const RETRYABLE_CODES = new Set(['INTERNAL_ERROR', 'TERMINAL_ERROR', 'NETWORK_ERROR']);

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const debug = (import.meta as any).env?.VITE_DEBUG === 'true';

  if (debug) {
    console.debug(`[Nova] invoke: ${command}`, args);
  }

  try {
    const result = await invoke<T>(command, args);
    if (debug) {
      console.debug(`[Nova] invoke ok: ${command}`);
    }
    return result;
  } catch (error) {
    const novaError = parseError(error);

    if (debug) {
      console.error(`[Nova] invoke failed: ${command}`, novaError);
    }

    if (RETRYABLE_CODES.has(novaError.code)) {
      try {
        const result = await invoke<T>(command, args);
        if (debug) {
          console.debug(`[Nova] invoke retry ok: ${command}`);
        }
        return result;
      } catch (retryError) {
        throw parseError(retryError);
      }
    }

    throw novaError;
  }
}
