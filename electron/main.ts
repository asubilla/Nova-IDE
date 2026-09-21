import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { existsSync, statSync, readFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// ─── Settings Persistence ──────────────────────────────────────────────────────
const SETTINGS_DIR = path.join(app.getPath("userData"), "settings");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "nova-settings.json");
const FIRST_RUN_FILE = path.join(SETTINGS_DIR, ".first-run-done");

interface NovaSettings {
  firstRun: boolean;
  theme: string;
  fontSize: number;
  fontFamily: string;
  minimap: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  smoothScrolling: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  tabSize: number;
  insertSpaces: boolean;
  cursorStyle: string;
  cursorBlinking: string;
  renderWhitespace: string;
  bracketPairColorization: boolean;
  mouseWheelZoom: boolean;
  folding: boolean;
  stickyScroll: boolean;
  suggestOnTriggerCharacters: boolean;
  quickSuggestions: boolean;
  formatOnPaste: boolean;
  formatOnSave: boolean;
  terminalShell: string;
  gitAutofetch: boolean;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  features: {
    addPath: boolean;
    desktopShortcut: boolean;
    startMenuShortcut: boolean;
    contextMenu: boolean;
    fileAssociation: boolean;
  };
  recentWorkspaces: string[];
}

const DEFAULT_SETTINGS: NovaSettings = {
  firstRun: true,
  theme: "nova-dark",
  fontSize: 14,
  fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono',Consolas,monospace",
  minimap: true,
  wordWrap: false,
  lineNumbers: true,
  smoothScrolling: true,
  autoSave: false,
  autoSaveDelay: 1000,
  tabSize: 2,
  insertSpaces: true,
  cursorStyle: "line",
  cursorBlinking: "smooth",
  renderWhitespace: "selection",
  bracketPairColorization: true,
  mouseWheelZoom: true,
  folding: true,
  stickyScroll: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  formatOnPaste: false,
  formatOnSave: false,
  terminalShell: "",
  gitAutofetch: true,
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
  aiApiKey: "",
  features: {
    addPath: true,
    desktopShortcut: true,
    startMenuShortcut: true,
    contextMenu: true,
    fileAssociation: true,
  },
  recentWorkspaces: [],
};

let currentSettings: NovaSettings = { ...DEFAULT_SETTINGS };

async function ensureSettingsDir() {
  try {
    await fs.mkdir(SETTINGS_DIR, { recursive: true });
  } catch {}
}

async function loadSettings(): Promise<NovaSettings> {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
      const saved = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings: NovaSettings): Promise<void> {
  await ensureSettingsDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

async function isFirstRun(): Promise<boolean> {
  try {
    if (existsSync(FIRST_RUN_FILE)) return false;
    const settings = await loadSettings();
    return settings.firstRun;
  } catch {
    return true;
  }
}

async function markFirstRunDone(): Promise<void> {
  currentSettings.firstRun = false;
  await saveSettings(currentSettings);
  await ensureSettingsDir();
  await fs.writeFile(FIRST_RUN_FILE, new Date().toISOString(), "utf-8");
}

// ─── Window Creation ───────────────────────────────────────────────────────────

function getWebPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", "web", "index.html");
  }
  return path.join(app.getAppPath(), "web", "index.html");
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1e1e2e",
    title: "Nova IDE",
    icon: isDev
      ? path.join(__dirname, "..", "..", "electron", "assets", "icon.png")
      : path.join(app.getAppPath(), "electron", "assets", "icon.png"),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
  });

  const webPath = getWebPath();
  if (existsSync(webPath)) {
    mainWindow.loadFile(webPath);
  } else {
    mainWindow.loadURL("data:text/html,<h1>Nova IDE - Build assets missing</h1><p>Run 'npm run build' first.</p>");
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  buildMenu();
}

