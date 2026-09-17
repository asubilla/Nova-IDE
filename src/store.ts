import { create } from "zustand";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  expanded?: boolean;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface AgentTask {
  id: string;
  status: "idle" | "thinking" | "running" | "completed" | "error";
  description: string;
  startedAt: number;
}

export type SidebarPanel =
  | "files"
  | "search"
  | "git"
  | "extensions"
  | "ai"
  | null;

export type BottomPanel = "terminal" | "output" | "problems" | null;

interface IDEState {
  workspacePath: string;
  fileTree: FileNode[];
  openFiles: OpenFile[];
  activeFile: string | null;
  sidebarPanel: SidebarPanel;
  bottomPanel: BottomPanel;
  chatMessages: ChatMessage[];
  agentTask: AgentTask;
  terminalReady: boolean;

  setWorkspacePath: (path: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  toggleFileTreeNode: (path: string) => void;
  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  setBottomPanel: (panel: BottomPanel) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setAgentTask: (task: AgentTask) => void;
  setTerminalReady: (ready: boolean) => void;
  saveFile: (path: string) => void;
}

const detectLanguage = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    dart: "dart",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  return map[ext] ?? "plaintext";
};

const toggleNode = (nodes: FileNode[], path: string): FileNode[] =>
  nodes.map((n) => {
    if (n.path === path) return { ...n, expanded: !n.expanded };
    if (n.children) return { ...n, children: toggleNode(n.children, path) };
    return n;
  });

export const useIDEStore = create<IDEState>((set, get) => ({
  workspacePath: "",
  fileTree: [],
  openFiles: [],
  activeFile: null,
  sidebarPanel: "files",
  bottomPanel: "terminal",
  chatMessages: [],
  agentTask: { id: "", status: "idle", description: "", startedAt: 0 },
  terminalReady: false,

  setWorkspacePath: (path) => set({ workspacePath: path }),
  setFileTree: (tree) => set({ fileTree: tree }),
  toggleFileTreeNode: (path) =>
    set((s) => ({ fileTree: toggleNode(s.fileTree, path) })),

  openFile: (file) =>
    set((s) => {
      const exists = s.openFiles.find((f) => f.path === file.path);
      if (exists) return { activeFile: file.path };
      return {
        openFiles: [...s.openFiles, file],
        activeFile: file.path,
      };
    }),

  closeFile: (path) =>
    set((s) => {
      const filtered = s.openFiles.filter((f) => f.path !== path);
      const newActive =
        s.activeFile === path
          ? filtered.length > 0
            ? filtered[filtered.length - 1]!.path
            : null
          : s.activeFile;
      return { openFiles: filtered, activeFile: newActive };
    }),

  setActiveFile: (path) => set({ activeFile: path }),

  updateFileContent: (path, content) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, modified: true } : f
      ),
    })),

  setSidebarPanel: (panel) =>
    set((s) => ({
      sidebarPanel: s.sidebarPanel === panel ? null : panel,
    })),

  setBottomPanel: (panel) =>
    set((s) => ({
      bottomPanel: s.bottomPanel === panel ? null : panel,
    })),

  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  setAgentTask: (task) => set({ agentTask: task }),
  setTerminalReady: (ready) => set({ terminalReady: ready }),

  saveFile: (path) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, modified: false } : f
      ),
    })),
}));

export { detectLanguage };
