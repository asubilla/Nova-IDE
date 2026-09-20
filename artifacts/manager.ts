import type { Artifact, AgentType } from '../core/types';

export interface ArtifactRecord {
  artifact: Artifact;
  version: number;
  producingAgentId: string;
  producingAgentType: AgentType;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  sizeBytes: number;
  tags: string[];
  dependencies: string[];
}

export interface ArtifactVersion {
  version: number;
  artifact: Artifact;
  timestamp: Date;
  producingAgentId: string;
}

export interface CleanupPolicy {
  maxAgeMs?: number;
  maxSizeBytes?: number;
  maxVersions?: number;
  retainLastN?: number;
}

export interface SerializedArtifactStore {
  version: number;
  artifacts: SerializedArtifact[];
  timestamp: Date;
}

export interface SerializedArtifact {
  key: string;
  record: ArtifactRecord;
  versions: ArtifactVersion[];
}

export class ArtifactManager {
  private artifacts: Map<string, ArtifactRecord> = new Map();
  private versions: Map<string, ArtifactVersion[]> = new Map();
  private agentIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private cleanupPolicies: CleanupPolicy = {};
  private sizeTracker = 0;

  constructor(cleanupPolicy?: CleanupPolicy) {
    if (cleanupPolicy) {
      this.cleanupPolicies = cleanupPolicy;
    }
  }

  private makeKey(name: string, type: string): string {
    return `${type}::${name}`;
  }

  store(
    artifact: Artifact,
    producingAgentId: string,
    producingAgentType: AgentType,
    options?: { tags?: string[]; dependencies?: string[]; ttlMs?: number }
  ): ArtifactRecord {
    const key = this.makeKey(artifact.name, artifact.type);
    const existing = this.artifacts.get(key);
    const sizeBytes = this.estimateSize(artifact);

    if (existing) {
      const version = existing.version + 1;
      const record: ArtifactRecord = {
        artifact,
        version,
        producingAgentId,
        producingAgentType,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
        expiresAt: options?.ttlMs ? new Date(Date.now() + options.ttlMs) : existing.expiresAt,
        sizeBytes,
        tags: options?.tags || existing.tags,
        dependencies: options?.dependencies || existing.dependencies,
      };
      this.artifacts.set(key, record);

      const vers = this.versions.get(key) || [];
      vers.push({
        version,
        artifact,
        timestamp: new Date(),
        producingAgentId,
      });
      this.versions.set(key, vers);

      this.sizeTracker += sizeBytes - existing.sizeBytes;
      this.updateIndex(key, producingAgentId, artifact.type);
      return record;
    }

    const record: ArtifactRecord = {
      artifact,
      version: 1,
      producingAgentId,
      producingAgentType,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: options?.ttlMs ? new Date(Date.now() + options.ttlMs) : undefined,
      sizeBytes,
      tags: options?.tags || [],
      dependencies: options?.dependencies || [],
    };

    this.artifacts.set(key, record);
    this.versions.set(key, [
      {
        version: 1,
        artifact,
        timestamp: new Date(),
        producingAgentId,
      },
    ]);
    this.sizeTracker += sizeBytes;
    this.updateIndex(key, producingAgentId, artifact.type);

    if (options?.dependencies) {
      for (const dep of options.dependencies) {
        if (!this.dependencyGraph.has(dep)) {
          this.dependencyGraph.set(dep, new Set());
        }
        this.dependencyGraph.get(dep)!.add(key);
      }
    }

    return record;
  }

  private updateIndex(key: string, agentId: string, type: string): void {
    if (!this.agentIndex.has(agentId)) {
      this.agentIndex.set(agentId, new Set());
    }
    this.agentIndex.get(agentId)!.add(key);

    if (!this.typeIndex.has(type)) {
      this.typeIndex.set(type, new Set());
    }
    this.typeIndex.get(type)!.add(key);
  }

  retrieve(name: string, type: string): ArtifactRecord | undefined {
    return this.artifacts.get(this.makeKey(name, type));
  }

  retrieveLatest(name: string, type: string): Artifact | undefined {
    const record = this.retrieve(name, type);
    return record?.artifact;
  }

  retrieveVersions(name: string, type: string): ArtifactVersion[] {
    return this.versions.get(this.makeKey(name, type)) || [];
  }

  retrieveByVersion(name: string, type: string, version: number): Artifact | undefined {
    const vers = this.retrieveVersions(name, type);
    const found = vers.find(v => v.version === version);
    return found?.artifact;
  }

  getByAgent(agentId: string): ArtifactRecord[] {
    const keys = this.agentIndex.get(agentId);
    if (!keys) return [];
    const records: ArtifactRecord[] = [];
    for (const key of keys) {
      const record = this.artifacts.get(key);
      if (record) records.push(record);
    }
    return records;
  }

  getByType(type: string): ArtifactRecord[] {
    const keys = this.typeIndex.get(type);
    if (!keys) return [];
    const records: ArtifactRecord[] = [];
    for (const key of keys) {
      const record = this.artifacts.get(key);
      if (record) records.push(record);
    }
    return records;
  }