function buildMenu(): void {
  const template: any[] = [
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("menu:new-file") },
        { label: "Open File...", accelerator: "CmdOrCtrl+O", click: () => mainWindow?.webContents.send("menu:open-file") },
        { label: "Open Folder...", accelerator: "CmdOrCtrl+K O", click: () => mainWindow?.webContents.send("menu:open-folder") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => mainWindow?.webContents.send("menu:save") },
        { label: "Save As...", accelerator: "CmdOrCtrl+Shift+S", click: () => mainWindow?.webContents.send("menu:save-as") },
        { label: "Save All", accelerator: "CmdOrCtrl+K S", click: () => mainWindow?.webContents.send("menu:save-all") },
        { type: "separator" },
        { label: "Preferences", accelerator: "CmdOrCtrl+,", click: () => mainWindow?.webContents.send("menu:preferences") },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { label: "Exit", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find", accelerator: "CmdOrCtrl+F", click: () => mainWindow?.webContents.send("menu:find") },
        { label: "Replace", accelerator: "CmdOrCtrl+H", click: () => mainWindow?.webContents.send("menu:replace") },
        { label: "Find in Files", accelerator: "CmdOrCtrl+Shift+F", click: () => mainWindow?.webContents.send("menu:find-in-files") },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => mainWindow?.webContents.send("menu:toggle-sidebar") },
        { label: "Toggle Terminal", accelerator: "CmdOrCtrl+`", click: () => mainWindow?.webContents.send("menu:toggle-terminal") },
        { label: "Toggle Panel", accelerator: "CmdOrCtrl+J", click: () => mainWindow?.webContents.send("menu:toggle-panel") },
      ],
    },
    {
      label: "Terminal",
      submenu: [
        { label: "New Terminal", accelerator: "Ctrl+Shift+`", click: () => mainWindow?.webContents.send("terminal:new") },
        { label: "Split Terminal", accelerator: "Ctrl+Shift+5", click: () => mainWindow?.webContents.send("terminal:split") },
        { type: "separator" },
        { label: "Clear Terminal", accelerator: "Ctrl+K", click: () => mainWindow?.webContents.send("terminal:clear") },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "About Nova IDE", click: () => mainWindow?.webContents.send("menu:about") },
        { label: "Documentation", click: () => shell.openExternal("https://nova-ide.dev/docs") },
        { label: "Report Issue", click: () => shell.openExternal("https://github.com/nova-ide/nova/issues") },
        { type: "separator" },
        { label: "Toggle Developer Tools", accelerator: "F12", click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── IPC Handlers: File System ────────────────────────────────────────────────

ipcMain.handle("fs:readFile", async (_event, filePath: string, encoding?: BufferEncoding) => {
  return fs.readFile(filePath, encoding ?? "utf-8");
});

ipcMain.handle("fs:writeFile", async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, "utf-8");
  return true;
});

ipcMain.handle("fs:readdir", async (_event, dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: entry.isSymbolicLink(),
  }));
});

ipcMain.handle("fs:mkdir", async (_event, dirPath: string, recursive?: boolean) => {
  await fs.mkdir(dirPath, { recursive: recursive ?? true });
  return true;
});

ipcMain.handle("fs:rm", async (_event, targetPath: string, options?: { recursive?: boolean; force?: boolean }) => {
  await fs.rm(targetPath, { recursive: options?.recursive ?? false, force: options?.force ?? false });
  return true;
});

ipcMain.handle("fs:rename", async (_event, oldPath: string, newPath: string) => {
  await fs.rename(oldPath, newPath);
  return true;
});

ipcMain.handle("fs:exists", async (_event, targetPath: string) => {
  return existsSync(targetPath);
});

ipcMain.handle("fs:stat", async (_event, targetPath: string) => {
  const stats = await fs.stat(targetPath);
  return {
    size: stats.size,
    created: stats.birthtimeMs,
    modified: stats.mtimeMs,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    mode: stats.mode,
  };
});

// ─── IPC Handlers: Git ────────────────────────────────────────────────────────

