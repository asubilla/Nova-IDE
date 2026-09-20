import * as fs from "fs";
import * as path from "path";

export interface OpenFile {
  path: string;
  content: string;
  language: string;
  modified: boolean;
  cursorPosition: number;
  selection?: { start: number; end: number };
}

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source: string;
}

export interface LanguageConfig {
  name: string;
  extensions: string[];
  commentStyle: { line: string; block?: { start: string; end: string } };
  keywords: string[];
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
}

const LANGUAGE_MAP: Record<string, LanguageConfig> = {
  typescript: {
    name: "TypeScript",
    extensions: [".ts", ".tsx"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "import", "export", "from", "const", "let", "var", "function",
      "class", "interface", "type", "enum", "extends", "implements",
      "async", "await", "return", "if", "else", "for", "while",
      "switch", "case", "break", "continue", "try", "catch", "finally",
      "throw", "new", "this", "super", "typeof", "instanceof",
    ],
  },
  javascript: {
    name: "JavaScript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "import", "export", "from", "const", "let", "var", "function",
      "class", "extends", "return", "if", "else", "for", "while",
      "do", "switch", "case", "break", "continue", "try", "catch",
      "finally", "throw", "new", "this", "typeof", "instanceof",
      "async", "await", "yield",
    ],
  },
  python: {
    name: "Python",
    extensions: [".py", ".pyw"],
    commentStyle: { line: "#" },
    keywords: [
      "import", "from", "class", "def", "return", "if", "elif", "else",
      "for", "while", "break", "continue", "pass", "try", "except",
      "finally", "raise", "with", "as", "yield", "lambda", "global",
      "nonlocal", "assert", "del", "in", "not", "and", "or", "is",
    ],
  },
  go: {
    name: "Go",
    extensions: [".go"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "package", "import", "func", "return", "if", "else", "for",
      "range", "switch", "case", "default", "break", "continue",
      "go", "chan", "select", "defer", "type", "struct", "interface",
      "map", "var", "const",
    ],
  },
  rust: {
    name: "Rust",
    extensions: [".rs"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "fn", "let", "mut", "pub", "struct", "enum", "impl", "trait",
      "use", "mod", "crate", "self", "super", "return", "if", "else",
      "match", "for", "while", "loop", "break", "continue", "move",
      "ref", "as", "type", "where", "async", "await", "dyn",
    ],
  },
  java: {
    name: "Java",
    extensions: [".java"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "import", "package", "class", "interface", "extends", "implements",
      "public", "private", "protected", "static", "final", "abstract",
      "return", "if", "else", "for", "while", "do", "switch", "case",
      "break", "continue", "try", "catch", "finally", "throw", "new",
      "this", "super", "void", "null", "true", "false",
    ],
  },
  cpp: {
    name: "C++",
    extensions: [".cpp", ".cc", ".cxx", ".c", ".h", ".hpp"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [
      "include", "using", "namespace", "class", "struct", "enum",
      "public", "private", "protected", "virtual", "override", "final",
      "return", "if", "else", "for", "while", "do", "switch", "case",
      "break", "continue", "try", "catch", "throw", "new", "delete",
      "this", "nullptr", "true", "false", "const", "static", "inline",
    ],
  },
  json: {
    name: "JSON",
    extensions: [".json"],
    commentStyle: { line: "" },
    keywords: [],
  },
  yaml: {
    name: "YAML",
    extensions: [".yaml", ".yml"],
    commentStyle: { line: "#" },
    keywords: [],
  },
  toml: {
    name: "TOML",
    extensions: [".toml"],
    commentStyle: { line: "#" },
    keywords: [],
  },
  markdown: {
    name: "Markdown",
    extensions: [".md", ".markdown"],
    commentStyle: { line: "" },
    keywords: [],
  },
  css: {
    name: "CSS",
    extensions: [".css"],
    commentStyle: { line: "//", block: { start: "/*", end: "*/" } },
    keywords: [],
  },
  html: {
    name: "HTML",
    extensions: [".html", ".htm"],
    commentStyle: { line: "", block: { start: "<!--", end: "-->" } },
    keywords: [],
  },
};

