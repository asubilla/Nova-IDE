export type FormatType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'codeblock'
  | 'link'
  | 'ordered-list'
  | 'unordered-list'
  | 'quote'
  | 'heading';

export interface RichTextEditorConfig {
  placeholder?: string;
  minHeight?: number;
  onContentChange?: (content: string) => void;
}

interface ToolbarButton {
  type: FormatType;
  icon: string;
  label: string;
  shortcut?: string;
  markdown?: string;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { type: 'bold', icon: 'B', label: 'Bold', shortcut: 'Ctrl+B', markdown: '**' },
  { type: 'italic', icon: 'I', label: 'Italic', shortcut: 'Ctrl+I', markdown: '*' },
  { type: 'strikethrough', icon: 'S', label: 'Strikethrough', shortcut: 'Ctrl+Shift+X', markdown: '~~' },
  { type: 'code', icon: '<>', label: 'Inline Code', shortcut: 'Ctrl+E', markdown: '`' },
  { type: 'codeblock', icon: '{ }', label: 'Code Block', markdown: '```\n' },
  { type: 'link', icon: '🔗', label: 'Link', shortcut: 'Ctrl+K' },
  { type: 'unordered-list', icon: '•', label: 'Unordered List', markdown: '- ' },
  { type: 'ordered-list', icon: '1.', label: 'Ordered List', markdown: '1. ' },
  { type: 'quote', icon: '❝', label: 'Quote', markdown: '> ' },
  { type: 'heading', icon: 'H', label: 'Heading', markdown: '## ' },
];

export class RichTextEditor {
  private container: HTMLElement | null = null;
  private editorEl: HTMLDivElement | null = null;
  private toolbarEl: HTMLDivElement | null = null;
  private config: RichTextEditorConfig;
  private isMarkdownMode: boolean = true;

  constructor(config: RichTextEditorConfig = {}) {
    this.config = {
      placeholder: 'Type your message...',
      minHeight: 120,
      ...config,
    };
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'rte-wrapper';

    this.toolbarEl = this.renderToolbar();
    this.editorEl = this.renderEditor();

    wrapper.appendChild(this.toolbarEl);
    wrapper.appendChild(this.editorEl);

    this.container = wrapper;
    return wrapper;
  }

  private renderToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'rte-toolbar';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'rte-toolbar-group';

