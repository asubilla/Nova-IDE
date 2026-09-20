export type ChangeType = 'create' | 'modify' | 'delete' | 'rename';

export type ExportFormat = 'patch' | 'diff' | 'json';

export interface FileChange {
  path: string;
  type: ChangeType;
  timestamp: Date;
  oldContent?: string;
  newContent?: string;
  addedLines: number;
  removedLines: number;
  diff: string;
  renamedFrom?: string;
}

export interface ChangeStats {
  totalChanges: number;
  creates: number;
  modifies: number;
  deletes: number;
  renames: number;
  totalAdded: number;
  totalRemoved: number;
  files: string[];
}

export class FileChangeTracker {
  private changes: FileChange[] = [];
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  trackCreate(path: string, content: string): void {
    const addedLines = content.split('\n').length;
    this.changes.push({
      path,
      type: 'create',
      timestamp: new Date(),
      newContent: content,
      addedLines,
      removedLines: 0,
      diff: this.makeCreateDiff(path, content),
    });
  }

  trackModify(path: string, oldContent: string, newContent: string): void {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const added = newLines.filter((l) => !oldLines.includes(l)).length;
    const removed = oldLines.filter((l) => !newLines.includes(l)).length;

    this.changes.push({
      path,
      type: 'modify',
      timestamp: new Date(),
      oldContent,
      newContent,
      addedLines: added,
      removedLines: removed,
      diff: this.makeModifyDiff(path, oldContent, newContent),
    });
  }

  trackDelete(path: string): void {
    this.changes.push({
      path,
      type: 'delete',
      timestamp: new Date(),
      addedLines: 0,
      removedLines: 0,
      diff: `--- a/${path}\n+++ /dev/null\n`,
    });
  }

  trackRename(oldPath: string, newPath: string): void {
    this.changes.push({
      path: newPath,
      type: 'rename',
      timestamp: new Date(),
      renamedFrom: oldPath,
      addedLines: 0,
      removedLines: 0,
      diff: `rename from ${oldPath}\nrename to ${newPath}`,
    });
  }

  getChanges(): FileChange[] {
    return [...this.changes];
  }

  getChangesByFile(path: string): FileChange[] {
    return this.changes.filter(
      (c) => c.path === path || c.renamedFrom === path
    );
  }

  getChangesByType(type: ChangeType): FileChange[] {
    return this.changes.filter((c) => c.type === type);
  }

  getChangeCount(): number {
    return this.changes.length;
  }

  getAddedLines(): number {
    return this.changes.reduce((sum, c) => sum + c.addedLines, 0);
  }

  getRemovedLines(): number {
    return this.changes.reduce((sum, c) => sum + c.removedLines, 0);
  }

  getModifiedFiles(): string[] {
    return [...new Set(this.changes.map((c) => c.path))];
  }

  renderChangeSummary(): string {
    const stats = this.getStats();
    const parts: string[] = [];

    if (stats.creates > 0) parts.push(`\u2795 ${stats.creates} created`);
    if (stats.modifies > 0) parts.push(`\u270f\ufe0f ${stats.modifies} modified`);
    if (stats.deletes > 0) parts.push(`\u2796 ${stats.deletes} deleted`);
    if (stats.renames > 0) parts.push(`\u21c4 ${stats.renames} renamed`);

    const summary = parts.length > 0 ? parts.join(' \u2022 ') : 'No changes';
    return `\u{1f4cb} **Session ${this.sessionId.slice(0, 8)}** \u2014 ${summary}\n\u2b06\ufe0f +${stats.totalAdded} / \u2b07\ufe0f -${stats.totalRemoved} lines`;
  }

  renderFileTree(): string {
    const files = this.getModifiedFiles();
    if (files.length === 0) return 'No file changes.';

    const tree = this.buildTree(files);
    return this.renderTreeNodes(tree, '');
  }

  renderDiff(path: string): string {
    const changes = this.getChangesByFile(path);
    if (changes.length === 0) return `No changes found for ${path}`;
    return changes.map((c) => c.diff).join('\n\n');
  }

  exportChanges(format: ExportFormat): string {
    switch (format) {
      case 'patch':
        return this.exportAsPatch();
      case 'diff':
        return this.exportAsDiff();
      case 'json':
        return this.exportAsJson();
    }
  }

  canRevert(path: string): boolean {
    return this.changes.some(
      (c) => c.path === path && (c.type === 'modify' || c.type === 'delete')
    );
  }

