declare module 'electron' {
  export interface Event {}
  export class BrowserWindow {
    static getAllWindows(): BrowserWindow[];
    constructor(options?: any);
    loadFile(path: string): void;
    loadURL(url: string): void;
    show(): void;
    once(event: string, callback: (...args: any[]) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
    webContents: {
      send(channel: string, ...args: any[]): void;
      on(event: string, callback: (...args: any[]) => void): void;
      toggleDevTools(): void;
      setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void;
    };
  }
  export class app {
    static getPath(name: string): string;
    static getVersion(): string;
    static on(event: string, callback: (...args: any[]) => void): void;
    static whenReady(): Promise<void>;
    static quit(): void;
  }
  export class ipcMain {
    static handle(channel: string, handler: (event: any, ...args: any[]) => any): void;
  }
  export class ipcRenderer {
    static invoke(channel: string, ...args: any[]): Promise<any>;
    static on(channel: string, listener: (...args: any[]) => void): void;
    static removeListener(channel: string, listener: (...args: any[]) => void): void;
  }
  export class contextBridge {
    static exposeInMainWorld(api: string, methods: Record<string, any>): void;
  }
  export class Menu {
    static buildFromTemplate(template: any[]): Menu;
    static setApplicationMenu(menu: Menu | null): void;
  }
  export class MenuItem {
    constructor(options: any);
  }
  export class shell {
    static openExternal(url: string): Promise<void>;
  }
}
