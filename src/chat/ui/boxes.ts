import { CodeHighlighter } from './code-highlighter.js';
import type { SupportedLanguage } from './code-highlighter.js';

export type BoxType = 'info' | 'success' | 'warning' | 'error' | 'code' | 'tip' | 'note' | 'important';

export interface BoxConfig {
  type: BoxType;
  title?: string;
  content: string;
  language?: SupportedLanguage;
  filename?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  copyable?: boolean;
  showLineNumbers?: boolean;
  customClass?: string;
}

const BOX_ICONS: Record<BoxType, string> = {
  info: '\u2139\uFE0F',
  success: '\u2705',
  warning: '\u26A0\uFE0F',
  error: '\u274C',
  code: '\u{1F4BB}',
  tip: '\u{1F4A1}',
  note: '\u{1F4DD}',
  important: '\u2757',
};

const BOX_CLASSES: Record<BoxType, string> = {
  info: 'chat-box-info',
  success: 'chat-box-success',
  warning: 'chat-box-warning',
  error: 'chat-box-error',
  code: 'chat-box-code',
  tip: 'chat-box-tip',
  note: 'chat-box-note',
  important: 'chat-box-important',
};

function escapeAttr(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class BoxRenderer {
  private highlighter: CodeHighlighter;
  private copyButtons: Map<HTMLElement, () => void> = new Map();

  constructor() {
    this.highlighter = new CodeHighlighter();
  }

  renderInfo(title: string, content: string): string {
    return this.renderBox({ type: 'info', title, content });
  }

  renderSuccess(title: string, content: string): string {
    return this.renderBox({ type: 'success', title, content });
  }

  renderWarning(title: string, content: string): string {
    return this.renderBox({ type: 'warning', title, content });
  }

  renderError(title: string, content: string): string {
    return this.renderBox({ type: 'error', title, content });
  }

  renderCode(title: string, code: string, language?: SupportedLanguage): string {
    return this.renderBox({
      type: 'code',
      title,
      content: code,
      language,
      copyable: true,
      showLineNumbers: true,
    });
  }

  renderTip(title: string, content: string): string {
    return this.renderBox({ type: 'tip', title, content });
  }

  renderNote(title: string, content: string): string {
    return this.renderBox({ type: 'note', title, content });
  }

  renderCustom(config: BoxConfig): string {
    return this.renderBox(config);
  }

  renderBox(config: BoxConfig): string {
    const {
      type,
      title,
      content,
      language,
      filename,
      collapsible = false,
      collapsed = false,
      copyable = false,
      showLineNumbers = true,
      customClass,
    } = config;

    const icon = BOX_ICONS[type];
    const boxClass = BOX_CLASSES[type];
    const collapseClass = collapsible ? 'chat-box-collapsible' : '';
    const collapsedClass = collapsed ? 'chat-box-collapsed' : '';
    const custom = customClass ? ` ${customClass}` : '';

    const titleHtml = title
      ? `<div class="chat-box-header">
          <span class="chat-box-icon">${icon}</span>
          <span class="chat-box-title">${this.highlighter.escapeHtml(title)}</span>
          <div class="chat-box-header-actions">
            ${collapsible ? `<button class="chat-box-toggle" title="Toggle collapse">\u25B6</button>` : ''}
            ${copyable ? `<button class="chat-box-copy" data-content="${escapeAttr(content)}" title="Copy to clipboard">\u2398</button>` : ''}
          </div>
        </div>`
      : '';

    let bodyHtml: string;
    if (type === 'code' && language) {
      bodyHtml = `<div class="chat-box-body chat-box-code-body">
        ${this.highlighter.renderCodeBlock({ code: content, language, filename, showLineNumbers })}
      </div>`;
    } else if (type === 'code') {
      bodyHtml = `<div class="chat-box-body chat-box-code-body">
        ${this.highlighter.renderCodeBlock({ code: content, language: 'text', filename, showLineNumbers })}
      </div>`;
    } else {
      const renderedContent = this.renderMarkdownContent(content);
      bodyHtml = `<div class="chat-box-body">${renderedContent}</div>`;
    }

    return `<div class="chat-box ${boxClass}${collapseClass}${collapsedClass}${custom ? ` ${custom}` : ''}" role="alert">
      ${titleHtml}
      ${bodyHtml}
    </div>`;
  }

  renderBoxElement(config: BoxConfig): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = this.renderBox(config);
    const box = container.firstElementChild as HTMLElement;

    const toggleBtn = box.querySelector('.chat-box-toggle') as HTMLButtonElement | null;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = box.classList.toggle('chat-box-collapsed');
        toggleBtn.textContent = isCollapsed ? '\u25B6' : '\u25BC';
      });
    }

    const copyBtn = box.querySelector('.chat-box-copy') as HTMLButtonElement | null;
    if (copyBtn) {
      const textToCopy = copyBtn.getAttribute('data-content') || '';
      const handler = () => this.handleCopy(copyBtn, textToCopy);
      copyBtn.addEventListener('click', handler);
      this.copyButtons.set(copyBtn, handler);
    }

    return box;
  }

  destroy(): void {
    for (const [btn, handler] of this.copyButtons) {
      btn.removeEventListener('click', handler);
    }
    this.copyButtons.clear();
  }

  private handleCopy(btn: HTMLButtonElement, text: string): void {
    const originalText = btn.textContent;
    btn.textContent = '\u2713';
    btn.disabled = true;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1500);
      })
      .catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          btn.textContent = '\u2713';
        } catch {
          btn.textContent = '\u2717';
        }
        document.body.removeChild(textarea);

        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1500);
      });
  }

  private renderMarkdownContent(content: string): string {
    let result = this.highlighter.escapeHtml(content);

    result = result.replace(/^### (.+)$/gm, '<h3 class="chat-box-h3">$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2 class="chat-box-h2">$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1 class="chat-box-h1">$1</h1>');

    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
    result = result.replace(
      /`([^`]+)`/g,
      '<code class="hljs-inline">$1</code>'
    );

    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="chat-box-link">$1</a>'
    );

    result = result.replace(/^- (.+)$/gm, '<li>$1</li>');
    result = result.replace(/(<li>[\s\S]*<\/li>\n?)+/g, '<ul class="chat-box-list">$&</ul>');

    result = result.replace(/^> (.+)$/gm, '<blockquote class="chat-box-blockquote">$1</blockquote>');

    result = result.replace(/\n/g, '<br>');

    return result;
  }
}