    for (const btn of TOOLBAR_BUTTONS) {
      const button = document.createElement('button');
      button.className = 'rte-toolbar-btn';
      button.type = 'button';
      button.title = btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label;
      button.dataset.format = btn.type;
      button.innerHTML = `<span class="rte-btn-icon">${btn.icon}</span>`;

      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.insertFormat(btn.type);
      });

      leftGroup.appendChild(button);
    }

    const rightGroup = document.createElement('div');
    rightGroup.className = 'rte-toolbar-group';

    const modeToggle = document.createElement('button');
    modeToggle.className = 'rte-toolbar-btn rte-mode-toggle';
    modeToggle.type = 'button';
    modeToggle.title = 'Toggle Markdown/HTML mode';
    modeToggle.textContent = this.isMarkdownMode ? 'MD' : 'HTML';
    modeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      this.isMarkdownMode = !this.isMarkdownMode;
      modeToggle.textContent = this.isMarkdownMode ? 'MD' : 'HTML';
    });
    rightGroup.appendChild(modeToggle);

    toolbar.appendChild(leftGroup);
    toolbar.appendChild(rightGroup);
    return toolbar;
  }

  private renderEditor(): HTMLDivElement {
    const editor = document.createElement('div');
    editor.className = 'rte-editor';
    editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.style.minHeight = `${this.config.minHeight}px`;

    if (this.config.placeholder) {
      editor.dataset.placeholder = this.config.placeholder;
    }

    editor.addEventListener('input', () => {
      this.config.onContentChange?.(this.getHTML());
    });

    editor.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });

    return editor;
  }

  getHTML(): string {
    if (!this.editorEl) return '';
    return this.editorEl.innerHTML;
  }

  getMarkdown(): string {
    if (!this.editorEl) return '';
    return this.parseHTML(this.editorEl.innerHTML);
  }

  setContent(html: string): void {
    if (!this.editorEl) return;
    this.editorEl.innerHTML = html;
    this.config.onContentChange?.(this.getHTML());
  }

  insertFormat(type: FormatType): void {
    const selection = window.getSelection();
    if (!selection || !this.editorEl) return;

    const selectedText = selection.toString();
    const range = selection.getRangeAt(0);

    switch (type) {
      case 'bold':
        this.wrapSelection(range, '**', '**', selectedText || 'bold text');
        break;
      case 'italic':
        this.wrapSelection(range, '*', '*', selectedText || 'italic text');
        break;
      case 'strikethrough':
        this.wrapSelection(range, '~~', '~~', selectedText || 'strikethrough');
        break;
      case 'code':
        this.wrapSelection(range, '`', '`', selectedText || 'code');
        break;
      case 'codeblock':
        this.insertAtCursor('```\n' + (selectedText || 'code here') + '\n```');
        break;
      case 'link':
        this.insertLink(selectedText || 'https://', selectedText || 'link text');
        break;
      case 'unordered-list':
        this.insertAtCursor('\n- ' + (selectedText || 'list item'));
        break;
      case 'ordered-list':
        this.insertAtCursor('\n1. ' + (selectedText || 'list item'));
        break;
      case 'quote':
        this.insertAtCursor('\n> ' + (selectedText || 'quote'));
        break;
      case 'heading':
        this.insertAtCursor('\n## ' + (selectedText || 'Heading'));
        break;
    }

    this.config.onContentChange?.(this.getHTML());
  }

  insertLink(url: string, text: string): void {
    this.insertAtCursor(`[${text}](${url})`);
  }

  insertCodeBlock(code: string, language: string): void {
    this.insertAtCursor(`\n\`\`\`${language}\n${code}\n\`\`\`\n`);
  }

  handleKeyboardShortcuts(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (ctrl && !shift && e.key === 'b') {
      e.preventDefault();
      this.insertFormat('bold');
    } else if (ctrl && !shift && e.key === 'i') {
      e.preventDefault();
      this.insertFormat('italic');
    } else if (ctrl && shift && e.key === 'X') {
      e.preventDefault();
      this.insertFormat('strikethrough');
    } else if (ctrl && e.key === 'k') {
      e.preventDefault();
      this.insertFormat('link');
    } else if (ctrl && e.key === 'e') {
      e.preventDefault();
      this.insertFormat('code');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  }

  parseMarkdown(text: string): string {
    let html = this.escapeHtml(text);

    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_match, lang, code) =>
        `<pre><code class="language-${lang}">${code}</code></pre>`
    );

    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );

    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    html = html.replace(/\n{2,}/g, '<br><br>');

    return html;
  }

  parseHTML(html: string): string {
    let md = html;

    md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
    md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
    md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
    md = md.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n');
    md = md.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n');
    md = md.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n');

    md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    md = md.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');
    md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');

    md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');

    md = md.replace(
      /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
      (_match, code) => `\n\`\`\`\n${code}\n\`\`\`\n`
    );

    md = md.replace(
      /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
      '[$2]($1)'
    );

    md = md.replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n');

    md = md.replace(/<ul>[\s\S]*?<\/ul>/gi, (match) => {
      return match.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
    });
    md = md.replace(/<ol>[\s\S]*?<\/ol>/gi, (match) => {
      let i = 0;
      return match.replace(/<li>(.*?)<\/li>/gi, () => `${++i}. $1\n`);
    });

    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<\/?div[^>]*>/gi, '\n');
    md = md.replace(/<\/?p[^>]*>/gi, '\n');

    md = md.replace(/<[^>]+>/g, '');

    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#0?39;/g, "'");

    return md.trim();
  }

  private wrapSelection(
    range: Range,
    prefix: string,
    suffix: string,
    fallback: string
  ): void {
    const selection = window.getSelection();
    if (!selection) return;

    const selectedText = selection.toString();
    const text = selectedText || fallback;

    range.deleteContents();
    const textNode = document.createTextNode(`${prefix}${text}${suffix}`);
    range.insertNode(textNode);

    if (!selectedText) {
      const newRange = document.createRange();
      newRange.setStart(textNode, prefix.length);
      newRange.setEnd(textNode, prefix.length + text.length);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }

    range.collapse(false);
  }

  private insertAtCursor(text: string): void {
    const selection = window.getSelection();
    if (!selection || !this.editorEl) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    this.editorEl.focus();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
