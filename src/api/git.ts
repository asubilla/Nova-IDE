import { tauriInvoke } from './tauri';

export const gitAPI = {
  status: () =>
    tauriInvoke<string>('git_status'),

  diff: () =>
    tauriInvoke<string>('git_diff'),

  commit: (message: string) =>
    tauriInvoke<string>('git_commit', { message }),
};
