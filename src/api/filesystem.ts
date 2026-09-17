import { tauriInvoke } from './tauri';

export interface FileEntry {
  name: string;
  isDir: boolean;
}

export const fsAPI = {
  readFile: (path: string) =>
    tauriInvoke<string>('read_file', { path }),

  writeFile: (path: string, content: string) =>
    tauriInvoke<void>('write_file', { path, content }),

  listDir: (path: string) =>
    tauriInvoke<FileEntry[]>('list_dir', { path }),
};
