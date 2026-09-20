export interface TerminalUIOptions {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: TerminalTheme;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  scrollback?: number;
  tabSize?: number;
}

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalBackend {
  execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getWorkingDirectory(): string;
}

type InputHandler = (input: string) => void;

const DEFAULT_THEME: TerminalTheme = {
  background: "#0D1117",
  foreground: "#C9D1D9",
  cursor: "#58A6FF",
  cursorAccent: "#0D1117",
  selectionBackground: "#264F78",
  black: "#484F58",
  red: "#FF7B72",
  green: "#3FB950",
  yellow: "#D29922",
  blue: "#58A6FF",
  magenta: "#BC8CFF",
  cyan: "#39C5CF",
  white: "#B1BAC4",
  brightBlack: "#6E7681",
  brightRed: "#FFA198",
  brightGreen: "#56D364",
  brightYellow: "#E3B341",
  brightBlue: "#79C0FF",
  brightMagenta: "#D2A8FF",
  brightCyan: "#56D4DD",
  brightWhite: "#F0F6FC",
};

const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

export class TerminalUI {
  private container: HTMLElement;
  private backend: TerminalBackend | null;
  private options: Required<TerminalUIOptions>;
  private theme: TerminalTheme;
  private outputElement: HTMLElement | null = null;
  private inputLineElement: HTMLElement | null = null;
  private promptElement: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private cursorElement: HTMLElement | null = null;
  private scrollContainer: HTMLElement | null = null;

  private cmdHistory: string[] = [];
  private historyIndex: number = -1;
  private currentInput: string = "";
  private cwd: string = "/";

  private outputBuffer: string = "";
  private scrollbackLimit: number;
  private inputHandlers: InputHandler[] = [];
  private isFocused: boolean = true;
  private cursorVisible: boolean = true;
  private cursorInterval: number | null = null;
  private selection: { start: number; end: number } | null = null;

  constructor(container: HTMLElement, backend?: TerminalBackend, options: TerminalUIOptions = {}) {
    this.container = container;
    this.backend = backend || null;
    this.theme = options.theme || DEFAULT_THEME;
    this.options = {
      fontFamily: options.fontFamily ?? "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
      fontSize: options.fontSize ?? 14,
      lineHeight: options.lineHeight ?? 1.4,
      theme: this.theme,
      cursorStyle: options.cursorStyle ?? "block",
      cursorBlink: options.cursorBlink ?? true,
      scrollback: options.scrollback ?? 10000,
      tabSize: options.tabSize ?? 8,
    };
    this.scrollbackLimit = this.options.scrollback;
    this.cwd = backend?.getWorkingDirectory() || "/";
  }

  render(): void {
    this.container.innerHTML = "";
    this.container.classList.add("terminal-ui");
    this.container.setAttribute("tabindex", "0");

    this.scrollContainer = document.createElement("div");
    this.scrollContainer.className = "terminal-scroll-container";
    this.scrollContainer.style.cssText = `
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      background: ${this.theme.background};
      color: ${this.theme.foreground};
      font-family: ${this.options.fontFamily};
      font-size: ${this.options.fontSize}px;
      line-height: ${this.options.lineHeight};
      padding: 8px;
      cursor: text;
    `;
    this.container.appendChild(this.scrollContainer);

    this.outputElement = document.createElement("div");
    this.outputElement.className = "terminal-output";
    this.outputElement.style.cssText = "white-space: pre-wrap; word-wrap: break-word;";
    this.scrollContainer.appendChild(this.outputElement);

    this.inputLineElement = document.createElement("div");
    this.inputLineElement.className = "terminal-input-line";
    this.inputLineElement.style.cssText = "display: flex; align-items: center;";
    this.scrollContainer.appendChild(this.inputLineElement);

    this.promptElement = document.createElement("span");
    this.promptElement.className = "terminal-prompt";
    this.promptElement.style.cssText = `color: ${this.theme.green}; margin-right: 8px; white-space: pre;`;
    this.promptElement.textContent = this.getPrompt();
    this.inputLineElement.appendChild(this.promptElement);

    const inputWrapper = document.createElement("span");
    inputWrapper.style.cssText = "position: relative; flex: 1;";
    this.inputLineElement.appendChild(inputWrapper);

    this.inputElement = document.createElement("input");
    this.inputElement.className = "terminal-input";
    this.inputElement.style.cssText = `
      background: transparent;
      color: ${this.theme.foreground};
      border: none;
      outline: none;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      width: 100%;
      caret-color: transparent;
    `;
    this.inputElement.setAttribute("autocomplete", "off");
    this.inputElement.setAttribute("autocorrect", "off");
    this.inputElement.setAttribute("autocapitalize", "off");
    this.inputElement.setAttribute("spellcheck", "false");
    inputWrapper.appendChild(this.inputElement);

    this.cursorElement = document.createElement("span");
    this.cursorElement.className = "terminal-cursor";
    this.updateCursorStyle();
    inputWrapper.appendChild(this.cursorElement);

    this.bindEvents();
    this.focus();

    if (this.options.cursorBlink) {
      this.startCursorBlink();
    }
  }

