import type { ChatMessage, ChatSession } from '../chat-types.js';
import { ChatWindow, ChatWindowConfig } from './chat-window.js';
import { DiffEngine, DiffResult, DiffFormat } from '../diff-engine.js';
import { CheckpointSystem, Checkpoint } from '../checkpoint-system.js';
import { VersionHistory, MessageVersion } from '../version-history.js';
import { SecretMasking, SecretDetection } from '../secret-masking.js';
import { BookmarkSystem, Bookmark } from './bookmark-system.js';
import { PinSystem, PinnedMessage } from './pin-system.js';
import { ThreadView, Thread } from './thread-view.js';
import { LivePreview } from './live-preview.js';
import { CodeHighlighter, SupportedLanguage } from './code-highlighter.js';

export interface EnhancedChatWindowConfig extends ChatWindowConfig {
  onShowDiff?: (messageId: string) => void;
  onShowPreview?: (code: string, language: string) => void;
  onShowThread?: (messageId: string) => void;
  onShowCheckpoints?: () => void;
  onShowSummary?: () => void;
  onRevert?: (messageId: string) => void;
  onToggleSecretMasking?: () => void;
  onExecuteCode?: (messageId: string) => void;
}

export class EnhancedChatWindow extends ChatWindow {
  private enhancedConfig: EnhancedChatWindowConfig;
  private diffEngine: DiffEngine;
  private checkpointSystem: CheckpointSystem;
  private versionHistory: VersionHistory;
  private secretMasking: SecretMasking;
  private bookmarkSystem: BookmarkSystem;
  private pinSystem: PinSystem;
  private threadView: ThreadView;
  private livePreview: LivePreview;
  private highlighter: CodeHighlighter;

  private diffPanel: HTMLElement | null = null;
  private previewPanel: HTMLElement | null = null;
  private threadSidebar: HTMLElement | null = null;
  private pinnedBar: HTMLElement | null = null;
  private bookmarkPanel: HTMLElement | null = null;
  private secretWarnings: HTMLElement | null = null;
  private summaryPanel: HTMLElement | null = null;
  private checkpointTimeline: HTMLElement | null = null;

  private secretMaskingEnabled = true;

  constructor(container: HTMLElement, config: EnhancedChatWindowConfig) {
    super(container, config);
    this.enhancedConfig = config;
    this.diffEngine = new DiffEngine();
    this.checkpointSystem = new CheckpointSystem();
    this.versionHistory = new VersionHistory(this.diffEngine);
    this.secretMasking = new SecretMasking();
    this.bookmarkSystem = new BookmarkSystem();
    this.pinSystem = new PinSystem();
    this.threadView = new ThreadView();
    this.livePreview = new LivePreview();
    this.highlighter = new CodeHighlighter();

    this.setupKeyboardShortcuts();
  }

  // ─── Rendering ────────────────────────────────────────────────────

  render(sessions: ChatSession[] = []): void {
    super.render(sessions);
    this.addEnhancedPanels();
  }

  private addEnhancedPanels(): void {
    const root = this.rootEl;
    if (!root) return;

    const mainEl = root.querySelector('.chat-main') as HTMLElement;
    if (!mainEl) return;

    const panelsContainer = document.createElement('div');
    panelsContainer.className = 'enhanced-panels';
    panelsContainer.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    const chatArea = document.createElement('div');
    chatArea.className = 'enhanced-chat-area';
    chatArea.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

    while (mainEl.firstChild) {
      chatArea.appendChild(mainEl.firstChild);
    }

    const sidePanels = document.createElement('div');
    sidePanels.className = 'enhanced-side-panels';
    sidePanels.style.cssText = 'width:350px;border-left:1px solid var(--chat-border);overflow-y:auto;display:none;';

    panelsContainer.appendChild(chatArea);
    panelsContainer.appendChild(sidePanels);
    mainEl.appendChild(panelsContainer);

    this.pinnedBar = this.createPinnedBar();
    const headerEl = chatArea.querySelector('.chat-main-header');
    if (headerEl && this.pinnedBar) {
      headerEl.after(this.pinnedBar);
    }

    this.secretWarnings = document.createElement('div');
    this.secretWarnings.className = 'secret-warnings';
    this.secretWarnings.style.cssText = 'display:none;padding:8px 16px;background:rgba(239,68,68,0.1);border-bottom:1px solid rgba(239,68,68,0.3);';
    const inputArea = chatArea.querySelector('.chat-input-area');
    if (inputArea) {
      inputArea.before(this.secretWarnings);
    }
  }

  // ─── Diff Panel ───────────────────────────────────────────────────

  showDiff(messageId: string): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'diff-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = '<h3 style="margin:0;font-size:14px;">Diff View</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const versions = this.versionHistory.getVersions(messageId);
    if (versions.length < 2) {
      panel.innerHTML += '<div style="color:var(--chat-text-muted);font-size:13px;">No diff available</div>';
    } else {
      const diff = this.diffEngine.computeDiff(
        versions[versions.length - 2].content,
        versions[versions.length - 1].content,
      );
      const diffHtml = this.diffEngine.renderDiff(diff, DiffFormat.Html);
      const content = document.createElement('div');
      content.innerHTML = diffHtml;
      panel.appendChild(content);
    }

