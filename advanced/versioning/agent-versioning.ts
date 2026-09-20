export interface TemplateVersion {
  version: string;
  templateId: string;
  definition: any;
  changelog: string;
  author: string;
  createdAt: Date;
  checksum: string;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export class AgentVersioning {
  private versions: Map<string, TemplateVersion[]> = new Map();
  private currentVersions: Map<string, string> = new Map();

  registerTemplate(templateId: string, definition: any, author: string, changelog: string): TemplateVersion {
    const versions = this.versions.get(templateId) || [];
    const versionNumber = versions.length > 0 ? this.bumpVersion(versions[versions.length - 1].version, 'patch') : '1.0.0';
    const version: TemplateVersion = { version: versionNumber, templateId, definition, changelog, author, createdAt: new Date(), checksum: this.computeChecksum(definition) };
    versions.push(version);
    this.versions.set(templateId, versions);
    this.currentVersions.set(templateId, versionNumber);
    return version;
  }

  private bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
    const parts = version.split('.').map(Number);
    if (type === 'major') return `${parts[0] + 1}.0.0`;
    if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }

  private computeChecksum(data: any): string { const str = JSON.stringify(data); let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } return hash.toString(16); }

  getVersion(templateId: string, version: string): TemplateVersion | undefined {
    return this.versions.get(templateId)?.find(v => v.version === version);
  }

  getCurrentVersion(templateId: string): TemplateVersion | undefined {
    const current = this.currentVersions.get(templateId);
    if (!current) return undefined;
    return this.getVersion(templateId, current);
  }

  getVersionHistory(templateId: string): TemplateVersion[] { return this.versions.get(templateId) || []; }
  getCurrentVersionNumber(templateId: string): string | undefined { return this.currentVersions.get(templateId); }

  rollback(templateId: string, targetVersion: string): boolean {
    const versions = this.versions.get(templateId);
    if (!versions) return false;
    const target = versions.find(v => v.version === targetVersion);
    if (!target) return false;
    this.currentVersions.set(templateId, targetVersion);
    return true;
  }

  diffVersions(templateId: string, version1: string, version2: string): VersionDiff | null {
    const v1 = this.getVersion(templateId, version1);
    const v2 = this.getVersion(templateId, version2);
    if (!v1 || !v2) return null;
    const keys1 = new Set(Object.keys(v1.definition));
    const keys2 = new Set(Object.keys(v2.definition));
    return {
      added: [...keys2].filter(k => !keys1.has(k)),
      removed: [...keys1].filter(k => !keys2.has(k)),
      modified: [...keys1].filter(k => keys2.has(k) && JSON.stringify(v1.definition[k]) !== JSON.stringify(v2.definition[k])),
    };
  }

  getAllTemplates(): string[] { return [...this.versions.keys()]; }
  getStats(): { totalTemplates: number; totalVersions: number; avgVersionsPerTemplate: number } {
    let totalVersions = 0;
    for (const v of this.versions.values()) totalVersions += v.length;
    return { totalTemplates: this.versions.size, totalVersions, avgVersionsPerTemplate: this.versions.size ? totalVersions / this.versions.size : 0 };
  }
}
