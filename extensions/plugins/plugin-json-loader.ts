import { EventEmitter } from 'events';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface PluginJSONConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  type: 'agent-tool' | 'ui-extension' | 'code-transformer' | 'validator' | 'ai-provider' | 'data-source' | 'custom';
  hooks: string[];
  permissions: string[];
  dependencies?: string[];
  config?: Record<string, any>;
  activationEvents?: string[];
  contributes?: PluginContributes;
}

export interface PluginContributes {
  commands?: { command: string; title: string; category?: string }[];
  menus?: Record<string, { command: string; when?: string }[]>;
  keybindings?: { command: string; key: string; when?: string }[];
  languages?: { id: string; extensions: string[]; aliases?: string[] }[];
  grammars?: { language: string; scopeName: string; path: string }[];
  themes?: { label: string; uiTheme: string; path: string }[];
  configuration?: any;
}

export interface PluginInstance {
  config: PluginJSONConfig;
  module?: any;
  exports?: any;
  status: 'registered' | 'activated' | 'deactivated' | 'error';
  activatedAt?: Date;
  error?: string;
}

export class PluginJSONLoader extends EventEmitter {
  private plugins: Map<string, PluginInstance> = new Map();
  private hookIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private activationEventIndex: Map<string, Set<string>> = new Map();
  private configPaths: Set<string> = new Set();

  constructor() { super(); }

  loadFromJSON(jsonPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    try {
      const content = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      const plugins: PluginJSONConfig[] = data.plugins || (Array.isArray(data) ? data : [data]);
      for (const config of plugins) {
        if (this.registerPlugin(config)) loaded++; else errors++;
      }
      this.configPaths.add(jsonPath);
    } catch (error) {
      this.emit('config-error', { path: jsonPath, error });
      errors++;
    }
    return { loaded, errors };
  }

