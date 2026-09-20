import { EventEmitter } from 'events';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  hooks: string[];
  permissions: string[];
  dependencies?: string[];
  config?: Record<string, any>;
}

export interface Plugin {
  manifest: PluginManifest;
  instance: any;
  loadedAt: Date;
  enabled: boolean;
  hooks: Map<string, Function>;
}

export interface PluginHook {
  name: string;
  description: string;
  execute: (...args: any[]) => any | Promise<any>;
}

export class PluginSystem extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private hookRegistry: Map<string, Map<string, Function>> = new Map();
  private pluginDirs: Set<string> = new Set();
  private watchTimers: NodeJS.Timeout[] = [];

  constructor(private config?: { autoReload?: boolean; watchIntervalMs?: number }) { super(); }

  async loadPlugin(pluginPath: string): Promise<boolean> {
    try {
      const manifestPath = join(pluginPath, 'plugin.json');
      if (!existsSync(manifestPath)) throw new Error(`No plugin.json found at ${pluginPath}`);
      const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (this.plugins.has(manifest.name)) throw new Error(`Plugin "${manifest.name}" already loaded`);

      const mainPath = join(pluginPath, manifest.main);
      const pluginModule = await import(mainPath);
      const instance = pluginModule.default || pluginModule;

      const hooks = new Map<string, Function>();
      for (const hookName of manifest.hooks) {
        if (typeof instance[hookName] === 'function') hooks.set(hookName, instance[hookName].bind(instance));
      }

      if (typeof instance['onLoad'] === 'function') await instance['onLoad']();

      const plugin: Plugin = { manifest, instance, loadedAt: new Date(), enabled: true, hooks };
      this.plugins.set(manifest.name, plugin);

      for (const [hookName, hookFn] of hooks) {
        if (!this.hookRegistry.has(hookName)) this.hookRegistry.set(hookName, new Map());
        this.hookRegistry.get(hookName)!.set(manifest.name, hookFn);
      }

      this.emit('plugin-loaded', { name: manifest.name, version: manifest.version });
      return true;
    } catch (error) {
      this.emit('plugin-error', { path: pluginPath, error });
      return false;
    }
  }

  async loadPluginsFromDirectory(dirPath: string): Promise<{ loaded: number; errors: number }> {
    let loaded = 0, errors = 0;
    if (!existsSync(dirPath)) return { loaded: 0, errors: 1 };
    this.pluginDirs.add(dirPath);

    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dirPath, entry.name);
        if (existsSync(join(pluginPath, 'plugin.json'))) {
          const success = await this.loadPlugin(pluginPath);
          if (success) loaded++; else errors++;
        }
      }
    }
    return { loaded, errors };
  }

  async unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;
    if (typeof plugin.instance['onUnload'] === 'function') await plugin.instance['onUnload']();

    for (const [hookName] of plugin.hooks) {
      this.hookRegistry.get(hookName)?.delete(pluginName);
    }
    this.plugins.delete(pluginName);
    this.emit('plugin-unloaded', { name: pluginName });
    return true;
  }

  async reloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;
    const pluginPath = join([...this.pluginDirs][0] || '', pluginName);
    await this.unloadPlugin(pluginName);
    return this.loadPlugin(pluginPath);
  }

  async executeHook(hookName: string, ...args: any[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const hookImplementations = this.hookRegistry.get(hookName);
    if (!hookImplementations) return results;

    for (const [pluginName, hookFn] of hookImplementations) {
      try {
        const plugin = this.plugins.get(pluginName);
        if (plugin?.enabled) {
          const result = await hookFn(...args);
          results.set(pluginName, result);
        }
      } catch (error) {
        results.set(pluginName, { error: (error as Error).message });
        this.emit('hook-error', { hookName, pluginName, error });
      }
    }
    return results;
  }

  registerHook(hookName: string, description: string): void {
    if (!this.hookRegistry.has(hookName)) this.hookRegistry.set(hookName, new Map());
  }

  getPlugin(name: string): Plugin | undefined { return this.plugins.get(name); }
  getAllPlugins(): Plugin[] { return [...this.plugins.values()]; }
  enablePlugin(name: string): boolean { const p = this.plugins.get(name); if (p) { p.enabled = true; return true; } return false; }
  disablePlugin(name: string): boolean { const p = this.plugins.get(name); if (p) { p.enabled = false; return true; } return false; }

  getPluginConfig(name: string): Record<string, any> | undefined { return this.plugins.get(name)?.manifest.config; }
  setPluginConfig(name: string, config: Record<string, any>): void { const p = this.plugins.get(name); if (p) p.manifest.config = { ...p.manifest.config, ...config }; }

  getAvailableHooks(): string[] { return [...this.hookRegistry.keys()]; }
  getHookImplementations(hookName: string): string[] { return [...(this.hookRegistry.get(hookName)?.keys() || [])]; }

  getStats(): { totalPlugins: number; enabledPlugins: number; totalHooks: number; hooksByPlugin: Record<string, number> } {
    let enabledPlugins = 0; const hooksByPlugin: Record<string, number> = {};
    for (const [name, plugin] of this.plugins) {
      if (plugin.enabled) enabledPlugins++;
      hooksByPlugin[name] = plugin.hooks.size;
    }
    return { totalPlugins: this.plugins.size, enabledPlugins, totalHooks: [...this.hookRegistry.values()].reduce((sum, map) => sum + map.size, 0), hooksByPlugin };
  }

  destroy(): void {
    for (const timer of this.watchTimers) clearInterval(timer);
    this.watchTimers = [];
    this.plugins.clear();
    this.hookRegistry.clear();
    this.removeAllListeners();
  }
}
