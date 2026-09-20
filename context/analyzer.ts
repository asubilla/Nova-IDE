import { ProjectProfile, LanguageInfo, FrameworkInfo, ProjectStructure, Convention, Dependency, ProjectSize, GitInfo, ContextFile } from '../core/types';
import glob = require('glob');
import { readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

export class ProjectAnalyzer {
  async analyze(rootPath: string): Promise<ProjectProfile> {
    const files = await this.scanFiles(rootPath);
    const languages = this.detectLanguages(files);
    const frameworks = this.detectFrameworks(rootPath, files);
    const structure = this.detectStructure(files);
    const conventions = this.extractConventions(files, rootPath);
    const dependencies = this.analyzeDependencies(rootPath);
    const size = this.calculateSize(files);
    const gitInfo = this.getGitInfo(rootPath);

    return {
      rootPath,
      languages,
      frameworks,
      testFrameworks: this.detectTestFrameworks(rootPath),
      lintTools: this.detectLintTools(rootPath),
      ciSystems: this.detectCISystems(rootPath),
      packageManagers: this.detectPackageManagers(rootPath),
      structure,
      conventions,
      dependencies,
      size,
      gitInfo,
    };
  }

  private async scanFiles(rootPath: string): Promise<string[]> {
    const patterns = ['**/*', '!node_modules/**', '!.git/**', '!dist/**', '!build/**', '!.next/**', '!coverage/**'];
    const files: string[] = [];
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, { cwd: rootPath, absolute: true, nodir: true });
      files.push(...matches);
    }
    
    return [...new Set(files)];
  }

  private detectLanguages(files: string[]): LanguageInfo[] {
    const extMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.rs': 'rust', '.go': 'go',
      '.java': 'java', '.cs': 'csharp', '.cpp': 'cpp',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown', '.css': 'css', '.scss': 'scss',
      '.html': 'html', '.vue': 'vue', '.svelte': 'svelte',
    };

    const counts: Record<string, number> = {};
    for (const file of files) {
      const ext = extname(file);
      const lang = extMap[ext];
      if (lang) counts[lang] = (counts[lang] || 0) + 1;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts).map(([name, files]) => ({
      name,
      percentage: Math.round((files / total) * 100),
      files,
    })).sort((a, b) => b.files - a.files);
  }

  private detectFrameworks(rootPath: string, files: string[]): FrameworkInfo[] {
    const frameworks: FrameworkInfo[] = [];
    const packageJson = this.readPackageJson(rootPath);
    
    if (!packageJson) return frameworks;

    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const frameworkSignatures: Record<string, { name: string; type: FrameworkInfo['type']; deps: string[] }> = {
      nextjs: { name: 'nextjs', type: 'fullstack', deps: ['next'] },
      react: { name: 'react', type: 'frontend', deps: ['react', 'react-dom'] },
      vue: { name: 'vue', type: 'frontend', deps: ['vue'] },
      svelte: { name: 'svelte', type: 'frontend', deps: ['svelte'] },
      express: { name: 'express', type: 'backend', deps: ['express'] },
      fastify: { name: 'fastify', type: 'backend', deps: ['fastify'] },
      nestjs: { name: 'nestjs', type: 'backend', deps: ['@nestjs/core'] },
      remix: { name: 'remix', type: 'fullstack', deps: ['@remix-run/node'] },
      astro: { name: 'astro', type: 'frontend', deps: ['astro'] },
      nuxt: { name: 'nuxt', type: 'fullstack', deps: ['nuxt'] },
      gatsby: { name: 'gatsby', type: 'frontend', deps: ['gatsby'] },
      electron: { name: 'electron', type: 'tool', deps: ['electron'] },
      tauri: { name: 'tauri', type: 'tool', deps: ['@tauri-apps/api'] },
    };

    for (const [key, sig] of Object.entries(frameworkSignatures)) {
      if (sig.deps.some(d => allDeps[d])) {
        const version = allDeps[sig.deps[0]];
        frameworks.push({ name: sig.name, version, type: sig.type });
      }
    }

    return frameworks;
  }

  private detectStructure(files: string[]): ProjectStructure {
    const dirs = new Set(files.map(f => {
      const parts = f.split('/');
      return parts.length > 1 ? parts[0] : '';
    }));

    const srcDirs = Array.from(dirs).filter(d => ['src', 'app', 'lib', 'source'].includes(d));
    const testDirs = Array.from(dirs).filter(d => ['test', 'tests', '__tests__', 'spec', 'specs', 'cypress', 'playwright'].includes(d));
    const configDirs = Array.from(dirs).filter(d => ['.config', 'config', 'cfg'].includes(d));

    let pattern: ProjectStructure['pattern'] = 'flat';
    if (srcDirs.some(d => this.hasFeatureFolders(d, files))) pattern = 'feature-folders';
    else if (srcDirs.length > 1) pattern = 'layered';
    else if (this.hasMonorepoMarkers(files)) pattern = 'monorepo';
    else if (srcDirs.length === 1) pattern = 'modular';

    return { pattern, srcDirs, testDirs, configDirs };
  }

  private hasFeatureFolders(srcDir: string, files: string[]): boolean {
    const featureDirs = files
      .filter(f => f.startsWith(`${srcDir}/`) && f.split('/').length === 3)
      .map(f => f.split('/')[1]);
    return new Set(featureDirs).size > 3;
  }

  private hasMonorepoMarkers(files: string[]): boolean {
    return files.some(f => f.endsWith('pnpm-workspace.yaml') || f.endsWith('turbo.json') || f.endsWith('nx.json'));
  }

  private extractConventions(files: string[], rootPath: string): Convention[] {
    const conventions: Convention[] = [];
    
    const namingPatterns = this.analyzeNamingPatterns(files);
    conventions.push(...namingPatterns);

    const importPatterns = this.analyzeImportPatterns(files, rootPath);
    conventions.push(...importPatterns);

    return conventions;
  }

  private analyzeNamingPatterns(files: string[]): Convention[] {
    const conventions: Convention[] = [];
    const componentFiles = files.filter(f => /\.(tsx?|jsx?|vue|svelte)$/.test(f) && !f.includes('.test.') && !f.includes('.spec.'));
    
    if (componentFiles.length > 0) {
      const pascalCase = componentFiles.filter(f => /[A-Z][a-z]+[A-Z]/.test(f.split('/').pop()?.replace(/\.[^.]+$/, '') || '')).length;
      const kebabCase = componentFiles.filter(f => /-/.test(f.split('/').pop()?.replace(/\.[^.]+$/, '') || '')).length;
      
      if (pascalCase > kebabCase) {
        conventions.push({ name: 'component-naming', pattern: 'PascalCase', examples: componentFiles.slice(0, 3).map(f => f.split('/').pop()!), enforcement: 'strict' });
      } else {
        conventions.push({ name: 'component-naming', pattern: 'kebab-case', examples: componentFiles.slice(0, 3).map(f => f.split('/').pop()!), enforcement: 'strict' });
      }
    }

    const hookFiles = files.filter(f => /use[A-Z]/.test(f.split('/').pop() || ''));
    if (hookFiles.length > 0) {
      conventions.push({ name: 'hook-naming', pattern: 'usePrefix', examples: hookFiles.slice(0, 3).map(f => f.split('/').pop()!), enforcement: 'strict' });
    }

    return conventions;
  }

  private analyzeImportPatterns(files: string[], rootPath: string): Convention[] {
    const conventions: Convention[] = [];
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    
    let relativeImports = 0;
    let absoluteImports = 0;
    let barrelImports = 0;

    for (const file of tsFiles.slice(0, 50)) {
      try {
        const content = readFileSync(file, 'utf-8');
        const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        for (const imp of imports) {
          const path = imp.match(/['"]([^'"]+)['"]/)?.[1];
          if (!path) continue;
          if (path.startsWith('.')) relativeImports++;
          else if (path.startsWith('@/') || path.startsWith('#/')) absoluteImports++;
          else if (!path.includes('/') || path.split('/').length === 1) barrelImports++;
        }
      } catch {}
    }

    if (absoluteImports > relativeImports) {
      conventions.push({ name: 'import-style', pattern: 'absolute (@/ or #/)', examples: ['@/components/Button', '@/hooks/useAuth'], enforcement: 'strict' });
    } else {
      conventions.push({ name: 'import-style', pattern: 'relative', examples: ['../components/Button', '../../hooks/useAuth'], enforcement: 'strict' });
    }

    return conventions;
  }

  private analyzeDependencies(rootPath: string): Dependency[] {
    const packageJson = this.readPackageJson(rootPath);
    if (!packageJson) return [];

    const deps: Dependency[] = [];
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const [name, version] of Object.entries(allDeps)) {
      deps.push({
        name,
        version: version as string,
        type: packageJson.dependencies[name] ? 'prod' : 'dev',
        vulnerabilityCount: 0,
      });
    }

    return deps;
  }

  private calculateSize(files: string[]): ProjectSize {
    let totalLines = 0;
    let sourceFiles = 0;
    let testFiles = 0;
    let configFiles = 0;

    for (const file of files.slice(0, 200)) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n').length;
        totalLines += lines;

        if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) testFiles++;
        else if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(extname(file))) sourceFiles++;
        else if (['.json', '.yaml', '.yml', '.toml', '.ini'].includes(extname(file))) configFiles++;
      } catch {}
    }

    return {
      totalFiles: files.length,
      totalLines,
      sourceFiles,
      testFiles,
      configFiles,
    };
  }

  private getGitInfo(rootPath: string): GitInfo {
    return {
      branch: 'main',
      lastCommit: 'unknown',
      uncommittedChanges: 0,
      contributors: 1,
    };
  }

  private detectTestFrameworks(rootPath: string): string[] {
    const packageJson = this.readPackageJson(rootPath);
    if (!packageJson) return [];
    
    const frameworks = ['vitest', 'jest', 'mocha', 'cypress', 'playwright', 'testing-library', '@testing-library'];
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    return frameworks.filter(f => Object.keys(allDeps).some(d => d.includes(f)));
  }

  private detectLintTools(rootPath: string): string[] {
    const tools = ['eslint', 'prettier', 'stylelint', 'tslint'];
    const files = ['.eslintrc', '.prettierrc', 'stylelint.config'];
    
    return tools.filter(t => existsSync(join(rootPath, `${t}.config.js`)) || 
      files.some(f => existsSync(join(rootPath, f))));
  }

  private detectCISystems(rootPath: string): string[] {
    const systems = [
      { name: 'github-actions', path: '.github/workflows' },
      { name: 'gitlab-ci', path: '.gitlab-ci.yml' },
      { name: 'circleci', path: '.circleci' },
      { name: 'jenkins', path: 'Jenkinsfile' },
      { name: 'azure-pipelines', path: 'azure-pipelines.yml' },
    ];
    
    return systems.filter(s => existsSync(join(rootPath, s.path))).map(s => s.name);
  }

  private detectPackageManagers(rootPath: string): string[] {
    const managers = [
      { name: 'npm', file: 'package-lock.json' },
      { name: 'yarn', file: 'yarn.lock' },
      { name: 'pnpm', file: 'pnpm-lock.yaml' },
      { name: 'bun', file: 'bun.lockb' },
    ];
    
    return managers.filter(m => existsSync(join(rootPath, m.file))).map(m => m.name);
  }

  private readPackageJson(rootPath: string): any {
    try {
      const path = join(rootPath, 'package.json');
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf-8'));
      }
    } catch {}
    return null;
  }

  async buildContextForAgent(profile: ProjectProfile, agentType: string, taskDescription: string): Promise<ContextFile[]> {
    const contextFiles: ContextFile[] = [];
    const relevantPatterns = this.getRelevantPatterns(agentType);
    
    for (const pattern of relevantPatterns) {
      const files = await glob(pattern, { cwd: profile.rootPath, absolute: true });
      for (const file of files.slice(0, 20)) {
        try {
          const content = readFileSync(file, 'utf-8');
          contextFiles.push({
            path: relative(profile.rootPath, file),
            content: content.slice(0, 10000),
            relevance: this.calculateRelevance(content, taskDescription),
            type: this.getFileType(file),
          });
        } catch {}
      }
    }

    return contextFiles.sort((a, b) => b.relevance - a.relevance).slice(0, 30);
  }

  private getRelevantPatterns(agentType: string): string[] {
    const patterns: Record<string, string[]> = {
      'feature-coder': ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
      'refactorer': ['src/**/*.ts', 'src/**/*.tsx'],
      'bug-fixer': ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
      'test-writer': ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'tests/**/*'],
      'code-reviewer': ['src/**/*.ts', 'src/**/*.tsx'],
      'security-scanner': ['src/**/*.ts', 'src/**/*.tsx', 'package.json'],
      'performance-profiler': ['src/**/*.ts', 'src/**/*.tsx', 'next.config.js', 'vite.config.ts'],
      'type-fixer': ['src/**/*.ts', 'src/**/*.tsx', 'tsconfig.json'],
      'doc-generator': ['src/**/*.ts', 'src/**/*.tsx', 'README.md'],
    };
    return patterns[agentType] || ['src/**/*'];
  }

  private calculateRelevance(content: string, taskDescription: string): number {
    const taskWords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const contentLower = content.toLowerCase();
    let score = 0;
    for (const word of taskWords) {
      if (contentLower.includes(word)) score += 1;
    }
    return Math.min(score / taskWords.length, 1);
  }

  private getFileType(file: string): ContextFile['type'] {
    const ext = extname(file);
    if (['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'].some(e => file.endsWith(e))) return 'test';
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.config.js', '.config.ts'].includes(ext) || file.includes('config')) return 'config';
    if (['.md', '.txt', '.rst'].includes(ext)) return 'doc';
    if (file.includes('package.json') || file.includes('lock')) return 'dependency';
    return 'source';
  }
}