  loadFromDirectory(dirPath: string): { loaded: number; errors: number } {
    let loaded = 0, errors = 0;
    if (!existsSync(dirPath)) return { loaded: 0, errors: 1 };
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginJsonPath = join(dirPath, entry.name, 'plugin.json');
        if (existsSync(pluginJsonPath)) {
          const result = this.loadFromJSON(pluginJsonPath);
          loaded += result.loaded; errors += result.errors;
        }
      } else if (entry.name.endsWith('.json')) {
        const result = this.loadFromJSON(join(dirPath, entry.name));
        loaded += result.loaded; errors += result.errors;
      }
    }
    return { loaded, errors };
  }

  loadFromObject(config: PluginJSONConfig): boolean { return this.registerPlugin(config); }

  loadFromString(jsonString: string): { loaded: number; errors: number } {
    try {
      const data = JSON.parse(jsonString);
      const plugins: PluginJSONConfig[] = data.plugins || (Array.isArray(data) ? data : [data]);
      let loaded = 0, errors = 0;
      for (const config of plugins) { if (this.registerPlugin(config)) loaded++; else errors++; }
      return { loaded, errors };
    } catch { return { loaded: 0, errors: 1 }; }
  }

  private registerPlugin(config: PluginJSONConfig): boolean {
    if (!config.name || !config.version || !config.main) return false;
    if (this.plugins.has(config.name)) this.emit('plugin-overwrite', { name: config.name });

    const instance: PluginInstance = { config, status: 'registered' };
    this.plugins.set(config.name, instance);

    for (const hook of config.hooks) {
      if (!this.hookIndex.has(hook)) this.hookIndex.set(hook, new Set());
      this.hookIndex.get(hook)!.add(config.name);
    }

    if (!this.typeIndex.has(config.type)) this.typeIndex.set(config.type, new Set());
    this.typeIndex.get(config.type)!.add(config.name);

    if (config.activationEvents) {
      for (const event of config.activationEvents) {
        if (!this.activationEventIndex.has(event)) this.activationEventIndex.set(event, new Set());
        this.activationEventIndex.get(event)!.add(config.name);
      }
    }

    this.emit('plugin-registered', { name: config.name, type: config.type });
    return true;
  }

  async activatePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin || plugin.status === 'activated') return false;

    try {
      // Check dependencies
      if (plugin.config.dependencies) {
        for (const dep of plugin.config.dependencies) {
          const depPlugin = this.plugins.get(dep);
          if (!depPlugin || depPlugin.status !== 'activated') {
            throw new Error(`Dependency "${dep}" not activated`);
          }
        }
      }

      // In real implementation, this would dynamically import the module
      plugin.status = 'activated';
      plugin.activatedAt = new Date();
      this.emit('plugin-activated', { name });
      return true;
    } catch (error) {
      plugin.status = 'error';
      plugin.error = (error as Error).message;
      this.emit('plugin-error', { name, error: plugin.error });
      return false;
    }
  }

  async deactivatePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin || plugin.status !== 'activated') return false;

    try {
      if (typeof plugin.module?.deactivate === 'function') await plugin.module.deactivate();
      plugin.status = 'deactivated';
      this.emit('plugin-deactivated', { name });
      return true;
    } catch (error) {
      this.emit('plugin-error', { name, error: (error as Error).message });
      return false;
    }
  }

  async triggerActivationEvent(event: string): Promise<string[]> {
    const pluginNames = this.activationEventIndex.get(event);
    if (!pluginNames) return [];

    const activated: string[] = [];
    for (const name of pluginNames) {
      const plugin = this.plugins.get(name);
      if (plugin && plugin.status === 'registered') {
        if (await this.activatePlugin(name)) activated.push(name);
      }
    }
    return activated;
  }

  getPluginContributions(name: string): PluginContributes | undefined {
    return this.plugins.get(name)?.config.contributes;
  }

  getAllCommands(): { plugin: string; command: string; title: string; category?: string }[] {
    const commands: { plugin: string; command: string; title: string; category?: string }[] = [];
    for (const [name, plugin] of this.plugins) {
      if (plugin.config.contributes?.commands) {
        for (const cmd of plugin.config.contributes.commands) {
          commands.push({ plugin: name, ...cmd });
        }
      }
    }
    return commands;
  }

  getAllLanguages(): { plugin: string; id: string; extensions: string[] }[] {
    const languages: { plugin: string; id: string; extensions: string[] }[] = [];
    for (const [name, plugin] of this.plugins) {
      if (plugin.config.contributes?.languages) {
        for (const lang of plugin.config.contributes.languages) {
          languages.push({ plugin: name, ...lang });
        }
      }
    }
    return languages;
  }

  getPlugin(name: string): PluginInstance | undefined { return this.plugins.get(name); }
  getAllPlugins(): PluginInstance[] { return [...this.plugins.values()]; }
  getActivatedPlugins(): PluginInstance[] { return [...this.plugins.values()].filter(p => p.status === 'activated'); }
  getPluginsByType(type: string): PluginInstance[] { const ids = this.typeIndex.get(type); if (!ids) return []; return [...ids].map(id => this.plugins.get(id)!).filter(Boolean); }
  removePlugin(name: string): boolean { return this.plugins.delete(name); }

  exportConfig(): string {
    const plugins = [...this.plugins.values()].map(p => p.config);
    return JSON.stringify({ plugins }, null, 2);
  }

  getStats(): { totalPlugins: number; activated: number; registered: number; error: number; byType: Record<string, number>; totalCommands: number; totalLanguages: number } {
    let activated = 0, registered = 0, error = 0;
    const byType: Record<string, number> = {};
    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'activated') activated++;
      else if (plugin.status === 'error') error++;
      else registered++;
      byType[plugin.config.type] = (byType[plugin.config.type] || 0) + 1;
    }
    const allCommands = this.getAllCommands();
    const allLanguages = this.getAllLanguages();
    return { totalPlugins: this.plugins.size, activated, registered, error, byType, totalCommands: allCommands.length, totalLanguages: allLanguages.length };
  }

  destroy(): void {
    this.plugins.clear();
    this.hookIndex.clear();
    this.typeIndex.clear();
    this.activationEventIndex.clear();
    this.configPaths.clear();
    this.removeAllListeners();
  }
}