  private bindEvents(): void {
    this.container.addEventListener("click", () => this.focus());

    this.inputElement?.addEventListener("input", () => {
      this.updateCursorPosition();
    });

    this.inputElement?.addEventListener("keydown", (e) => {
      this.handleKeypress(e);
    });

    this.inputElement?.addEventListener("focus", () => {
      this.isFocused = true;
      this.showCursor();
    });

    this.inputElement?.addEventListener("blur", () => {
      this.isFocused = false;
      this.hideCursor();
    });

    this.scrollContainer?.addEventListener("mouseup", () => {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        this.selection = {
          start: sel.anchorOffset,
          end: sel.focusOffset,
        };
      }
    });
  }

  write(text: string): void {
    if (!this.outputElement) return;

    const span = document.createElement("span");
    span.innerHTML = this.parseAnsi(text);
    this.outputElement.appendChild(span);

    this.outputBuffer += text;
    this.trimBuffer();
    this.scrollToBottom();
  }

  writeln(text: string): void {
    this.write(text + "\n");
  }

  clear(): void {
    if (this.outputElement) {
      this.outputElement.innerHTML = "";
    }
    this.outputBuffer = "";
  }

  handleInput(input: string): void {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (this.cmdHistory.length === 0 || this.cmdHistory[this.cmdHistory.length - 1] !== trimmed) {
      this.cmdHistory.push(trimmed);
      if (this.cmdHistory.length > 1000) {
        this.cmdHistory.shift();
      }
    }
    this.historyIndex = -1;
    this.currentInput = "";

    this.writeln(`${this.getPrompt()}${input}`);

    for (const handler of this.inputHandlers) {
      handler(trimmed);
    }

    if (this.backend) {
      this.executeCommand(trimmed);
    }
  }

  private async executeCommand(command: string): Promise<void> {
    try {
      const result = await this.backend!.execute(command);
      if (result.stdout) {
        this.write(result.stdout);
      }
      if (result.stderr) {
        this.write(result.stderr);
      }
    } catch (err: any) {
      this.writeln(`Error: ${err.message}`);
    }
  }

  handleKeypress(e: KeyboardEvent): void {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (this.inputElement) {
          const value = this.inputElement.value;
          this.inputElement.value = "";
          this.updateCursorPosition();
          this.handleInput(value);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        this.navigateHistory(-1);
        break;

      case "ArrowDown":
        e.preventDefault();
        this.navigateHistory(1);
        break;

      case "ArrowLeft":
        // Allow default cursor movement
        break;

      case "ArrowRight":
        // Allow default cursor movement
        break;

      case "c":
        if (e.ctrlKey) {
          e.preventDefault();
          if (this.inputElement?.selectionStart !== this.inputElement?.selectionEnd) {
            this.copySelection();
          } else {
            this.writeln(`${this.getPrompt()}${this.inputElement?.value || ""}^C`);
            if (this.inputElement) this.inputElement.value = "";
            this.updateCursorPosition();
          }
        }
        break;

      case "v":
        if (e.ctrlKey) {
          e.preventDefault();
          this.pasteClipboard();
        }
        break;

      case "a":
        if (e.ctrlKey) {
          e.preventDefault();
          this.selectAll();
        }
        break;

      case "l":
        if (e.ctrlKey) {
          e.preventDefault();
          this.clear();
        }
        break;

      case "u":
        if (e.ctrlKey) {
          e.preventDefault();
          if (this.inputElement) {
            const pos = this.inputElement.selectionStart || 0;
            this.inputElement.value = this.inputElement.value.substring(pos);
            this.inputElement.setSelectionRange(0, 0);
            this.updateCursorPosition();
          }
        }
        break;

      case "k":
        if (e.ctrlKey) {
          e.preventDefault();
          if (this.inputElement) {
            const pos = this.inputElement.selectionStart || 0;
            this.inputElement.value = this.inputElement.value.substring(0, pos);
            this.updateCursorPosition();
          }
        }
        break;

      case "Tab":
        e.preventDefault();
        if (this.inputElement) {
          const partial = this.inputElement.value;
          const completed = this.autocomplete(partial);
          if (completed) {
            this.inputElement.value = completed;
            this.updateCursorPosition();
          }
        }
        break;

      case "Home":
        e.preventDefault();
        if (this.inputElement) {
          this.inputElement.setSelectionRange(0, 0);
          this.updateCursorPosition();
        }
        break;

      case "End":
        e.preventDefault();
        if (this.inputElement) {
          const len = this.inputElement.value.length;
          this.inputElement.setSelectionRange(len, len);
          this.updateCursorPosition();
        }
        break;
    }
  }

  autocomplete(partial: string): string | null {
    const parts = partial.split(" ");
    const lastPart = parts[parts.length - 1] || "";
    if (!lastPart) return null;

    // Simple autocomplete: just return the partial with common extensions
    const commonExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"];
    for (const ext of commonExtensions) {
      if (lastPart + ext === lastPart) continue;
    }

    return null;
  }

  getCwd(): string {
    return this.cwd;
  }

  setCwd(path: string): void {
    this.cwd = path;
    if (this.promptElement) {
      this.promptElement.textContent = this.getPrompt();
    }
  }

  getPrompt(): string {
    const dir = this.cwd.split("/").pop() || this.cwd;
    return `${dir} > `;
  }

  setPrompt(prompt: string): void {
    if (this.promptElement) {
      this.promptElement.textContent = prompt;
    }
  }

  history(): string[] {
    return [...this.cmdHistory];
  }

  searchHistory(query: string): string[] {
    const lower = query.toLowerCase();
    return this.cmdHistory.filter((cmd) => cmd.toLowerCase().includes(lower));
  }

  copySelection(): void {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      navigator.clipboard.writeText(sel.toString()).catch(() => {});
    }
  }

  pasteClipboard(): void {
    navigator.clipboard
      .readText()
      .then((text) => {
        if (this.inputElement) {
          const pos = this.inputElement.selectionStart || 0;
          const before = this.inputElement.value.substring(0, pos);
          const after = this.inputElement.value.substring(pos);
          this.inputElement.value = before + text + after;
          const newPos = pos + text.length;
          this.inputElement.setSelectionRange(newPos, newPos);
          this.updateCursorPosition();
        }
      })
      .catch(() => {});
  }

  selectAll(): void {
    if (this.outputElement) {
      const range = document.createRange();
      range.selectNodeContents(this.outputElement);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  scrollUp(): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop -= this.options.fontSize * this.options.lineHeight;
    }
  }

  scrollDown(): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop += this.options.fontSize * this.options.lineHeight;
    }
  }

  scrollToBottom(): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  onInput(callback: InputHandler): { dispose: () => void } {
    this.inputHandlers.push(callback);
    return {
      dispose: () => {
        const idx = this.inputHandlers.indexOf(callback);
        if (idx !== -1) this.inputHandlers.splice(idx, 1);
      },
    };
  }

  focus(): void {
    this.inputElement?.focus();
    this.isFocused = true;
    this.showCursor();
  }

  dispose(): void {
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
      this.cursorInterval = null;
    }
    this.container.innerHTML = "";
    this.inputHandlers = [];
    this.cmdHistory = [];
  }

  private navigateHistory(direction: number): void {
    if (this.cmdHistory.length === 0) return;

    if (this.historyIndex === -1) {
      this.currentInput = this.inputElement?.value || "";
    }

    this.historyIndex += direction;

    if (this.historyIndex < 0) {
      this.historyIndex = -1;
      if (this.inputElement) this.inputElement.value = this.currentInput;
    } else if (this.historyIndex >= this.cmdHistory.length) {
      this.historyIndex = this.cmdHistory.length - 1;
    } else {
      if (this.inputElement) {
        this.inputElement.value = this.cmdHistory[this.cmdHistory.length - 1 - this.historyIndex];
      }
    }

    this.updateCursorPosition();
  }

  private parseAnsi(text: string): string {
    const colorMap: Record<string, string> = {
      "30": this.theme.black,
      "31": this.theme.red,
      "32": this.theme.green,
      "33": this.theme.yellow,
      "34": this.theme.blue,
      "35": this.theme.magenta,
      "36": this.theme.cyan,
      "37": this.theme.white,
      "90": this.theme.brightBlack,
      "91": this.theme.brightRed,
      "92": this.theme.brightGreen,
      "93": this.theme.brightYellow,
      "94": this.theme.brightBlue,
      "95": this.theme.brightMagenta,
      "96": this.theme.brightCyan,
      "97": this.theme.brightWhite,
    };

    return text.replace(ANSI_REGEX, (_match, code) => {
      const codes = code.split(";");
      let result = "";
      for (const c of codes) {
        if (c === "0" || c === "") {
          result += "</span>";
        } else if (colorMap[c]) {
          result += `<span style="color:${colorMap[c]}">`;
        } else if (c === "1") {
          result += `<span style="font-weight:bold">`;
        } else if (c === "3") {
          result += `<span style="font-style:italic">`;
        } else if (c === "4") {
          result += `<span style="text-decoration:underline">`;
        } else if (c === "7") {
          result += `<span style="background:${this.theme.foreground};color:${this.theme.background}">`;
        }
      }
      return result;
    });
  }

  private trimBuffer(): void {
    if (this.outputBuffer.length > this.scrollbackLimit * 80) {
      const lines = this.outputBuffer.split("\n");
      if (lines.length > this.scrollbackLimit) {
        this.outputBuffer = lines.slice(-this.scrollbackLimit).join("\n");
        if (this.outputElement) {
          const children = Array.from(this.outputElement.children);
          const removeCount = Math.floor(children.length / 2);
          for (let i = 0; i < removeCount; i++) {
            children[i].remove();
          }
        }
      }
    }
  }

  private updateCursorPosition(): void {
    if (!this.inputElement || !this.cursorElement) return;

    const text = this.inputElement.value;
    const pos = this.inputElement.selectionStart || 0;
    const before = text.substring(0, pos);

    const measureSpan = document.createElement("span");
    measureSpan.style.cssText = `
      font-family: ${this.options.fontFamily};
      font-size: ${this.options.fontSize}px;
      visibility: hidden;
      position: absolute;
      white-space: pre;
    `;
    measureSpan.textContent = before;
    document.body.appendChild(measureSpan);
    const width = measureSpan.offsetWidth;
    document.body.removeChild(measureSpan);

    this.cursorElement.style.left = `${width}px`;
  }

  private updateCursorStyle(): void {
    if (!this.cursorElement) return;

    const baseStyle = `
      position: absolute;
      pointer-events: none;
      transition: left 0.05s;
    `;

    switch (this.options.cursorStyle) {
      case "block":
        this.cursorElement.style.cssText = baseStyle + `
          width: ${this.options.fontSize * 0.6}px;
          height: ${this.options.fontSize}px;
          background: ${this.theme.cursor};
          opacity: 0.7;
        `;
        break;
      case "underline":
        this.cursorElement.style.cssText = baseStyle + `
          width: ${this.options.fontSize * 0.6}px;
          height: 2px;
          bottom: 0;
          background: ${this.theme.cursor};
        `;
        break;
      case "bar":
        this.cursorElement.style.cssText = baseStyle + `
          width: 2px;
          height: ${this.options.fontSize}px;
          background: ${this.theme.cursor};
        `;
        break;
    }
  }

  private startCursorBlink(): void {
    this.cursorInterval = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      if (this.cursorElement) {
        this.cursorElement.style.opacity = this.cursorVisible && this.isFocused ? "1" : "0";
      }
    }, 530);
  }

  private showCursor(): void {
    if (this.cursorElement) {
      this.cursorElement.style.opacity = "1";
      this.cursorVisible = true;
    }
  }

  private hideCursor(): void {
    if (this.cursorElement) {
      this.cursorElement.style.opacity = "0";
      this.cursorVisible = false;
    }
  }
}
