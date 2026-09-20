import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  publisher: string;
  license: string;
  repository: string;
  categories: ExtensionCategory[];
  keywords: string[];
  engines: { nova: string };
  icon: string;
  readme: string;
  changelog: string;
  dependencies: string[];
  activationEvents: string[];
  contributes: ExtensionContributes;
  main: string;
}

export interface ExtensionContributes {
  commands?: { command: string; title: string; category?: string }[];
  languages?: { id: string; aliases: string[]; extensions: string[] }[];
  themes?: { id: string; label: string; uiTheme: string }[];
  grammars?: { language: string; scopeName: string; path: string }[];
}

export type ExtensionCategory =
  | 'programming'
  | 'snippets'
  | 'linters'
  | 'formatters'
  | 'themes'
  | 'keymaps'
  | 'debuggers'
  | 'other';

export type ExtensionStatus = 'installed' | 'enabled' | 'disabled' | 'uninstalled';

export interface InstalledExtension {
  manifest: ExtensionManifest;
  status: ExtensionStatus;
  installedAt: Date;
  updatedAt: Date;
  enabled: boolean;
}

export interface MarketplaceExtension {
  manifest: ExtensionManifest;
  downloads: number;
  rating: number;
  ratingCount: number;
  featured: boolean;
  verified: boolean;
  lastUpdated: Date;
  installCount: number;
}

export interface ExtensionRating {
  extensionId: string;
  userId: string;
  rating: number;
  review: string;
  createdAt: Date;
}

export interface ExtensionUpdate {
  extensionId: string;
  currentVersion: string;
  latestVersion: string;
  changelog: string;
}

export interface SearchResult {
  extensions: MarketplaceExtension[];
  total: number;
  query: string;
}

