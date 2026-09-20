import type { SupportedLanguage } from './code-highlighter.js';
import { CodeHighlighter } from './code-highlighter.js';

export type PreviewFormat = 'png' | 'pdf' | 'html';

export interface DiffSegment {
  type: 'added' | 'removed' | 'unchanged';
  line: string;
  lineNumber?: number;
}

export interface PreviewConfig {
  debounceMs?: number;
  sandboxPolicy?: string;
  maxPreviewSize?: number;
  enableExport?: boolean;
  styles?: string;
}

const DEFAULT_CONFIG: Required<PreviewConfig> = {
  debounceMs: 300,
  sandboxPolicy: 'allow-scripts allow-same-origin',
  maxPreviewSize: 1024 * 1024,
  enableExport: true,
  styles: '',
};

export class LivePreview {
  private config: Required<PreviewConfig>;
  private highlighter: CodeHighlighter;
  private previewContainer: HTMLElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentIframe: HTMLIFrameElement | null = null;
  private observer: MutationObserver | null = null;

  constructor(config?: PreviewConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.highlighter = new CodeHighlighter();
  }

  renderPreview(
    code: string,
    language: SupportedLanguage,
    container: HTMLElement
  ): void {
    this.previewContainer = container;
    this.previewContainer.innerHTML = '';

    try {
      switch (language) {
        case 'html':
          this.renderHTMLPreview(code, container);
          break;
        case 'markdown':
          this.renderMarkdownPreview(code, container);
          break;
        case 'json':
          this.renderJSONPreview(code, container);
          break;
        case 'css':
          this.renderCSSPreview(code, container);
          break;
        case 'javascript':
        case 'typescript':
          this.renderJSPreview(code, container);
          break;
        default:
          this.renderPlainTextPreview(code, language, container);
          break;
      }
    } catch (error) {
      this.renderError(error as Error, container);
    }
  }

