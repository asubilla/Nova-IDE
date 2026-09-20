export interface IDELayoutOptions {
  sidebarWidth?: number;
  sidebarMinWidth?: number;
  sidebarMaxWidth?: number;
  bottomPanelHeight?: number;
  bottomPanelMinHeight?: number;
  bottomPanelMaxHeight?: number;
  defaultPanel?: string;
}

export interface Panel {
  id: string;
  title: string;
  element: HTMLElement;
  tabs: Tab[];
  activeTabId: string | null;
  visible: boolean;
  splitDirection?: "horizontal" | "vertical";
}

export interface Tab {
  id: string;
  title: string;
  path: string;
  icon?: string;
  modified?: boolean;
  element?: HTMLElement;
}

export interface SplitPanel {
  id: string;
  children: Panel[];
  direction: "horizontal" | "vertical";
  ratio: number;
}

const DEFAULT_OPTIONS: Required<IDELayoutOptions> = {
  sidebarWidth: 260,
  sidebarMinWidth: 180,
  sidebarMaxWidth: 500,
  bottomPanelHeight: 200,
  bottomPanelMinHeight: 100,
  bottomPanelMaxHeight: 600,
  defaultPanel: "editor",
};

export class IDELayout {
  private container: HTMLElement;
  private options: Required<IDELayoutOptions>;
  private root: HTMLElement | null = null;
  private sidebarElement: HTMLElement | null = null;
  private editorArea: HTMLElement | null = null;
  private bottomPanel: HTMLElement | null = null;
  private bottomPanelContent: HTMLElement | null = null;
  private bottomPanelTabs: HTMLElement | null = null;
  private statusBar: HTMLElement | null = null;

  private panels: Map<string, Panel> = new Map();
  private activePanelId: string = "editor";
  private sidebarVisible: boolean = true;
  private bottomVisible: boolean = false;
  private commandPaletteVisible: boolean = false;
  private quickOpenVisible: boolean = false;
  private commandPaletteElement: HTMLElement | null = null;
  private quickOpenElement: HTMLElement | null = null;

  private openFiles: Map<string, Tab> = new Map();
  private activeFile: string | null = null;

  private resizeState: {
    target: "sidebar" | "bottom" | null;
    startX: number;
    startY: number;
    startSize: number;
  } | null = null;

