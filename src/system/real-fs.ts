import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface FileStats {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  permissions: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  children?: FileTreeNode[];
}

export interface SearchResult {
  path: string;
  name: string;
  matchLine?: number;
  matchContent?: string;
}

export interface GitStatusFile {
  status: string;
  filePath: string;
}

export class RealFileSystem {
  private rootPath: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    if (!fs.existsSync(this.rootPath)) {
      throw new Error(`Root path does not exist: ${this.rootPath}`);
    }
  }

  readFile(filePath: string): string {
    const resolved = this.resolvePath(filePath);
    return fs.readFileSync(resolved, 'utf-8');
  }

  writeFile(filePath: string, content: string): void {
    const resolved = this.resolvePath(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf-8');
  }

  appendFile(filePath: string, content: string): void {
    const resolved = this.resolvePath(filePath);
    fs.appendFileSync(resolved, content, 'utf-8');
  }

  deleteFile(filePath: string): void {
    const resolved = this.resolvePath(filePath);
    fs.unlinkSync(resolved);
  }

  deleteDirectory(dirPath: string): void {
    const resolved = this.resolvePath(dirPath);
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  createDirectory(dirPath: string): void {
    const resolved = this.resolvePath(dirPath);
    fs.mkdirSync(resolved, { recursive: true });
  }

  renameFile(oldPath: string, newPath: string): void {
    const resolvedOld = this.resolvePath(oldPath);
    const resolvedNew = this.resolvePath(newPath);
    const newDir = path.dirname(resolvedNew);
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }
    fs.renameSync(resolvedOld, resolvedNew);
  }

  copyFile(src: string, dest: string): void {
    const resolvedSrc = this.resolvePath(src);
    const resolvedDest = this.resolvePath(dest);
    const destDir = path.dirname(resolvedDest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(resolvedSrc, resolvedDest);
  }

  exists(filePath: string): boolean {
    const resolved = this.resolvePath(filePath);
    return fs.existsSync(resolved);
  }

  stat(filePath: string): FileStats {
    const resolved = this.resolvePath(filePath);
    const stats = fs.statSync(resolved);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
      permissions: stats.mode.toString(8).slice(-3),
    };
  }

  readdir(dirPath: string): string[] {
    const resolved = this.resolvePath(dirPath);
    return fs.readdirSync(resolved);
  }

  readTree(dirPath: string, depth: number = -1, currentDepth: number = 0): FileTreeNode[] {
    const resolved = this.resolvePath(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name);
      const stats = fs.statSync(fullPath);
      const node: FileTreeNode = {
        name: entry.name,
        path: this.getRelativePath(this.rootPath, fullPath),
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
      };

      if (entry.isDirectory() && (depth === -1 || currentDepth < depth)) {
        node.children = this.readTree(fullPath, depth, currentDepth + 1);
      }

      nodes.push(node);
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  searchFiles(dir: string, query: string): string[] {
    const resolved = this.resolvePath(dir);
    const results: string[] = [];
    const regex = new RegExp(query, 'i');

    const walk = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (regex.test(entry.name)) {
          results.push(this.getRelativePath(this.rootPath, fullPath));
        }
      }
    };

    walk(resolved);
    return results;
  }

  searchContent(dir: string, pattern: string): SearchResult[] {
    const resolved = this.resolvePath(dir);
    const results: SearchResult[] = [];
    const regex = new RegExp(pattern, 'gi');

    const walk = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (regex.test(line)) {
                results.push({
                  path: this.getRelativePath(this.rootPath, fullPath),
                  name: entry.name,
                  matchLine: index + 1,
                  matchContent: line.trim(),
                });
              }
              regex.lastIndex = 0;
            });
          } catch {
            // Skip binary files or files that can't be read
          }
        }
      }
    };

    walk(resolved);
    return results;
  }

  watch(filePath: string, callback: (event: string, filename: string | null) => void): fs.FSWatcher {
    const resolved = this.resolvePath(filePath);
    const watcher = fs.watch(resolved, { recursive: true }, (event, filename) => {
      callback(event, filename);
    });
    this.watchers.set(resolved, watcher);
    return watcher;
  }

  unwatch(filePath: string): void {
    const resolved = this.resolvePath(filePath);
    const watcher = this.watchers.get(resolved);
    if (watcher) {
      watcher.close();
      this.watchers.delete(resolved);
    }
  }

  closeAllWatchers(): void {
    for (const [key, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }

  getGitStatus(repoPath: string): GitStatusFile[] {
    const resolved = this.resolvePath(repoPath);
    try {
      const output = execSync('git status --porcelain', {
        cwd: resolved,
        encoding: 'utf-8',
        timeout: 10000,
      });

      return output
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => ({
          status: line.substring(0, 2).trim(),
          filePath: line.substring(3).trim(),
        }));
    } catch {
      return [];
    }
  }

  getFileSize(filePath: string): number {
    const resolved = this.resolvePath(filePath);
    return fs.statSync(resolved).size;
  }

  getModifiedTime(filePath: string): Date {
    const resolved = this.resolvePath(filePath);
    return fs.statSync(resolved).mtime;
  }

  isDirectory(filePath: string): boolean {
    const resolved = this.resolvePath(filePath);
    try {
      return fs.statSync(resolved).isDirectory();
    } catch {
      return false;
    }
  }

  getExtension(filename: string): string {
    return path.extname(filename).toLowerCase();
  }

  normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  resolvePath(...parts: string[]): string {
    return path.resolve(this.rootPath, ...parts);
  }

  getRelativePath(from: string, to: string): string {
    const resolvedFrom = path.resolve(from);
    const resolvedTo = path.resolve(to);
    return path.relative(resolvedFrom, resolvedTo).replace(/\\/g, '/');
  }

  getRootPath(): string {
    return this.rootPath;
  }

  readFileBinary(filePath: string): Buffer {
    const resolved = this.resolvePath(filePath);
    return fs.readFileSync(resolved);
  }

  writeFileBinary(filePath: string, data: Buffer): void {
    const resolved = this.resolvePath(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, data);
  }

  chmod(filePath: string, mode: string | number): void {
    const resolved = this.resolvePath(filePath);
    fs.chmodSync(resolved, mode);
  }

  glob(pattern: string, dirPath: string = '.'): string[] {
    const resolved = this.resolvePath(dirPath);
    const results: string[] = [];
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    );

    const walk = (currentDir: string): void => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              walk(fullPath);
            }
          } else if (regex.test(entry.name)) {
            results.push(this.getRelativePath(this.rootPath, fullPath));
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    walk(resolved);
    return results;
  }
}