  getDependents(name: string, type: string): string[] {
    const key = this.makeKey(name, type);
    const deps = this.dependencyGraph.get(key);
    return deps ? [...deps] : [];
  }

  getDependencies(name: string, type: string): ArtifactRecord[] {
    const record = this.retrieve(name, type);
    if (!record) return [];
    return record.dependencies
      .map(dep => this.artifacts.get(dep))
      .filter((r): r is ArtifactRecord => r !== undefined);
  }

  list(): ArtifactRecord[] {
    return [...this.artifacts.values()];
  }

  delete(name: string, type: string): boolean {
    const key = this.makeKey(name, type);
    const record = this.artifacts.get(key);
    if (!record) return false;

    this.artifacts.delete(key);
    this.versions.delete(key);
    this.agentIndex.get(record.producingAgentId)?.delete(key);
    this.typeIndex.get(type)?.delete(key);
    this.dependencyGraph.delete(key);
    for (const deps of this.dependencyGraph.values()) {
      deps.delete(key);
    }
    this.sizeTracker -= record.sizeBytes;
    return true;
  }

  cleanup(): number {
    let removed = 0;
    const now = new Date();

    for (const [key, record] of this.artifacts) {
      if (this.cleanupPolicies.maxAgeMs && record.expiresAt && record.expiresAt < now) {
        this.deleteByName(key);
        removed++;
        continue;
      }

      if (this.cleanupPolicies.maxSizeBytes && this.sizeTracker > this.cleanupPolicies.maxSizeBytes) {
        this.deleteByName(key);
        removed++;
      }
    }

    if (this.cleanupPolicies.maxVersions) {
      for (const [key, vers] of this.versions) {
        if (vers.length > this.cleanupPolicies.maxVersions) {
          const excess = vers.splice(0, vers.length - this.cleanupPolicies.maxVersions);
          removed += excess.length;
        }
      }
    }

    if (this.cleanupPolicies.retainLastN) {
      const byAgent = new Map<string, { key: string; record: ArtifactRecord }[]>();
      for (const [key, record] of this.artifacts) {
        const agentKey = record.producingAgentId;
        if (!byAgent.has(agentKey)) byAgent.set(agentKey, []);
        byAgent.get(agentKey)!.push({ key, record });
      }
      for (const [, items] of byAgent) {
        items.sort((a, b) => b.record.createdAt.getTime() - a.record.createdAt.getTime());
        while (items.length > this.cleanupPolicies.retainLastN) {
          const removed_item = items.pop()!;
          this.deleteByName(removed_item.key);
          removed++;
        }
      }
    }

    return removed;
  }

  private deleteByName(key: string): void {
    const record = this.artifacts.get(key);
    if (!record) return;

    this.artifacts.delete(key);
    this.versions.delete(key);
    this.agentIndex.get(record.producingAgentId)?.delete(key);
    this.typeIndex.get(record.artifact.type)?.delete(key);
    this.dependencyGraph.delete(key);
    for (const deps of this.dependencyGraph.values()) {
      deps.delete(key);
    }
    this.sizeTracker -= record.sizeBytes;
  }

  private estimateSize(artifact: Artifact): number {
    try {
      return JSON.stringify(artifact.data).length * 2;
    } catch {
      return 256;
    }
  }

  serialize(): SerializedArtifactStore {
    const serialized: SerializedArtifact[] = [];
    for (const [key, record] of this.artifacts) {
      serialized.push({
        key,
        record,
        versions: this.versions.get(key) || [],
      });
    }
    return {
      version: 1,
      artifacts: serialized,
      timestamp: new Date(),
    };
  }

  deserialize(store: SerializedArtifactStore): void {
    this.artifacts.clear();
    this.versions.clear();
    this.agentIndex.clear();
    this.typeIndex.clear();
    this.dependencyGraph.clear();
    this.sizeTracker = 0;

    for (const item of store.artifacts) {
      this.artifacts.set(item.key, item.record);
      this.versions.set(item.key, item.versions);
      this.sizeTracker += item.record.sizeBytes;
      this.updateIndex(item.key, item.record.producingAgentId, item.record.artifact.type);
    }
  }

  getSizeBytes(): number {
    return this.sizeTracker;
  }

  getCount(): number {
    return this.artifacts.size;
  }

  clear(): void {
    this.artifacts.clear();
    this.versions.clear();
    this.agentIndex.clear();
    this.typeIndex.clear();
    this.dependencyGraph.clear();
    this.sizeTracker = 0;
  }

  setCleanupPolicy(policy: CleanupPolicy): void {
    this.cleanupPolicies = { ...this.cleanupPolicies, ...policy };
  }

  shareBetweenAgents(
    name: string,
    type: string,
    targetAgentId: string
  ): ArtifactRecord | undefined {
    const record = this.retrieve(name, type);
    if (!record) return undefined;

    if (!this.agentIndex.has(targetAgentId)) {
      this.agentIndex.set(targetAgentId, new Set());
    }
    this.agentIndex.get(targetAgentId)!.add(this.makeKey(name, type));
    return record;
  }
}