  revertFile(path: string): FileChange | null {
    const matchingChanges = this.changes.filter((c: FileChange) => c.path === path);
    if (matchingChanges.length === 0) return null;
    const change = matchingChanges[matchingChanges.length - 1];
    const idx = this.changes.indexOf(change);
    if (change.type === 'modify' && change.oldContent) {
      const reverted: FileChange = {
        path,
        type: 'modify',
        timestamp: new Date(),
        oldContent: change.newContent,
        newContent: change.oldContent,
        addedLines: change.removedLines,
        removedLines: change.addedLines,
        diff: this.makeModifyDiff(path, change.newContent ?? '', change.oldContent),
      };
      this.changes.push(reverted);
      return reverted;
    }

    if (change.type === 'create') {
      const reverted: FileChange = {
        path,
        type: 'delete',
        timestamp: new Date(),
        addedLines: 0,
        removedLines: change.addedLines,
        diff: `--- a/${path}\n+++ /dev/null\n`,
      };
      this.changes.push(reverted);
      return reverted;
    }

    return null;
  }

  revertAll(): number {
    let count = 0;
    const files = this.getModifiedFiles();
    for (const file of files) {
      if (this.revertFile(file)) count++;
    }
    return count;
  }

  private getStats(): ChangeStats {
    const files = this.getModifiedFiles();
    return {
      totalChanges: this.changes.length,
      creates: this.getChangesByType('create').length,
      modifies: this.getChangesByType('modify').length,
      deletes: this.getChangesByType('delete').length,
      renames: this.getChangesByType('rename').length,
      totalAdded: this.getAddedLines(),
      totalRemoved: this.getRemovedLines(),
      files,
    };
  }

  private makeCreateDiff(path: string, content: string): string {
    const lines = content.split('\n');
    const diffLines = lines.map((l, i) => `+${l}`);
    return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${diffLines.join('\n')}`;
  }

  private makeModifyDiff(path: string, oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) {
        diffLines.push(`+${newLines[i]}`);
      } else if (i >= newLines.length) {
        diffLines.push(`-${oldLines[i]}`);
      } else if (oldLines[i] !== newLines[i]) {
        diffLines.push(`-${oldLines[i]}`);
        diffLines.push(`+${newLines[i]}`);
      }
    }

    return `--- a/${path}\n+++ b/${path}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${diffLines.join('\n')}`;
  }

  private buildTree(files: string[]): Map<string, any> {
    const root = new Map<string, any>();
    for (const file of files) {
      const parts = file.replace(/\\/g, '/').split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current.set(part, null);
        } else {
          if (!current.has(part)) current.set(part, new Map());
          current = current.get(part) as Map<string, any>;
        }
      }
    }
    return root;
  }

  private renderTreeNodes(nodes: Map<string, any>, prefix: string): string {
    const entries = [...nodes.entries()];
    const lines: string[] = [];

    entries.forEach(([name, children], i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
      const ext = isLast ? '    ' : '\u2502   ';

      const change = this.changes.find((c) => c.path.endsWith(name));
      const indicator = change ? this.typeIndicator(change.type) : '';

      lines.push(`${prefix}${connector}${name}${indicator}`);

      if (children instanceof Map) {
        lines.push(this.renderTreeNodes(children, prefix + ext));
      }
    });

    return lines.join('\n');
  }

  private typeIndicator(type: ChangeType): string {
    switch (type) {
      case 'create': return ' \u2795 new';
      case 'modify': return ' \u270f\ufe0f';
      case 'delete': return ' \u2796';
      case 'rename': return ' \u21c4';
    }
  }

  private exportAsPatch(): string {
    return this.changes.map((c) => c.diff).join('\n\n');
  }

  private exportAsDiff(): string {
    const header = `diff --git a/session-${this.sessionId.slice(0, 8)} b/session-${this.sessionId.slice(0, 8)}`;
    const diffs = this.changes.map((c) => c.diff);
    return [header, ...diffs].join('\n');
  }

  private exportAsJson(): string {
    return JSON.stringify(
      this.changes.map((c) => ({
        path: c.path,
        type: c.type,
        timestamp: c.timestamp.toISOString(),
        addedLines: c.addedLines,
        removedLines: c.removedLines,
        renamedFrom: c.renamedFrom,
      })),
      null,
      2
    );
  }
}
