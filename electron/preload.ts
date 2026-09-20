import { contextBridge, ipcRenderer } from "electron";

function wrapInvoke<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    try { return await fn(...args); }
    catch (error: any) { throw new Error(error?.message ?? String(error)); }
  }) as T;
}

function invoke(channel: string, ...args: any[]) {
  return ipcRenderer.invoke(channel, ...args);
}

const novaAPI = {
  fs: {
    readFile: wrapInvoke((p: string, e?: string) => invoke("fs:readFile", p, e)),
    writeFile: wrapInvoke((p: string, c: string) => invoke("fs:writeFile", p, c)),
    readdir: wrapInvoke((p: string) => invoke("fs:readdir", p)),
    mkdir: wrapInvoke((p: string, r?: boolean) => invoke("fs:mkdir", p, r)),
    rm: wrapInvoke((p: string, o?: any) => invoke("fs:rm", p, o)),
    rename: wrapInvoke((o: string, n: string) => invoke("fs:rename", o, n)),
    exists: wrapInvoke((p: string) => invoke("fs:exists", p)),
    stat: wrapInvoke((p: string) => invoke("fs:stat", p)),
  },
  git: {
    status: wrapInvoke((c: string) => invoke("git:status", c)),
    add: wrapInvoke((c: string, f: string[]) => invoke("git:add", c, f)),
    commit: wrapInvoke((c: string, m: string) => invoke("git:commit", c, m)),
    push: wrapInvoke((c: string, r?: string, b?: string) => invoke("git:push", c, r, b)),
    pull: wrapInvoke((c: string, r?: string, b?: string) => invoke("git:pull", c, r, b)),
    log: wrapInvoke((c: string, n?: number) => invoke("git:log", c, n)),
  },
  terminal: {
    execute: wrapInvoke((cmd: string, cwd?: string) => invoke("terminal:execute", cmd, cwd)),
  },
  chat: {
    send: wrapInvoke((msg: string, ctx?: any) => invoke("chat:send", msg, ctx)),
  },
  dialog: {
    openFile: wrapInvoke(() => invoke("dialog:openFile")),
    openFolder: wrapInvoke(() => invoke("dialog:openFolder")),
    saveFile: wrapInvoke((p: string, c: string) => invoke("dialog:saveFile", p, c)),
  },
  byok: {
    listProviders: wrapInvoke(() => invoke("byok:list")),
    addProvider: wrapInvoke((p: any) => invoke("byok:add", p)),
    removeProvider: wrapInvoke((id: string) => invoke("byok:remove", id)),
    updateProvider: wrapInvoke((id: string, p: any) => invoke("byok:update", id, p)),
    testProvider: wrapInvoke((id: string) => invoke("byok:test", id)),
    getKeyUsage: wrapInvoke((id: string) => invoke("byok:usage", id)),
  },
  byoa: {
    listAgents: wrapInvoke(() => invoke("byoa:list")),
    addAgent: wrapInvoke((a: any) => invoke("byoa:add", a)),
    removeAgent: wrapInvoke((id: string) => invoke("byoa:remove", id)),
    updateAgent: wrapInvoke((id: string, a: any) => invoke("byoa:update", id, a)),
    testAgent: wrapInvoke((id: string) => invoke("byoa:test", id)),
    cloneAgent: wrapInvoke((id: string, n: string) => invoke("byoa:clone", id, n)),
    exportAgent: wrapInvoke((id: string) => invoke("byoa:export", id)),
    importAgent: wrapInvoke((c: any) => invoke("byoa:import", c)),
  },
  logs: {
    getLogs: wrapInvoke((f?: any) => invoke("logs:get", f)),
    getStats: wrapInvoke(() => invoke("logs:stats")),
    search: wrapInvoke((q: string) => invoke("logs:search", q)),
    exportLogs: wrapInvoke((fmt: string) => invoke("logs:export", fmt)),
    clear: wrapInvoke(() => invoke("logs:clear")),
    subscribe: wrapInvoke(() => invoke("logs:subscribe")),
  },
  monitoring: {
    getHealth: wrapInvoke(() => invoke("monitoring:health")),
    getMetrics: wrapInvoke(() => invoke("monitoring:metrics")),
    getAlerts: wrapInvoke(() => invoke("monitoring:alerts")),
    acknowledgeAlert: wrapInvoke((id: string) => invoke("monitoring:acknowledge", id)),
  },
  security: {
    scan: wrapInvoke((p: string) => invoke("security:scan", p)),
    getReport: wrapInvoke(() => invoke("security:report")),
    getAuditLog: wrapInvoke((f?: any) => invoke("security:audit", f)),
    exportAudit: wrapInvoke((fmt: string) => invoke("security:export", fmt)),
  },
  debug: {
    start: wrapInvoke((c: any) => invoke("debug:start", c)),
    stop: wrapInvoke((id?: string) => invoke("debug:stop", id)),
    setBreakpoint: wrapInvoke((f: string, l: number, c?: string) => invoke("debug:breakpoint", f, l, c)),
    step: wrapInvoke((t: string) => invoke("debug:step", t)),
    continue: wrapInvoke(() => invoke("debug:continue")),
    getStack: wrapInvoke(() => invoke("debug:stack")),
  },
  mcp: {
    list: wrapInvoke(() => invoke("mcp:list")),
    toggle: wrapInvoke((id: string, e: boolean) => invoke("mcp:toggle", id, e)),
    add: wrapInvoke((s: any) => invoke("mcp:add", s)),
    remove: wrapInvoke((id: string) => invoke("mcp:remove", id)),
  },
  lsp: {
    list: wrapInvoke(() => invoke("lsp:list")),
    toggle: wrapInvoke((id: string, e: boolean) => invoke("lsp:toggle", id, e)),
  },
  plugins: {
    list: wrapInvoke(() => invoke("plugins:list")),
    toggle: wrapInvoke((id: string, e: boolean) => invoke("plugins:toggle", id, e)),
    config: wrapInvoke((id: string) => invoke("plugins:config", id)),
  },
  editor: {
    toggle: wrapInvoke((e: boolean) => invoke("editor:toggle", e)),
    diff: wrapInvoke((p: string) => invoke("editor:diff", p)),
  },
  app: {
    version: wrapInvoke(() => invoke("app:version")),
    path: wrapInvoke((n: string) => invoke("app:path", n)),
    platform: wrapInvoke(() => invoke("app:platform")),
  },
  on(channel: string, callback: (...args: any[]) => void): () => void {
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  },
};

contextBridge.exposeInMainWorld("nova", novaAPI);
