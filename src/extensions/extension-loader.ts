import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionAPI } from './extension-api';

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  engines: { nova: string };
  activationEvents?: string[];
  contributes?: ExtensionContributes;
  dependencies?: string[];
}

export interface ExtensionContributes {
  commands?: ExtensionCommand[];
  languages?: ExtensionLanguage[];
  themes?: ExtensionTheme[];
  keybindings?: ExtensionKeybinding[];
}

export interface ExtensionCommand {
  command: string;
  title: string;
  category?: string;
  when?: string;
}

export interface ExtensionLanguage {
  id: string;
  aliases?: string[];
  extensions?: string[];
  configuration?: string;
}

export interface ExtensionTheme {
  id: string;
  label: string;
  uiTheme: 'vs' | 'vs-dark' | 'hc-black';
  path: string;
}

export interface ExtensionKeybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

export type ExtensionState = 'loaded' | 'active' | 'inactive' | 'error';

export interface LoadedExtension {
  manifest: ExtensionManifest;
  state: ExtensionState;
  api: ExtensionAPI;
  module: any;
  activatedAt?: number;
  error?: string;
}

export interface ExtensionHook {
  name: string;
  callback: (data: any) => any;
  extensionId: string;
}

export interface RegisteredCommand {
  id: string;
  title: string;
  category?: string;
  callback: (...args: any[]) => any;
  extensionId: string;
}

export interface RegisteredLanguage {
  id: string;
  aliases: string[];
  extensions: string[];
  extensionId: string;
}

export interface RegisteredTheme {
  id: string;
  label: string;
  uiTheme: string;
  extensionId: string;
}

export interface RegisteredKeybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
  extensionId: string;
}

export class ExtensionLoader extends EventEmitter {
  private extensionPath: string;
  private extensions: Map<string, LoadedExtension> = new Map();
  private hooks: Map<string, ExtensionHook[]> = new Map();
  private commands: Map<string, RegisteredCommand> = new Map();
  private languages: Map<string, RegisteredLanguage> = new Map();
  private themes: Map<string, RegisteredTheme> = new Map();
  private keybindings: Map<string, RegisteredKeybinding> = new Map();

  constructor(extensionPath: string) {
    super();
    this.extensionPath = extensionPath;
    this.ensureExtensionDir();
  }

  private ensureExtensionDir(): void {
    if (!fs.existsSync(this.extensionPath)) {
      fs.mkdirSync(this.extensionPath, { recursive: true });
    }
  }

  async loadExtension(manifest: ExtensionManifest): Promise<LoadedExtension> {
    if (this.extensions.has(manifest.id)) {
      const existing = this.extensions.get(manifest.id)!;
      if (existing.state === 'active') {
        return existing;
      }
    }

    const validationError = this.validateManifest(manifest);
    if (validationError) {
      throw new Error(`Invalid manifest for ${manifest.id}: ${validationError}`);
    }

    const api = new ExtensionAPI(manifest.id);
    const extDir = path.join(this.extensionPath, manifest.id);

    let module: any = null;
    if (fs.existsSync(extDir)) {
      const mainPath = path.join(extDir, manifest.main);
      try {
        module = require(mainPath);
      } catch (err) {
        // module load failed, extension may be pure manifest-based
      }
    }

    const loaded: LoadedExtension = {
      manifest,
      state: 'loaded',
      api,
      module,
    };

    this.extensions.set(manifest.id, loaded);

    if (manifest.contributes?.commands) {
      for (const cmd of manifest.contributes.commands) {
        this.registerCommand({
          id: cmd.command,
          title: cmd.title,
          category: cmd.category,
          callback: () => {},
          extensionId: manifest.id,
        });
      }
    }

    if (manifest.contributes?.languages) {
      for (const lang of manifest.contributes.languages) {
        this.registerLanguage({
          id: lang.id,
          aliases: lang.aliases ?? [],
          extensions: lang.extensions ?? [],
          extensionId: manifest.id,
        });
      }
    }

    if (manifest.contributes?.themes) {
      for (const theme of manifest.contributes.themes) {
        this.registerTheme({
          id: theme.id,
          label: theme.label,
          uiTheme: theme.uiTheme,
          extensionId: manifest.id,
        });
      }
    }

    if (manifest.contributes?.keybindings) {
      for (const kb of manifest.contributes.keybindings) {
        this.registerKeybinding({
          command: kb.command,
          key: kb.key,
          mac: kb.mac,
          when: kb.when,
          extensionId: manifest.id,
        });
      }
    }

    this.emit('extensionLoaded', manifest.id);
    return loaded;
  }

  async activateExtension(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) {
      throw new Error(`Extension ${id} is not loaded`);
    }
    if (ext.state === 'active') {
      return;
    }

