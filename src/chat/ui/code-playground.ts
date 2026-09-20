import { CodeHighlighter, type SupportedLanguage } from './code-highlighter.js';

export type PlaygroundLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'html'
  | 'css'
  | 'json'
  | 'sql'
  | 'bash'
  | 'go'
  | 'rust'
  | 'java';

export type PlaygroundTheme = 'dark' | 'light' | 'monokai';

export interface CodePlaygroundConfig {
  language?: PlaygroundLanguage;
  code?: string;
  theme?: PlaygroundTheme;
  showMinimap?: boolean;
  wordWrap?: boolean;
  fontSize?: number;
  tabSize?: number;
  onRun?: (code: string, language: PlaygroundLanguage) => Promise<string>;
  onCodeChange?: (code: string) => void;
}

interface HistoryEntry {
  content: string;
  cursorOffset: number;
}

const LANGUAGE_LABELS: Record<PlaygroundLanguage, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  sql: 'SQL',
  bash: 'Bash',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
};

const LANGUAGE_FILE_EXTENSIONS: Record<PlaygroundLanguage, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  html: '.html',
  css: '.css',
  json: '.json',
  sql: '.sql',
  bash: '.sh',
  go: '.go',
  rust: '.rs',
  java: '.java',
};

const THEMES: Record<PlaygroundTheme, Record<string, string>> = {
  dark: {
    bg: '#1e1e2e',
    editorBg: '#181825',
    text: '#cdd6f4',
    lineNum: '#585b70',
    selection: '#45475a',
    cursor: '#f5e0dc',
    border: '#313244',
    gutter: '#11111b',
    toolbarBg: '#1e1e2e',
    accent: '#89b4fa',
    error: '#f38ba8',
    success: '#a6e3a1',
    outputBg: '#11111b',
  },
  light: {
    bg: '#eff1f5',
    editorBg: '#ffffff',
    text: '#4c4f69',
    lineNum: '#9ca0b0',
    selection: '#ccd0da',
    cursor: '#dc8a78',
    border: '#ccd0da',
    gutter: '#e6e9ef',
    toolbarBg: '#e6e9ef',
    accent: '#1e66f5',
    error: '#d20f39',
    success: '#40a02b',
    outputBg: '#e6e9ef',
  },
  monokai: {
    bg: '#272822',
    editorBg: '#1e1f1c',
    text: '#f8f8f2',
    lineNum: '#90908a',
    selection: '#49483e',
    cursor: '#f8f8f0',
    border: '#3e3d32',
    gutter: '#1a1b16',
    toolbarBg: '#272822',
    accent: '#a6e22e',
    error: '#f92672',
    success: '#a6e22e',
    outputBg: '#1a1b16',
  },
};

export class CodePlayground {
  private container: HTMLElement | null = null;
  private editorEl: HTMLTextAreaElement | null = null;
  private lineNumbersEl: HTMLDivElement | null = null;
  private outputEl: HTMLPreElement | null = null;
  private languageSelect: HTMLSelectElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private wrapperEl: HTMLDivElement | null = null;
  private editorWrapperEl: HTMLDivElement | null = null;
  private outputPanelEl: HTMLDivElement | null = null;
  private highlighter: CodeHighlighter;

  private config: CodePlaygroundConfig;
  private currentLanguage: PlaygroundLanguage;
  private currentTheme: PlaygroundTheme;
  private isRunning: boolean = false;
  private isFullscreen: boolean = false;
  private isSplitView: boolean = true;
  private isWordWrap: boolean;
  private isMinimap: boolean;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxHistory: number = 100;

  constructor(config: CodePlaygroundConfig = {}) {
    this.config = config;
    this.currentLanguage = config.language || 'javascript';
    this.currentTheme = config.theme || 'dark';
    this.isWordWrap = config.wordWrap ?? false;
    this.isMinimap = config.showMinimap ?? false;
    this.highlighter = new CodeHighlighter();
  }