export class Editor {
  private openFiles: Map<string, OpenFile> = new Map();
  private currentFile: string | null = null;
  private undoStack: Map<string, string[]> = new Map();
  private redoStack: Map<string, string[]> = new Map();

  async openFile(filePath: string): Promise<OpenFile> {
    const resolved = path.resolve(filePath);

    if (this.openFiles.has(resolved)) {
      this.currentFile = resolved;
      return this.openFiles.get(resolved)!;
    }

    let content = "";
    try {
      content = fs.readFileSync(resolved, "utf-8");
    } catch {
      content = "";
    }

    const language = this.getLanguage(resolved);
    const openFile: OpenFile = {
      path: resolved,
      content,
      language,
      modified: false,
      cursorPosition: 0,
    };

    this.openFiles.set(resolved, openFile);
    this.currentFile = resolved;
    this.undoStack.set(resolved, [content]);
    this.redoStack.set(resolved, []);

    return openFile;
  }

  closeFile(filePath: string): void {
    const resolved = path.resolve(filePath);
    this.openFiles.delete(resolved);
    this.undoStack.delete(resolved);
    this.redoStack.delete(resolved);

    if (this.currentFile === resolved) {
      const remaining = Array.from(this.openFiles.keys());
      this.currentFile = remaining.length > 0 ? remaining[0] : null;
    }
  }

  async saveFile(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    const openFile = this.openFiles.get(resolved);

    if (openFile) {
      fs.writeFileSync(resolved, openFile.content, "utf-8");
      openFile.modified = false;
    }
  }

  getOpenFiles(): OpenFile[] {
    return Array.from(this.openFiles.values());
  }

  getCurrentFile(): OpenFile | null {
    if (!this.currentFile) return null;
    return this.openFiles.get(this.currentFile) || null;
  }

  setContent(filePath: string, content: string): void {
    const resolved = path.resolve(filePath);
    const openFile = this.openFiles.get(resolved);

    if (openFile) {
      this.pushUndo(resolved, openFile.content);
      openFile.content = content;
      openFile.modified = true;
    }
  }

  getContent(filePath: string): string {
    const resolved = path.resolve(filePath);
    const openFile = this.openFiles.get(resolved);
    return openFile?.content || "";
  }

  getSelection(): { start: number; end: number; text: string } | null {
    const openFile = this.getCurrentFile();
    if (!openFile || !openFile.selection) return null;

    const { start, end } = openFile.selection;
    return {
      start,
      end,
      text: openFile.content.substring(start, end),
    };
  }

  setSelection(start: number, end: number): void {
    const openFile = this.getCurrentFile();
    if (openFile) {
      openFile.selection = { start, end };
    }
  }

  insertText(text: string): void {
    const openFile = this.getCurrentFile();
    if (openFile) {
      this.pushUndo(openFile.path, openFile.content);
      const pos = openFile.cursorPosition;
      openFile.content =
        openFile.content.substring(0, pos) + text + openFile.content.substring(pos);
      openFile.cursorPosition += text.length;
      openFile.modified = true;
      openFile.selection = undefined;
    }
  }

  deleteSelection(): void {
    const openFile = this.getCurrentFile();
    if (openFile && openFile.selection) {
      this.pushUndo(openFile.path, openFile.content);
      const { start, end } = openFile.selection;
      openFile.content =
        openFile.content.substring(0, start) + openFile.content.substring(end);
      openFile.cursorPosition = start;
      openFile.selection = undefined;
      openFile.modified = true;
    }
  }

  undo(): void {
    const openFile = this.getCurrentFile();
    if (!openFile) return;

    const stack = this.undoStack.get(openFile.path);
    if (stack && stack.length > 1) {
      this.pushRedo(openFile.path, openFile.content);
      stack.pop();
      openFile.content = stack[stack.length - 1];
      openFile.modified = true;
    }
  }

  redo(): void {
    const openFile = this.getCurrentFile();
    if (!openFile) return;

    const stack = this.redoStack.get(openFile.path);
    if (stack && stack.length > 0) {
      this.pushUndo(openFile.path, openFile.content);
      const content = stack.pop()!;
      openFile.content = content;
      openFile.modified = true;
    }
  }

