import { execSync } from 'child_process';
import * as path from 'path';

export interface GitStatusFile {
  status: string;
  filePath: string;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: GitStatusFile[];
  modified: GitStatusFile[];
  deleted: GitStatusFile[];
  untracked: string[];
  conflicted: GitStatusFile[];
  clean: boolean;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: string | null;
  tracking: string | null;
}

export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

export interface GitBlameLine {
  hash: string;
  author: string;
  date: string;
  line: string;
}

export class RealGit {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
  }

  private exec(command: string): string {
    try {
      return execSync(`git ${command}`, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      throw new Error(`Git command failed: ${err.stderr || err.message || 'Unknown error'}`);
    }
  }

  init(): void {
    this.exec('init');
  }

  clone(url: string, dest?: string): void {
    const destArg = dest ? ` "${dest}"` : '';
    this.exec(`clone "${url}"${destArg}`);
  }

  status(): GitStatus {
    const output = this.exec('status --porcelain=v1 -b');
    const lines = output.split('\n').filter((line) => line.length > 0);

    let current: string | null = null;
    let tracking: string | null = null;
    let ahead = 0;
    let behind = 0;

    const staged: GitStatusFile[] = [];
    const modified: GitStatusFile[] = [];
    const deleted: GitStatusFile[] = [];
    const untracked: string[] = [];
    const conflicted: GitStatusFile[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        const branchInfo = line.substring(3);
        const branchParts = branchInfo.split('...');
        current = branchParts[0];
        if (branchParts.length > 1) {
          tracking = branchParts[1].split(' ')[0];
          const trackingInfo = branchParts[1];
          const aheadMatch = trackingInfo.match(/ahead (\d+)/);
          const behindMatch = trackingInfo.match(/behind (\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }
        continue;
      }

      if (line.startsWith('?? ')) {
        untracked.push(line.substring(3));
        continue;
      }

      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.substring(3);

      if (line.includes('UU ') || line.includes('AA ') || line.includes('DD ')) {
        conflicted.push({ status: 'U', filePath });
        continue;
      }

      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({ status: indexStatus, filePath });
      }

      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        modified.push({ status: workTreeStatus, filePath });
      }

      if (workTreeStatus === 'D' || indexStatus === 'D') {
        deleted.push({ status: 'D', filePath });
      }
    }

    return {
      current,
      tracking,
      ahead,
      behind,
      staged,
      modified,
      deleted,
      untracked,
      conflicted,
      clean: staged.length === 0 && modified.length === 0 && deleted.length === 0 && untracked.length === 0 && conflicted.length === 0,
    };
  }

  add(files: string | string[]): void {
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    this.exec(`add ${fileList}`);
  }

  commit(message: string): string {
    const escapedMessage = message.replace(/"/g, '\\"');
    return this.exec(`commit -m "${escapedMessage}"`);
  }

  push(remote: string = 'origin', branch?: string): string {
    const currentBranch = branch || this.getCurrentBranch();
    return this.exec(`push ${remote} ${currentBranch}`);
  }

  pull(remote: string = 'origin', branch?: string): string {
    const currentBranch = branch || this.getCurrentBranch();
    return this.exec(`pull ${remote} ${currentBranch}`);
  }

  fetch(remote?: string): string {
    if (remote) {
      return this.exec(`fetch ${remote}`);
    }
    return this.exec('fetch');
  }

  branch(list: boolean = true): GitBranch[] {
    if (list) {
      const output = this.exec('branch -vv');
      return output
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const current = line.startsWith('*');
          const cleaned = line.replace(/^\*?\s+/, '');
          const parts = cleaned.split(/\s+/);
          const name = parts[0];
          let remote: string | null = null;
          let tracking: string | null = null;

          if (parts.length > 1 && parts[1].startsWith('[')) {
            const trackingInfo = parts[1].replace(/[\[\]]/g, '');
            if (trackingInfo.includes('/')) {
              const trackingParts = trackingInfo.split('/');
              remote = trackingParts[0];
              tracking = trackingParts[1];
            } else {
              tracking = trackingInfo;
            }
          }

          return { name, current, remote, tracking };
        });
    }
    return [];
  }

  createBranch(name: string): string {
    return this.exec(`branch ${name}`);
  }

  deleteBranch(name: string, force: boolean = false): string {
    const flag = force ? '-D' : '-d';
    return this.exec(`branch ${flag} ${name}`);
  }

  checkout(branch: string): string {
    return this.exec(`checkout ${branch}`);
  }

  merge(branch: string): string {
    return this.exec(`merge ${branch}`);
  }

  diff(file?: string): string {
    if (file) {
      return this.exec(`diff "${file}"`);
    }
    return this.exec('diff');
  }

  diffStaged(): string {
    return this.exec('diff --staged');
  }

  diffFiles(file1: string, file2: string): string {
    return this.exec(`diff "${file1}" "${file2}"`);
  }

  log(count: number = 10): GitLogEntry[] {
    const output = this.exec(
      `log -${count} --pretty=format:"%H|%h|%an|%ae|%ai|%s"`
    );

    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split('|');
        return {
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          email: parts[3],
          date: parts[4],
          message: parts.slice(5).join('|'),
        };
      });
  }

  blame(file: string): GitBlameLine[] {
    const output = this.exec(`blame --porcelain "${file}"`);
    const lines = output.split('\n');
    const results: GitBlameLine[] = [];
    let currentHash = '';

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        currentHash = line.split(' ')[0];
      } else if (line.startsWith('author ')) {
        const author = line.substring(7);
        const nextLine = lines[lines.indexOf(line) + 1];
        const dateMatch = nextLine?.match(/^author-time (\d+)/);
        const date = dateMatch ? new Date(parseInt(dateMatch[1]) * 1000).toISOString() : '';
        const contentLine = lines[lines.indexOf(line) + 4];
        if (contentLine) {
          results.push({
            hash: currentHash,
            author,
            date,
            line: contentLine,
          });
        }
      }
    }

    return results;
  }

  stash(): string {
    return this.exec('stash');
  }

  stashPop(): string {
    return this.exec('stash pop');
  }

  stashList(): string {
    return this.exec('stash list');
  }

  tag(name: string, message?: string): string {
    if (message) {
      const escapedMessage = message.replace(/"/g, '\\"');
      return this.exec(`tag -a "${name}" -m "${escapedMessage}"`);
    }
    return this.exec(`tag ${name}`);
  }

  deleteTag(name: string): string {
    return this.exec(`tag -d ${name}`);
  }

  remote(list: boolean = true): GitRemote[] {
    if (list) {
      const output = this.exec('remote -v');
      const remotes: GitRemote[] = [];
      const seen = new Set<string>();

      output
        .split('\n')
        .filter((line) => line.length > 0)
        .forEach((line) => {
          const parts = line.split(/\s+/);
          const name = parts[0];
          const url = parts[1];
          const type = parts[2] === '(push)' ? 'push' : 'fetch';
          const key = `${name}-${type}`;

          if (!seen.has(key)) {
            seen.add(key);
            remotes.push({ name, url, type });
          }
        });

      return remotes;
    }
    return [];
  }

  addRemote(name: string, url: string): string {
    return this.exec(`remote add ${name} "${url}"`);
  }

  removeRemote(name: string): string {
    return this.exec(`remote remove ${name}`);
  }

  getConfig(key: string): string {
    try {
      return this.exec(`config ${key}`);
    } catch {
      return '';
    }
  }

  setConfig(key: string, value: string): void {
    this.exec(`config ${key} "${value}"`);
  }

  isRepo(): boolean {
    try {
      this.exec('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  getCurrentBranch(): string {
    return this.exec('rev-parse --abbrev-ref HEAD');
  }

  getBranches(): GitBranch[] {
    return this.branch(true);
  }

  getRemotes(): GitRemote[] {
    return this.remote(true);
  }

  getFileHistory(file: string, count: number = 10): GitLogEntry[] {
    const output = this.exec(
      `log -${count} --pretty=format:"%H|%h|%an|%ae|%ai|%s" -- "${file}"`
    );

    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split('|');
        return {
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          email: parts[3],
          date: parts[4],
          message: parts.slice(5).join('|'),
        };
      });
  }

  revert(commit: string): string {
    return this.exec(`revert ${commit}`);
  }

  reset(commit: string, hard: boolean = false): string {
    const flag = hard ? '--hard' : '--soft';
    return this.exec(`reset ${flag} ${commit}`);
  }

  addAndCommit(files: string | string[], message: string): string {
    this.add(files);
    return this.commit(message);
  }

  hasUncommittedChanges(): boolean {
    const status = this.status();
    return !status.clean;
  }

  hasUnpushedCommits(): boolean {
    try {
      const output = this.exec('log @{u}..HEAD --oneline');
      return output.length > 0;
    } catch {
      return false;
    }
  }

  getRepoRoot(): string {
    return this.exec('rev-parse --show-toplevel');
  }

  getShortHash(commit: string = 'HEAD'): string {
    return this.exec(`rev-parse --short ${commit}`);
  }

  getFullHash(commit: string = 'HEAD'): string {
    return this.exec(`rev-parse ${commit}`);
  }

  getParentCommit(commit: string = 'HEAD'): string {
    return this.exec(`rev-parse ${commit}^`);
  }

  getCommitMessage(commit: string = 'HEAD'): string {
    return this.exec(`log -1 --pretty=format:"%s" ${commit}`);
  }

  getCommitAuthor(commit: string = 'HEAD'): string {
    return this.exec(`log -1 --pretty=format:"%an" ${commit}`);
  }

  getCommitDate(commit: string = 'HEAD'): string {
    return this.exec(`log -1 --pretty=format:"%ai" ${commit}`);
  }

  cherryPick(commit: string): string {
    return this.exec(`cherry-pick ${commit}`);
  }

  rebase(branch: string): string {
    return this.exec(`rebase ${branch}`);
  }

  abortRebase(): string {
    return this.exec('rebase --abort');
  }

  continueRebase(): string {
    return this.exec('rebase --continue');
  }

  gc(): string {
    return this.exec('gc');
  }

  prune(): string {
    return this.exec('remote prune origin');
  }

  clean(force: boolean = true, directories: boolean = true): string {
    const flags = [];
    if (force) flags.push('-f');
    if (directories) flags.push('-d');
    return this.exec(`clean ${flags.join(' ')}`);
  }

  showTree(treeRef: string): string {
    return this.exec(`ls-tree -r --name-only ${treeRef}`);
  }

  getHash(object: string): string {
    return this.exec(`rev-parse ${object}`);
  }

  getObjectSize(object: string): string {
    return this.exec(`cat-file -s ${object}`);
  }

  getObjectType(object: string): string {
    return this.exec(`cat-file -t ${object}`);
  }

  archive(ref: string, output: string): string {
    return this.exec(`archive -o "${output}" ${ref}`);
  }

  submoduleInit(): string {
    return this.exec('submodule init');
  }

  submoduleUpdate(): string {
    return this.exec('submodule update');
  }

  worktreeAdd(path: string, branch: string): string {
    return this.exec(`worktree add "${path}" ${branch}`);
  }

  worktreeList(): string {
    return this.exec('worktree list');
  }

  worktreeRemove(path: string): string {
    return this.exec(`worktree remove "${path}"`);
  }
}