  render(language?: PlaygroundLanguage, code?: string): HTMLElement {
    if (language) this.currentLanguage = language;

    const wrapper = document.createElement('div');
    wrapper.className = 'cp-playground';
    wrapper.style.setProperty('--cp-bg', THEMES[this.currentTheme].bg);
    wrapper.style.setProperty('--cp-editor-bg', THEMES[this.currentTheme].editorBg);
    wrapper.style.setProperty('--cp-text', THEMES[this.currentTheme].text);
    wrapper.style.setProperty('--cp-line-num', THEMES[this.currentTheme].lineNum);
    wrapper.style.setProperty('--cp-border', THEMES[this.currentTheme].border);
    wrapper.style.setProperty('--cp-gutter', THEMES[this.currentTheme].gutter);
    wrapper.style.setProperty('--cp-toolbar-bg', THEMES[this.currentTheme].toolbarBg);
    wrapper.style.setProperty('--cp-accent', THEMES[this.currentTheme].accent);
    wrapper.style.setProperty('--cp-error', THEMES[this.currentTheme].error);
    wrapper.style.setProperty('--cp-success', THEMES[this.currentTheme].success);
    wrapper.style.setProperty('--cp-output-bg', THEMES[this.currentTheme].outputBg);

    const toolbar = this.renderToolbar();
    const mainArea = document.createElement('div');
    mainArea.className = 'cp-main';

    this.editorWrapperEl = document.createElement('div');
    this.editorWrapperEl.className = 'cp-editor-wrapper';

    const gutter = document.createElement('div');
    gutter.className = 'cp-gutter';
    this.lineNumbersEl = document.createElement('div');
    this.lineNumbersEl.className = 'cp-line-numbers';
    gutter.appendChild(this.lineNumbersEl);

    const editorContainer = document.createElement('div');
    editorContainer.className = 'cp-editor-container';

    this.editorEl = document.createElement('textarea');
    this.editorEl.className = 'cp-editor';
    this.editorEl.spellcheck = false;
    this.editorEl.autocomplete = 'off';
    this.editorEl.autocapitalize = 'off';
    this.editorEl.wrap = this.isWordWrap ? 'soft' : 'off';
    this.editorEl.value = code || this.config.code || '';

    this.editorEl.addEventListener('input', () => this.onEditorInput());
    this.editorEl.addEventListener('keydown', (e) => this.onEditorKeydown(e));
    this.editorEl.addEventListener('scroll', () => this.syncScroll());
    this.editorEl.addEventListener('click', () => this.updateCursorInfo());

    editorContainer.appendChild(this.editorEl);
    this.editorWrapperEl.appendChild(gutter);
    this.editorWrapperEl.appendChild(editorContainer);

    this.outputPanelEl = document.createElement('div');
    this.outputPanelEl.className = 'cp-output-panel';

    const outputHeader = document.createElement('div');
    outputHeader.className = 'cp-output-header';
    outputHeader.innerHTML = `<span class="cp-output-title">Output</span>`;

    this.outputEl = document.createElement('pre');
    this.outputEl.className = 'cp-output';

    this.outputPanelEl.appendChild(outputHeader);
    this.outputPanelEl.appendChild(this.outputEl);

    mainArea.appendChild(this.editorWrapperEl);
    mainArea.appendChild(this.outputPanelEl);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(mainArea);

    this.container = wrapper;
    this.updateLineNumbers();
    this.pushHistory();

    return wrapper;
  }

  private renderToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'cp-toolbar';

    const left = document.createElement('div');
    left.className = 'cp-toolbar-left';

