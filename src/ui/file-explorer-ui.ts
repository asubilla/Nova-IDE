export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  expanded?: boolean;
  selected?: boolean;
  hidden?: boolean;
  size?: number;
  modified?: Date;
}

export interface FileSystemAdapter {
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ type: "file" | "directory"; size: number; mtime: Date }>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  action?: () => void;
  children?: ContextMenuItem[];
}

export interface FileExplorerUIOptions {
  rootPath?: string;
  showHidden?: boolean;
  multiSelect?: boolean;
  dragDrop?: boolean;
}

type FileClickCallback = (path: string, node: FileTreeNode) => void;
type ContextMenuCallback = (x: number, y: number, path: string, node: FileTreeNode) => void;

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: "TS", color: "#3178C6" },
  tsx: { icon: "TX", color: "#3178C6" },
  js: { icon: "JS", color: "#F7DF1E" },
  jsx: { icon: "JX", color: "#F7DF1E" },
  json: { icon: "{}", color: "#CB3837" },
  md: { icon: "M", color: "#519ABA" },
  css: { icon: "#", color: "#563D7C" },
  scss: { icon: "S", color: "#C6538C" },
  html: { icon: "<>", color: "#E44D26" },
  py: { icon: "Py", color: "#3776AB" },
  go: { icon: "Go", color: "#00ADD8" },
  rs: { icon: "Rs", color: "#DEA584" },
  java: { icon: "J", color: "#ED8B00" },
  cpp: { icon: "C+", color: "#00599C" },
  c: { icon: "C", color: "#A8B9CC" },
  yaml: { icon: "Y", color: "#CB171E" },
  yml: { icon: "Y", color: "#CB171E" },
  toml: { icon: "T", color: "#9C4221" },
  env: { icon: "E", color: "#ECD53F" },
  gitignore: { icon: "G", color: "#F05032" },
  sh: { icon: "$", color: "#4EAA25" },
  bash: { icon: "B", color: "#4EAA25" },
  ps1: { icon: "PS", color: "#012456" },
  txt: { icon: "T", color: "#89A0C6" },
  log: { icon: "L", color: "#89A0C6" },
  svg: { icon: "S", color: "#FFB13B" },
  png: { icon: "P", color: "#A855F7" },
  jpg: { icon: "J", color: "#A855F7" },
  gif: { icon: "G", color: "#A855F7" },
  ico: { icon: "I", color: "#A855F7" },
  woff: { icon: "W", color: "#A855F7" },
  woff2: { icon: "W", color: "#A855F7" },
  ttf: { icon: "T", color: "#A855F7" },
  zip: { icon: "Z", color: "#F5A623" },
  tar: { icon: "T", color: "#F5A623" },
  gz: { icon: "G", color: "#F5A623" },
};

const DIRECTORY_ICON = "\uD83D\uDCC1";
const DIRECTORY_EXPANDED_ICON = "\uD83D\uDCC2";

export class FileExplorerUI {
  private container: HTMLElement;
  private fileSystem: FileSystemAdapter;
  private rootPath: string;
  private root: FileTreeNode | null = null;
  private selectedPaths: Set<string> = new Set();
  private clipboard: { paths: string[]; operation: "copy" | "cut" } | null = null;
  private showHidden: boolean;
  private multiSelect: boolean;
  private dragDrop: boolean;
  private treeElement: HTMLElement | null = null;
  private breadcrumbElement: HTMLElement | null = null;
  private contextMenuElement: HTMLElement | null = null;
  private searchInput: HTMLElement | null = null;
  private fileClickCallbacks: FileClickCallback[] = [];
  private fileDoubleClickCallbacks: FileClickCallback[] = [];
  private contextMenuCallbacks: ContextMenuCallback[] = [];
  private focusedPath: string | null = null;
  private expandedDirs: Set<string> = new Set();
  private searchQuery: string = "";
  private searchResults: string[] = [];

  constructor(
    container: HTMLElement,
    fileSystem: FileSystemAdapter,
    options: FileExplorerUIOptions = {}
  ) {
    this.container = container;
    this.fileSystem = fileSystem;
    this.rootPath = options.rootPath ?? "/";
    this.showHidden = options.showHidden ?? false;
    this.multiSelect = options.multiSelect ?? true;
    this.dragDrop = options.dragDrop ?? true;
  }

