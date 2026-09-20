import { DiffEngine, DiffResult, DiffLine, DiffLineType, DiffFormat } from './diff-engine';

export interface FileDiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  contextLines?: number;
  showLineNumbers?: boolean;
  foldUnchanged?: boolean;
  syntaxHighlight?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  language?: string;
}

export interface FileVersion {
  versionId: string;
  filePath: string;
  content: string;
  timestamp: Date;
  author?: string;
}

export interface FileDiffResult {
  file1: FileContent;
  file2: FileContent;
  diff: DiffResult;
  options: FileDiffOptions;
}

export interface FileTreeChange {
  filePath: string;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
  additions: number;
  deletions: number;
  language?: string;
}

export interface FileTree {
  changes: FileTreeChange[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

export interface DiffStatsDisplay {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  filesChanged: FileTreeChange[];
}

export interface SyntaxToken {
  text: string;
  type: string;
}

const DEFAULT_OPTIONS: FileDiffOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
  contextLines: 3,
  showLineNumbers: true,
  foldUnchanged: false,
  syntaxHighlight: false,
};

export class FileDiffViewer {
  private diffEngine: DiffEngine;

  constructor(diffEngine?: DiffEngine) {
    this.diffEngine = diffEngine ?? new DiffEngine();
  }

  compareFiles(file1: FileContent, file2: FileContent, options?: FileDiffOptions): FileDiffResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    let oldText = file1.content;
    let newText = file2.content;

    if (opts.ignoreWhitespace) {
      oldText = oldText.replace(/\s+/g, ' ').trim();
      newText = newText.replace(/\s+/g, ' ').trim();
    }

    if (opts.ignoreCase) {
      oldText = oldText.toLowerCase();
      newText = newText.toLowerCase();
    }

    const diff = this.diffEngine.computeDiff(oldText, newText, {
      contextLines: opts.contextLines,
    });

    return { file1, file2, diff, options: opts };
  }

  compareVersions(
    filePath: string,
    version1: FileVersion,
    version2: FileVersion,
    options?: FileDiffOptions,
  ): FileDiffResult {
    const file1: FileContent = {
      path: filePath,
      content: version1.content,
    };
    const file2: FileContent = {
      path: filePath,
      content: version2.content,
    };

    return this.compareFiles(file1, file2, options);
  }

  renderFileDiff(result: FileDiffResult, format?: DiffFormat): string {
    const fmt = format ?? DiffFormat.Html;

    switch (fmt) {
      case DiffFormat.Html:
        return this.renderHtmlDiff(result);
      case DiffFormat.Text:
        return this.renderTextDiff(result);
      case DiffFormat.Unified:
        return this.renderUnifiedDiff(result);
      default:
        return this.renderHtmlDiff(result);
    }
  }

  highlightChanges(diff: DiffResult, options?: FileDiffOptions): string {
    const lines: string[] = [];

    for (const hunk of diff.hunks) {
      lines.push(`<div class="diff-hunk">`);
      lines.push(`<div class="hunk-header">${this.escapeHtml(hunk.header)}</div>`);

      for (const line of hunk.lines) {
        const cssClass = this.getChangeCssClass(line.type);
        const marker = this.getChangeMarker(line.type);
        const content = options?.syntaxHighlight
          ? this.highlightSyntax(line.content, 'text')
          : this.escapeHtml(line.content);

        lines.push(
          `<div class="diff-line ${cssClass}">` +
            `<span class="marker">${marker}</span>` +
            `<span class="content">${content}</span>` +
          `</div>`,
        );
      }

      lines.push(`</div>`);
    }

    return lines.join('\n');
  }

  renderFileTree(changes: FileTreeChange[]): string {
    const tree: string[] = [];
    tree.push('<div class="file-tree">');
    tree.push('<div class="file-tree-header">Files changed:</div>');

    const sorted = [...changes].sort((a, b) => {
      const order = { added: 0, modified: 1, removed: 2, unchanged: 3 };
      return (order[a.changeType] ?? 4) - (order[b.changeType] ?? 4);
    });

    for (const change of sorted) {
      const icon = this.getFileIcon(change);
      const badge = this.getChangeBadge(change);
      tree.push(
        `<div class="file-tree-item ${change.changeType}">` +
          `<span class="file-icon">${icon}</span>` +
          `<span class="file-path">${this.escapeHtml(change.filePath)}</span>` +
          `<span class="file-badge">${badge}</span>` +
        `</div>`,
      );
    }

    tree.push('</div>');
    return tree.join('\n');
  }

  renderStats(result: FileDiffResult): string {
    const stats = result.diff.stats;
    return (
      `<div class="file-diff-stats">` +
      `<div class="stat-row">` +
        `<span class="stat-label">File 1:</span>` +
        `<span class="stat-value">${this.escapeHtml(result.file1.path)}</span>` +
      `</div>` +
      `<div class="stat-row">` +
        `<span class="stat-label">File 2:</span>` +
        `<span class="stat-value">${this.escapeHtml(result.file2.path)}</span>` +
      `</div>` +
      `<div class="stat-row">` +
        `<span class="stat-label">Total lines:</span>` +
        `<span class="stat-value">${stats.totalLines}</span>` +
      `</div>` +
      `<div class="stat-row">` +
        `<span class="stat-label">Added:</span>` +
        `<span class="stat-value stat-added">+${stats.addedLines}</span>` +
      `</div>` +
      `<div class="stat-row">` +
        `<span class="stat-label">Removed:</span>` +
        `<span class="stat-value stat-removed">-${stats.removedLines}</span>` +
      `</div>` +
      `<div class="stat-row">` +
        `<span class="stat-label">Modified:</span>` +
        `<span class="stat-value stat-modified">~${stats.modifiedLines}</span>` +
      `</div>` +
      `</div>`
    );
  }

