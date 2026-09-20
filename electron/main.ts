import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { existsSync, statSync } from "fs";
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