  renderHTMLPreview(code: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-html';

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.setAttribute('sandbox', this.config.sandboxPolicy);
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'HTML Preview');
    iframe.style.width = '100%';
    iframe.style.minHeight = '200px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.style.background = '#ffffff';

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    * { box-sizing: border-box; }
    ${this.config.styles}
  </style>
</head>
<body>${code}</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);

    this.currentIframe = iframe;

    const toolbar = this.createToolbar('HTML Preview', [
      { label: 'Refresh', action: () => this.refreshIframe(iframe, htmlContent) },
      { label: 'Open in Tab', action: () => this.openInNewTab(htmlContent) },
    ]);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(iframe);
    target.appendChild(wrapper);

    iframe.onload = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          const height = Math.min(
            Math.max(body.scrollHeight + 32, 200),
            600
          );
          iframe.style.height = `${height}px`;
        }
      } catch {
        iframe.style.height = '400px';
      }
    };
  }

  renderMarkdownPreview(code: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-markdown';

    const rendered = this.parseMarkdown(code);
    const content = document.createElement('div');
    content.className = 'preview-markdown-content';
    content.innerHTML = rendered;

    const toolbar = this.createToolbar('Markdown Preview');
    wrapper.appendChild(toolbar);
    wrapper.appendChild(content);
    target.appendChild(wrapper);
  }

  renderJSONPreview(code: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-json';

    let formatted: string;
    try {
      const parsed = JSON.parse(code);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = code;
    }

    const highlighted = this.highlighter.highlight(formatted, 'json');

    const content = document.createElement('div');
    content.className = 'preview-json-content';
    content.innerHTML = `<pre class="hljs-pre"><code>${highlighted}</code></pre>`;

    const toolbar = this.createToolbar('JSON Preview', [
      {
        label: 'Format',
        action: () => {
          try {
            const parsed = JSON.parse(code);
            content.innerHTML = `<pre class="hljs-pre"><code>${this.highlighter.highlight(JSON.stringify(parsed, null, 2), 'json')}</code></pre>`;
          } catch {
            /* already formatted or invalid */
          }
        },
      },
      {
        label: 'Minify',
        action: () => {
          try {
            const parsed = JSON.parse(code);
            content.innerHTML = `<pre class="hljs-pre"><code>${this.highlighter.highlight(JSON.stringify(parsed), 'json')}</code></pre>`;
          } catch {
            /* invalid json */
          }
        },
      },
    ]);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(content);
    target.appendChild(wrapper);
  }

  renderCSSPreview(code: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-css';

    const previewBox = document.createElement('div');
    previewBox.className = 'preview-css-box';
    previewBox.innerHTML = `
      <div class="preview-css-sample" style="padding: 16px; border: 1px dashed #ccc; border-radius: 8px; margin: 12px;">
        <h3>CSS Preview Sample</h3>
        <p>This is a sample paragraph to preview your CSS styles.</p>
        <button>Sample Button</button>
        <a href="#">Sample Link</a>
        <div class="sample-box">Box Element</div>
      </div>
      <style>${code}</style>
    `;

    const toolbar = this.createToolbar('CSS Preview');
    wrapper.appendChild(toolbar);
    wrapper.appendChild(previewBox);
    target.appendChild(wrapper);
  }

  renderJSPreview(code: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-js';

    const output = document.createElement('div');
    output.className = 'preview-js-output';

    const logs: string[] = [];

    const sandbox = document.createElement('div');
    sandbox.style.display = 'none';

    const toolbar = this.createToolbar('JavaScript Preview', [
      {
        label: 'Run',
        action: () => {
          logs.length = 0;
          output.innerHTML = '<div class="preview-js-running">Running...</div>';

          setTimeout(() => {
            try {
              const iframe = document.createElement('iframe');
              iframe.setAttribute('sandbox', 'allow-scripts');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);

              const win = iframe.contentWindow;
              if (win) {
                const capturedLogs: string[] = [];
                const sandbox = win as unknown as { console: { log: Function; error: Function; warn: Function }; eval: (code: string) => unknown };
                const origLog = sandbox.console.log;
                const origError = sandbox.console.error;
                const origWarn = sandbox.console.warn;

                (sandbox.console as unknown as Record<string, unknown>).log = (...args: unknown[]) => {
                  capturedLogs.push(
                    args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
                  );
                  origLog.apply(sandbox.console, args as unknown[]);
                };
                (sandbox.console as unknown as Record<string, unknown>).error = (...args: unknown[]) => {
                  capturedLogs.push(
                    `ERROR: ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
                  );
                  origError.apply(sandbox.console, args as unknown[]);
                };
                (sandbox.console as unknown as Record<string, unknown>).warn = (...args: unknown[]) => {
                  capturedLogs.push(
                    `WARN: ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
                  );
                  origWarn.apply(sandbox.console, args as unknown[]);
                };

                try {
                  const result = sandbox.eval(code);
                  if (result !== undefined) {
                    capturedLogs.push(`=> ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`);
                  }
                } catch (e) {
                  capturedLogs.push(`Error: ${(e as Error).message}`);
                }

                output.innerHTML =
                  capturedLogs.length > 0
                    ? `<pre class="preview-js-log">${capturedLogs.map((l) => this.highlighter.escapeHtml(l)).join('\n')}</pre>`
                    : '<div class="preview-js-empty">No output</div>';
              }

              document.body.removeChild(iframe);
            } catch (e) {
              output.innerHTML = `<div class="preview-js-error">${this.highlighter.escapeHtml((e as Error).message)}</div>`;
            }
          }, 100);
        },
      },
    ]);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(output);
    target.appendChild(wrapper);
  }

  renderDiffPreview(oldCode: string, newCode: string, container?: HTMLElement): void {
    const target = container || this.previewContainer;
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-diff';

    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    const segments = this.computeDiff(oldLines, newLines);

    const diffHtml = segments
      .map((seg) => {
        const prefix =
          seg.type === 'added' ? '+' : seg.type === 'removed' ? '-' : ' ';
        const className =
          seg.type === 'added'
            ? 'diff-added'
            : seg.type === 'removed'
              ? 'diff-removed'
              : 'diff-unchanged';
        return `<div class="diff-line ${className}">` +
          `<span class="diff-prefix">${prefix}</span>` +
          `<span class="diff-content">${this.highlighter.escapeHtml(seg.line)}</span>` +
          `</div>`;
      })
      .join('');

    const addedCount = segments.filter((s) => s.type === 'added').length;
    const removedCount = segments.filter((s) => s.type === 'removed').length;

    const stats = document.createElement('div');
    stats.className = 'diff-stats';
    stats.innerHTML = `<span class="diff-stat-added">+${addedCount}</span> <span class="diff-stat-removed">-${removedCount}</span>`;

    const content = document.createElement('div');
    content.className = 'preview-diff-content';
    content.innerHTML = `<pre class="diff-pre">${diffHtml}</pre>`;

    const toolbar = this.createToolbar('Diff Preview');
    wrapper.appendChild(toolbar);
    wrapper.appendChild(stats);
    wrapper.appendChild(content);
    target.appendChild(wrapper);
  }

  updatePreview(code: string, language: SupportedLanguage): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.previewContainer) {
        this.renderPreview(code, language, this.previewContainer);
      }
    }, this.config.debounceMs);
  }

  async exportPreview(format: PreviewFormat): Promise<Blob | null> {
    if (!this.config.enableExport) {
      console.warn('Export is disabled in preview config');
      return null;
    }

    if (!this.currentIframe?.contentDocument) {
      console.warn('No preview available for export');
      return null;
    }

    try {
      if (format === 'png') {
        return this.exportAsPNG();
      }
      if (format === 'pdf') {
        return this.exportAsPDF();
      }
      if (format === 'html') {
        return this.exportAsHTML();
      }
    } catch (error) {
      console.error('Export failed:', error);
      return null;
    }
    return null;
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.currentIframe?.src) {
      URL.revokeObjectURL(this.currentIframe.src);
    }
  }

  private computeDiff(oldLines: string[], newLines: string[]): DiffSegment[] {
    const segments: DiffSegment[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    let oi = 0;
    let ni = 0;

    while (oi < oldLines.length || ni < newLines.length) {
      if (oi < oldLines.length && ni < newLines.length) {
        if (oldLines[oi] === newLines[ni]) {
          segments.push({
            type: 'unchanged',
            line: oldLines[oi],
            lineNumber: ni + 1,
          });
          oi++;
          ni++;
        } else {
          segments.push({ type: 'removed', line: oldLines[oi] });
          segments.push({ type: 'added', line: newLines[ni], lineNumber: ni + 1 });
          oi++;
          ni++;
        }
      } else if (oi < oldLines.length) {
        segments.push({ type: 'removed', line: oldLines[oi] });
        oi++;
      } else {
        segments.push({ type: 'added', line: newLines[ni], lineNumber: ni + 1 });
        ni++;
      }
    }

    return segments;
  }

  private parseMarkdown(text: string): string {
    let result = this.highlighter.escapeHtml(text);

    result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
    result = result.replace(/`([^`]+)`/g, '<code class="hljs-inline">$1</code>');

    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');

    result = result.replace(/^- (.+)$/gm, '<li>$1</li>');
    result = result.replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>');

    result = result.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    result = result.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const highlighted = this.highlighter.highlight(code.trim(), (lang as SupportedLanguage) || 'text');
      return `<pre class="hljs-pre"><code>${highlighted}</code></pre>`;
    });

    result = result.replace(/^(?!<[hluobo])/gm, '<br>');

    return result;
  }

  private createToolbar(
    title: string,
    actions?: Array<{ label: string; action: () => void }>
  ): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'preview-toolbar';

    const titleEl = document.createElement('span');
    titleEl.className = 'preview-toolbar-title';
    titleEl.textContent = title;
    toolbar.appendChild(titleEl);

    if (actions && actions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'preview-toolbar-actions';

      for (const { label, action } of actions) {
        const btn = document.createElement('button');
        btn.className = 'preview-toolbar-btn';
        btn.textContent = label;
        btn.addEventListener('click', action);
        actionsContainer.appendChild(btn);
      }

      toolbar.appendChild(actionsContainer);
    }

    return toolbar;
  }

  private refreshIframe(iframe: HTMLIFrameElement, html: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);
  }

  private openInNewTab(html: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  private renderError(error: Error, container: HTMLElement): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'preview-error';
    errorDiv.innerHTML = `
      <div class="preview-error-icon">!</div>
      <div class="preview-error-title">Preview Error</div>
      <div class="preview-error-message">${this.highlighter.escapeHtml(error.message)}</div>
    `;
    container.appendChild(errorDiv);
  }

  private renderPlainTextPreview(code: string, language: SupportedLanguage, container: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper preview-plaintext';

    const highlighted = this.highlighter.highlight(code, language);
    const content = document.createElement('div');
    content.className = 'preview-plaintext-content';
    content.innerHTML = `<pre class="hljs-pre"><code>${highlighted}</code></pre>`;

    const toolbar = this.createToolbar('Code Preview');
    wrapper.appendChild(toolbar);
    wrapper.appendChild(content);
    container.appendChild(wrapper);
  }

  private async exportAsPNG(): Promise<Blob> {
    if (!this.currentIframe?.contentDocument?.body) {
      throw new Error('No preview content available');
    }

    const body = this.currentIframe.contentDocument.body;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    canvas.width = body.scrollWidth * 2;
    canvas.height = body.scrollHeight * 2;
    ctx.scale(2, 2);

    const html = `<!DOCTYPE html><html><head><style>${this.config.styles}</style></head><body>${body.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.src = url;

    return new Promise((resolve, reject) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => {
          URL.revokeObjectURL(url);
          if (b) resolve(b);
          else reject(new Error('Failed to create PNG'));
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to render preview'));
      };
    });
  }

  private async exportAsPDF(): Promise<Blob> {
    throw new Error('PDF export requires a server-side renderer. Use HTML export instead.');
  }

  private async exportAsHTML(): Promise<Blob> {
    if (!this.currentIframe?.contentDocument) {
      throw new Error('No preview content available');
    }

    const html = this.currentIframe.contentDocument.documentElement.outerHTML;
    return new Blob([html], { type: 'text/html' });
  }
}
