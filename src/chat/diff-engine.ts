import * as crypto from 'crypto';

export enum DiffLineType {
  Added = 'added',
  Removed = 'removed',
  Modified = 'modified',
  Unchanged = 'unchanged',
  Context = 'context',
}

export enum DiffFormat {
  Html = 'html',
  Text = 'text',
  Unified = 'unified',
}

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffResult {
  id: string;
  hunks: DiffHunk[];
  stats: DiffStats;
  timestamp: Date;
}

export interface DiffStats {
  totalLines: number;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  unchangedLines: number;
  addedChars: number;
  removedChars: number;
}

export interface WordDiffSegment {
  text: string;
  isChange: boolean;
}

export interface SideBySideResult {
  left: DiffLine[];
  right: DiffLine[];
  stats: DiffStats;
}

export interface Patch {
  id: string;
  originalHash: string;
  hunks: PatchHunk[];
  timestamp: Date;
}

export interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  operations: PatchOperation[];
}

export interface PatchOperation {
  type: 'add' | 'remove' | 'keep';
  content: string;
  lineCount: number;
}

export interface DiffOptions {
  contextLines?: number;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  generateHunks?: boolean;
}

const DEFAULT_CONTEXT_LINES = 3;

export class DiffEngine {
  private textEncoder = new TextEncoder();

  computeDiff(
    oldText: string,
    newText: string,
    options?: DiffOptions,
  ): DiffResult {
    const contextLines = options?.contextLines ?? DEFAULT_CONTEXT_LINES;
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const lcs = this.computeLCS(oldLines, newLines);
    const rawLines = this.buildRawDiffLines(oldLines, newLines, lcs);
    const hunks = this.buildHunks(rawLines, contextLines);
    const stats = this.computeStats(rawLines);

    return {
      id: this.generateId(),
      hunks,
      stats,
      timestamp: new Date(),
    };
  }

