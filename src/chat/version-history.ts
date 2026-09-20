import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { DiffEngine, DiffResult } from './diff-engine';

export interface MessageVersion {
  versionId: string;
  messageId: string;
  content: string;
  userId: string;
  timestamp: Date;
  changeDescription: string;
}

export interface VersionComparison {
  messageId: string;
  version1: MessageVersion;
  version2: MessageVersion;
  diff: DiffResult;
}

export interface VersionHistoryEvents {
  'version:added': (version: MessageVersion) => void;
  'version:restored': (version: MessageVersion) => void;
  'version:pruned': (messageId: string, removedCount: number) => void;
}

export class VersionHistory extends EventEmitter {
  private versions = new Map<string, MessageVersion[]>();
  private latestVersion = new Map<string, string>();

  private diffEngine: DiffEngine;

  constructor(diffEngine?: DiffEngine) {
    super();
    this.diffEngine = diffEngine ?? new DiffEngine();
  }

  addVersion(
    messageId: string,
    content: string,
    userId: string,
    changeDescription?: string,
  ): MessageVersion {
    const existing = this.versions.get(messageId) ?? [];
    const previousVersion = existing.length > 0 ? existing[existing.length - 1] : null;

    const description =
      changeDescription ?? this.generateChangeDescription(previousVersion?.content ?? null, content);

    const version: MessageVersion = {
      versionId: this.generateId(),
      messageId,
      content,
      userId,
      timestamp: new Date(),
      changeDescription: description,
    };

    existing.push(version);
    this.versions.set(messageId, existing);
    this.latestVersion.set(messageId, version.versionId);

    this.emit('version:added', version);
    return version;
  }

  getVersions(messageId: string): MessageVersion[] {
    return [...(this.versions.get(messageId) ?? [])];
  }

  getVersion(messageId: string, versionId: string): MessageVersion | undefined {
    const versions = this.versions.get(messageId) ?? [];
    return versions.find((v) => v.versionId === versionId);
  }

  restoreVersion(messageId: string, versionId: string): MessageVersion {
    const versions = this.versions.get(messageId) ?? [];
    const version = versions.find((v) => v.versionId === versionId);

    if (!version) {
      throw new Error(`Version ${versionId} not found for message ${messageId}`);
    }

    this.emit('version:restored', version);
    return version;
  }

  compareVersions(messageId: string, v1Id: string, v2Id: string): VersionComparison {
    const versions = this.versions.get(messageId) ?? [];
    const version1 = versions.find((v) => v.versionId === v1Id);
    const version2 = versions.find((v) => v.versionId === v2Id);

    if (!version1 || !version2) {
      throw new Error('Both versions must exist');
    }

    const diff = this.diffEngine.computeDiff(version1.content, version2.content);

    return {
      messageId,
      version1,
      version2,
      diff,
    };
  }

  getLatestVersion(messageId: string): MessageVersion | undefined {
    const versions = this.versions.get(messageId) ?? [];
    if (versions.length === 0) {
      return undefined;
    }
    return versions[versions.length - 1];
  }

  getLatestVersionId(messageId: string): string | undefined {
    return this.latestVersion.get(messageId);
  }

  pruneVersions(messageId: string, keepCount: number): number {
    const versions = this.versions.get(messageId) ?? [];
    if (versions.length <= keepCount) {
      return 0;
    }

    const removed = versions.splice(0, versions.length - keepCount);
    this.versions.set(messageId, versions);

    if (versions.length > 0) {
      this.latestVersion.set(messageId, versions[versions.length - 1].versionId);
    } else {
      this.latestVersion.delete(messageId);
    }

    this.emit('version:pruned', messageId, removed.length);
    return removed.length;
  }

  getMessageIds(): string[] {
    return Array.from(this.versions.keys());
  }

  getVersionCount(messageId: string): number {
    return (this.versions.get(messageId) ?? []).length;
  }

  getVersionHistorySummary(messageId: string): {
    totalVersions: number;
    firstVersion?: Date;
    lastVersion?: Date;
    contributors: string[];
  } {
    const versions = this.versions.get(messageId) ?? [];
    const contributors = Array.from(new Set(versions.map((v) => v.userId)));

    return {
      totalVersions: versions.length,
      firstVersion: versions[0]?.timestamp,
      lastVersion: versions[versions.length - 1]?.timestamp,
      contributors,
    };
  }

  exportVersions(messageId: string): MessageVersion[] {
    return this.getVersions(messageId).map((v) => ({
      ...v,
    }));
  }

  importVersions(messageId: string, versions: MessageVersion[]): number {
    const existing = this.versions.get(messageId) ?? [];
    let imported = 0;

    for (const version of versions) {
      if (!existing.some((v) => v.versionId === version.versionId)) {
        existing.push(version);
        imported++;
      }
    }

    existing.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    this.versions.set(messageId, existing);

    if (existing.length > 0) {
      this.latestVersion.set(messageId, existing[existing.length - 1].versionId);
    }

    return imported;
  }

  destroy(): void {
    this.versions.clear();
    this.latestVersion.clear();
    this.removeAllListeners();
  }

  // ─── Internal ────────────────────────────────────────────────────

  private generateChangeDescription(
    oldContent: string | null,
    newContent: string,
  ): string {
    if (oldContent === null) {
      return 'Initial version';
    }

    if (oldContent === newContent) {
      return 'No changes';
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const added = newLines.filter((l) => !oldLines.includes(l)).length;
    const removed = oldLines.filter((l) => !newLines.includes(l)).length;

    const parts: string[] = [];
    if (added > 0) parts.push(`+${added} lines`);
    if (removed > 0) parts.push(`-${removed} lines`);

    return parts.length > 0 ? parts.join(', ') : 'Content updated';
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