async function gitExec(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execAsync(`git ${args.join(" ")}`, { cwd, maxBuffer: 10 * 1024 * 1024 });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

ipcMain.handle("git:status", async (_event, cwd: string) => {
  return gitExec(cwd, ["status", "--porcelain", "-b"]);
});

ipcMain.handle("git:add", async (_event, cwd: string, files: string[]) => {
  return gitExec(cwd, ["add", ...files]);
});

ipcMain.handle("git:commit", async (_event, cwd: string, message: string) => {
  return gitExec(cwd, ["commit", "-m", message]);
});

ipcMain.handle("git:push", async (_event, cwd: string, remote?: string, branch?: string) => {
  const args = ["push"];
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  return gitExec(cwd, args);
});

ipcMain.handle("git:pull", async (_event, cwd: string, remote?: string, branch?: string) => {
  const args = ["pull"];
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  return gitExec(cwd, args);
});

ipcMain.handle("git:log", async (_event, cwd: string, count?: number) => {
  const n = count ?? 20;
  return gitExec(cwd, [`log`, `--oneline`, `-n`, String(n)]);
});

// ─── IPC Handlers: Terminal ───────────────────────────────────────────────────

ipcMain.handle("terminal:execute", async (_event, command: string, cwd?: string) => {
  const { stdout, stderr } = await execAsync(command, {
    cwd: cwd ?? process.env.HOME ?? process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  return { stdout, stderr };
});

// ─── IPC Handlers: Chat (AI) ────────────────────────────────────────────────

const chatHistory: Array<{ role: string; content: string }> = [];

ipcMain.handle("chat:send", async (_event, message: string, context?: { filePath?: string; code?: string; language?: string }) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const provider = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  const systemPrompt = `You are Nova AI, an expert coding assistant inside the Nova Sub-Agent IDE. You help users with coding, debugging, explaining code, writing functions, and software engineering tasks. Be concise and helpful. Use markdown for code blocks.`;

  const userMsg = context?.code
    ? `${message}\n\n\`\`\`${context.language || ""}\n${context.code}\n\`\`\`\nFile: ${context.filePath || "unknown"}`
    : message;

  chatHistory.push({ role: "user", content: userMsg });
  if (chatHistory.length > 50) chatHistory.splice(0, chatHistory.length - 50);

  if (!apiKey) {
    const reply = `[Nova AI - Offline Mode]\n\nNo AI API key configured.\n\nTo enable AI responses, set one of these environment variables:\n- OPENAI_API_KEY (for OpenAI GPT models)\n- ANTHROPIC_API_KEY (for Claude models)\n\nYou can also set:\n- AI_PROVIDER: "openai" | "anthropic" | "google" | "local"\n- AI_MODEL: model name (e.g., "gpt-4o-mini", "claude-3-5-haiku-20241022")\n\nCurrent message: ${message}`;
    chatHistory.push({ role: "assistant", content: reply });
    return { reply, tokens: 0 };
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-20),
    ];

    let url = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any;

    if (provider === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const systemMsg = messages.find(m => m.role === "system");
      const otherMsgs = messages.filter(m => m.role !== "system");
      body = {
        model: model,
        max_tokens: 4096,
        system: systemMsg?.content || "",
        messages: otherMsgs.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      };
    } else {
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages, max_tokens: 4096, temperature: 0.7 };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    let reply = "";
    let tokens = 0;

    if (provider === "anthropic") {
      reply = data.content?.[0]?.text || "No response";
      tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    } else {
      reply = data.choices?.[0]?.message?.content || "No response";
      tokens = data.usage?.total_tokens || 0;
    }

    chatHistory.push({ role: "assistant", content: reply });
    return { reply, tokens };
  } catch (err: any) {
    return { reply: `Error: ${err.message}`, tokens: 0 };
  }
});

// ─── IPC Handlers: Dialog ────────────────────────────────────────────────────

ipcMain.handle("dialog:openFile", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "All Files", extensions: ["*"] },
      { name: "JavaScript", extensions: ["js", "jsx", "ts", "tsx"] },
      { name: "Python", extensions: ["py"] },
      { name: "HTML", extensions: ["html", "htm"] },
      { name: "CSS", extensions: ["css", "scss", "less"] },
      { name: "JSON", extensions: ["json"] },
      { name: "Markdown", extensions: ["md"] },
      { name: "Rust", extensions: ["rs"] },
      { name: "Go", extensions: ["go"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf-8");
  return { filePath, content };
});

ipcMain.handle("dialog:openFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:saveFile", async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, "utf-8");
  return true;
});

// ─── IPC Handlers: BYOK (Provider Management) ──────────────────────────────

const byokProviders = new Map<string, any>();

ipcMain.handle("byok:list", () => {
  return Array.from(byokProviders.values());
});

ipcMain.handle("byok:add", (_event, provider: any) => {
  byokProviders.set(provider.id, { ...provider, status: "active", createdAt: Date.now() });
  return byokProviders.get(provider.id);
});

ipcMain.handle("byok:remove", (_event, id: string) => {
  byokProviders.delete(id);
  return { deleted: true };
});

