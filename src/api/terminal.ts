import { tauriInvoke } from './tauri';

interface TerminalOutput {
  id: string;
  output: string;
}

export const terminalAPI = {
  spawn: (id: string, cwd: string) =>
    tauriInvoke<TerminalOutput>('spawn_terminal', { id, cwd }),

  sendInput: (id: string, input: string) =>
    tauriInvoke<TerminalOutput>('send_input', { id, input }),

  getOutput: (id: string) =>
    tauriInvoke<TerminalOutput>('get_terminal_output', { id }),
};
