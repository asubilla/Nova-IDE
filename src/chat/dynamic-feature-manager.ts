import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FeatureConfig {
  [key: string]: unknown;
}

export interface FeatureDefinition {
  id: string;
  name: string;
  enabled: boolean;
  config: FeatureConfig;
  version: string;
  dependencies: string[];
}

export interface FeatureStatus {
  id: string;
  name: string;
  enabled: boolean;
  version: string;
  config: FeatureConfig;
  dependencies: string[];
  missingDependencies: string[];
  ready: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
}

export interface AgentEntry {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

export interface FeaturesFile {
  version: string;
  features: Record<string, { enabled: boolean; config: FeatureConfig }>;
  providers: ProviderEntry[];
  agents: AgentEntry[];
}

export class DynamicFeatureManager extends EventEmitter {
  private features: Map<string, FeatureDefinition> = new Map();
  private configPath: string;
  private configFile: FeaturesFile | null = null;

  constructor(configDir?: string) {
    super();
    this.configPath = join(configDir ?? process.cwd(), 'src', 'chat', 'features.json');
  }

  loadFeatures(): FeaturesFile {
    if (!existsSync(this.configPath)) {
      throw new Error(`Features config not found at ${this.configPath}`);
    }

    const raw = readFileSync(this.configPath, 'utf-8');
    const file = JSON.parse(raw) as FeaturesFile;
    this.configFile = file;

    this.features.clear();

    for (const [id, entry] of Object.entries(file.features)) {
      this.features.set(id, {
        id,
        name: id,
        enabled: entry.enabled,
        config: entry.config,
        version: '1.0.0',
        dependencies: [],
      });
    }

    this.emit('features:loaded', { count: this.features.size });
    return file;
  }

  enableFeature(featureId: string): void {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const missing = this.getMissingDependencies(featureId);
    if (missing.length > 0) {
      throw new Error(`Cannot enable ${featureId}: missing dependencies [${missing.join(', ')}]`);
    }

    feature.enabled = true;
    this.features.set(featureId, feature);
    this.syncToFile();
    this.emit('feature:enabled', { featureId });
  }

  disableFeature(featureId: string): void {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const dependents = this.getDependents(featureId);
    if (dependents.length > 0) {
      throw new Error(`Cannot disable ${featureId}: depended on by [${dependents.join(', ')}]`);
    }

    feature.enabled = false;
    this.features.set(featureId, feature);
    this.syncToFile();
    this.emit('feature:disabled', { featureId });
  }

  updateFeatureConfig(featureId: string, config: FeatureConfig): void {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    feature.config = { ...feature.config, ...config };
    this.features.set(featureId, feature);
    this.syncToFile();
    this.emit('feature:config-updated', { featureId, config: feature.config });
  }

  getEnabledFeatures(): FeatureDefinition[] {
    return Array.from(this.features.values())
      .filter((f) => f.enabled)
      .map((f) => ({ ...f }));
  }

  registerFeature(feature: FeatureDefinition): void {
    if (this.features.has(feature.id)) {
      throw new Error(`Feature ${feature.id} already registered`);
    }

    this.features.set(feature.id, { ...feature });
    this.syncToFile();
    this.emit('feature:registered', { featureId: feature.id });
  }

  removeFeature(featureId: string): void {
    if (!this.features.has(featureId)) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const dependents = this.getDependents(featureId);
    if (dependents.length > 0) {
      throw new Error(`Cannot remove ${featureId}: depended on by [${dependents.join(', ')}]`);
    }

    this.features.delete(featureId);
    this.syncToFile();
    this.emit('feature:removed', { featureId });
  }

  exportConfig(): FeaturesFile {
    const features: FeaturesFile['features'] = {};
    for (const [id, f] of Array.from(this.features.entries())) {
      features[id] = { enabled: f.enabled, config: f.config };
    }

    return {
      version: this.configFile?.version ?? '1.0.0',
      features,
      providers: this.configFile?.providers ?? [],
      agents: this.configFile?.agents ?? [],
    };
  }

  importConfig(config: FeaturesFile): void {
    this.configFile = config;
    this.features.clear();

    for (const [id, entry] of Object.entries(config.features)) {
      this.features.set(id, {
        id,
        name: id,
        enabled: entry.enabled,
        config: entry.config,
        version: '1.0.0',
        dependencies: [],
      });
    }

    this.persistToFile(config);
    this.emit('config:imported', { featureCount: this.features.size });
  }

  getFeatureStatus(): FeatureStatus[] {
    return Array.from(this.features.values()).map((f) => {
      const missing = this.getMissingDependencies(f.id);
      return {
        id: f.id,
        name: f.name,
        enabled: f.enabled,
        version: f.version,
        config: f.config,
        dependencies: f.dependencies,
        missingDependencies: missing,
        ready: missing.length === 0,
      };
    });
  }

  getProviders(): ProviderEntry[] {
    return this.configFile?.providers ?? [];
  }

  getAgents(): AgentEntry[] {
    return this.configFile?.agents ?? [];
  }

  getFeature(featureId: string): FeatureDefinition | null {
    const f = this.features.get(featureId);
    return f ? { ...f } : null;
  }

  private getMissingDependencies(featureId: string): string[] {
    const feature = this.features.get(featureId);
    if (!feature) return [];

    return feature.dependencies.filter((depId) => {
      const dep = this.features.get(depId);
      return !dep || !dep.enabled;
    });
  }

  private getDependents(featureId: string): string[] {
    const dependents: string[] = [];
    for (const [id, f] of Array.from(this.features.entries())) {
      if (f.dependencies.includes(featureId) && f.enabled) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  private syncToFile(): void {
    const config = this.exportConfig();
    this.persistToFile(config);
  }

  private persistToFile(config: FeaturesFile): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch {
      this.emit('config:save-error', { error: 'Failed to write features config' });
    }
  }

  destroy(): void {
    this.features.clear();
    this.configFile = null;
    this.removeAllListeners();
  }
}
