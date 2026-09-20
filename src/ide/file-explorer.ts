import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  size?: number;
  modified?: Date;
  icon?: string;
}

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  renamed: Array<{ from: string; to: string }>;
}

export interface FileChange {
  type: "create" | "modify" | "delete";
  path: string;
  timestamp: Date;
}

type WatchCallback = (event: FileChange) => void;

const FILE_ICONS: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  html: "html",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  yaml: "yaml",
  toml: "toml",
  env: "env",
  gitignore: "git",
};

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "__pycache__"]);

export class FileExplorer {
  private rootPath: string;
  private recentFiles: string[] = [];
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private watchCallbacks: Map<string, Set<WatchCallback>> = new Map();

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.loadRecentFiles();
  }

  async getTree(): Promise<FileTreeNode> {
    return this.buildTree(this.rootPath);
  }

  private async buildTree(dirPath: string): Promise<FileTreeNode> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const children: FileTreeNode[] = [];

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const fileStat = await stat(fullPath);

      if (entry.isDirectory()) {
        children.push({
          name: entry.name,
          path: fullPath,
          type: "directory",
          modified: fileStat.mtime,
          children: (await this.buildTree(fullPath)).children,
        });
      } else {
        children.push({
          name: entry.name,
          path: fullPath,
          type: "file",
          size: fileStat.size,
          modified: fileStat.mtime,
          icon: this.getFileIcon(entry.name),
        });
      }
    }

    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      name: path.basename(dirPath),
      path: dirPath,
      type: "directory",
      children,
    };
  }

  async getChildren(dirPath: string): Promise<FileTreeNode[]> {
    const resolved = path.resolve(dirPath);
    const entries = await readdir(resolved, { withFileTypes: true });
    const children: FileTreeNode[] = [];

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(resolved, entry.name);
      const fileStat = await stat(fullPath);

      children.push({
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? "directory" : "file",
        size: entry.isFile() ? fileStat.size : undefined,
        modified: fileStat.mtime,
        icon: entry.isFile() ? this.getFileIcon(entry.name) : undefined,
      });
    }

    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return children;
  }

  async readFile(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    return readFile(resolved, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(resolved, content, "utf-8");
    this.addToRecentFiles(resolved);
  }

  async createFile(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (!fs.existsSync(resolved)) {
      await writeFile(resolved, "", "utf-8");
    }
    this.addToRecentFiles(resolved);
  }

  async createDirectory(dirPath: string): Promise<void> {
    const resolved = path.resolve(dirPath);
    await mkdir(resolved, { recursive: true });
  }

  async deleteFile(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    await unlink(resolved);
    this.removeFromRecentFiles(resolved);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    await rename(resolvedOld, resolvedNew);
    this.removeFromRecentFiles(resolvedOld);
    this.addToRecentFiles(resolvedNew);
  }

  async searchFiles(query: string): Promise<string[]> {
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();
    await this.walkDirectory(this.rootPath, (filePath) => {
      const name = path.basename(filePath).toLowerCase();
      if (name.includes(lowerQuery)) {
        results.push(filePath);
      }
    });
    return results;
  }

  async searchContent(query: string): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const lowerQuery = query.toLowerCase();

    await this.walkDirectory(this.rootPath, async (filePath) => {
      try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(lowerQuery)) {
            results.push({
              file: filePath,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch {
        // Skip binary files or unreadable files
      }
    });

    return results;
  }

  private async walkDirectory(
    dirPath: string,
    callback: (filePath: string) => void | Promise<void>
  ): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, callback);
      } else {
        await callback(fullPath);
      }
    }
  }

  getRecentFiles(): string[] {
    return [...this.recentFiles];
  }

  private addToRecentFiles(filePath: string): void {
    this.recentFiles = this.recentFiles.filter((f) => f !== filePath);
    this.recentFiles.unshift(filePath);
    if (this.recentFiles.length > 50) {
      this.recentFiles = this.recentFiles.slice(0, 50);
    }
    this.saveRecentFiles();
  }

  private removeFromRecentFiles(filePath: string): void {
    this.recentFiles = this.recentFiles.filter((f) => f !== filePath);
    this.saveRecentFiles();
  }

  private loadRecentFiles(): void {
    try {
      const recentPath = path.join(this.rootPath, ".nova", "recent.json");
      if (fs.existsSync(recentPath)) {
        const data = fs.readFileSync(recentPath, "utf-8");
        this.recentFiles = JSON.parse(data);
      }
    } catch {
      this.recentFiles = [];
    }
  }

  private saveRecentFiles(): void {
    try {
      const novaDir = path.join(this.rootPath, ".nova");
      if (!fs.existsSync(novaDir)) {
        fs.mkdirSync(novaDir, { recursive: true });
      }
      const recentPath = path.join(novaDir, "recent.json");
      fs.writeFileSync(recentPath, JSON.stringify(this.recentFiles, null, 2));
    } catch {
      // Silently fail if we can't save
    }
  }

  async getGitStatus(): Promise<GitStatus> {
    const status: GitStatus = {
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
      renamed: [],
    };

    try {
      const { execSync } = require("child_process");
      const output = execSync("git status --porcelain", {
        cwd: this.rootPath,
        encoding: "utf-8",
      });

      const lines = output.split("\n").filter((line: string) => line.trim());

      for (const line of lines) {
        const statusCode = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        if (statusCode.includes("M")) {
          status.modified.push(filePath);
        } else if (statusCode.includes("A")) {
          status.added.push(filePath);
        } else if (statusCode.includes("D")) {
          status.deleted.push(filePath);
        } else if (statusCode.includes("?")) {
          status.untracked.push(filePath);
        } else if (statusCode.includes("R")) {
          const parts = filePath.split(" -> ");
          if (parts.length === 2) {
            status.renamed.push({ from: parts[0], to: parts[1] });
          }
        }
      }
    } catch {
      // Not a git repo or git not available
    }

    return status;
  }

  getFileIcon(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return FILE_ICONS[ext] || "file";
  }

  async getFileSize(filePath: string): Promise<number> {
    const resolved = path.resolve(filePath);
    const fileStat = await stat(resolved);
    return fileStat.size;
  }

  watchDirectory(dirPath: string, callback: WatchCallback): () => void {
    const resolved = path.resolve(dirPath);

    if (!this.watchCallbacks.has(resolved)) {
      this.watchCallbacks.set(resolved, new Set());

      try {
        const watcher = fs.watch(resolved, { recursive: true }, (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(resolved, filename);
          const change: FileChange = {
            type: eventType === "rename" ? "delete" : "modify",
            path: fullPath,
            timestamp: new Date(),
          };

          if (eventType === "rename") {
            if (fs.existsSync(fullPath)) {
              change.type = "create";
            }
          }

          const callbacks = this.watchCallbacks.get(resolved);
          if (callbacks) {
            callbacks.forEach((cb) => cb(change));
          }
        });

        this.watchers.set(resolved, watcher);
      } catch {
        // Watch failed
      }
    }

    const callbacks = this.watchCallbacks.get(resolved);
    if (callbacks) {
      callbacks.add(callback);
    }

    return () => {
      const cbs = this.watchCallbacks.get(resolved);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) {
          this.watchCallbacks.delete(resolved);
          const watcher = this.watchers.get(resolved);
          if (watcher) {
            watcher.close();
            this.watchers.delete(resolved);
          }
        }
      }
    };
  }

  destroy(): void {
    const watchersArray = Array.from(this.watchers.values());
    for (const watcher of watchersArray) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchCallbacks.clear();
  }
}
