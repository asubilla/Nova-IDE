import { tauriInvoke } from './tauri';

export const terminalAPI = {
  spawn: (shell?: string) =>
    tauriInvoke<string>('spawn_terminal', { shell }),

  sendInput: (id: string, input: string) =>
    tauriInvoke<void>('send_input', { id, input }),
};