    this.languageSelect = document.createElement('select');
    this.languageSelect.className = 'cp-language-select';
    for (const [key, label] of Object.entries(LANGUAGE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      if (key === this.currentLanguage) opt.selected = true;
      this.languageSelect.appendChild(opt);
    }
    this.languageSelect.addEventListener('change', () => {
      this.setLanguage(this.languageSelect!.value as PlaygroundLanguage);
    });

    const themeSelect = document.createElement('select');
    themeSelect.className = 'cp-theme-select';
    for (const theme of ['dark', 'light', 'monokai'] as PlaygroundTheme[]) {
      const opt = document.createElement('option');
      opt.value = theme;
      opt.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
      if (theme === this.currentTheme) opt.selected = true;
      themeSelect.appendChild(opt);
    }
    themeSelect.addEventListener('change', () => {
      this.setTheme(themeSelect.value as PlaygroundTheme);
    });

    left.appendChild(this.languageSelect);
    left.appendChild(themeSelect);

    const right = document.createElement('div');
    right.className = 'cp-toolbar-right';

    const wordWrapBtn = this.createToolbarButton('Wrap', () => this.toggleWordWrap());
    wordWrapBtn.classList.toggle('active', this.isWordWrap);

    const findBtn = this.createToolbarButton('Find', () => this.openFindReplace());

    const formatBtn = this.createToolbarButton('Format', () => this.format());

    this.runBtn = this.createToolbarButton('Run', () => this.run());
    this.runBtn.classList.add('cp-run-btn');

    const copyBtn = this.createToolbarButton('Copy', () => this.copyCode());

    const downloadBtn = this.createToolbarButton('Download', () => this.downloadCode());

    const splitBtn = this.createToolbarButton('Split', () => this.splitView());

    const fullscreenBtn = this.createToolbarButton('Expand', () => this.toggleFullscreen());

    right.appendChild(wordWrapBtn);
    right.appendChild(findBtn);
    right.appendChild(formatBtn);
    right.appendChild(this.runBtn);
    right.appendChild(copyBtn);
    right.appendChild(downloadBtn);
    right.appendChild(splitBtn);
    right.appendChild(fullscreenBtn);

    toolbar.appendChild(left);
    toolbar.appendChild(right);
    return toolbar;
  }

  private createToolbarButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'cp-toolbar-btn';
    btn.type = 'button';
    btn.title = label;
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  setCode(code: string): void {
    if (!this.editorEl) return;
    this.editorEl.value = code;
    this.onEditorInput();
  }

  getCode(): string {
    return this.editorEl?.value || '';
  }

  setLanguage(lang: PlaygroundLanguage): void {
    this.currentLanguage = lang;
    if (this.languageSelect) {
      this.languageSelect.value = lang;
    }
    this.updateLineNumbers();
  }

  async run(): Promise<void> {
    if (this.isRunning || !this.outputEl) return;

    this.isRunning = true;
    this.runBtn!.textContent = 'Running...';
    this.runBtn!.disabled = true;
    this.outputEl.textContent = 'Executing...';
    this.outputEl.className = 'cp-output cp-output-running';

    try {
      const code = this.getCode();
      let result: string;

      if (this.config.onRun) {
        result = await this.config.onRun(code, this.currentLanguage);
      } else {
        result = this.defaultRun(code);
      }

      this.outputEl.textContent = result || '(no output)';
      this.outputEl.className = 'cp-output cp-output-success';
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.outputEl.textContent = `Error: ${errorMsg}`;
      this.outputEl.className = 'cp-output cp-output-error';
    } finally {
      this.isRunning = false;
      this.runBtn!.textContent = 'Run';
      this.runBtn!.disabled = false;
    }
  }

