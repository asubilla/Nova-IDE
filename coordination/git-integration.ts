import { execSync } from 'child_process';

export interface GitStatus {
  branch: string;
  isClean: boolean;
  modifiedFiles: string[];
  stagedFiles: string[];
  untrackedFiles: string[];
  ahead: number;
  behind: number;
  lastCommit: string;
  lastCommitMessage: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  lastCommit: string;
  lastCommitDate: Date;
  ahead: number;
  behind: number;
}

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  error?: string;
}

export interface GitIntegrationConfig {
  projectPath: string;
  autoStash: boolean;
  createBackupBranch: boolean;
  backupBranchPrefix: string;
}

export class GitIntegration {
  private config: GitIntegrationConfig;
  private isGitRepo: boolean = false;

  constructor(config: GitIntegrationConfig) {
    this.config = config;
    this.isGitRepo = this.checkGitRepo();
  }

  private checkGitRepo(): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.config.projectPath,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return this.isGitRepo;
  }

  getStatus(): GitStatus {
    if (!this.isGitRepo) {
      return this.createEmptyStatus();
    }

    try {
      const branch = this.exec('git rev-parse --abbrev-ref HEAD');
      const isClean = this.exec('git status --porcelain') === '';
      const modifiedFiles = this.exec('git diff --name-only').split('\n').filter(Boolean);
      const stagedFiles = this.exec('git diff --cached --name-only').split('\n').filter(Boolean);
      const untrackedFiles = this.exec('git ls-files --others --exclude-standard').split('\n').filter(Boolean);
      const ahead = parseInt(this.exec('git rev-list --count @{upstream}..HEAD') || '0');
      const behind = parseInt(this.exec('git rev-list --count HEAD..@{upstream}') || '0');
      const lastCommit = this.exec('git rev-parse HEAD');
      const lastCommitMessage = this.exec('git log -1 --pretty=%B');

      return {
        branch,
        isClean,
        modifiedFiles,
        stagedFiles,
        untrackedFiles,
        ahead,
        behind,
        lastCommit,
        lastCommitMessage,
      };
    } catch (error) {
      return this.createEmptyStatus();
    }
  }

  getBranches(): BranchInfo[] {
    if (!this.isGitRepo) return [];

    try {
      const currentBranch = this.exec('git rev-parse --abbrev-ref HEAD');
      const branches = this.exec('git branch --format=%(refname:short)').split('\n').filter(Boolean);

      return branches.map(name => ({
        name,
        isCurrent: name === currentBranch,
        lastCommit: this.exec(`git log -1 --pretty=%H ${name}`),
        lastCommitDate: new Date(this.exec(`git log -1 --pretty=%ci ${name}`)),
        ahead: parseInt(this.exec(`git rev-list --count @{upstream}..${name}`) || '0'),
        behind: parseInt(this.exec(`git rev-list --count ${name}..@{upstream}`) || '0'),
      }));
    } catch {
      return [];
    }
  }

  createBranch(branchName: string): boolean {
    if (!this.isGitRepo) return false;

    try {
      this.exec(`git branch ${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  switchBranch(branchName: string): boolean {
    if (!this.isGitRepo) return false;

    try {
      if (this.config.autoStash) {
        this.stashChanges();
      }
      this.exec(`git checkout ${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  createBackupBranch(prefix?: string): string | null {
    if (!this.isGitRepo) return null;

    const branchPrefix = prefix || this.config.backupBranchPrefix;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${branchPrefix}/backup-${timestamp}`;

    try {
      this.createBranch(backupName);
      return backupName;
    } catch {
      return null;
    }
  }

  stashChanges(): boolean {
    if (!this.isGitRepo) return false;

    try {
      this.exec('git stash push -m "Agent auto-stash"');
      return true;
    } catch {
      return false;
    }
  }

  popStash(): boolean {
    if (!this.isGitRepo) return false;

    try {
      this.exec('git stash pop');
      return true;
    } catch {
      return false;
    }
  }

  commitChanges(message: string, files?: string[]): boolean {
    if (!this.isGitRepo) return false;

    try {
      if (files && files.length > 0) {
        for (const file of files) {
          this.exec(`git add "${file}"`);
        }
      } else {
        this.exec('git add -A');
      }
      this.exec(`git commit -m "${message}"`);
      return true;
    } catch {
      return false;
    }
  }

  mergeBranch(source: string, target: string): MergeResult {
    if (!this.isGitRepo) {
      return { success: false, conflicts: [], error: 'Not a git repository' };
    }

    try {
      this.exec(`git checkout ${target}`);
      this.exec(`git merge ${source}`);
      return { success: true, conflicts: [] };
    } catch (error) {
      const conflicts = this.getConflictingFiles();
      return {
        success: false,
        conflicts,
        error: error instanceof Error ? error.message : 'Merge failed',
      };
    }
  }

  abortMerge(): boolean {
    if (!this.isGitRepo) return false;

    try {
      this.exec('git merge --abort');
      return true;
    } catch {
      return false;
    }
  }

  isFileModified(filePath: string): boolean {
    if (!this.isGitRepo) return false;

    try {
      const status = this.exec(`git status --porcelain "${filePath}"`);
      return status.length > 0;
    } catch {
      return false;
    }
  }

  getFileDiff(filePath: string): string {
    if (!this.isGitRepo) return '';

    try {
      return this.exec(`git diff "${filePath}"`);
    } catch {
      return '';
    }
  }

  getFileContentAtCommit(filePath: string, commitHash: string): string | null {
    if (!this.isGitRepo) return null;

    try {
      return this.exec(`git show ${commitHash}:"${filePath}"`);
    } catch {
      return null;
    }
  }

  getConflictingFiles(): string[] {
    if (!this.isGitRepo) return [];

    try {
      const status = this.exec('git diff --name-only --diff-filter=U');
      return status.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  resolveConflict(filePath: string, content: string): boolean {
    if (!this.isGitRepo) return false;

    try {
      const fs = require('fs');
      const fullPath = `${this.config.projectPath}/${filePath}`;
      fs.writeFileSync(fullPath, content);
      this.exec(`git add "${filePath}"`);
      return true;
    } catch {
      return false;
    }
  }

  hasUncommittedChanges(): boolean {
    return !this.getStatus().isClean;
  }

  isFileTracked(filePath: string): boolean {
    if (!this.isGitRepo) return false;

    try {
      this.exec(`git ls-files --error-unmatch "${filePath}"`);
      return true;
    } catch {
      return false;
    }
  }

  canFileBeModified(filePath: string): { canModify: boolean; reason?: string } {
    if (!this.isGitRepo) {
      return { canModify: true };
    }

    if (this.isFileModified(filePath)) {
      return { canModify: false, reason: 'File has uncommitted changes' };
    }

    const status = this.getStatus();
    if (status.stagedFiles.includes(filePath)) {
      return { canModify: false, reason: 'File is staged for commit' };
    }

    return { canModify: true };
  }

  private exec(command: string): string {
    try {
      return execSync(command, {
        cwd: this.config.projectPath,
        stdio: 'pipe',
        encoding: 'utf-8',
      }).trim();
    } catch {
      return '';
    }
  }

  private createEmptyStatus(): GitStatus {
    return {
      branch: 'unknown',
      isClean: true,
      modifiedFiles: [],
      stagedFiles: [],
      untrackedFiles: [],
      ahead: 0,
      behind: 0,
      lastCommit: '',
      lastCommitMessage: '',
    };
  }
}