    try {
      if (ext.module && typeof ext.module.activate === 'function') {
        await ext.module.activate(ext.api);
      }

      ext.state = 'active';
      ext.activatedAt = Date.now();
      this.emit('extensionActivated', id);
    } catch (err) {
      ext.state = 'error';
      ext.error = err instanceof Error ? err.message : String(err);
      this.emit('extensionError', id, err);
      throw err;
    }
  }

  async deactivateExtension(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext || ext.state !== 'active') {
      return;
    }

    try {
      if (ext.module && typeof ext.module.deactivate === 'function') {
        await ext.module.deactivate();
      }

      ext.state = 'inactive';
      this.emit('extensionDeactivated', id);
    } catch (err) {
      ext.error = err instanceof Error ? err.message : String(err);
      this.emit('extensionError', id, err);
    }
  }

  async unloadExtension(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) return;

    if (ext.state === 'active') {
      await this.deactivateExtension(id);
    }

    for (const [hookName, hooks] of Array.from(this.hooks.entries())) {
      const filtered = hooks.filter((h) => h.extensionId !== id);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }

    for (const [cmdId, cmd] of Array.from(this.commands.entries())) {
      if (cmd.extensionId === id) {
        this.commands.delete(cmdId);
      }
    }

    for (const [langId, lang] of Array.from(this.languages.entries())) {
      if (lang.extensionId === id) {
        this.languages.delete(langId);
      }
    }

    for (const [themeId, theme] of Array.from(this.themes.entries())) {
      if (theme.extensionId === id) {
        this.themes.delete(themeId);
      }
    }

    for (const [idx, kb] of Array.from(this.keybindings.entries())) {
      if (kb.extensionId === id) {
        this.keybindings.delete(idx);
      }
    }

    this.extensions.delete(id);
    this.emit('extensionUnloaded', id);
  }

  getExtension(id: string): LoadedExtension | undefined {
    return this.extensions.get(id);
  }

  listLoaded(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }

  listActive(): LoadedExtension[] {
    return this.listLoaded().filter((ext) => ext.state === 'active');
  }

  async callHook(hookName: string, data: any): Promise<any> {
    const hooks = this.hooks.get(hookName) || [];
    let result = data;

    for (const hook of hooks) {
      try {
        const hookResult = await hook.callback(result);
        if (hookResult !== undefined) {
          result = hookResult;
        }
      } catch (err) {
        this.emit('hookError', hookName, hook.extensionId, err);
      }
    }

    return result;
  }

  registerHook(hookName: string, callback: (data: any) => any, extensionId: string): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName)!.push({ name: hookName, callback, extensionId });
  }

  registerCommand(command: RegisteredCommand): void {
    if (this.commands.has(command.id)) {
      const existing = this.commands.get(command.id)!;
      if (existing.extensionId !== command.extensionId) {
        throw new Error(`Command ${command.id} is already registered by extension ${existing.extensionId}`);
      }
    }
    this.commands.set(command.id, command);
  }

  executeCommand(commandId: string, args?: any[]): any {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command ${commandId} is not registered`);
    }

    try {
      return command.callback(...(args || []));
    } catch (err) {
      this.emit('commandError', commandId, err);
      throw err;
    }
  }

  getCommand(commandId: string): RegisteredCommand | undefined {
    return this.commands.get(commandId);
  }

  listCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  registerLanguage(language: RegisteredLanguage): void {
    this.languages.set(language.id, language);
  }

  getLanguage(languageId: string): RegisteredLanguage | undefined {
    return this.languages.get(languageId);
  }

  listLanguages(): RegisteredLanguage[] {
    return Array.from(this.languages.values());
  }

  registerTheme(theme: RegisteredTheme): void {
    this.themes.set(theme.id, theme);
  }

  getTheme(themeId: string): RegisteredTheme | undefined {
    return this.themes.get(themeId);
  }

  listThemes(): RegisteredTheme[] {
    return Array.from(this.themes.values());
  }

  registerKeybinding(keybinding: RegisteredKeybinding): void {
    const key = `${keybinding.command}:${keybinding.key}`;
    this.keybindings.set(key, keybinding);
  }

  listKeybindings(): RegisteredKeybinding[] {
    return Array.from(this.keybindings.values());
  }

  getExtensionManifest(id: string): ExtensionManifest | null {
    const manifestPath = path.join(this.extensionPath, id, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(content) as ExtensionManifest;
    } catch {
      return null;
    }
  }

  validateManifest(manifest: ExtensionManifest): string | null {
    if (!manifest.id || typeof manifest.id !== 'string') {
      return 'manifest.id is required and must be a string';
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
      return 'manifest.name is required and must be a string';
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      return 'manifest.version is required and must be a string';
    }
    if (!manifest.main || typeof manifest.main !== 'string') {
      return 'manifest.main is required and must be a string';
    }
    if (!manifest.engines || typeof manifest.engines !== 'object') {
      return 'manifest.engines is required and must be an object';
    }
    if (!manifest.engines.nova) {
      return 'manifest.engines.nova is required';
    }

    if (manifest.contributes?.commands) {
      for (const cmd of manifest.contributes.commands) {
        if (!cmd.command || !cmd.title) {
          return `Invalid command entry: command and title are required`;
        }
      }
    }

    if (manifest.contributes?.languages) {
      for (const lang of manifest.contributes.languages) {
        if (!lang.id) {
          return 'Language entry requires an id';
        }
      }
    }

    if (manifest.contributes?.themes) {
      for (const theme of manifest.contributes.themes) {
        if (!theme.id || !theme.label || !theme.uiTheme) {
          return 'Theme entry requires id, label, and uiTheme';
        }
      }
    }

    return null;
  }

  dispose(): void {
    for (const ext of Array.from(this.extensions.values())) {
      if (ext.state === 'active') {
        this.deactivateExtension(ext.manifest.id);
      }
    }
    this.extensions.clear();
    this.hooks.clear();
    this.commands.clear();
    this.languages.clear();
    this.themes.clear();
    this.keybindings.clear();
  }
}
