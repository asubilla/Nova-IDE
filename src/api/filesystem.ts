import { tauriInvoke } from './tauri';

export const fsAPI = {
  readFile: (path: string) =>
    tauriInvoke<string>('read_file', { path }),

  writeFile: (path: string, content: string) =>
    tauriInvoke<void>('write_file', { path, content }),

  listDir: (path: string) =>
    tauriInvoke<string[]>('list_dir', { path }),
};