const BUILT_IN_EXTENSIONS: MarketplaceExtension[] = [
  {
    manifest: {
      id: 'nova-prettier',
      name: 'Prettier Formatter',
      description: 'Code formatter using prettier',
      version: '3.2.0',
      author: 'Prettier Team',
      publisher: 'prettier',
      license: 'MIT',
      repository: 'https://github.com/prettier/prettier',
      categories: ['formatters'],
      keywords: ['prettier', 'formatter', 'javascript', 'typescript'],
      engines: { nova: '>=2.0.0' },
      icon: 'prettier.svg',
      readme: '# Prettier Formatter\nFormats your code using Prettier.',
      changelog: '## 3.2.0\n- Updated config resolution',
      dependencies: [],
      activationEvents: ['onLanguage:javascript', 'onLanguage:typescript'],
      contributes: { commands: [{ command: 'prettier.format', title: 'Format Document' }] },
      main: 'dist/index.js',
    },
    downloads: 15000000,
    rating: 4.8,
    ratingCount: 12500,
    featured: true,
    verified: true,
    lastUpdated: new Date('2026-01-15'),
    installCount: 12000000,
  },
  {
    manifest: {
      id: 'nova-eslint',
      name: 'ESLint',
      description: 'Integrates ESLint JavaScript linting',
      version: '9.1.0',
      author: 'ESLint Team',
      publisher: 'eslint',
      license: 'MIT',
      repository: 'https://github.com/eslint/eslint',
      categories: ['linters'],
      keywords: ['eslint', 'lint', 'javascript', 'typescript'],
      engines: { nova: '>=2.0.0' },
      icon: 'eslint.svg',
      readme: '# ESLint\nIntegrates ESLint into Nova.',
      changelog: '## 9.1.0\n- Flat config support',
      dependencies: [],
      activationEvents: ['onLanguage:javascript', 'onLanguage:typescript'],
      contributes: { commands: [{ command: 'eslint.lint', title: 'Lint File' }] },
      main: 'dist/index.js',
    },
    downloads: 12000000,
    rating: 4.7,
    ratingCount: 10200,
    featured: true,
    verified: true,
    lastUpdated: new Date('2026-02-01'),
    installCount: 10000000,
  },
  {
    manifest: {
      id: 'nova-gitlens',
      name: 'GitLens',
      description: 'Supercharge Git within Nova',
      version: '14.8.0',
      author: 'Eric Amodio',
      publisher: 'gitlens',
      license: 'MIT',
      repository: 'https://github.com/gitkraken/vscode-gitlens',
      categories: ['programming'],
      keywords: ['git', 'lens', 'blame', 'history'],
      engines: { nova: '>=2.0.0' },
      icon: 'gitlens.svg',
      readme: '# GitLens\nEnhances Git capabilities.',
      changelog: '## 14.8.0\n- Line history improvements',
      dependencies: [],
      activationEvents: ['onLanguage:gitlens'],
      contributes: { commands: [{ command: 'gitlens.toggleFileBlame', title: 'Toggle File Blame' }] },
      main: 'dist/index.js',
    },
    downloads: 8500000,
    rating: 4.9,
    ratingCount: 8900,
    featured: true,
    verified: true,
    lastUpdated: new Date('2026-01-28'),
    installCount: 7200000,
  },
  {
    manifest: {
      id: 'nova-docker',
      name: 'Docker',
      description: 'Docker container management',
      version: '1.29.0',
      author: 'Microsoft',
      publisher: 'docker',
      license: 'MIT',
      repository: 'https://github.com/microsoft/vscode-docker',
      categories: ['programming'],
      keywords: ['docker', 'container', 'kubernetes'],
      engines: { nova: '>=2.0.0' },
      icon: 'docker.svg',
      readme: '# Docker\nManage Docker containers.',
      changelog: '## 1.29.0\n- Compose V2 support',
      dependencies: [],
      activationEvents: ['onLanguage:dockerfile'],
      contributes: { commands: [{ command: 'docker.build', title: 'Build Image' }] },
      main: 'dist/index.js',
    },
    downloads: 5200000,
    rating: 4.5,
    ratingCount: 4300,
    featured: false,
    verified: true,
    lastUpdated: new Date('2026-02-10'),
    installCount: 4100000,
  },
  {
    manifest: {
      id: 'nova-python',
      name: 'Python',
      description: 'Python language support with IntelliSense',
      version: '2024.2.0',
      author: 'Microsoft',
      publisher: 'python',
      license: 'MIT',
      repository: 'https://github.com/microsoft/vscode-python',
      categories: ['programming'],
      keywords: ['python', 'linting', 'debugging', 'intellisense'],
      engines: { nova: '>=2.0.0' },
      icon: 'python.svg',
      readme: '# Python\nFull Python support.',
      changelog: '## 2024.2.0\n- Pylance updates',
      dependencies: [],
      activationEvents: ['onLanguage:python'],
      contributes: {
        commands: [{ command: 'python.run', title: 'Run Python File' }],
        languages: [{ id: 'python', aliases: ['Python'], extensions: ['.py'] }],
      },
      main: 'dist/index.js',
    },
    downloads: 9800000,
    rating: 4.6,
    ratingCount: 7800,
    featured: true,
    verified: true,
    lastUpdated: new Date('2026-01-20'),
    installCount: 8100000,
  },
  {
    manifest: {
      id: 'nova-rust',
      name: 'Rust',
      description: 'Rust language support via rust-analyzer',
      version: '0.4.0',
      author: 'rust-lang',
      publisher: 'rust-lang',
      license: 'MIT',
      repository: 'https://github.com/rust-lang/rust-analyzer',
      categories: ['programming'],
      keywords: ['rust', 'cargo', 'analyzer'],
      engines: { nova: '>=2.0.0' },
      icon: 'rust.svg',
      readme: '# Rust\nRust language support.',
      changelog: '## 0.4.0\n- Proc macro support',
      dependencies: [],
      activationEvents: ['onLanguage:rust'],
      contributes: {
        commands: [{ command: 'rust.run', title: 'Run Rust File' }],
        languages: [{ id: 'rust', aliases: ['Rust'], extensions: ['.rs'] }],
      },
      main: 'dist/index.js',
    },
    downloads: 3100000,
    rating: 4.8,
    ratingCount: 2900,
    featured: false,
    verified: true,
    lastUpdated: new Date('2026-02-05'),
    installCount: 2400000,
  },
  {
    manifest: {
      id: 'nova-go',
      name: 'Go',
      description: 'Go language support via gopls',
      version: '0.41.0',
      author: 'Google',
      publisher: 'google',
      license: 'BSD-3-Clause',
      repository: 'https://github.com/golang/vscode-go',
      categories: ['programming'],
      keywords: ['go', 'golang', 'gopls'],
      engines: { nova: '>=2.0.0' },
      icon: 'go.svg',
      readme: '# Go\nGo language support.',
      changelog: '## 0.41.0\n- Inlay hints improvements',
      dependencies: [],
      activationEvents: ['onLanguage:go'],
      contributes: {
        commands: [{ command: 'go.run', title: 'Run Go File' }],
        languages: [{ id: 'go', aliases: ['Go'], extensions: ['.go'] }],
      },
      main: 'dist/index.js',
    },
    downloads: 2800000,
    rating: 4.7,
    ratingCount: 2400,
    featured: false,
    verified: true,
    lastUpdated: new Date('2026-02-12'),
    installCount: 2100000,
  },
  {
    manifest: {
      id: 'nova-one-dark-pro',
      name: 'One Dark Pro',
      description: 'Atom Inspired Dark Theme',
      version: '3.16.0',
      author: 'binaryify',
      publisher: 'binaryify',
      license: 'MIT',
      repository: 'https://github.com/Binaryify/OneDark-Pro',
      categories: ['themes'],
      keywords: ['theme', 'dark', 'atom', 'one-dark'],
      engines: { nova: '>=2.0.0' },
      icon: 'onedark.svg',
      readme: '# One Dark Pro\nDark theme inspired by Atom.',
      changelog: '## 3.16.0\n- New color tokens',
      dependencies: [],
      activationEvents: [],
      contributes: { themes: [{ id: 'One Dark Pro', label: 'One Dark Pro', uiTheme: 'vs-dark' }] },
      main: 'dist/index.js',
    },
    downloads: 6200000,
    rating: 4.9,
    ratingCount: 5600,
    featured: true,
    verified: true,
    lastUpdated: new Date('2026-01-05'),
    installCount: 5100000,
  },
];