  computeWordDiff(oldText: string, newText: string): WordDiffSegment[][] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: WordDiffSegment[][] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] ?? '';
      const newLine = newLines[i] ?? '';
      result.push(this.wordDiffLine(oldLine, newLine));
    }

    return result;
  }

  computeCharDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: DiffLine[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] ?? '';
      const newLine = newLines[i] ?? '';

      if (oldLine === newLine) {
        result.push({
          type: DiffLineType.Unchanged,
          content: newLine,
          oldLineNum: i + 1,
          newLineNum: i + 1,
        });
      } else {
        const segments = this.charDiffSegments(oldLine, newLine);
        for (const seg of segments) {
          result.push(seg);
        }
      }
    }

    return result;
  }

  renderDiff(diff: DiffResult, format: DiffFormat): string {
    switch (format) {
      case DiffFormat.Html:
        return this.renderHtml(diff);
      case DiffFormat.Text:
        return this.renderText(diff);
      case DiffFormat.Unified:
        return this.renderUnifiedDiff(diff);
      default:
        return this.renderText(diff);
    }
  }

  renderSideBySide(oldText: string, newText: string): SideBySideResult {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const lcs = this.computeLCS(oldLines, newLines);
    const rawLines = this.buildRawDiffLines(oldLines, newLines, lcs);

    const left: DiffLine[] = [];
    const right: DiffLine[] = [];

    for (const line of rawLines) {
      switch (line.type) {
        case DiffLineType.Unchanged:
          left.push(line);
          right.push(line);
          break;
        case DiffLineType.Removed:
          left.push(line);
          right.push({
            type: DiffLineType.Context,
            content: '',
            oldLineNum: null,
            newLineNum: null,
          });
          break;
        case DiffLineType.Added:
          left.push({
            type: DiffLineType.Context,
            content: '',
            oldLineNum: null,
            newLineNum: null,
          });
          right.push(line);
          break;
        case DiffLineType.Modified:
          left.push({
            type: DiffLineType.Removed,
            content: line.content,
            oldLineNum: line.oldLineNum,
            newLineNum: null,
          });
          right.push({
            type: DiffLineType.Added,
            content: line.content,
            oldLineNum: null,
            newLineNum: line.newLineNum,
          });
          break;
      }
    }

    const stats = this.computeStats(rawLines);
    return { left, right, stats };
  }

  renderInline(oldText: string, newText: string): string {
    const diff = this.computeDiff(oldText, newText);
    return this.renderHtml(diff);
  }

  renderUnified(oldText: string, newText: string): string {
    const diff = this.computeDiff(oldText, newText);
    return this.renderUnifiedFromResult(diff, oldText, newText);
  }

  applyPatch(original: string, patch: Patch): string {
    const originalHash = this.hashText(original);
    if (originalHash !== patch.originalHash) {
      throw new Error('Patch does not match original text');
    }

    const lines = original.split('\n');
    let result = [...lines];

    for (const hunk of patch.hunks.slice().reverse()) {
      result = this.applyHunk(result, hunk);
    }

    return result.join('\n');
  }

  revertToOriginal(original: string, diff: DiffResult): string {
    return original;
  }

  // ─── Internal: LCS ───────────────────────────────────────────────

  private computeLCS(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0) as number[],
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp;
  }

  private buildRawDiffLines(
    oldLines: string[],
    newLines: string[],
    dp: number[][],
  ): DiffLine[] {
    const result: DiffLine[] = [];
    let i = oldLines.length;
    let j = newLines.length;
    const ops: DiffLine[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        ops.push({
          type: DiffLineType.Unchanged,
          content: oldLines[i - 1],
          oldLineNum: i,
          newLineNum: j,
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({
          type: DiffLineType.Added,
          content: newLines[j - 1],
          oldLineNum: null,
          newLineNum: j,
        });
        j--;
      } else if (i > 0) {
        ops.push({
          type: DiffLineType.Removed,
          content: oldLines[i - 1],
          oldLineNum: i,
          newLineNum: null,
        });
        i--;
      }
    }

    ops.reverse();
    return ops;
  }

  private buildHunks(lines: DiffLine[], contextLines: number): DiffHunk[] {
    const changeIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type !== DiffLineType.Unchanged) {
        changeIndices.push(i);
      }
    }

    if (changeIndices.length === 0) {
      return [];
    }

    const groups: number[][] = [];
    let currentGroup: number[] = [changeIndices[0]];

    for (let i = 1; i < changeIndices.length; i++) {
      if (changeIndices[i] - changeIndices[i - 1] <= contextLines * 2 + 1) {
        currentGroup.push(changeIndices[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [changeIndices[i]];
      }
    }
    groups.push(currentGroup);

    return groups.map((group) => {
      const start = Math.max(0, group[0] - contextLines);
      const end = Math.min(lines.length - 1, group[group.length - 1] + contextLines);
      const hunkLines = lines.slice(start, end + 1);

      const firstChanged = hunkLines.find(
        (l) => l.type !== DiffLineType.Unchanged && l.type !== DiffLineType.Context,
      );
      const oldStart = firstChanged?.oldLineNum ?? (start + 1);
      const newStart = firstChanged?.newLineNum ?? (start + 1);

      const oldCount = hunkLines.filter(
        (l) => l.type === DiffLineType.Unchanged || l.type === DiffLineType.Removed,
      ).length;
      const newCount = hunkLines.filter(
        (l) => l.type === DiffLineType.Unchanged || l.type === DiffLineType.Added,
      ).length;

      return {
        header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: hunkLines,
      };
    });
  }

  private computeStats(lines: DiffLine[]): DiffStats {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;
    let addedChars = 0;
    let removedChars = 0;

    for (const line of lines) {
      switch (line.type) {
        case DiffLineType.Added:
          added++;
          addedChars += line.content.length;
          break;
        case DiffLineType.Removed:
          removed++;
          removedChars += line.content.length;
          break;
        case DiffLineType.Modified:
          modified++;
          break;
        case DiffLineType.Unchanged:
          unchanged++;
          break;
      }
    }

    return {
      totalLines: lines.length,
      addedLines: added,
      removedLines: removed,
      modifiedLines: modified,
      unchangedLines: unchanged,
      addedChars,
      removedChars,
    };
  }

  // ─── Internal: Rendering ─────────────────────────────────────────

  private renderHtml(diff: DiffResult): string {
    const lines: string[] = [];
    lines.push('<div class="diff-container">');
    lines.push(this.renderStatsHtml(diff.stats));

    for (const hunk of diff.hunks) {
      lines.push(`<div class="diff-hunk">`);
      lines.push(`<div class="diff-hunk-header">${this.escapeHtml(hunk.header)}</div>`);
      for (const line of hunk.lines) {
        const cssClass = this.getLineCssClass(line.type);
        const lineNum = this.formatLineNumbers(line);
        lines.push(
          `<div class="diff-line ${cssClass}">` +
            `<span class="line-numbers">${lineNum}</span>` +
            `<span class="line-sign">${this.getLineSign(line.type)}</span>` +
            `<span class="line-content">${this.escapeHtml(line.content)}</span>` +
          `</div>`,
        );
      }
      lines.push(`</div>`);
    }

    lines.push(`</div>`);
    return lines.join('\n');
  }

  private renderStatsHtml(stats: DiffStats): string {
    return (
      `<div class="diff-stats">` +
      `<span class="stat-total">${stats.totalLines} lines</span> ` +
      `<span class="stat-added">+${stats.addedLines}</span> ` +
      `<span class="stat-removed">-${stats.removedLines}</span> ` +
      `<span class="stat-modified">~${stats.modifiedLines}</span>` +
      `</div>`
    );
  }

  private renderText(diff: DiffResult): string {
    const lines: string[] = [];
    lines.push(`--- ${diff.stats.totalLines} lines, +${diff.stats.addedLines} -${diff.stats.removedLines} ~${diff.stats.modifiedLines}`);

    for (const hunk of diff.hunks) {
      lines.push(hunk.header);
      for (const line of hunk.lines) {
        const sign = this.getLineSign(line.type);
        const lineNum = line.oldLineNum ?? line.newLineNum ?? 0;
        lines.push(`${sign.padStart(3)} ${String(lineNum).padStart(4)} | ${line.content}`);
      }
    }

    return lines.join('\n');
  }

  private renderUnifiedDiff(diff: DiffResult): string {
    const lines: string[] = [];
    for (const hunk of diff.hunks) {
      lines.push(hunk.header);
      for (const line of hunk.lines) {
        const sign = this.getUnifiedSign(line.type);
        lines.push(`${sign}${line.content}`);
      }
    }
    return lines.join('\n');
  }

  private renderUnifiedFromResult(diff: DiffResult, _oldText: string, _newText: string): string {
    const lines: string[] = [];
    lines.push(`--- a`);
    lines.push(`+++ b`);

    for (const hunk of diff.hunks) {
      lines.push(hunk.header);
      for (const line of hunk.lines) {
        const sign = this.getUnifiedSign(line.type);
        lines.push(`${sign}${line.content}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Internal: Word / Char Diff ──────────────────────────────────

  private wordDiffLine(oldLine: string, newLine: string): WordDiffSegment[] {
    if (oldLine === newLine) {
      return [{ text: oldLine, isChange: false }];
    }

    const oldWords = this.tokenize(oldLine);
    const newWords = this.tokenize(newLine);
    const segments: WordDiffSegment[] = [];
    const lcs = this.computeWordLCS(oldWords, newWords);

    let oi = 0;
    let ni = 0;
    let li = 0;

    while (oi < oldWords.length || ni < newWords.length) {
      if (
        li < lcs.length &&
        oi < oldWords.length &&
        ni < newWords.length &&
        oldWords[oi] === lcs[li] &&
        newWords[ni] === lcs[li]
      ) {
        segments.push({ text: oldWords[oi], isChange: false });
        oi++;
        ni++;
        li++;
      } else if (oi < oldWords.length && (li >= lcs.length || oldWords[oi] !== lcs[li])) {
        segments.push({ text: oldWords[oi], isChange: true });
        oi++;
      } else if (ni < newWords.length && (li >= lcs.length || newWords[ni] !== lcs[li])) {
        segments.push({ text: newWords[ni], isChange: true });
        ni++;
      } else {
        break;
      }
    }

    return segments;
  }

  private tokenize(text: string): string[] {
    return text.split(/(\s+)/).filter((s) => s.length > 0);
  }

  private computeWordLCS(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0) as number[],
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result: string[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }

  private charDiffSegments(oldLine: string, newLine: string): DiffLine[] {
    const m = oldLine.length;
    const n = newLine.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0) as number[],
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLine[i - 1] === newLine[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const ops: { type: DiffLineType; char: string }[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLine[i - 1] === newLine[j - 1]) {
        ops.unshift({ type: DiffLineType.Unchanged, char: oldLine[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.unshift({ type: DiffLineType.Added, char: newLine[j - 1] });
        j--;
      } else if (i > 0) {
        ops.unshift({ type: DiffLineType.Removed, char: oldLine[i - 1] });
        i--;
      }
    }

    const segments: DiffLine[] = [];
    let currentContent = '';
    let currentType: DiffLineType | null = null;

    for (const op of ops) {
      if (op.type === currentType) {
        currentContent += op.char;
      } else {
        if (currentType !== null && currentContent.length > 0) {
          segments.push({
            type: currentType,
            content: currentContent,
            oldLineNum: null,
            newLineNum: null,
          });
        }
        currentType = op.type;
        currentContent = op.char;
      }
    }

    if (currentType !== null && currentContent.length > 0) {
      segments.push({
        type: currentType,
        content: currentContent,
        oldLineNum: null,
        newLineNum: null,
      });
    }

    return segments;
  }

  // ─── Internal: Patch ─────────────────────────────────────────────

  private applyHunk(lines: string[], hunk: PatchHunk): string[] {
    const result = [...lines];
    let offset = 0;

    for (const op of hunk.operations) {
      const pos = hunk.oldStart + offset;

      switch (op.type) {
        case 'keep':
          offset += op.lineCount;
          break;
        case 'remove':
          result.splice(pos, op.lineCount);
          break;
        case 'add':
          result.splice(pos, 0, ...op.content.split('\n'));
          offset += op.lineCount;
          break;
      }
    }

    return result;
  }

  // ─── Internal: Helpers ───────────────────────────────────────────

  private getLineCssClass(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Added:
        return 'diff-added';
      case DiffLineType.Removed:
        return 'diff-removed';
      case DiffLineType.Modified:
        return 'diff-modified';
      case DiffLineType.Context:
        return 'diff-context';
      default:
        return 'diff-unchanged';
    }
  }

  private getLineSign(type: DiffLineType): string {
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

  private formatLineNumbers(line: DiffLine): string {
    const oldNum = line.oldLineNum !== null ? String(line.oldLineNum).padStart(4) : '    ';
    const newNum = line.newLineNum !== null ? String(line.newLineNum).padStart(4) : '    ';
    return `${oldNum} ${newNum}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  createPatch(original: string, modified: string): Patch {
    const diff = this.computeDiff(original, modified);
    const hunks: PatchHunk[] = diff.hunks.map((h) => ({
      oldStart: h.oldStart,
      oldCount: h.oldCount,
      newStart: h.newStart,
      newCount: h.newCount,
      operations: this.hunkToOperations(h),
    }));

    return {
      id: this.generateId(),
      originalHash: this.hashText(original),
      hunks,
      timestamp: new Date(),
    };
  }

  private hunkToOperations(hunk: DiffHunk): PatchOperation[] {
    const ops: PatchOperation[] = [];
    let keepCount = 0;
    let removeCount = 0;
    let addCount = 0;
    let keepContent: string[] = [];
    let removeContent: string[] = [];
    let addContent: string[] = [];

    const flush = () => {
      if (keepCount > 0) {
        ops.push({ type: 'keep', content: keepContent.join('\n'), lineCount: keepCount });
        keepCount = 0;
        keepContent = [];
      }
      if (removeCount > 0) {
        ops.push({ type: 'remove', content: removeContent.join('\n'), lineCount: removeCount });
        removeCount = 0;
        removeContent = [];
      }
      if (addCount > 0) {
        ops.push({ type: 'add', content: addContent.join('\n'), lineCount: addCount });
        addCount = 0;
        addContent = [];
      }
    };

    for (const line of hunk.lines) {
      switch (line.type) {
        case DiffLineType.Unchanged:
          flush();
          keepCount++;
          keepContent.push(line.content);
          break;
        case DiffLineType.Removed:
          flush();
          removeCount++;
          removeContent.push(line.content);
          break;
        case DiffLineType.Added:
          flush();
          addCount++;
          addContent.push(line.content);
          break;
      }
    }

    flush();
    return ops;
  }

  getStats(diff: DiffResult): DiffStats {
    return diff.stats;
  }
}
