import { contextBridge, ipcRenderer } from "electron";

export interface NovaAPI {
  fs: {
    readFile(filePath: string, encoding?: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<boolean>;
    readdir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }>>;
    mkdir(dirPath: string, recursive?: boolean): Promise<boolean>;
    rm(targetPath: string, options?: { recursive?: boolean; force?: boolean }): Promise<boolean>;
    rename(oldPath: string, newPath: string): Promise<boolean>;
    exists(targetPath: string): Promise<boolean>;
    stat(targetPath: string): Promise<{
      size: number;
      created: number;
      modified: number;
      isFile: boolean;
      isDirectory: boolean;
      isSymlink: boolean;
      mode: number;
    }>;
  };
  git: {
    status(cwd: string): Promise<string>;
    add(cwd: string, files: string[]): Promise<string>;
    commit(cwd: string, message: string): Promise<string>;
    push(cwd: string, remote?: string, branch?: string): Promise<string>;
    pull(cwd: string, remote?: string, branch?: string): Promise<string>;
    log(cwd: string, count?: number): Promise<string>;
  };
  terminal: {
    execute(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }>;
  };
  app: {
    version(): Promise<string>;
    path(name: string): Promise<string>;
    platform(): Promise<string>;
  };
  on(channel: string, callback: (...args: any[]) => void): () => void;
}

function wrapInvoke<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      throw new Error(`Nova API error: ${message}`);
    }
  }) as T;
}

const novaAPI: NovaAPI = {
  fs: {
    readFile: wrapInvoke((filePath: string, encoding?: string) =>
      ipcRenderer.invoke("fs:readFile", filePath, encoding)
    ),
    writeFile: wrapInvoke((filePath: string, content: string) =>
      ipcRenderer.invoke("fs:writeFile", filePath, content)
    ),
    readdir: wrapInvoke((dirPath: string) =>
      ipcRenderer.invoke("fs:readdir", dirPath)
    ),
    mkdir: wrapInvoke((dirPath: string, recursive?: boolean) =>
      ipcRenderer.invoke("fs:mkdir", dirPath, recursive)
    ),
    rm: wrapInvoke((targetPath: string, options?: { recursive?: boolean; force?: boolean }) =>
      ipcRenderer.invoke("fs:rm", targetPath, options)
    ),
    rename: wrapInvoke((oldPath: string, newPath: string) =>
      ipcRenderer.invoke("fs:rename", oldPath, newPath)
    ),
    exists: wrapInvoke((targetPath: string) =>
      ipcRenderer.invoke("fs:exists", targetPath)
    ),
    stat: wrapInvoke((targetPath: string) =>
      ipcRenderer.invoke("fs:stat", targetPath)
    ),
  },
  git: {
    status: wrapInvoke((cwd: string) =>
      ipcRenderer.invoke("git:status", cwd)
    ),
    add: wrapInvoke((cwd: string, files: string[]) =>
      ipcRenderer.invoke("git:add", cwd, files)
    ),
    commit: wrapInvoke((cwd: string, message: string) =>
      ipcRenderer.invoke("git:commit", cwd, message)
    ),
    push: wrapInvoke((cwd: string, remote?: string, branch?: string) =>
      ipcRenderer.invoke("git:push", cwd, remote, branch)
    ),
    pull: wrapInvoke((cwd: string, remote?: string, branch?: string) =>
      ipcRenderer.invoke("git:pull", cwd, remote, branch)
    ),
    log: wrapInvoke((cwd: string, count?: number) =>
      ipcRenderer.invoke("git:log", cwd, count)
    ),
  },
  terminal: {
    execute: wrapInvoke((command: string, cwd?: string) =>
      ipcRenderer.invoke("terminal:execute", command, cwd)
    ),
  },
  app: {
    version: wrapInvoke(() =>
      ipcRenderer.invoke("app:version")
    ),
    path: wrapInvoke((name: string) =>
      ipcRenderer.invoke("app:path", name)
    ),
    platform: wrapInvoke(() =>
      ipcRenderer.invoke("app:platform")
    ),
  },
  on(channel: string, callback: (...args: any[]) => void): () => void {
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
};

contextBridge.exposeInMainWorld("nova", novaAPI);
