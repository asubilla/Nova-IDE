declare const monaco: any;

export interface MonacoEditorOptions {
  fontSize?: number;
  fontFamily?: string;
  minimap?: boolean;
  wordWrap?: "off" | "on" | "wordWrapColumn" | "bounded";
  readOnly?: boolean;
  theme?: string;
  tabSize?: number;
}

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  isRegex?: boolean;
  searchInSelectionOnly?: boolean;
}

export interface FindMatch {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  matches: string[];
}

export interface Position {
  lineNumber: number;
  column: number;
}

export interface Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface Selection {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
}

interface CustomAction {
  id: string;
  label: string;
  keybinding: string;
  action: () => void;
  dispose?: () => void;
}

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs";

const NOVA_DARK_THEME: any = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    { token: "keyword", foreground: "C586C0" },
    { token: "string", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "type", foreground: "4EC9B0" },
    { token: "function", foreground: "DCDCAA" },
    { token: "variable", foreground: "9CDCFE" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "delimiter", foreground: "D4D4D4" },
    { token: "tag", foreground: "569CD6" },
    { token: "attribute.name", foreground: "9CDCFE" },
    { token: "attribute.value", foreground: "CE9178" },
  ],
  colors: {
    "editor.background": "#0D1117",
    "editor.foreground": "#C9D1D9",
    "editor.lineHighlightBackground": "#161B22",
    "editor.selectionBackground": "#264F78",
    "editorCursor.foreground": "#58A6FF",
    "editor.inactiveSelectionBackground": "#264F7855",
    "editorLineNumber.foreground": "#484F58",
    "editorLineNumber.activeForeground": "#C9D1D9",
    "editorIndentGuide.background": "#21262D",
    "editorIndentGuide.activeBackground": "#30363D",
    "editorWidget.background": "#161B22",
    "editorWidget.border": "#30363D",
    "editorSuggestWidget.background": "#161B22",
    "editorSuggestWidget.border": "#30363D",
    "editorSuggestWidget.selectedBackground": "#1F6FEB33",
    "list.hoverBackground": "#161B22",
    "input.background": "#0D1117",
    "input.border": "#30363D",
    "focusBorder": "#1F6FEB",
  },
};

let monacoLoaded = false;
let monacoLoadPromise: Promise<void> | null = null;