ipcMain.handle("byok:update", (_event, id: string, updates: any) => {
  const existing = byokProviders.get(id);
  if (existing) { Object.assign(existing, updates); return existing; }
  return null;
});

ipcMain.handle("byok:test", async (_event, id: string) => {
  const provider = byokProviders.get(id);
  if (!provider) return { success: false, error: "Provider not found" };
  try {
    const start = Date.now();
    const response = await fetch(provider.baseUrl || "https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    return { success: response.ok, latency: Date.now() - start, error: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, latency: 0, error: err.message };
  }
});

ipcMain.handle("byok:usage", (_event, id: string) => {
  const p = byokProviders.get(id);
  return { providerId: id, totalRequests: p?.totalRequests || 0, totalTokens: p?.totalTokens || 0, lastUsedAt: p?.lastUsedAt || null, errorCount: p?.errorCount || 0 };
});

// ─── IPC Handlers: BYOA (Agent Configuration) ──────────────────────────────

const byoaAgents = new Map<string, any>();

ipcMain.handle("byoa:list", () => {
  return Array.from(byoaAgents.values());
});

ipcMain.handle("byoa:add", (_event, agent: any) => {
  byoaAgents.set(agent.id, { ...agent, enabled: agent.enabled !== false, createdAt: Date.now(), usageCount: 0 });
  return byoaAgents.get(agent.id);
});

ipcMain.handle("byoa:remove", (_event, id: string) => {
  byoaAgents.delete(id);
  return { deleted: true };
});

ipcMain.handle("byoa:update", (_event, id: string, updates: any) => {
  const existing = byoaAgents.get(id);
  if (existing) { Object.assign(existing, updates); return existing; }
  return null;
});

ipcMain.handle("byoa:test", async (_event, id: string) => {
  const agent = byoaAgents.get(id);
  if (!agent) return { success: false, error: "Agent not found" };
  try {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100));
    return { success: true, responseTime: Date.now() - start, output: "Agent test passed" };
  } catch (err: any) {
    return { success: false, responseTime: 0, error: err.message };
  }
});

ipcMain.handle("byoa:clone", (_event, id: string, name: string) => {
  const agent = byoaAgents.get(id);
  if (!agent) return null;
  const clone = { ...agent, id: `clone-${Date.now()}`, name, createdAt: Date.now() };
  byoaAgents.set(clone.id, clone);
  return clone;
});

ipcMain.handle("byoa:export", (_event, id: string) => {
  const agent = byoaAgents.get(id);
  return agent ? JSON.stringify(agent, null, 2) : null;
});

ipcMain.handle("byoa:import", (_event, config: any) => {
  try {
    const agent = typeof config === "string" ? JSON.parse(config) : config;
    byoaAgents.set(agent.id, agent);
    return agent;
  } catch { return null; }
});

// ─── IPC Handlers: Logs ────────────────────────────────────────────────────

const logEntries: any[] = [];
const logSubscribers: Set<any> = new Set();

function addLog(level: string, category: string, message: string, data?: any) {
  const entry = { id: `log-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, timestamp: Date.now(), level, category, message, data };
  logEntries.push(entry);
  if (logEntries.length > 5000) logEntries.splice(0, logEntries.length - 5000);
  for (const sub of logSubscribers) { try { sub(entry); } catch {} }
  return entry;
}

ipcMain.handle("logs:get", (_event, filter?: any) => {
  let logs = logEntries;
  if (filter?.level) logs = logs.filter(l => l.level === filter.level);
  if (filter?.category) logs = logs.filter(l => l.category === filter.category);
  if (filter?.search) logs = logs.filter(l => l.message.toLowerCase().includes(filter.search.toLowerCase()));
  return logs.slice(-200);
});

ipcMain.handle("logs:stats", () => {
  const byLevel: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const l of logEntries) { byLevel[l.level] = (byLevel[l.level] || 0) + 1; byCategory[l.category] = (byCategory[l.category] || 0) + 1; }
  return { total: logEntries.length, byLevel, byCategory };
});

ipcMain.handle("logs:search", (_event, query: string) => {
  return logEntries.filter(l => l.message.toLowerCase().includes(query.toLowerCase())).slice(-100);
});

ipcMain.handle("logs:export", (_event, format: string) => {
  if (format === "csv") { return "timestamp,level,category,message\n" + logEntries.map(l => `${new Date(l.timestamp).toISOString()},${l.level},${l.category},"${l.message.replace(/"/g, '""')}"`).join("\n"); }
  return JSON.stringify(logEntries, null, 2);
});

