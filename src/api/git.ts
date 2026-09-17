import { tauriInvoke } from './tauri';

export interface GitFileStatus {
  path: string;
  status: string;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileStatus[];
}

export interface GitDiffFile {
  path: string;
  diff: string;
}

export interface GitDiffResult {
  files: GitDiffFile[];
}

export interface GitCommitResult {
  success: boolean;
  message: string;
}

export const gitAPI = {
  status: (cwd: string = '.') =>
    tauriInvoke<GitStatusResult>('git_status', { cwd }),

  diff: (cwd: string = '.') =>
    tauriInvoke<GitDiffResult>('git_diff', { cwd }),

  commit: (cwd: string = '.', message: string, files: string[] = ['.']) =>
    tauriInvoke<GitCommitResult>('git_commit', { cwd, message, files }),
};