function loadMonaco(): Promise<void> {
  if (monacoLoaded) return Promise.resolve();
  if (monacoLoadPromise) return monacoLoadPromise;

  monacoLoadPromise = new Promise((resolve, reject) => {
    if (typeof (window as any).monaco !== "undefined") {
      monacoLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `${MONACO_CDN}/loader.js`;
    script.onload = () => {
      (window as any).require.config({
        paths: { vs: MONACO_CDN },
      });
      (window as any).require(["vs/editor/editor.main"], () => {
        monacoLoaded = true;
        resolve();
      });
    };
    script.onerror = () => reject(new Error("Failed to load Monaco Editor"));
    document.head.appendChild(script);
  });

  return monacoLoadPromise;
}

export class MonacoEditor {
  private container: HTMLElement;
  private options: Required<MonacoEditorOptions>;
  private editor: any = null;
  private model: any = null;
  private contentChangeListeners: Array<(value: string) => void> = [];
  private selectionChangeListeners: Array<(selection: Selection) => void> = [];
  private customActions: CustomAction[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, options: MonacoEditorOptions = {}) {
    this.container = container;
    this.options = {
      fontSize: options.fontSize ?? 14,
      fontFamily: options.fontFamily ?? "'Cascadia Code', 'Fira Code', Consolas, monospace",
      minimap: options.minimap ?? true,
      wordWrap: options.wordWrap ?? "off",
      readOnly: options.readOnly ?? false,
      theme: options.theme ?? "nova-dark",
      tabSize: options.tabSize ?? 2,
    };

    this.container.style.position = "relative";
    this.container.style.width = "100%";
    this.container.style.height = "100%";
  }

  async createEditor(model?: any): Promise<void> {
    await loadMonaco();

    if (typeof (window as any).monaco === "undefined") {
      throw new Error("Monaco Editor not loaded");
    }

    const m = (window as any).monaco;

    m.editor.defineTheme("nova-dark", NOVA_DARK_THEME);
    m.editor.defineTheme("vs-dark", m.editor.ThemeName?.VS_DARK ?? "vs-dark");
    m.editor.defineTheme("vs-light", m.editor.ThemeName?.VS_LIGHT ?? "vs-light");

    if (!model) {
      this.model = m.editor.createModel("", "plaintext");
    } else {
      this.model = model;
    }

    this.editor = m.editor.create(this.container, {
      model: this.model,
      fontSize: this.options.fontSize,
      fontFamily: this.options.fontFamily,
      minimap: { enabled: this.options.minimap },
      wordWrap: this.options.wordWrap,
      readOnly: this.options.readOnly,
      theme: this.options.theme,
      tabSize: this.options.tabSize,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      padding: { top: 8, bottom: 8 },
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: "mouseover",
      contextmenu: true,
      mouseWheelZoom: true,
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
    });

    this.model.onDidChangeContent(() => {
      const value = this.model.getValue();
      for (const listener of this.contentChangeListeners) {
        listener(value);
      }
    });

    this.editor.onDidChangeCursorSelection((e: any) => {
      const selection: Selection = {
        selectionStartLineNumber: e.selection.startLineNumber,
        selectionStartColumn: e.selection.startColumn,
        positionLineNumber: e.selection.positionLineNumber,
        positionColumn: e.selection.positionColumn,
      };
      for (const listener of this.selectionChangeListeners) {
        listener(selection);
      }
    });

    for (const custom of this.customActions) {
      this.registerCustomAction(custom);
    }
  }

  setValue(content: string): void {
    if (this.model) {
      this.model.setValue(content);
    }
  }

  getValue(): string {
    return this.model ? this.model.getValue() : "";
  }

  setLanguage(lang: string): void {
    if (this.model) {
      const m = (window as any).monaco;
      const langId = this.mapLanguageId(lang);
      m.editor.setModelLanguage(this.model, langId);
    }
  }

  setTheme(theme: string): void {
    if (this.editor) {
      const m = (window as any).monaco;
      m.editor.setTheme(theme);
      this.options.theme = theme;
    }
  }

  setFontSize(size: number): void {
    this.options.fontSize = size;
    if (this.editor) {
      this.editor.updateOptions({ fontSize: size });
    }
  }

  setWordWrap(mode: "off" | "on" | "wordWrapColumn" | "bounded"): void {
    this.options.wordWrap = mode;
    if (this.editor) {
      this.editor.updateOptions({ wordWrap: mode });
    }
  }

  toggleMinimap(): void {
    this.options.minimap = !this.options.minimap;
    if (this.editor) {
      this.editor.updateOptions({ minimap: { enabled: this.options.minimap } });
    }
  }

  find(query: string, options?: FindOptions): FindMatch[] {
    if (!this.model) return [];
    const m = (window as any).monaco;
    const finds = this.model.findMatches(query, false, options?.isRegex ?? false, options?.wholeWord ?? false, options?.matchCase ? null : "ontrolIgnoreCase", false);
    return finds.map((match: any) => ({
      range: match.range,
      matches: match.matches || [],
    }));
  }

  replace(query: string, replacement: string): number {
    if (!this.model) return 0;
    const matches = this.model.findMatches(query, false, false, false, null, false);
    const edits = matches.map((match: any) => ({
      range: match.range,
      text: replacement,
    }));
    this.model.pushEdits(edits);
    return matches.length;
  }

  async formatDocument(): Promise<void> {
    if (!this.editor) return;
    await this.editor.getAction("editor.action.formatDocument")?.run();
  }

  addAction(id: string, label: string, keybinding: string, action: () => void): void {
    const customAction: CustomAction = { id, label, keybinding, action };
    this.customActions.push(customAction);
    if (this.editor) {
      this.registerCustomAction(customAction);
    }
  }

  private registerCustomAction(custom: CustomAction): void {
    const m = (window as any).monaco;
    this.editor.addAction({
      id: custom.id,
      label: custom.label,
      keybindings: [this.parseKeybinding(custom.keybinding)],
      contextMenuGroupId: "custom",
      contextMenuOrder: 1.5,
      run: () => custom.action(),
    });
  }

  private parseKeybinding(keybinding: string): number {
    const m = (window as any).monaco;
    const parts = keybinding.split("+").map((p) => p.trim().toLowerCase());
    let key = 0;
    for (const part of parts) {
      switch (part) {
        case "ctrl":
        case "control":
          key |= m.KeyMod.CtrlCmd;
          break;
        case "shift":
          key |= m.KeyMod.Shift;
          break;
        case "alt":
          key |= m.KeyMod.Alt;
          break;
        case "meta":
        case "cmd":
          key |= m.KeyMod.WinCtrl;
          break;
        default:
          key |= (m.KeyCode as any)[part.charAt(0).toUpperCase() + part.slice(1)] ?? 0;
          break;
      }
    }
    return key;
  }

  onDidChangeContent(callback: (value: string) => void): { dispose: () => void } {
    this.contentChangeListeners.push(callback);
    return {
      dispose: () => {
        const idx = this.contentChangeListeners.indexOf(callback);
        if (idx !== -1) this.contentChangeListeners.splice(idx, 1);
      },
    };
  }

  onDidChangeCursorSelection(callback: (selection: Selection) => void): { dispose: () => void } {
    this.selectionChangeListeners.push(callback);
    return {
      dispose: () => {
        const idx = this.selectionChangeListeners.indexOf(callback);
        if (idx !== -1) this.selectionChangeListeners.splice(idx, 1);
      },
    };
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    if (this.editor) {
      this.editor.dispose();
    }
    if (this.model) {
      this.model.dispose();
    }
    this.editor = null;
    this.model = null;
    this.contentChangeListeners = [];
    this.selectionChangeListeners = [];
    this.customActions = [];
  }

  getModel(): any {
    return this.model;
  }

  getSelection(): Selection | null {
    if (!this.editor) return null;
    const sel = this.editor.getSelection();
    return sel
      ? {
          selectionStartLineNumber: sel.selectionStartLineNumber,
          selectionStartColumn: sel.selectionStartColumn,
          positionLineNumber: sel.positionLineNumber,
          positionColumn: sel.positionColumn,
        }
      : null;
  }

  setSelection(range: Range): void {
    if (this.editor) {
      const m = (window as any).monaco;
      this.editor.setSelection(
        new m.Range(
          range.startLineNumber,
          range.startColumn,
          range.endLineNumber,
          range.endColumn
        )
      );
    }
  }

  revealLine(line: number): void {
    if (this.editor) {
      this.editor.revealLineInCenterIfOutsideViewport(line);
    }
  }

  getLineCount(): number {
    return this.model ? this.model.getLineCount() : 0;
  }

  getPosition(): Position | null {
    if (!this.editor) return null;
    const pos = this.editor.getPosition();
    return pos ? { lineNumber: pos.lineNumber, column: pos.column } : null;
  }

  setPosition(position: Position): void {
    if (this.editor) {
      this.editor.setPosition({
        lineNumber: position.lineNumber,
        column: position.column,
      });
    }
  }

  trigger(command: string, handlerId: string, payload?: any): void {
    if (this.editor) {
      this.editor.trigger(command, handlerId, payload);
    }
  }

  getSupportedLanguages(): string[] {
    const m = (window as any).monaco;
    if (!m) return [];
    return m.languages.getLanguages().map((l: any) => l.id);
  }

  private mapLanguageId(lang: string): string {
    const map: Record<string, string> = {
      ts: "typescript",
      tsx: "typescriptreact",
      js: "javascript",
      jsx: "javascriptreact",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      rb: "ruby",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      ps1: "powershell",
      xml: "xml",
      svg: "xml",
      dockerfile: "dockerfile",
      makefile: "makefile",
      toml: "ini",
      ini: "ini",
      cfg: "ini",
    };
    return map[lang.toLowerCase()] ?? lang.toLowerCase();
  }
}

export function getMonacoEditorHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Editor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #editor-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0D1117;
    }
  </style>
</head>
<body>
  <div id="editor-container"></div>
  <script src="${MONACO_CDN}/loader.js"></script>
  <script>
    require.config({ paths: { vs: "${MONACO_CDN}" } });
    require(["vs/editor/editor.main"], function () {
      window.monacoReady = true;
    });
  </script>
</body>
</html>`;
}