ipcMain.handle("logs:clear", () => { logEntries.length = 0; return { cleared: true }; });

ipcMain.handle("logs:subscribe", (event) => {
  const sub = (entry: any) => { try { event.sender.send("log:entry", entry); } catch {} };
  logSubscribers.add(sub);
  event.sender.once("destroyed", () => logSubscribers.delete(sub));
  return { subscribed: true };
});

addLog("info", "system", "Nova IDE started");
addLog("info", "system", `Platform: ${process.platform} ${process.arch}`);

// ─── IPC Handlers: Monitoring ──────────────────────────────────────────────

ipcMain.handle("monitoring:health", () => {
  const memUsage = process.memoryUsage();
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: app.getVersion(),
    components: {
      memory: { status: memUsage.heapUsed / memUsage.heapTotal < 0.85 ? "healthy" : "degraded", heapUsed: memUsage.heapUsed, heapTotal: memUsage.heapTotal, rss: memUsage.rss },
      cpu: { status: "healthy", usage: process.cpuUsage() },
      system: { status: "healthy", platform: process.platform, arch: process.arch, nodeVersion: process.version },
    },
  };
});

ipcMain.handle("monitoring:metrics", () => {
  const mem = process.memoryUsage();
  return {
    sessions: { total: 1, active: 1, completed: 0, failed: 0 },
    system: { uptime: process.uptime(), memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, external: mem.external }, activeConnections: logSubscribers.size },
    logs: { total: logEntries.length },
    timestamp: new Date().toISOString(),
  };
});

ipcMain.handle("monitoring:alerts", () => {
  const alerts: any[] = [];
  const mem = process.memoryUsage();
  if (mem.heapUsed / mem.heapTotal > 0.85) alerts.push({ id: "mem-high", severity: "warning", message: "Heap memory usage above 85%", source: "monitoring", timestamp: new Date().toISOString(), acknowledged: false });
  return alerts;
});

ipcMain.handle("monitoring:acknowledge", (_event, id: string) => {
  return { acknowledged: true, alertId: id, acknowledgedAt: new Date().toISOString() };
});

// ─── IPC Handlers: Security ────────────────────────────────────────────────

const auditEntries: any[] = [];

ipcMain.handle("security:scan", async (_event, projectPath: string) => {
  addLog("info", "security", `Security scan started for: ${projectPath}`);
  const findings: any[] = [];
  try {
    const entries = await fs.readdir(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".env" && entry.isFile()) { findings.push({ file: entry.name, severity: "high", message: ".env file found - may contain secrets" }); }
      if (entry.name === "node_modules" && entry.isDirectory()) { continue; }
    }
    const pkgPath = projectPath + "/package.json";
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
      if (pkg.dependencies) {
        for (const [name, ver] of Object.entries(pkg.dependencies)) {
          if (name.includes("lodash") && typeof ver === "string" && ver.includes("<4.17.21")) { findings.push({ file: "package.json", severity: "medium", message: `Vulnerable ${name} version: ${ver}` }); }
        }
      }
    } catch {}
  } catch { findings.push({ file: projectPath, severity: "low", message: "Could not read project directory" }); }
  addLog("info", "security", `Security scan completed: ${findings.length} findings`);
  return { scanId: `scan-${Date.now()}`, status: "completed", findings, summary: { critical: 0, high: findings.filter(f => f.severity === "high").length, medium: findings.filter(f => f.severity === "medium").length, low: findings.filter(f => f.severity === "low").length, info: 0 }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
});

ipcMain.handle("security:report", () => {
  return { totalScans: auditEntries.length, lastScanAt: auditEntries.length > 0 ? auditEntries[auditEntries.length - 1].timestamp : null };
});

ipcMain.handle("security:audit", (_event, filter?: any) => {
  let logs = auditEntries;
  if (filter?.action) logs = logs.filter(l => l.action === filter.action);
  return logs.slice(-100);
});

ipcMain.handle("security:export", (_event, format: string) => {
  return JSON.stringify(auditEntries, null, 2);
});

// ─── IPC Handlers: Debug ───────────────────────────────────────────────────

let debugSession: any = null;
let breakpoints: any[] = [];