  async render(): Promise<void> {
    this.container.innerHTML = "";
    this.container.classList.add("file-explorer");
    this.container.setAttribute("role", "tree");
    this.container.setAttribute("aria-label", "File Explorer");

    const toolbar = document.createElement("div");
    toolbar.className = "file-explorer-toolbar";
    toolbar.innerHTML = `
      <span class="toolbar-title">Explorer</span>
      <div class="toolbar-actions">
        <button class="toolbar-btn" data-action="new-file" title="New File">+</button>
        <button class="toolbar-btn" data-action="new-folder" title="New Folder">+</button>
        <button class="toolbar-btn" data-action="refresh" title="Refresh">&#x21BB;</button>
        <button class="toolbar-btn" data-action="collapse-all" title="Collapse All">&#x2191;</button>
      </div>
    `;
    this.container.appendChild(toolbar);

    toolbar.querySelector('[data-action="new-file"]')?.addEventListener("click", () => {
      this.promptNewFile();
    });
    toolbar.querySelector('[data-action="new-folder"]')?.addEventListener("click", () => {
      this.promptNewDirectory();
    });
    toolbar.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
      this.refresh();
    });
    toolbar.querySelector('[data-action="collapse-all"]')?.addEventListener("click", () => {
      this.collapseAll();
    });

    const searchContainer = document.createElement("div");
    searchContainer.className = "file-explorer-search";
    searchContainer.innerHTML = `<input type="text" placeholder="Search files..." class="search-input" />`;
    this.container.appendChild(searchContainer);
    this.searchInput = searchContainer.querySelector(".search-input");

    this.searchInput?.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.searchQuery = target.value;
      this.search(this.searchQuery);
    });

    this.breadcrumbElement = document.createElement("div");
    this.breadcrumbElement.className = "file-explorer-breadcrumb";
    this.container.appendChild(this.breadcrumbElement);

    this.treeElement = document.createElement("div");
    this.treeElement.className = "file-explorer-tree";
    this.treeElement.setAttribute("role", "treegroup");
    this.container.appendChild(this.treeElement);

    this.container.addEventListener("keydown", (e) => this.handleKeydown(e));
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container || e.target === this.treeElement) {
        this.clearSelection();
      }
    });

    this.container.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.root = await this.buildTree(this.rootPath);
    this.renderTree();
  }

  private async buildTree(dirPath: string, depth: number = 0): Promise<FileTreeNode> {
    const entries = await this.fileSystem.readdir(dirPath);
    const children: FileTreeNode[] = [];

    for (const name of entries) {
      if (!this.showHidden && name.startsWith(".")) continue;

      const fullPath = dirPath === "/" ? `/${name}` : `${dirPath}/${name}`;
      try {
        const stat = await this.fileSystem.stat(fullPath);
        const node: FileTreeNode = {
          name,
          path: fullPath,
          type: stat.type,
          size: stat.size,
          modified: stat.mtime,
          expanded: this.expandedDirs.has(fullPath),
        };

        if (stat.type === "directory") {
          if (this.expandedDirs.has(fullPath)) {
            node.children = (await this.buildTree(fullPath, depth + 1)).children;
          } else {
            node.children = [];
          }
        }

        children.push(node);
      } catch {
        // skip inaccessible entries
      }
    }

    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      name: dirPath.split("/").pop() || dirPath,
      path: dirPath,
      type: "directory",
      children,
      expanded: this.expandedDirs.has(dirPath),
    };
  }

  private renderTree(): void {
    if (!this.treeElement || !this.root) return;
    this.treeElement.innerHTML = "";

    if (this.searchQuery && this.searchResults.length > 0) {
      for (const resultPath of this.searchResults) {
        const parts = resultPath.replace(this.rootPath, "").split("/").filter(Boolean);
        const name = parts.pop() || resultPath;
        const item = this.createTreeItemElement(name, resultPath, "file", parts.length);
        this.treeElement.appendChild(item);
      }
      return;
    }

    if (this.root.children) {
      for (const child of this.root.children) {
        this._renderNode(child, 0, this.treeElement!);
      }
    }

    this.updateBreadcrumb();
  }

  private _renderNode(node: FileTreeNode, depth: number, parent: HTMLElement): void {
    const item = this.createTreeItemElement(node.name, node.path, node.type, depth);

    if (this.selectedPaths.has(node.path)) {
      item.classList.add("selected");
    }
    if (this.focusedPath === node.path) {
      item.classList.add("focused");
    }

    parent.appendChild(item);

    if (node.type === "directory" && node.children && node.expanded) {
      const childContainer = document.createElement("div");
      childContainer.className = "tree-children";
      childContainer.setAttribute("role", "group");

      if (node.children) {
        for (const child of node.children) {
          this._renderNode(child, depth + 1, childContainer);
        }
      }

      parent.appendChild(childContainer);
    }
  }

  private createTreeItemElement(
    name: string,
    filePath: string,
    type: "file" | "directory",
    depth: number
  ): HTMLElement {
    const item = document.createElement("div");
    item.className = "tree-item";
    item.setAttribute("role", "treeitem");
    item.setAttribute("data-path", filePath);
    item.setAttribute("data-type", type);
    item.style.paddingLeft = `${depth * 16 + 8}px`;
    item.tabIndex = 0;

    if (type === "directory") {
      const isExpanded = this.expandedDirs.has(filePath);
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "tree-item-toggle";
      toggleIcon.textContent = isExpanded ? "\u25BC" : "\u25B6";
      item.appendChild(toggleIcon);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "tree-item-toggle";
      spacer.textContent = " ";
      item.appendChild(spacer);
    }

    const icon = document.createElement("span");
    icon.className = "tree-item-icon";
    if (type === "directory") {
      icon.textContent = this.expandedDirs.has(filePath) ? DIRECTORY_EXPANDED_ICON : DIRECTORY_ICON;
    } else {
      const fileIcon = this.renderFileIcon(name);
      icon.textContent = fileIcon.icon;
      icon.style.color = fileIcon.color;
      icon.style.fontSize = "10px";
      icon.style.fontWeight = "bold";
      icon.style.width = "18px";
      icon.style.height = "18px";
      icon.style.display = "inline-flex";
      icon.style.alignItems = "center";
      icon.style.justifyContent = "center";
      icon.style.borderRadius = "3px";
      icon.style.backgroundColor = fileIcon.color + "22";
    }
    item.appendChild(icon);

    const label = document.createElement("span");
    label.className = "tree-item-label";
    label.textContent = name;
    item.appendChild(label);

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleItemClick(filePath, type, e);
    });

    item.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.handleItemDoubleClick(filePath, type);
    });

    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleContextMenu(e.clientX, e.clientY, filePath, type);
    });

    if (this.dragDrop) {
      item.draggable = true;
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", filePath);
        e.dataTransfer!.effectAllowed = "move";
      });
      item.addEventListener("dragover", (e) => {
        if (type === "directory") {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "move";
          item.classList.add("drag-over");
        }
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const sourcePath = e.dataTransfer?.getData("text/plain");
        if (sourcePath && sourcePath !== filePath && type === "directory") {
          this.moveFile(sourcePath, filePath);
        }
      });
    }

    return item;
  }

  expand(path: string): void {
    this.expandedDirs.add(path);
    this.refresh();
  }

  collapse(path: string): void {
    this.expandedDirs.delete(path);
    const prefix = path + "/";
    const toRemove: string[] = [];
    this.expandedDirs.forEach((expanded) => {
      if (expanded.startsWith(prefix)) {
        toRemove.push(expanded);
      }
    });
    for (const item of toRemove) {
      this.expandedDirs.delete(item);
    }
    this.refresh();
  }

  selectFile(path: string): void {
    if (!this.multiSelect) {
      this.selectedPaths.clear();
    }
    this.selectedPaths.add(path);
    this.focusedPath = path;
    this.updateSelectionVisuals();
    this.updateBreadcrumb();
  }

  private clearSelection(): void {
    this.selectedPaths.clear();
    this.focusedPath = null;
    this.updateSelectionVisuals();
    this.updateBreadcrumb();
  }

  private updateSelectionVisuals(): void {
    const items = this.container.querySelectorAll(".tree-item");
    items.forEach((item) => {
      const el = item as HTMLElement;
      const path = el.getAttribute("data-path");
      if (path && this.selectedPaths.has(path)) {
        el.classList.add("selected");
      } else {
        el.classList.remove("selected");
      }
      if (path === this.focusedPath) {
        el.classList.add("focused");
      } else {
        el.classList.remove("focused");
      }
    });
  }

  private updateBreadcrumb(): void {
    if (!this.breadcrumbElement) return;
    this.breadcrumbElement.innerHTML = "";

    const path = this.focusedPath || this.rootPath;
    const parts = path.split("/").filter(Boolean);

    const rootSpan = document.createElement("span");
    rootSpan.className = "breadcrumb-item";
    rootSpan.textContent = parts[0] || "/";
    rootSpan.addEventListener("click", () => {
      this.selectFile("/");
    });
    this.breadcrumbElement.appendChild(rootSpan);

    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      currentPath += "/" + parts[i];
      const sep = document.createElement("span");
      sep.className = "breadcrumb-separator";
      sep.textContent = " > ";
      this.breadcrumbElement.appendChild(sep);

      const span = document.createElement("span");
      span.className = "breadcrumb-item";
      span.textContent = parts[i];
      const p = currentPath;
      span.addEventListener("click", () => {
        this.selectFile(p);
      });
      this.breadcrumbElement.appendChild(span);
    }
  }

  private handleItemClick(filePath: string, type: "file" | "directory", event: MouseEvent): void {
    if (event.shiftKey && this.multiSelect && this.focusedPath) {
      const items = this.getAllVisiblePaths();
      const startIdx = items.indexOf(this.focusedPath);
      const endIdx = items.indexOf(filePath);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        for (let i = lo; i <= hi; i++) {
          this.selectedPaths.add(items[i]);
        }
      }
    } else if ((event.ctrlKey || event.metaKey) && this.multiSelect) {
      if (this.selectedPaths.has(filePath)) {
        this.selectedPaths.delete(filePath);
      } else {
        this.selectedPaths.add(filePath);
      }
    } else {
      if (!this.multiSelect) {
        this.selectedPaths.clear();
      }
      this.selectedPaths.add(filePath);
    }

    this.focusedPath = filePath;
    this.updateSelectionVisuals();

    if (type === "directory") {
      if (this.expandedDirs.has(filePath)) {
        this.collapse(filePath);
      } else {
        this.expand(filePath);
      }
    }

    for (const cb of this.fileClickCallbacks) {
      const node = this.findNode(filePath);
      if (node) cb(filePath, node);
    }
  }

  private handleItemDoubleClick(filePath: string, type: "file" | "directory"): void {
    if (type === "file") {
      for (const cb of this.fileDoubleClickCallbacks) {
        const node = this.findNode(filePath);
        if (node) cb(filePath, node);
      }
    } else if (type === "directory") {
      this.expand(filePath);
    }
  }

  private handleContextMenu(x: number, y: number, filePath: string, type: "file" | "directory"): void {
    this.selectFile(filePath);

    const node = this.findNode(filePath);
    if (!node) return;

    for (const cb of this.contextMenuCallbacks) {
      cb(x, y, filePath, node);
    }

    this.renderContextMenu(x, y, filePath);
  }

  renderContextMenu(x: number, y: number, path: string): void {
    this.removeContextMenu();

    const menu = document.createElement("div");
    menu.className = "file-explorer-context-menu";
    menu.style.position = "fixed";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = "10000";

    const isDir = this.expandedDirs.has(path) || this.selectedPaths.size > 0;
    const items: ContextMenuItem[] = [
      { label: "New File", action: () => this.promptNewFile(path) },
      { label: "New Folder", action: () => this.promptNewDirectory(path) },
      { separator: true, label: "" },
      { label: "Cut", shortcut: "Ctrl+X", action: () => this.cutSelected() },
      { label: "Copy", shortcut: "Ctrl+C", action: () => this.copySelected() },
      { label: "Paste", shortcut: "Ctrl+V", action: () => this.paste(), disabled: !this.clipboard },
      { separator: true, label: "" },
      { label: "Rename", shortcut: "F2", action: () => this.renameSelected() },
      { label: "Delete", shortcut: "Del", action: () => this.deleteSelected() },
    ];

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "context-menu-separator";
        menu.appendChild(sep);
        continue;
      }

      const menuItem = document.createElement("div");
      menuItem.className = "context-menu-item" + (item.disabled ? " disabled" : "");
      menuItem.innerHTML = `
        <span class="context-menu-label">${item.label}</span>
        ${item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : ""}
      `;

      if (!item.disabled && item.action) {
        menuItem.addEventListener("click", () => {
          item.action!();
          this.removeContextMenu();
        });
      }

      menu.appendChild(menuItem);
    }

    document.body.appendChild(menu);
    this.contextMenuElement = menu;

    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.removeContextMenu();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  private removeContextMenu(): void {
    if (this.contextMenuElement) {
      this.contextMenuElement.remove();
      this.contextMenuElement = null;
    }
  }

  renderFileIcon(filename: string): { icon: string; color: string } {
    const ext = filename.includes(".")
      ? filename.split(".").pop()?.toLowerCase() || ""
      : "";
    return FILE_ICONS[ext] || { icon: "\uD83D\uDCC4", color: "#89A0C6" };
  }

  renderTreeItem(path: string, depth: number): HTMLElement | null {
    const node = this.findNode(path);
    if (!node) return null;
    return this.createTreeItemElement(node.name, node.path, node.type, depth);
  }

  async createFile(path: string): Promise<void> {
    await this.fileSystem.writeFile(path, "");
    await this.refresh();
  }

  async createDirectory(path: string): Promise<void> {
    await this.fileSystem.mkdir(path);
    await this.refresh();
  }

  async deleteSelected(): Promise<void> {
    const paths = Array.from(this.selectedPaths);
    for (const path of paths) {
      try {
        await this.fileSystem.unlink(path);
      } catch {
        // ignore
      }
    }
    this.selectedPaths.clear();
    await this.refresh();
  }

  async renameSelected(): Promise<void> {
    if (this.selectedPaths.size !== 1) return;
    const oldPath = Array.from(this.selectedPaths)[0];
    const name = oldPath.split("/").pop() || "";
    const newName = prompt("Rename to:", name);
    if (newName && newName !== name) {
      const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = dir + "/" + newName;
      try {
        await this.fileSystem.rename(oldPath, newPath);
        this.selectedPaths.clear();
        this.selectedPaths.add(newPath);
        await this.refresh();
      } catch {
        // ignore
      }
    }
  }

  copySelected(): void {
    if (this.selectedPaths.size === 0) return;
    this.clipboard = {
      paths: Array.from(this.selectedPaths),
      operation: "copy",
    };
  }

  cutSelected(): void {
    if (this.selectedPaths.size === 0) return;
    this.clipboard = {
      paths: Array.from(this.selectedPaths),
      operation: "cut",
    };
  }

  async paste(): Promise<void> {
    if (!this.clipboard) return;
    const targetDir = this.focusedPath || this.rootPath;

    for (const srcPath of this.clipboard.paths) {
      const name = srcPath.split("/").pop() || "";
      const destPath = targetDir + "/" + name;

      try {
        if (this.clipboard.operation === "cut") {
          await this.fileSystem.rename(srcPath, destPath);
        } else {
          // copy: read and write
          // In a real FS adapter this would be a proper copy
          await this.fileSystem.writeFile(destPath, "");
        }
      } catch {
        // ignore
      }
    }

    if (this.clipboard.operation === "cut") {
      this.clipboard = null;
    }

    await this.refresh();
  }

  private async moveFile(sourcePath: string, targetDir: string): Promise<void> {
    const name = sourcePath.split("/").pop() || "";
    const destPath = targetDir + "/" + name;
    try {
      await this.fileSystem.rename(sourcePath, destPath);
      await this.refresh();
    } catch {
      // ignore
    }
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      this.searchResults = [];
      this.searchQuery = "";
      this.renderTree();
      return;
    }

    this.searchQuery = query;
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    const walk = async (dirPath: string) => {
      const entries = await this.fileSystem.readdir(dirPath);
      for (const name of entries) {
        if (!this.showHidden && name.startsWith(".")) continue;
        const fullPath = dirPath === "/" ? `/${name}` : `${dirPath}/${name}`;
        try {
          const stat = await this.fileSystem.stat(fullPath);
          if (name.toLowerCase().includes(lowerQuery)) {
            results.push(fullPath);
          }
          if (stat.type === "directory") {
            await walk(fullPath);
          }
        } catch {
          // skip
        }
      }
    };

    await walk(this.rootPath);
    this.searchResults = results;
    this.renderTree();
  }

  getSelected(): string[] {
    return Array.from(this.selectedPaths);
  }

  onFileClick(callback: FileClickCallback): { dispose: () => void } {
    this.fileClickCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.fileClickCallbacks.indexOf(callback);
        if (idx !== -1) this.fileClickCallbacks.splice(idx, 1);
      },
    };
  }

  onFileDoubleClick(callback: FileClickCallback): { dispose: () => void } {
    this.fileDoubleClickCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.fileDoubleClickCallbacks.indexOf(callback);
        if (idx !== -1) this.fileDoubleClickCallbacks.splice(idx, 1);
      },
    };
  }

  onContextMenu(callback: ContextMenuCallback): { dispose: () => void } {
    this.contextMenuCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.contextMenuCallbacks.indexOf(callback);
        if (idx !== -1) this.contextMenuCallbacks.splice(idx, 1);
      },
    };
  }

  toggleHidden(): void {
    this.showHidden = !this.showHidden;
    this.refresh();
  }

  private handleKeydown(e: KeyboardEvent): void {
    const items = Array.from(this.container.querySelectorAll(".tree-item")) as HTMLElement[];
    const currentIdx = items.findIndex((el) => el.getAttribute("data-path") === this.focusedPath);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (currentIdx < items.length - 1) {
          const nextPath = items[currentIdx + 1].getAttribute("data-path")!;
          this.selectFile(nextPath);
          items[currentIdx + 1].focus();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (currentIdx > 0) {
          const prevPath = items[currentIdx - 1].getAttribute("data-path")!;
          this.selectFile(prevPath);
          items[currentIdx - 1].focus();
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (this.focusedPath) {
          const node = this.findNode(this.focusedPath);
          if (node?.type === "directory" && !this.expandedDirs.has(this.focusedPath)) {
            this.expand(this.focusedPath);
          }
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (this.focusedPath) {
          if (this.expandedDirs.has(this.focusedPath)) {
            this.collapse(this.focusedPath);
          } else {
            const parent = this.getParentPath(this.focusedPath);
            if (parent) this.selectFile(parent);
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (this.focusedPath) {
          const node = this.findNode(this.focusedPath);
          if (node) {
            if (node.type === "directory") {
              if (this.expandedDirs.has(this.focusedPath)) {
                this.collapse(this.focusedPath);
              } else {
                this.expand(this.focusedPath);
              }
            } else {
              for (const cb of this.fileDoubleClickCallbacks) {
                cb(this.focusedPath, node);
              }
            }
          }
        }
        break;
      case "F2":
        e.preventDefault();
        this.renameSelected();
        break;
      case "Delete":
        e.preventDefault();
        this.deleteSelected();
        break;
      case "c":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.copySelected();
        }
        break;
      case "x":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.cutSelected();
        }
        break;
      case "v":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.paste();
        }
        break;
      case "a":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAll();
        }
        break;
    }
  }

  private selectAll(): void {
    const items = this.container.querySelectorAll(".tree-item");
    items.forEach((item) => {
      const path = item.getAttribute("data-path");
      if (path) this.selectedPaths.add(path);
    });
    this.updateSelectionVisuals();
  }

  private getAllVisiblePaths(): string[] {
    const items = this.container.querySelectorAll(".tree-item");
    return Array.from(items)
      .map((el) => el.getAttribute("data-path"))
      .filter(Boolean) as string[];
  }

  private findNode(targetPath: string): FileTreeNode | null {
    if (!this.root) return null;
    const search = (node: FileTreeNode): FileTreeNode | null => {
      if (node.path === targetPath) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this.root);
  }

  private getParentPath(filePath: string): string | null {
    const parts = filePath.split("/").filter(Boolean);
    if (parts.length <= 1) return null;
    parts.pop();
    return "/" + parts.join("/");
  }

  private promptNewFile(basePath?: string): void {
    const name = prompt("New file name:");
    if (!name) return;
    const dir = basePath || this.rootPath;
    const isDir = this.expandedDirs.has(dir);
    const filePath = isDir ? dir + "/" + name : (dir.substring(0, dir.lastIndexOf("/")) || "/") + "/" + name;
    this.createFile(filePath);
  }

  private promptNewDirectory(basePath?: string): void {
    const name = prompt("New folder name:");
    if (!name) return;
    const dir = basePath || this.rootPath;
    const isDir = this.expandedDirs.has(dir);
    const dirPath = isDir ? dir + "/" + name : (dir.substring(0, dir.lastIndexOf("/")) || "/") + "/" + name;
    this.createDirectory(dirPath);
  }

  private collapseAll(): void {
    this.expandedDirs.clear();
    this.renderTree();
  }
}