const EXTENSIONS_DIR = join(process.cwd(), '.nova', 'extensions');

export class ExtensionMarketplace extends EventEmitter {
  private installed: Map<string, InstalledExtension> = new Map();
  private ratings: Map<string, ExtensionRating[]> = new Map();
  private extensionsDir: string;

  constructor(extensionsDir?: string) {
    super();
    this.extensionsDir = extensionsDir || EXTENSIONS_DIR;
    this.ensureDirectories();
    this.loadInstalled();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.extensionsDir)) {
      mkdirSync(this.extensionsDir, { recursive: true });
    }
  }

  private loadInstalled(): void {
    const manifestPath = join(this.extensionsDir, 'installed.json');
    if (existsSync(manifestPath)) {
      try {
        const data = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        for (const [id, ext] of Object.entries(data)) {
          const installed = ext as InstalledExtension;
          installed.installedAt = new Date(installed.installedAt);
          installed.updatedAt = new Date(installed.updatedAt);
          this.installed.set(id, installed);
        }
      } catch {
        /* ignore corrupt manifest */
      }
    }
  }

  private saveInstalled(): void {
    const manifestPath = join(this.extensionsDir, 'installed.json');
    const data: Record<string, InstalledExtension> = {};
    for (const [id, ext] of this.installed) {
      data[id] = ext;
    }
    writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async searchExtensions(query: string): Promise<SearchResult> {
    const normalized = query.toLowerCase().trim();
    const matches = BUILT_IN_EXTENSIONS.filter(
      (ext) =>
        ext.manifest.name.toLowerCase().includes(normalized) ||
        ext.manifest.description.toLowerCase().includes(normalized) ||
        ext.manifest.keywords.some((k) => k.toLowerCase().includes(normalized)) ||
        ext.manifest.categories.some((c) => c.toLowerCase().includes(normalized)),
    );
    return { extensions: matches, total: matches.length, query };
  }

  async getExtension(id: string): Promise<MarketplaceExtension | null> {
    return BUILT_IN_EXTENSIONS.find((ext) => ext.manifest.id === id) || null;
  }

  async installExtension(id: string): Promise<InstalledExtension> {
    if (this.installed.has(id)) {
      throw new Error(`Extension ${id} is already installed`);
    }
    const marketplace = BUILT_IN_EXTENSIONS.find((ext) => ext.manifest.id === id);
    if (!marketplace) {
      throw new Error(`Extension ${id} not found in marketplace`);
    }
    const installed: InstalledExtension = {
      manifest: marketplace.manifest,
      status: 'enabled',
      installedAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
    };
    this.installed.set(id, installed);
    this.saveInstalled();
    this.emit('extensionInstalled', installed);
    return installed;
  }

  async uninstallExtension(id: string): Promise<void> {
    if (!this.installed.has(id)) {
      throw new Error(`Extension ${id} is not installed`);
    }
    this.installed.delete(id);
    this.saveInstalled();
    this.emit('extensionUninstalled', id);
  }

  async listInstalled(): Promise<InstalledExtension[]> {
    return Array.from(this.installed.values());
  }

  async enableExtension(id: string): Promise<InstalledExtension> {
    const ext = this.installed.get(id);
    if (!ext) throw new Error(`Extension ${id} is not installed`);
    ext.enabled = true;
    ext.status = 'enabled';
    ext.updatedAt = new Date();
    this.installed.set(id, ext);
    this.saveInstalled();
    this.emit('extensionEnabled', id);
    return ext;
  }

  async disableExtension(id: string): Promise<InstalledExtension> {
    const ext = this.installed.get(id);
    if (!ext) throw new Error(`Extension ${id} is not installed`);
    ext.enabled = false;
    ext.status = 'disabled';
    ext.updatedAt = new Date();
    this.installed.set(id, ext);
    this.saveInstalled();
    this.emit('extensionDisabled', id);
    return ext;
  }

  async getUpdates(): Promise<ExtensionUpdate[]> {
    const updates: ExtensionUpdate[] = [];
    for (const [id, installed] of this.installed) {
      const marketplace = BUILT_IN_EXTENSIONS.find((ext) => ext.manifest.id === id);
      if (marketplace && marketplace.manifest.version !== installed.manifest.version) {
        updates.push({
          extensionId: id,
          currentVersion: installed.manifest.version,
          latestVersion: marketplace.manifest.version,
          changelog: marketplace.manifest.changelog,
        });
      }
    }
    return updates;
  }

  async rateExtension(id: string, rating: number, userId: string = 'anonymous', review: string = ''): Promise<ExtensionRating> {
    if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
    const ext = BUILT_IN_EXTENSIONS.find((e) => e.manifest.id === id);
    if (!ext) throw new Error(`Extension ${id} not found`);
    const entry: ExtensionRating = { extensionId: id, userId, rating, review, createdAt: new Date() };
    const existing = this.ratings.get(id) || [];
    const idx = existing.findIndex((r) => r.userId === userId);
    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }
    this.ratings.set(id, existing);
    const totalRatings = existing.reduce((sum, r) => sum + r.rating, 0);
    ext.rating = Math.round((totalRatings / existing.length) * 10) / 10;
    ext.ratingCount = existing.length;
    this.emit('extensionRated', entry);
    return entry;
  }

  async getPopular(): Promise<MarketplaceExtension[]> {
    return [...BUILT_IN_EXTENSIONS].sort((a, b) => b.downloads - a.downloads);
  }

  async getFeatured(): Promise<MarketplaceExtension[]> {
    return BUILT_IN_EXTENSIONS.filter((ext) => ext.featured);
  }

  getExtensionById(id: string): MarketplaceExtension | null {
    return BUILT_IN_EXTENSIONS.find((ext) => ext.manifest.id === id) || null;
  }
}