  computeFileTree(fileResults: FileDiffResult[]): FileTree {
    const changes: FileTreeChange[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const result of fileResults) {
      const stats = result.diff.stats;
      let changeType: FileTreeChange['changeType'];

      if (stats.addedLines > 0 && stats.removedLines === 0) {
        changeType = 'added';
      } else if (stats.addedLines === 0 && stats.removedLines > 0) {
        changeType = 'removed';
      } else if (stats.addedLines > 0 || stats.removedLines > 0) {
        changeType = 'modified';
      } else {
        changeType = 'unchanged';
      }

      changes.push({
        filePath: result.file1.path,
        changeType,
        additions: stats.addedLines,
        deletions: stats.removedLines,
        language: result.file1.language,
      });

      totalAdditions += stats.addedLines;
      totalDeletions += stats.removedLines;
    }

    return {
      changes,
      totalAdditions,
      totalDeletions,
      totalFiles: fileResults.length,
    };
  }

  renderStatsDisplay(fileResults: FileDiffResult[]): string {
    const tree = this.computeFileTree(fileResults);

    return (
      `<div class="file-stats-display">` +
      `<div class="stats-summary">` +
        `<span class="total-files">${tree.totalFiles} files changed</span>` +
        `<span class="total-additions stat-added">+${tree.totalAdditions}</span>` +
        `<span class="total-deletions stat-removed">-${tree.totalDeletions}</span>` +
      `</div>` +
      this.renderFileTree(tree.changes) +
      `</div>`
    );
  }

  exportPatch(result: FileDiffResult): string {
    const lines: string[] = [];
    lines.push(`--- a/${result.file1.path}`);
    lines.push(`+++ b/${result.file2.path}`);

    for (const hunk of result.diff.hunks) {
      lines.push(hunk.header);
      for (const line of hunk.lines) {
        const sign = this.getUnifiedSign(line.type);
        lines.push(`${sign}${line.content}`);
      }
    }

    return lines.join('\n');
  }

  jumpToChange(diff: DiffResult, changeIndex: number): DiffLine | null {
    let current = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== DiffLineType.Unchanged && line.type !== DiffLineType.Context) {
          if (current === changeIndex) {
            return line;
          }
          current++;
        }
      }
    }
    return null;
  }

  copyChangedLines(diff: DiffResult): string {
    const changedLines: string[] = [];
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === DiffLineType.Added || line.type === DiffLineType.Removed) {
          changedLines.push(line.content);
        }
      }
    }
    return changedLines.join('\n');
  }

  // ─── Internal ────────────────────────────────────────────────────

  private renderHtmlDiff(result: FileDiffResult): string {
    const lines: string[] = [];
    lines.push('<div class="file-diff">');
    lines.push(this.renderStats(result));

    lines.push(this.diffEngine.renderDiff(result.diff, DiffFormat.Html));

    lines.push('</div>');
    return lines.join('\n');
  }

  private renderTextDiff(result: FileDiffResult): string {
    const lines: string[] = [];
    const stats = result.diff.stats;

    lines.push(`--- ${result.file1.path}`);
    lines.push(`+++ ${result.file2.path}`);
    lines.push(`@@ ${stats.addedLines} additions, ${stats.removedLines} deletions @@`);
    lines.push('');

    lines.push(this.diffEngine.renderDiff(result.diff, DiffFormat.Text));
    return lines.join('\n');
  }

  private renderUnifiedDiff(result: FileDiffResult): string {
    const lines: string[] = [];
    lines.push(`--- a/${result.file1.path}`);
    lines.push(`+++ b/${result.file2.path}`);

    lines.push(this.diffEngine.renderDiff(result.diff, DiffFormat.Unified));
    return lines.join('\n');
  }

  private getChangeCssClass(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added:
        return 'change-added';
      case DiffLineType.Removed:
        return 'change-removed';
      case DiffLineType.Modified:
        return 'change-modified';
      default:
        return 'change-unchanged';
    }
  }

  private getChangeMarker(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added:
        return '+';
      case DiffLineType.Removed:
        return '-';
      case DiffLineType.Modified:
        return '~';
      default:
        return ' ';
    }
  }

  private getUnifiedSign(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added:
        return '+';
      case DiffLineType.Removed:
        return '-';
      default:
        return ' ';
    }
  }

  private getFileIcon(change: FileTreeChange): string {
    switch (change.changeType) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      case 'modified':
        return '~';
      default:
        return ' ';
    }
  }

  private getChangeBadge(change: FileTreeChange): string {
    if (change.additions === 0 && change.deletions === 0) {
      return '';
    }
    const parts: string[] = [];
    if (change.additions > 0) parts.push(`+${change.additions}`);
    if (change.deletions > 0) parts.push(`-${change.deletions}`);
    return parts.join(' ');
  }

  private highlightSyntax(code: string, _language: string): string {
    let result = this.escapeHtml(code);

    const patterns: Array<[RegExp, string]> = [
      [/(\b(?:function|const|let|var|if|else|for|while|return|class|interface|type|enum|import|export|from|default|async|await|new|throw|try|catch)\b)/g, 'keyword'],
      [/(\/\/.*$)/gm, 'comment'],
      [/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, 'string'],
      [/\b(\d+(?:\.\d+)?)\b/g, 'number'],
      [/\b(true|false|null|undefined|this)\b/g, 'literal'],
    ];

    for (const [pattern, className] of patterns) {
      result = result.replace(pattern, `<span class="syntax-${className}">$1</span>`);
    }

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