  private pushUndo(filePath: string, content: string): void {
    const stack = this.undoStack.get(filePath) || [];
    stack.push(content);
    if (stack.length > 100) {
      stack.shift();
    }
    this.undoStack.set(filePath, stack);
    this.redoStack.set(filePath, []);
  }

  private pushRedo(filePath: string, content: string): void {
    const stack = this.redoStack.get(filePath) || [];
    stack.push(content);
    this.redoStack.set(filePath, stack);
  }

  find(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    const openFilesArray = Array.from(this.openFiles.entries());
    for (const [filePath, openFile] of openFilesArray) {
      const lines = openFile.content.split("\n");
      lines.forEach((line, lineIndex) => {
        let startIndex = 0;
        const lowerLine = line.toLowerCase();
        let columnIndex = lowerLine.indexOf(lowerQuery, startIndex);

        while (columnIndex !== -1) {
          results.push({
            file: filePath,
            line: lineIndex + 1,
            column: columnIndex + 1,
            match: line.substring(columnIndex, columnIndex + query.length),
          });
          startIndex = columnIndex + 1;
          columnIndex = lowerLine.indexOf(lowerQuery, startIndex);
        }
      });
    }

    return results;
  }

  replace(query: string, replacement: string): number {
    const openFile = this.getCurrentFile();
    if (!openFile) return 0;

    this.pushUndo(openFile.path, openFile.content);
    const regex = new RegExp(this.escapeRegex(query), "gi");
    const matches = openFile.content.match(regex);
    openFile.content = openFile.content.replace(regex, replacement);
    openFile.modified = true;

    return matches?.length || 0;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  gotoLine(line: number): void {
    const openFile = this.getCurrentFile();
    if (!openFile) return;

    const lines = openFile.content.split("\n");
    let position = 0;

    for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
      position += lines[i].length + 1;
    }

    openFile.cursorPosition = position;
    openFile.selection = undefined;
  }

  format(): void {
    const openFile = this.getCurrentFile();
    if (!openFile) return;

    this.pushUndo(openFile.path, openFile.content);

    const lines = openFile.content.split("\n");
    const formatted = lines.map((line) => line.replace(/\s+$/, "")).join("\n");
    openFile.content = formatted.replace(/\n{3,}/g, "\n\n").trim() + "\n";
    openFile.modified = true;
  }

  getDiagnostics(): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const openFile = this.getCurrentFile();

    if (!openFile) return diagnostics;

    const lines = openFile.content.split("\n");

    lines.forEach((line, index) => {
      const trimmed = line.trimEnd();

      if (trimmed.length > 120) {
        diagnostics.push({
          line: index + 1,
          column: 121,
          message: `Line exceeds maximum length of 120 characters (${trimmed.length})`,
          severity: "warning",
          source: "editor",
        });
      }

      if (/\t/.test(line) && openFile.language !== "python") {
        diagnostics.push({
          line: index + 1,
          column: line.indexOf("\t") + 1,
          message: "Unexpected tab character, use spaces instead",
          severity: "warning",
          source: "editor",
        });
      }

      if (/;\s*$/.test(line) && openFile.language === "python") {
        diagnostics.push({
          line: index + 1,
          column: line.length,
          message: "Unexpected semicolon in Python",
          severity: "error",
          source: "editor",
        });
      }
    });

    return diagnostics;
  }

  getLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    for (const [lang, config] of Object.entries(LANGUAGE_MAP)) {
      if (config.extensions.includes(ext)) {
        return lang;
      }
    }

    return "plaintext";
  }

  getLanguageConfig(lang: string): LanguageConfig | null {
    return LANGUAGE_MAP[lang] || null;
  }

  setCursorPosition(position: number): void {
    const openFile = this.getCurrentFile();
    if (openFile) {
      openFile.cursorPosition = Math.max(0, Math.min(position, openFile.content.length));
    }
  }

  getCursorPosition(): number {
    const openFile = this.getCurrentFile();
    return openFile?.cursorPosition || 0;
  }

  getLineCount(): number {
    const openFile = this.getCurrentFile();
    if (!openFile) return 0;
    return openFile.content.split("\n").length;
  }

  getLine(lineNumber: number): string {
    const openFile = this.getCurrentFile();
    if (!openFile) return "";
    const lines = openFile.content.split("\n");
    return lines[lineNumber - 1] || "";
  }
}