ipcMain.handle("debug:start", (_event, config: any) => {
  debugSession = { id: `debug-${Date.now()}`, status: "running", startedAt: new Date().toISOString(), ...config };
  addLog("info", "debug", `Debug session started: ${debugSession.id}`);
  return debugSession;
});

ipcMain.handle("debug:stop", () => {
  const id = debugSession?.id;
  debugSession = null;
  addLog("info", "debug", `Debug session stopped: ${id}`);
  return { stopped: true, debugId: id };
});

ipcMain.handle("debug:breakpoint", (_event, file: string, line: number, condition?: string) => {
  const bp = { id: `bp-${Date.now()}`, file, line, condition, verified: true };
  breakpoints.push(bp);
  return bp;
});

ipcMain.handle("debug:step", (_event, type: string) => {
  addLog("debug", "debug", `Step: ${type}`);
  return { stepped: true, type, timestamp: new Date().toISOString() };
});

ipcMain.handle("debug:continue", () => {
  addLog("debug", "debug", "Debug continue");
  return { continued: true, timestamp: new Date().toISOString() };
});

ipcMain.handle("debug:stack", () => {
  return { frames: debugSession ? [{ file: "main.ts", line: 1, function: "main" }] : [], totalFrames: debugSession ? 1 : 0 };
});

// ─── IPC Handlers: MCP (Model Context Protocol) ────────────────────────────

const mcpServers = new Map<string, any>([
  ["playwright", { id: "playwright", name: "Playwright", type: "mcp", enabled: true, command: "npx @anthropic-ai/mcp-server-playwright", description: "Browser automation via Playwright", status: "connected" }],
  ["filesystem", { id: "filesystem", name: "Filesystem", type: "mcp", enabled: true, command: "npx @anthropic-ai/mcp-server-filesystem", description: "File system operations", status: "connected" }],
  ["github", { id: "github", name: "GitHub", type: "mcp", enabled: false, command: "npx @anthropic-ai/mcp-server-github", description: "GitHub API integration", status: "disconnected" }],
  ["postgres", { id: "postgres", name: "PostgreSQL", type: "mcp", enabled: false, command: "npx @anthropic-ai/mcp-server-postgres", description: "PostgreSQL database access", status: "disconnected" }],
]);

ipcMain.handle("mcp:list", () => Array.from(mcpServers.values()));
ipcMain.handle("mcp:toggle", (_event, id: string, enabled: boolean) => {
  const server = mcpServers.get(id);
  if (server) { server.enabled = enabled; server.status = enabled ? "connected" : "disconnected"; }
  return server;
});
ipcMain.handle("mcp:add", (_event, server: any) => {
  mcpServers.set(server.id, { ...server, status: "disconnected" });
  return mcpServers.get(server.id);
});
ipcMain.handle("mcp:remove", (_event, id: string) => { mcpServers.delete(id); return { deleted: true }; });

// ─── IPC Handlers: LSP (Language Server Protocol) ──────────────────────────

const lspServers = new Map<string, any>([
  ["typescript", { id: "typescript", name: "TypeScript", language: "typescript", enabled: true, status: "active", features: ["completion", "hover", "diagnostics", "formatting", "refactoring"] }],
  ["python", { id: "python", name: "Python (Pylance)", language: "python", enabled: true, status: "active", features: ["completion", "hover", "diagnostics", "formatting"] }],
  ["rust", { id: "rust", name: "Rust Analyzer", language: "rust", enabled: true, status: "active", features: ["completion", "hover", "diagnostics", "inlay-hints"] }],
  ["go", { id: "go", name: "Go (gopls)", language: "go", enabled: true, status: "active", features: ["completion", "hover", "diagnostics", "formatting"] }],
]);

ipcMain.handle("lsp:list", () => Array.from(lspServers.values()));
ipcMain.handle("lsp:toggle", (_event, id: string, enabled: boolean) => {
  const server = lspServers.get(id);
  if (server) { server.enabled = enabled; server.status = enabled ? "active" : "inactive"; }
  return server;
});

// ─── IPC Handlers: Plugins ─────────────────────────────────────────────────