    this.diffPanel = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Preview Panel ────────────────────────────────────────────────

  showPreview(code: string, language: string): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'preview-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = `<h3 style="margin:0;font-size:14px;">Preview: ${language}</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-content';
    this.livePreview.renderPreview(code, language as SupportedLanguage, previewContainer);
    panel.appendChild(previewContainer);

    this.previewPanel = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Thread View ──────────────────────────────────────────────────

  showThread(messageId: string): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'thread-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = '<h3 style="margin:0;font-size:14px;">Thread</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    this.threadSidebar = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Checkpoint Timeline ──────────────────────────────────────────

  showCheckpoints(): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'checkpoint-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = '<h3 style="margin:0;font-size:14px;">Checkpoints</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--chat-text-muted);font-size:13px;text-align:center;padding:24px;';
    empty.textContent = 'No checkpoints yet';
    panel.appendChild(empty);

    this.checkpointTimeline = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Summary Panel ────────────────────────────────────────────────

  showSummary(): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'summary-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = '<h3 style="margin:0;font-size:14px;">Session Summary</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    this.summaryPanel = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Bookmarks Panel ──────────────────────────────────────────────

  showBookmarks(): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    sidePanels.style.display = '';
    sidePanels.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'bookmark-panel';
    panel.style.cssText = 'padding:16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = '<h3 style="margin:0;font-size:14px;">Bookmarks</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      sidePanels.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    this.bookmarkPanel = panel;
    sidePanels.appendChild(panel);
  }

  // ─── Code Execution ───────────────────────────────────────────────

  executeCode(messageId: string): void {
    this.enhancedConfig.onExecuteCode?.(messageId);
  }

  // ─── Secret Masking Toggle ────────────────────────────────────────

  toggleSecretMasking(): void {
    this.secretMaskingEnabled = !this.secretMaskingEnabled;
    this.enhancedConfig.onToggleSecretMasking?.();

    if (this.secretWarnings) {
      this.secretWarnings.style.display = this.secretMaskingEnabled ? '' : 'none';
    }
  }

  showSecretWarnings(secrets: SecretDetection[]): void {
    if (!this.secretWarnings) return;

    if (secrets.length === 0) {
      this.secretWarnings.style.display = 'none';
      return;
    }

    this.secretWarnings.style.display = '';
    this.secretWarnings.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#ef4444;">
        <span style="font-weight:600;">Secrets Detected:</span>
        <span>${secrets.length} potential secret(s) found and masked</span>
      </div>
    `;
  }

  // ─── Pinned Bar ───────────────────────────────────────────────────

  private createPinnedBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'pinned-messages-bar';
    bar.style.cssText = 'display:none;padding:6px 16px;background:rgba(245,158,11,0.08);border-bottom:1px solid rgba(245,158,11,0.2);font-size:13px;';
    bar.innerHTML = '<span style="color:var(--chat-text-muted);">No pinned messages</span>';
    return bar;
  }

  updatePinnedBar(pins: PinnedMessage[]): void {
    if (!this.pinnedBar) return;

    if (pins.length === 0) {
      this.pinnedBar.style.display = 'none';
      return;
    }

    this.pinnedBar.style.display = '';
    this.pinnedBar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:500;">Pinned:</span>
        <span>${pins.length} message(s)</span>
      </div>
    `;
  }

  // ─── Add Message with Secret Detection ────────────────────────────

  addMessage(message: ChatMessage): void {
    super.addMessage(message);

    if (this.secretMaskingEnabled) {
      const secrets = this.secretMasking.detectSecrets(message.content);
      if (secrets.length > 0) {
        this.showSecretWarnings(secrets);
      }
    }
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────────────

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const selectedMsg = this.getSelectedMessageId();
        if (selectedMsg) this.showDiff(selectedMsg);
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.togglePreviewPanel();
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        this.showBookmarks();
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        const selectedMsg = this.getSelectedMessageId();
        if (selectedMsg) this.showThread(selectedMsg);
      }

      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.handleUndo();
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        this.handleRedo();
      }
    });
  }

  private getSelectedMessageId(): string | null {
    const selected = this.messagesEl?.querySelector('[data-message-id]');
    return selected?.getAttribute('data-message-id') ?? null;
  }

  private togglePreviewPanel(): void {
    const sidePanels = this.rootEl?.querySelector('.enhanced-side-panels') as HTMLElement;
    if (!sidePanels) return;

    if (sidePanels.style.display === 'none' || !sidePanels.style.display) {
      this.showPreview('', 'text');
    } else {
      sidePanels.style.display = 'none';
    }
  }

  private handleUndo(): void {
    this.enhancedConfig.onRevert?.('');
  }

  private handleRedo(): void {
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  destroy(): void {
    this.diffEngine = undefined as any;
    this.checkpointSystem.destroy();
    this.versionHistory.destroy();
    this.bookmarkSystem = undefined as any;
    this.pinSystem = undefined as any;
    this.livePreview.destroy();
    this.highlighter = undefined as any;
    super.destroy();
  }
}
