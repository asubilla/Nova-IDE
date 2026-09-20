import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { existsSync, statSync, readFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function getWebPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "web", "index.html");
  }
  return path.join(process.resourcesPath, "web", "index.html");
}

function getPreloadPath(): string {
  if (isDev) {
    return path.join(__dirname, "preload.js");
  }
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
    icon: path.join(__dirname, "..", "electron", "assets", "icon.png"),
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

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