  constructor(container: HTMLElement, options: IDELayoutOptions = {}) {
    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  render(): void {
    this.container.innerHTML = "";
    this.container.classList.add("ide-layout");

    this.root = document.createElement("div");
    this.root.className = "ide-root";
    this.root.style.cssText = `
      display: grid;
      grid-template-columns: ${this.sidebarVisible ? this.options.sidebarWidth + "px" : "0px"} 1fr;
      grid-template-rows: 1fr ${this.bottomVisible ? this.options.bottomPanelHeight + "px" : "0px"} 24px;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #1E1E1E;
    `;
    this.container.appendChild(this.root);

    this.renderSidebar();
    this.renderMainArea();
    this.renderBottomPanel();
    this.renderStatusBar();

    this.setupResizeHandlers();
  }

  private renderSidebar(): void {
    this.sidebarElement = document.createElement("div");
    this.sidebarElement.className = "ide-sidebar";
    this.sidebarElement.style.cssText = `
      grid-row: 1 / 3;
      grid-column: 1;
      overflow: hidden;
      display: ${this.sidebarVisible ? "flex" : "none"};
      flex-direction: column;
      background: #252526;
      border-right: 1px solid #333;
      min-width: ${this.options.sidebarMinWidth}px;
      max-width: ${this.options.sidebarMaxWidth}px;
    `;
    this.root!.appendChild(this.sidebarElement);

    const header = document.createElement("div");
    header.className = "sidebar-header";
    header.style.cssText = `
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #BBB;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.textContent = "EXPLORER";
    this.sidebarElement.appendChild(header);

    const content = document.createElement("div");
    content.className = "sidebar-content";
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    `;
    this.sidebarElement.appendChild(content);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle sidebar-resize";
    resizeHandle.style.cssText = `
      width: 4px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.15s;
      position: absolute;
      top: 0;
      bottom: 0;
      right: -2px;
      z-index: 10;
    `;
    resizeHandle.addEventListener("mouseenter", () => {
      resizeHandle.style.background = "#007ACC";
    });
    resizeHandle.addEventListener("mouseleave", () => {
      if (!this.resizeState || this.resizeState.target !== "sidebar") {
        resizeHandle.style.background = "transparent";
      }
    });
    this.sidebarElement.appendChild(resizeHandle);
  }

  private renderMainArea(): void {
    const mainArea = document.createElement("div");
    mainArea.className = "ide-main";
    mainArea.style.cssText = `
      grid-row: 1;
      grid-column: 2;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    this.root!.appendChild(mainArea);

    this.renderTabBar(mainArea);

    this.editorArea = document.createElement("div");
    this.editorArea.className = "ide-editor-area";
    this.editorArea.style.cssText = `
      flex: 1;
      overflow: hidden;
      position: relative;
    `;
    mainArea.appendChild(this.editorArea);
  }

  private renderTabBar(parent: HTMLElement): void {
    const tabBar = document.createElement("div");
    tabBar.className = "ide-tab-bar";
    tabBar.style.cssText = `
      display: flex;
      align-items: stretch;
      background: #252526;
      border-bottom: 1px solid #333;
      height: 35px;
      overflow-x: auto;
      overflow-y: hidden;
      flex-shrink: 0;
    `;
    parent.appendChild(tabBar);
  }

  private renderBottomPanel(): void {
    this.bottomPanel = document.createElement("div");
    this.bottomPanel.className = "ide-bottom-panel";
    this.bottomPanel.style.cssText = `
      grid-row: 2;
      grid-column: 1 / 3;
      display: ${this.bottomVisible ? "flex" : "none"};
      flex-direction: column;
      background: #1E1E1E;
      border-top: 1px solid #333;
      min-height: ${this.options.bottomPanelMinHeight}px;
      max-height: ${this.options.bottomPanelMaxHeight}px;
    `;
    this.root!.appendChild(this.bottomPanel);

    this.bottomPanelTabs = document.createElement("div");
    this.bottomPanelTabs.className = "bottom-panel-tabs";
    this.bottomPanelTabs.style.cssText = `
      display: flex;
      align-items: stretch;
      background: #252526;
      border-bottom: 1px solid #333;
      height: 30px;
      flex-shrink: 0;
    `;
    this.bottomPanel.appendChild(this.bottomPanelTabs);

    const tabs = ["Terminal", "Output", "Problems"];
    for (const tabName of tabs) {
      const tab = document.createElement("div");
      tab.className = "bottom-panel-tab";
      tab.textContent = tabName;
      tab.style.cssText = `
        padding: 0 12px;
        font-size: 12px;
        color: #999;
        cursor: pointer;
        display: flex;
        align-items: center;
        border-bottom: 2px solid transparent;
        user-select: none;
      `;
      tab.addEventListener("click", () => {
        this.setActiveBottomTab(tabName.toLowerCase());
      });
      this.bottomPanelTabs.appendChild(tab);
    }

    const closeBtn = document.createElement("div");
    closeBtn.className = "bottom-panel-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.style.cssText = `
      margin-left: auto;
      padding: 0 8px;
      cursor: pointer;
      color: #999;
      font-size: 16px;
      display: flex;
      align-items: center;
    `;
    closeBtn.addEventListener("click", () => this.toggleOutput());
    this.bottomPanelTabs.appendChild(closeBtn);

    this.bottomPanelContent = document.createElement("div");
    this.bottomPanelContent.className = "bottom-panel-content";
    this.bottomPanelContent.style.cssText = `
      flex: 1;
      overflow: hidden;
      position: relative;
    `;
    this.bottomPanel.appendChild(this.bottomPanelContent);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle bottom-resize";
    resizeHandle.style.cssText = `
      height: 4px;
      cursor: row-resize;
      background: transparent;
      transition: background 0.15s;
      position: absolute;
      left: 0;
      right: 0;
      top: -2px;
      z-index: 10;
    `;
    resizeHandle.addEventListener("mouseenter", () => {
      resizeHandle.style.background = "#007ACC";
    });
    resizeHandle.addEventListener("mouseleave", () => {
      if (!this.resizeState || this.resizeState.target !== "bottom") {
        resizeHandle.style.background = "transparent";
      }
    });
    this.bottomPanel.appendChild(resizeHandle);
  }

  private renderStatusBar(): void {
    this.statusBar = document.createElement("div");
    this.statusBar.className = "ide-status-bar";
    this.statusBar.style.cssText = `
      grid-row: 3;
      grid-column: 1 / 3;
      display: flex;
      align-items: center;
      background: #007ACC;
      color: white;
      font-size: 12px;
      padding: 0 10px;
      justify-content: space-between;
    `;
    this.root!.appendChild(this.statusBar);

    const left = document.createElement("div");
    left.className = "status-left";
    left.style.cssText = "display: flex; gap: 12px; align-items: center;";
    this.statusBar.appendChild(left);

    const right = document.createElement("div");
    right.className = "status-right";
    right.style.cssText = "display: flex; gap: 12px; align-items: center;";
    this.statusBar.appendChild(right);
  }

  private setupResizeHandlers(): void {
    document.addEventListener("mousemove", (e) => {
      if (!this.resizeState) return;

      const dx = e.clientX - this.resizeState.startX;
      const dy = e.clientY - this.resizeState.startY;

      if (this.resizeState.target === "sidebar") {
        const newWidth = Math.max(
          this.options.sidebarMinWidth,
          Math.min(this.options.sidebarMaxWidth, this.resizeState.startSize + dx)
        );
        this.options.sidebarWidth = newWidth;
        this.root!.style.gridTemplateColumns = `${newWidth}px 1fr`;
      } else if (this.resizeState.target === "bottom") {
        const newHeight = Math.max(
          this.options.bottomPanelMinHeight,
          Math.min(this.options.bottomPanelMaxHeight, this.resizeState.startSize - dy)
        );
        this.options.bottomPanelHeight = newHeight;
        this.root!.style.gridTemplateRows = `1fr ${newHeight}px 24px`;
      }
    });

    document.addEventListener("mouseup", () => {
      if (this.resizeState) {
        const handle = this.container.querySelector(
          `.resize-handle.${this.resizeState.target}-resize`
        ) as HTMLElement;
        if (handle) handle.style.background = "transparent";
        this.resizeState = null;
      }
    });

    const sidebarHandle = this.container.querySelector(".sidebar-resize") as HTMLElement;
    if (sidebarHandle) {
      sidebarHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.resizeState = {
          target: "sidebar",
          startX: e.clientX,
          startY: e.clientY,
          startSize: this.options.sidebarWidth,
        };
      });
    }

    const bottomHandle = this.container.querySelector(".bottom-resize") as HTMLElement;
    if (bottomHandle) {
      bottomHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.resizeState = {
          target: "bottom",
          startX: e.clientX,
          startY: e.clientY,
          startSize: this.options.bottomPanelHeight,
        };
      });
    }
  }

  getSplitPanels(): Panel[] {
    return Array.from(this.panels.values());
  }

  splitHorizontal(panelId: string): void {
    const existing = this.panels.get(panelId);
    if (!existing) return;

    const newPanel: Panel = {
      id: `${panelId}-split-${Date.now()}`,
      title: existing.title,
      element: existing.element.cloneNode(true) as HTMLElement,
      tabs: [],
      activeTabId: null,
      visible: true,
      splitDirection: "horizontal",
    };

    this.panels.set(newPanel.id, newPanel);
  }

  splitVertical(panelId: string): void {
    const existing = this.panels.get(panelId);
    if (!existing) return;

    const newPanel: Panel = {
      id: `${panelId}-split-${Date.now()}`,
      title: existing.title,
      element: existing.element.cloneNode(true) as HTMLElement,
      tabs: [],
      activeTabId: null,
      visible: true,
      splitDirection: "vertical",
    };

    this.panels.set(newPanel.id, newPanel);
  }

  closePanel(panelId: string): void {
    this.panels.delete(panelId);
  }

  maximizePanel(panelId: string): void {
    this.panels.forEach((panel, id) => {
      if (id !== panelId) {
        panel.visible = false;
      } else {
        panel.visible = true;
      }
    });
  }

  focusPanel(panelId: string): void {
    this.activePanelId = panelId;
  }

  addTab(panelId: string, tab: Tab): void {
    let panel = this.panels.get(panelId);
    if (!panel) {
      panel = {
        id: panelId,
        title: panelId,
        element: this.editorArea || this.container,
        tabs: [],
        activeTabId: null,
        visible: true,
      };
      this.panels.set(panelId, panel);
    }

    const existing = panel.tabs.find((t) => t.path === tab.path);
    if (existing) {
      panel.activeTabId = existing.id;
      this.openFiles.set(tab.path, existing);
    } else {
      panel.tabs.push(tab);
      panel.activeTabId = tab.id;
      this.openFiles.set(tab.path, tab);
    }

    this.activeFile = tab.path;
    this.renderTabs();
  }

  removeTab(panelId: string, tabId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.tabs = panel.tabs.filter((t) => t.id !== tabId);
    if (panel.activeTabId === tabId) {
      panel.activeTabId = panel.tabs.length > 0 ? panel.tabs[panel.tabs.length - 1].id : null;
    }

    let pathToRemove: string | null = null;
    this.openFiles.forEach((tab, path) => {
      if (tab.id === tabId) {
        pathToRemove = path;
      }
    });
    if (pathToRemove) {
      this.openFiles.delete(pathToRemove);
    }

    this.renderTabs();
  }

  switchTab(panelId: string, tabId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.activeTabId = tabId;
    const tab = panel.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.activeFile = tab.path;
    }

    this.renderTabs();
  }

  getOpenFiles(): Tab[] {
    return Array.from(this.openFiles.values());
  }

  setActiveFile(path: string): void {
    this.activeFile = path;
    const tab = this.openFiles.get(path);
    if (tab) {
      const panel = this.panels.get("editor");
      if (panel) {
        panel.activeTabId = tab.id;
        this.renderTabs();
      }
    }
  }

  showCommandPalette(): void {
    if (this.commandPaletteVisible) {
      this.hideCommandPalette();
      return;
    }

    this.commandPaletteElement = document.createElement("div");
    this.commandPaletteElement.className = "command-palette-overlay";
    this.commandPaletteElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      justify-content: center;
      padding-top: 80px;
    `;

    const palette = document.createElement("div");
    palette.className = "command-palette";
    palette.style.cssText = `
      width: 600px;
      max-height: 400px;
      background: #252526;
      border: 1px solid #454545;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type a command...";
    input.style.cssText = `
      padding: 10px 14px;
      background: #3C3C3C;
      color: #CCC;
      border: none;
      border-bottom: 1px solid #454545;
      font-size: 14px;
      outline: none;
    `;
    palette.appendChild(input);

    const list = document.createElement("div");
    list.className = "command-palette-list";
    list.style.cssText = `
      overflow-y: auto;
      flex: 1;
    `;

    const commands = [
      { id: "toggle-sidebar", label: "Toggle Sidebar", shortcut: "Ctrl+B" },
      { id: "toggle-terminal", label: "Toggle Terminal", shortcut: "Ctrl+`" },
      { id: "toggle-output", label: "Toggle Output Panel" },
      { id: "toggle-problems", label: "Toggle Problems Panel" },
      { id: "format-document", label: "Format Document", shortcut: "Shift+Alt+F" },
      { id: "quick-open", label: "Quick Open File", shortcut: "Ctrl+P" },
      { id: "save", label: "Save File", shortcut: "Ctrl+S" },
      { id: "save-all", label: "Save All Files", shortcut: "Ctrl+K S" },
      { id: "close-tab", label: "Close Tab", shortcut: "Ctrl+W" },
      { id: "close-all", label: "Close All Tabs" },
    ];

    const renderCommands = (filter: string) => {
      list.innerHTML = "";
      const lower = filter.toLowerCase();
      const filtered = commands.filter(
        (c) => !filter || c.label.toLowerCase().includes(lower)
      );

      for (const cmd of filtered) {
        const item = document.createElement("div");
        item.className = "command-palette-item";
        item.style.cssText = `
          padding: 8px 14px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #CCC;
          font-size: 13px;
        `;
        item.innerHTML = `
          <span>${cmd.label}</span>
          ${cmd.shortcut ? `<span style="color:#888;font-size:11px">${cmd.shortcut}</span>` : ""}
        `;
        item.addEventListener("mouseenter", () => {
          item.style.background = "#094771";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
        });
        item.addEventListener("click", () => {
          this.executeCommand(cmd.id);
          this.hideCommandPalette();
        });
        list.appendChild(item);
      }
    };

    renderCommands("");
    input.addEventListener("input", () => renderCommands(input.value));
    palette.appendChild(list);

    this.commandPaletteElement.appendChild(palette);
    this.commandPaletteElement.addEventListener("click", (e) => {
      if (e.target === this.commandPaletteElement) this.hideCommandPalette();
    });

    document.body.appendChild(this.commandPaletteElement);
    this.commandPaletteVisible = true;
    input.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hideCommandPalette();
        document.removeEventListener("keydown", handleKey);
      }
    };
    document.addEventListener("keydown", handleKey);
  }

  hideCommandPalette(): void {
    if (this.commandPaletteElement) {
      this.commandPaletteElement.remove();
      this.commandPaletteElement = null;
    }
    this.commandPaletteVisible = false;
  }

  showQuickOpen(): void {
    if (this.quickOpenVisible) {
      this.hideQuickOpen();
      return;
    }

    this.quickOpenElement = document.createElement("div");
    this.quickOpenElement.className = "quick-open-overlay";
    this.quickOpenElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      justify-content: center;
      padding-top: 80px;
    `;

    const palette = document.createElement("div");
    palette.className = "quick-open";
    palette.style.cssText = `
      width: 600px;
      max-height: 400px;
      background: #252526;
      border: 1px solid #454545;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search files by name...";
    input.style.cssText = `
      padding: 10px 14px;
      background: #3C3C3C;
      color: #CCC;
      border: none;
      border-bottom: 1px solid #454545;
      font-size: 14px;
      outline: none;
    `;
    palette.appendChild(input);

    const list = document.createElement("div");
    list.className = "quick-open-list";
    list.style.cssText = `overflow-y: auto; flex: 1;`;
    palette.appendChild(list);

    const renderFiles = (filter: string) => {
      list.innerHTML = "";
      const lower = filter.toLowerCase();
      const files = Array.from(this.openFiles.values()).filter(
        (f) => !filter || f.path.toLowerCase().includes(lower)
      );

      for (const file of files) {
        const item = document.createElement("div");
        item.className = "quick-open-item";
        item.style.cssText = `
          padding: 8px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #CCC;
          font-size: 13px;
        `;
        const filename = file.path.split("/").pop() || file.path;
        item.innerHTML = `
          <span style="color:#888;font-size:11px;">${file.icon || "?"}</span>
          <span>${filename}</span>
          <span style="color:#888;font-size:11px;margin-left:auto;">${file.path}</span>
        `;
        item.addEventListener("mouseenter", () => {
          item.style.background = "#094771";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
        });
        item.addEventListener("click", () => {
          this.setActiveFile(file.path);
          this.hideQuickOpen();
        });
        list.appendChild(item);
      }
    };

    renderFiles("");
    input.addEventListener("input", () => renderFiles(input.value));
    this.quickOpenElement.appendChild(palette);
    this.quickOpenElement.addEventListener("click", (e) => {
      if (e.target === this.quickOpenElement) this.hideQuickOpen();
    });

    document.body.appendChild(this.quickOpenElement);
    this.quickOpenVisible = true;
    input.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hideQuickOpen();
        document.removeEventListener("keydown", handleKey);
      }
    };
    document.addEventListener("keydown", handleKey);
  }

  hideQuickOpen(): void {
    if (this.quickOpenElement) {
      this.quickOpenElement.remove();
      this.quickOpenElement = null;
    }
    this.quickOpenVisible = false;
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    if (this.sidebarElement) {
      this.sidebarElement.style.display = this.sidebarVisible ? "flex" : "none";
    }
    if (this.root) {
      this.root.style.gridTemplateColumns = `${this.sidebarVisible ? this.options.sidebarWidth : 0}px 1fr`;
    }
  }

  toggleTerminal(): void {
    this.bottomVisible = !this.bottomVisible;
    if (this.bottomPanel) {
      this.bottomPanel.style.display = this.bottomVisible ? "flex" : "none";
    }
    if (this.root) {
      this.root.style.gridTemplateRows = `1fr ${this.bottomVisible ? this.options.bottomPanelHeight : 0}px 24px`;
    }
  }

  toggleOutput(): void {
    this.toggleTerminal();
  }

  toggleProblems(): void {
    this.toggleTerminal();
  }

  private renderTabs(): void {
    const tabBar = this.root?.querySelector(".ide-tab-bar");
    if (!tabBar) return;
    tabBar.innerHTML = "";

    const panel = this.panels.get("editor");
    if (!panel) return;

    for (const tab of panel.tabs) {
      const tabEl = document.createElement("div");
      tabEl.className = "ide-tab" + (tab.id === panel.activeTabId ? " active" : "");
      tabEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 12px;
        font-size: 13px;
        color: ${tab.id === panel.activeTabId ? "#FFF" : "#999"};
        background: ${tab.id === panel.activeTabId ? "#1E1E1E" : "#2D2D2D"};
        border-right: 1px solid #333;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        min-width: 0;
        position: relative;
      `;

      if (tab.id === panel.activeTabId) {
        tabEl.style.borderTop = "2px solid #007ACC";
      }

      const filename = tab.path.split("/").pop() || tab.path;
      const label = document.createElement("span");
      label.textContent = (tab.modified ? "\u25CF " : "") + filename;
      tabEl.appendChild(label);

      const closeBtn = document.createElement("span");
      closeBtn.innerHTML = "&times;";
      closeBtn.style.cssText = `
        font-size: 14px;
        opacity: 0.5;
        padding: 2px;
        border-radius: 3px;
      `;
      closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.background = "#4E4E4E";
        closeBtn.style.opacity = "1";
      });
      closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.background = "transparent";
        closeBtn.style.opacity = "0.5";
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeTab("editor", tab.id);
      });
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener("click", () => {
        this.switchTab("editor", tab.id);
      });

      tabBar.appendChild(tabEl);
    }
  }

  private setActiveBottomTab(name: string): void {
    const tabs = this.bottomPanelTabs?.querySelectorAll(".bottom-panel-tab");
    tabs?.forEach((tab) => {
      const el = tab as HTMLElement;
      if (el.textContent?.toLowerCase() === name) {
        el.style.color = "#FFF";
        el.style.borderBottomColor = "#007ACC";
      } else {
        el.style.color = "#999";
        el.style.borderBottomColor = "transparent";
      }
    });
  }

  private executeCommand(commandId: string): void {
    switch (commandId) {
      case "toggle-sidebar":
        this.toggleSidebar();
        break;
      case "toggle-terminal":
        this.toggleTerminal();
        break;
      case "toggle-output":
        this.toggleOutput();
        break;
      case "toggle-problems":
        this.toggleProblems();
        break;
      case "quick-open":
        this.showQuickOpen();
        break;
      case "close-tab":
        if (this.activeFile) {
          const panel = this.panels.get("editor");
          const tab = panel?.tabs.find((t) => t.path === this.activeFile);
          if (tab) this.removeTab("editor", tab.id);
        }
        break;
      case "close-all":
        const editorPanel = this.panels.get("editor");
        if (editorPanel) {
          editorPanel.tabs = [];
          editorPanel.activeTabId = null;
          this.openFiles.clear();
          this.renderTabs();
        }
        break;
    }
  }

  dispose(): void {
    this.container.innerHTML = "";
    this.panels.clear();
    this.openFiles.clear();
    this.hideCommandPalette();
    this.hideQuickOpen();
  }
}
