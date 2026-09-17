import { invoke } from '@tauri-apps/api/core';
import { NovaError } from '../types/errors';
import { useNotificationStore } from '../store/notificationStore';

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

const COMMAND_LABELS: Record<string, string> = {
  read_file: 'Reading file',
  write_file: 'Writing file',
  list_dir: 'Listing directory',
  send_ai_message: 'AI request',
  stream_ai_message: 'AI streaming',
  spawn_agent: 'Spawning agent',
  kill_agent: 'Stopping agent',
  git_status: 'Git status',
  git_diff: 'Git diff',
  git_commit: 'Git commit',
  spawn_terminal: 'Starting terminal',
  send_input: 'Terminal command',
  execute_pattern: 'Executing pattern',
  trigger_heal: 'Running diagnostics',
  browser_navigate: 'Navigating',
  search_mcp_tools: 'Searching tools',
  execute_mcp_tool: 'Executing tool',
};

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const debug = (import.meta as any).env?.VITE_DEBUG === 'true';
  const notify = useNotificationStore.getState();

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
    const label = COMMAND_LABELS[command] || command;

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
        const finalError = parseError(retryError);
        notify.error(`${label} failed`, finalError.message);
        throw finalError;
      }
    }

    notify.error(`${label} failed`, novaError.message);
    throw novaError;
  }
}
