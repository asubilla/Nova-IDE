export interface CopyButtonConfig {
  text: string;
  label?: string;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
  onCopy?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface CopyButtonInstance {
  element: HTMLElement;
  copy: () => Promise<boolean>;
  setText: (text: string) => void;
  destroy: () => void;
}

export class CopyButton {
  private activeInstances: Map<HTMLElement, { cleanup: () => void }> = new Map();
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.setupKeyboardShortcut();
  }

  render(textOrConfig: string | CopyButtonConfig, label?: string): HTMLElement {
    const config =
      typeof textOrConfig === 'string'
        ? { text: textOrConfig, label: label || 'Copy' }
        : textOrConfig;

    const {
      text,
      label: btnLabel = 'Copy',
      className = '',
      size = 'small',
      showTooltip = true,
      onCopy,
      onError,
    } = config;

    const button = document.createElement('button');
    button.className = `copy-btn copy-btn-${size}${className ? ` ${className}` : ''}`;
    button.type = 'button';
    button.setAttribute('data-copy-text', text);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'copy-btn-icon';
    iconSpan.innerHTML = this.getCopyIcon();

    const labelSpan = document.createElement('span');
    labelSpan.className = 'copy-btn-label';
    labelSpan.textContent = btnLabel;

    button.appendChild(iconSpan);
    button.appendChild(labelSpan);

    if (showTooltip) {
      button.setAttribute('title', btnLabel);
    }

    const clickHandler = async (): Promise<void> => {
      await this.handleCopy(button, text, onCopy, onError);
    };

    button.addEventListener('click', clickHandler);

    this.activeInstances.set(button, {
      cleanup: () => {
        button.removeEventListener('click', clickHandler);
      },
    });

    return button;
  }

  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return this.fallbackCopy(text);
    }
  }

  showSuccess(button: HTMLElement): void {
    const icon = button.querySelector('.copy-btn-icon') as HTMLElement | null;
    const label = button.querySelector('.copy-btn-label') as HTMLElement | null;
    const prevIcon = icon?.innerHTML;
    const prevLabel = label?.textContent;

    button.classList.add('copy-btn-success');
    if (icon) icon.innerHTML = this.getCheckIcon();
    if (label) label.textContent = 'Copied!';
    button.setAttribute('aria-label', 'Copied to clipboard');

    setTimeout(() => {
      button.classList.remove('copy-btn-success');
      if (icon) icon.innerHTML = prevIcon || this.getCopyIcon();
      if (label) label.textContent = prevLabel || 'Copy';
      button.setAttribute('aria-label', 'Copy to clipboard');
    }, 2000);
  }

  showError(button: HTMLElement): void {
    const icon = button.querySelector('.copy-btn-icon') as HTMLElement | null;
    const label = button.querySelector('.copy-btn-label') as HTMLElement | null;
    const prevIcon = icon?.innerHTML;
    const prevLabel = label?.textContent;

    button.classList.add('copy-btn-error');
    if (icon) icon.innerHTML = this.getErrorIcon();
    if (label) label.textContent = 'Failed';
    button.setAttribute('aria-label', 'Copy failed');

    setTimeout(() => {
      button.classList.remove('copy-btn-error');
      if (icon) icon.innerHTML = prevIcon || this.getCopyIcon();
      if (label) label.textContent = prevLabel || 'Copy';
      button.setAttribute('aria-label', 'Copy to clipboard');
    }, 2000);
  }

  renderCodeBlock(
    code: string,
    language?: string,
    filename?: string
  ): { header: HTMLElement; copyButton: HTMLElement } {
    const header = document.createElement('div');
    header.className = 'copy-code-header';

    if (filename) {
      const filenameEl = document.createElement('span');
      filenameEl.className = 'copy-code-filename';
      filenameEl.textContent = filename;
      header.appendChild(filenameEl);
    }

    if (language) {
      const langBadge = document.createElement('span');
      langBadge.className = 'copy-code-lang';
      langBadge.textContent = language.toUpperCase();
      header.appendChild(langBadge);
    }

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    header.appendChild(spacer);

    const cleanCode = this.stripLineNumbers(code);
    const copyButton = this.render({
      text: cleanCode,
      label: 'Copy',
      size: 'small',
      showTooltip: true,
    });
    copyButton.classList.add('copy-code-btn');

    header.appendChild(copyButton);

    return { header, copyButton };
  }

  renderFormattedText(text: string, label?: string): HTMLElement {
    return this.render({ text, label: label || 'Copy text', size: 'small' });
  }

  destroy(): void {
    for (const [button, { cleanup }] of this.activeInstances) {
      cleanup();
    }
    this.activeInstances.clear();

    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
  }

  private async handleCopy(
    button: HTMLElement,
    text: string,
    onCopy?: (text: string) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      const success = await this.copy(text);

      if (success) {
        this.showSuccess(button);
        onCopy?.(text);
      } else {
        this.showError(button);
        onError?.(new Error('Copy failed'));
      }
    } catch (error) {
      this.showError(button);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fallbackCopy(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;padding:0;border:none;outline:none;box-shadow:none;';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    const range = document.createRange();
    range.selectNodeContents(textarea);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    textarea.select();
    textarea.setSelectionRange(0, text.length);

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch {
      success = false;
    }

    if (selection) {
      selection.removeAllRanges();
    }
    document.body.removeChild(textarea);

    return success;
  }

  private stripLineNumbers(code: string): string {
    return code
      .split('\n')
      .map((line) => {
        const match = line.match(/^\s*\d+\s*[|:\s]\s*(.*)/);
        return match ? match[1] : line;
      })
      .join('\n');
  }

  private setupKeyboardShortcut(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const activeEl = document.activeElement;
        if (activeEl && activeEl instanceof HTMLElement) {
          const codeBlock = activeEl.closest('.hljs-code-block, .chat-code-block');
          if (codeBlock) {
            const codeEl = codeBlock.querySelector('code');
            if (codeEl) {
              const text = codeEl.textContent || '';
              this.copy(text).then((success) => {
                if (success) {
                  const copyBtn = codeBlock.querySelector('.copy-btn, .hljs-copy-btn') as HTMLElement | null;
                  if (copyBtn) this.showSuccess(copyBtn);
                }
              });
            }
          }
        }
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  private getCopyIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }

  private getCheckIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  private getErrorIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }
}