  private defaultRun(code: string): string {
    if (this.currentLanguage === 'javascript' || this.currentLanguage === 'typescript') {
      try {
        const logs: string[] = [];
        const mockConsole = {
          log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
          error: (...args: unknown[]) => logs.push('[error] ' + args.map(String).join(' ')),
          warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(String).join(' ')),
          info: (...args: unknown[]) => logs.push('[info] ' + args.map(String).join(' ')),
        };
        const fn = new Function('console', code);
        const result = fn(mockConsole);
        if (result !== undefined) logs.push(String(result));
        return logs.join('\n') || '(no output)';
      } catch (e) {
        throw new Error(`Runtime error: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (this.currentLanguage === 'python') {
      return `[Python] Execution requires a Python runtime. Code preview:\n${code}`;
    }

    return `[${LANGUAGE_LABELS[this.currentLanguage]}] Execution not available in browser. Code preview:\n${code}`;
  }

  format(): void {
    if (!this.editorEl) return;
    let code = this.editorEl.value;

    if (this.currentLanguage === 'json') {
      try {
        code = JSON.stringify(JSON.parse(code), null, 2);
      } catch {
        return;
      }
    } else if (this.currentLanguage === 'html') {
      code = this.formatHtml(code);
    } else if (this.currentLanguage === 'css') {
      code = this.formatCss(code);
    } else {
      code = this.autoIndent(code);
    }

    this.editorEl.value = code;
    this.onEditorInput();
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    this.container?.classList.toggle('cp-fullscreen', this.isFullscreen);
  }

  splitView(): void {
    this.isSplitView = !this.isSplitView;
    this.outputPanelEl?.classList.toggle('cp-hidden', !this.isSplitView);
  }

  setTheme(theme: PlaygroundTheme): void {
    this.currentTheme = theme;
    const colors = THEMES[theme];
    if (!this.container) return;

    const style = this.container.style;
    style.setProperty('--cp-bg', colors.bg);
    style.setProperty('--cp-editor-bg', colors.editorBg);
    style.setProperty('--cp-text', colors.text);
    style.setProperty('--cp-line-num', colors.lineNum);
    style.setProperty('--cp-border', colors.border);
    style.setProperty('--cp-gutter', colors.gutter);
    style.setProperty('--cp-toolbar-bg', colors.toolbarBg);
    style.setProperty('--cp-accent', colors.accent);
    style.setProperty('--cp-error', colors.error);
    style.setProperty('--cp-success', colors.success);
    style.setProperty('--cp-output-bg', colors.outputBg);
  }

  copyCode(): void {
    const code = this.getCode();
    navigator.clipboard.writeText(code).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  downloadCode(): void {
    const code = this.getCode();
    const ext = LANGUAGE_FILE_EXTENSIONS[this.currentLanguage];
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private onEditorInput(): void {
    this.updateLineNumbers();
    this.pushHistory();
    this.config.onCodeChange?.(this.getCode());
  }

  private onEditorKeydown(e: KeyboardEvent): void {
    const tabSize = this.config.tabSize || 2;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.editorEl!.selectionStart;
      const end = this.editorEl!.selectionEnd;
      const value = this.editorEl!.value;

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const line = value.substring(lineStart, end);
        const dedented = line.replace(new RegExp(`^ {1,${tabSize}}`, 'gm'), '');
        const diff = line.length - dedented.length;
        this.editorEl!.value = value.substring(0, lineStart) + dedented + value.substring(end);
        this.editorEl!.selectionStart = Math.max(start - diff, lineStart);
        this.editorEl!.selectionEnd = end - diff;
      } else {
        const spaces = ' '.repeat(tabSize);
        this.editorEl!.value = value.substring(0, start) + spaces + value.substring(end);
        this.editorEl!.selectionStart = this.editorEl!.selectionEnd = start + tabSize;
      }
      this.onEditorInput();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const start = this.editorEl!.selectionStart;
      const value = this.editorEl!.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.substring(lineStart, start);
      const indent = currentLine.match(/^\s*/)?.[0] || '';
      const lastChar = currentLine.trim().slice(-1);
      const nextChar = value[start];

      let insertion = '\n' + indent;

      if (lastChar === '{' || lastChar === '(' || lastChar === '[' || lastChar === ':') {
        insertion = '\n' + indent + ' '.repeat(tabSize);
        if (nextChar === '}' || nextChar === ')' || nextChar === ']') {
          insertion += '\n' + indent;
        }
      }

      this.editorEl!.value = value.substring(0, start) + insertion + value.substring(start);
      const newPos = start + insertion.length;
      this.editorEl!.selectionStart = this.editorEl!.selectionEnd = newPos;
      this.onEditorInput();
      return;
    }

    if (e.key === 'Backspace') {
      const start = this.editorEl!.selectionStart;
      const value = this.editorEl!.value;
      if (start > 0) {
        const pair = value.substring(start - 2, start + 1);
        if (pair === '{}' || pair === '()' || pair === '[]' || pair === '""' || pair === "''" || pair === '``') {
          if (this.editorEl!.selectionStart === this.editorEl!.selectionEnd) {
            e.preventDefault();
            this.editorEl!.value = value.substring(0, start - 1) + value.substring(start + 1);
            this.editorEl!.selectionStart = this.editorEl!.selectionEnd = start - 1;
            this.onEditorInput();
            return;
          }
        }
      }
    }

    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key]) {
      const start = this.editorEl!.selectionStart;
      const end = this.editorEl!.selectionEnd;
      const value = this.editorEl!.value;

      if (start !== end) {
        e.preventDefault();
        const selected = value.substring(start, end);
        this.editorEl!.value = value.substring(0, start) + e.key + selected + pairs[e.key] + value.substring(end);
        this.editorEl!.selectionStart = start + 1;
        this.editorEl!.selectionEnd = end + 1;
        this.onEditorInput();
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'f') {
        e.preventDefault();
        this.openFindReplace();
      }
    }
  }

  private undo(): void {
    if (this.undoStack.length <= 1) return;
    this.redoStack.push(this.undoStack.pop()!);
    const entry = this.undoStack[this.undoStack.length - 1];
    if (this.editorEl) {
      this.editorEl.value = entry.content;
      this.updateLineNumbers();
    }
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);
    if (this.editorEl) {
      this.editorEl.value = entry.content;
      this.updateLineNumbers();
    }
  }

  private pushHistory(): void {
    const content = this.editorEl?.value || '';
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1].content === content) {
      return;
    }
    this.undoStack.push({ content, cursorOffset: this.editorEl?.selectionStart || 0 });
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private updateLineNumbers(): void {
    if (!this.lineNumbersEl || !this.editorEl) return;
    const lineCount = this.editorEl.value.split('\n').length;
    const nums: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      nums.push(`<div class="cp-line-num">${i}</div>`);
    }
    this.lineNumbersEl.innerHTML = nums.join('');
  }

  private syncScroll(): void {
    if (!this.editorEl || !this.lineNumbersEl) return;
    this.lineNumbersEl.style.transform = `translateY(-${this.editorEl.scrollTop}px)`;
  }

  private updateCursorInfo(): void {
    if (!this.editorEl) return;
    const pos = this.editorEl.selectionStart;
    const lines = this.editorEl.value.substring(0, pos).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    if (this.container) this.container.dataset.cursorInfo = `Ln ${line}, Col ${col}`;
  }

  private openFindReplace(): void {
    const query = window.prompt('Find:');
    if (!query) return;
    const replacement = window.prompt('Replace with (leave empty to just find):');

    if (replacement !== null) {
      const code = this.getCode();
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      this.setCode(code.replace(regex, replacement));
    }
  }

  private toggleWordWrap(): void {
    this.isWordWrap = !this.isWordWrap;
    if (this.editorEl) {
      this.editorEl.wrap = this.isWordWrap ? 'soft' : 'off';
    }
  }

  private autoIndent(code: string): string {
    const lines = code.split('\n');
    let indentLevel = 0;
    const tabSize = this.config.tabSize || 2;
    const indent = ' '.repeat(tabSize);

    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        if (/^[}\])]/.test(trimmed)) {
          indentLevel = Math.max(0, indentLevel - 1);
        }

        const result = indent.repeat(indentLevel) + trimmed;

        if (/[{(\[]$/.test(trimmed) && !/^[}\])]/.test(trimmed)) {
          indentLevel++;
        } else if (/^[}\])]/.test(trimmed) && /[{(\[]$/.test(line.trimEnd())) {
          // closing bracket that was on same line as opener
        }

        return result;
      })
      .join('\n');
  }

  private formatHtml(html: string): string {
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    const tokens = html.replace(/>\s*</g, '>\n<').split('\n');

    for (const token of tokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;

      if (/^<\//.test(trimmed)) {
        indent = Math.max(0, indent - 1);
      }

      formatted += tab.repeat(indent) + trimmed + '\n';

      if (
        /^<[a-zA-Z]/.test(trimmed) &&
        !/\/>$/.test(trimmed) &&
        !/^<\//.test(trimmed) &&
        !/^<(br|hr|img|input|meta|link)/i.test(trimmed)
      ) {
        indent++;
      }
    }

    return formatted.trim();
  }

  private formatCss(css: string): string {
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    const chars = css.replace(/\s+/g, ' ').split('');
    let buffer = '';

    for (const ch of chars) {
      buffer += ch;

      if (ch === '{') {
        formatted += buffer.trim() + ' {\n';
        buffer = '';
        indent++;
      } else if (ch === '}') {
        if (buffer.trim()) {
          formatted += tab.repeat(indent) + buffer.trim() + '\n';
        }
        buffer = '';
        indent = Math.max(0, indent - 1);
        formatted += '}\n';
      } else if (ch === ';' && buffer.trim().endsWith(';')) {
        formatted += tab.repeat(indent) + buffer.trim() + '\n';
        buffer = '';
      }
    }

    if (buffer.trim()) {
      formatted += tab.repeat(indent) + buffer.trim();
    }

    return formatted.trim();
  }
}