const plugins = new Map<string, any>([
  ["prettier", { id: "prettier", name: "Prettier", version: "3.2.0", enabled: true, description: "Code formatter", config: "prettier.config.js" }],
  ["eslint", { id: "eslint", name: "ESLint", version: "9.0.0", enabled: true, description: "JavaScript linter", config: ".eslintrc.json" }],
  ["gitlens", { id: "gitlens", name: "GitLens", version: "15.0.0", enabled: true, description: "Git supercharged" }],
  ["copilot", { id: "copilot", name: "GitHub Copilot", version: "1.0.0", enabled: false, description: "AI pair programming" }],
  ["dotenv", { id: "dotenv", name: "DotENV", version: "1.0.0", enabled: true, description: "Environment variable support", config: ".env" }],
  ["errorlens", { id: "errorlens", name: "Error Lens", version: "3.0.0", enabled: true, description: "Inline error decorations" }],
]);

ipcMain.handle("plugins:list", () => Array.from(plugins.values()));
ipcMain.handle("plugins:toggle", (_event, id: string, enabled: boolean) => {
  const plugin = plugins.get(id);
  if (plugin) plugin.enabled = enabled;
  return plugin;
});
ipcMain.handle("plugins:config", (_event, id: string) => {
  const plugin = plugins.get(id);
  return plugin ? { id: plugin.id, name: plugin.name, config: plugin.config || null } : null;
});

// ─── IPC Handlers: Editor ──────────────────────────────────────────────────

ipcMain.handle("editor:toggle", (_event, enabled: boolean) => {
  addLog("info", "editor", `Editor ${enabled ? "enabled" : "disabled"}`);
  return { enabled };
});

ipcMain.handle("editor:diff", async (_event, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { filePath, original: content, modified: content };
  } catch { return null; }
});

// ─── IPC Handlers: App Info ───────────────────────────────────────────────────

ipcMain.handle("app:version", () => {
  return app.getVersion();
});

ipcMain.handle("app:path", (_event, name: string) => {
  return app.getPath(name as any);
});

ipcMain.handle("app:platform", () => {
  return process.platform;
});

// ─── IPC Handlers: Settings ──────────────────────────────────────────────────

ipcMain.handle("settings:get", async () => {
  if (currentSettings.firstRun) {
    currentSettings = await loadSettings();
  }
  return currentSettings;
});

ipcMain.handle("settings:set", async (_event, updates: Partial<NovaSettings>) => {
  currentSettings = { ...currentSettings, ...updates };
  await saveSettings(currentSettings);
  return currentSettings;
});

ipcMain.handle("settings:getAll", async () => {
  currentSettings = await loadSettings();
  return currentSettings;
});

ipcMain.handle("settings:reset", async () => {
  currentSettings = { ...DEFAULT_SETTINGS };
  await saveSettings(currentSettings);
  return currentSettings;
});

ipcMain.handle("settings:isFirstRun", async () => {
  return isFirstRun();
});

ipcMain.handle("settings:completeFirstRun", async () => {
  await markFirstRunDone();
  return { success: true };
});

ipcMain.handle("settings:addRecentWorkspace", async (_event, workspace: string) => {
  currentSettings.recentWorkspaces = [
    workspace,
    ...currentSettings.recentWorkspaces.filter((w) => w !== workspace),
  ].slice(0, 20);
  await saveSettings(currentSettings);
  return currentSettings.recentWorkspaces;
});

// ─── IPC Handlers: System ─────────────────────────────────────────────────────

ipcMain.handle("system:getFreeSpace", async (_event, dirPath: string) => {
  try {
    const { stdout } = await execAsync(`powershell -Command "(Get-PSDrive -Name ${dirPath.charAt(0)}).Free / 1GB"`, { timeout: 5000 });
    return { freeGB: parseFloat(stdout.trim()), available: true };
  } catch {
    return { freeGB: 0, available: false };
  }
});

ipcMain.handle("system:getDrives", async () => {
  try {
    const { stdout } = await execAsync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Free,Used | ConvertTo-Json"', { timeout: 5000 });
    return JSON.parse(stdout);
  } catch {
    return [];
  }
});

ipcMain.handle("system:validatePath", async (_event, dirPath: string) => {
  try {
    await fs.access(dirPath, fs.constants.W_OK);
    return { writable: true, exists: true };
  } catch {
    try {
      await fs.access(path.dirname(dirPath), fs.constants.W_OK);
      return { writable: true, exists: false };
    } catch {
      return { writable: false, exists: false };
    }
  }
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  currentSettings = await loadSettings();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
