import {
  ProjectProfile,
  AgentType,
  AgentTask,
  AgentCapability,
  LanguageInfo,
  FrameworkInfo,
  ProjectStructure,
} from '../core/types';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import glob = require('glob');

export interface ModuleBoundary {
  id: string;
  name: string;
  path: string;
  type: 'feature' | 'layer' | 'package' | 'domain' | 'shared';
  files: string[];
  complexity: ModuleComplexity;
  ownership: OwnershipInfo;
  technologyStack: string[];
}

export interface ModuleComplexity {
  linesOfCode: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  fileCount: number;
  avgFileSize: number;
  score: number;
}

export interface OwnershipInfo {
  primaryOwner: string;
  contributors: string[];
  lastModified: Date;
  changeFrequency: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'dynamic' | 'peer' | 'runtime';
  weight: number;
}

export interface HotSpot {
  filePath: string;
  changeFrequency: number;
  bugDensity: number;
  complexityScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DeepProjectAnalysis {
  modules: ModuleBoundary[];
  dependencyGraph: DependencyEdge[];
  hotSpots: HotSpot[];
  technologyMatrix: TechnologyMatrix;
  recommendedDistribution: RecommendedDistribution;
}

export interface TechnologyMatrix {
  languages: Map<string, AgentType[]>;
  frameworks: Map<string, AgentType[]>;
  patterns: Map<string, AgentType[]>;
}

export interface RecommendedDistribution {
  preferredAgentTypes: AgentType[];
  moduleAssignments: Map<string, AgentType[]>;
  parallelizableModules: string[][];
  sequentialChain: string[];
}

const TECHNOLOGY_AGENT_MAP: Record<string, AgentType[]> = {
  typescript: ['type-fixer', 'feature-coder', 'refactorer', 'code-reviewer'],
  javascript: ['feature-coder', 'refactorer', 'code-reviewer'],
  python: ['feature-coder', 'bug-fixer', 'code-reviewer'],
  rust: ['feature-coder', 'performance-profiler', 'code-reviewer'],
  go: ['feature-coder', 'performance-profiler', 'code-reviewer'],
  java: ['feature-coder', 'code-reviewer', 'security-scanner'],
  css: ['feature-coder', 'accessibility-auditor'],
  html: ['feature-coder', 'accessibility-auditor'],
  react: ['feature-coder', 'test-writer', 'accessibility-auditor'],
  vue: ['feature-coder', 'test-writer', 'accessibility-auditor'],
  nextjs: ['feature-coder', 'performance-profiler', 'test-writer'],
  express: ['feature-coder', 'security-scanner', 'test-writer'],
  nestjs: ['feature-coder', 'security-scanner', 'test-writer'],
  graphql: ['api-designer', 'code-reviewer', 'test-writer'],
};

const FRAMEWORK_AGENT_MAP: Record<string, AgentType[]> = {
  react: ['feature-coder', 'test-writer', 'accessibility-auditor', 'performance-profiler'],
  vue: ['feature-coder', 'test-writer', 'accessibility-auditor'],
  angular: ['feature-coder', 'type-fixer', 'test-writer'],
  nextjs: ['feature-coder', 'performance-profiler', 'code-reviewer', 'doc-generator'],
  express: ['feature-coder', 'security-scanner', 'test-writer', 'doc-generator'],
  nestjs: ['feature-coder', 'type-fixer', 'security-scanner', 'test-writer'],
  fastify: ['feature-coder', 'performance-profiler', 'test-writer'],
};

const FILE_CHANGE_PATTERNS = [
  '**/error-handler*',
  '**/middleware*',
  '**/auth*',
  '**/validation*',
  '**/transform*',
  '**/converter*',
];

export class ProjectDeepAnalyzer {
  private rootPath: string;
  private projectProfile: ProjectProfile;
  private fileContents: Map<string, string> = new Map();

  constructor(projectProfile: ProjectProfile) {
    this.rootPath = projectProfile.rootPath;
    this.projectProfile = projectProfile;
  }

  async analyze(): Promise<DeepProjectAnalysis> {
    const modules = await this.detectModuleBoundaries();
    const dependencyGraph = await this.buildDependencyGraph(modules);
    const hotSpots = await this.detectHotSpots();
    const technologyMatrix = this.buildTechnologyMatrix();
    const recommendedDistribution = this.recommendDistribution(modules, dependencyGraph);

    return {
      modules,
      dependencyGraph,
      hotSpots,
      technologyMatrix,
      recommendedDistribution,
    };
  }

  private async detectModuleBoundaries(): Promise<ModuleBoundary[]> {
    const modules: ModuleBoundary[] = [];
    const structure = this.projectProfile.structure;

    switch (structure.pattern) {
      case 'feature-folders':
        modules.push(...await this.detectFeatureModules(structure));
        break;
      case 'layered':
        modules.push(...await this.detectLayeredModules(structure));
        break;
      case 'monorepo':
        modules.push(...await this.detectMonorepoModules(structure));
        break;
      case 'modular':
        modules.push(...await this.detectModularModules(structure));
        break;
      default:
        modules.push(...await this.detectFlatModules(structure));
        break;
    }

    for (const mod of modules) {
      mod.complexity = await this.calculateModuleComplexity(mod);
      mod.ownership = await this.analyzeOwnership(mod);
      mod.technologyStack = this.detectModuleTechnologies(mod);
    }

    return modules;
  }

  private async detectFeatureModules(structure: ProjectStructure): Promise<ModuleBoundary[]> {
    const modules: ModuleBoundary[] = [];

    for (const srcDir of structure.srcDirs) {
      const featurePath = join(this.rootPath, srcDir);
      if (!existsSync(featurePath)) continue;

      const entries = await glob('*', { cwd: featurePath, absolute: false });
      for (const entry of entries) {
        const fullPath = join(featurePath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const files = await glob('**/*', { cwd: fullPath, absolute: true });
          modules.push({
            id: `feature-${entry}`,
            name: entry,
            path: fullPath,
            type: 'feature',
            files,
            complexity: this.emptyComplexity(),
            ownership: this.emptyOwnership(),
            technologyStack: [],
          });
        }
      }
    }

    if (modules.length === 0) {
      modules.push(...await this.detectModularModules(structure));
    }

    return modules;
  }

  private async detectLayeredModules(structure: ProjectStructure): Promise<ModuleBoundary[]> {
    const modules: ModuleBoundary[] = [];
    const layerPatterns: Record<string, string[]> = {
      presentation: ['components', 'pages', 'views', 'ui', 'layouts'],
      application: ['services', 'use-cases', 'interactors', 'application'],
      domain: ['domain', 'models', 'entities', 'value-objects', 'aggregate'],
      infrastructure: ['infrastructure', 'repos', 'adapters', 'external', 'gateways'],
      shared: ['shared', 'common', 'utils', 'helpers', 'lib'],
    };

    for (const srcDir of structure.srcDirs) {
      for (const [layer, names] of Object.entries(layerPatterns)) {
        for (const name of names) {
          const layerPath = join(this.rootPath, srcDir, name);
          if (existsSync(layerPath)) {
            const files = await glob('**/*', { cwd: layerPath, absolute: true });
            modules.push({
              id: `layer-${layer}-${name}`,
              name: `${layer}/${name}`,
              path: layerPath,
              type: 'layer',
              files,
              complexity: this.emptyComplexity(),
              ownership: this.emptyOwnership(),
              technologyStack: [],
            });
          }
        }
      }
    }

    return modules;
  }

  private async detectMonorepoModules(structure: ProjectStructure): Promise<ModuleBoundary[]> {
    const modules: ModuleBoundary[] = [];
    const packageDirs = ['packages', 'apps', 'libs', 'modules'];

    for (const dir of packageDirs) {
      const dirPath = join(this.rootPath, dir);
      if (!existsSync(dirPath)) continue;

      const entries = await glob('*', { cwd: dirPath, absolute: false });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const files = await glob('**/*', { cwd: fullPath, absolute: true });
          modules.push({
            id: `package-${entry}`,
            name: entry,
            path: fullPath,
            type: 'package',
            files,
            complexity: this.emptyComplexity(),
            ownership: this.emptyOwnership(),
            technologyStack: [],
          });
        }
      }
    }

    return modules;
  }

  private async detectModularModules(structure: ProjectStructure): Promise<ModuleBoundary[]> {
    const modules: ModuleBoundary[] = [];

    for (const srcDir of structure.srcDirs) {
      const srcPath = join(this.rootPath, srcDir);
      if (!existsSync(srcPath)) continue;

      const entries = await glob('*', { cwd: srcPath, absolute: false });
      for (const entry of entries) {
        const fullPath = join(srcPath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const files = await glob('**/*', { cwd: fullPath, absolute: true });
          modules.push({
            id: `module-${entry}`,
            name: entry,
            path: fullPath,
            type: 'domain',
            files,
            complexity: this.emptyComplexity(),
            ownership: this.emptyOwnership(),
            technologyStack: [],
          });
        }
      }
    }

    if (modules.length === 0) {
      const allFiles = await glob('**/*', { cwd: this.rootPath, absolute: true });
      modules.push({
        id: 'module-root',
        name: 'root',
        path: this.rootPath,
        type: 'domain',
        files: allFiles,
        complexity: this.emptyComplexity(),
        ownership: this.emptyOwnership(),
        technologyStack: [],
      });
    }

    return modules;
  }

  private async detectFlatModules(structure: ProjectStructure): Promise<ModuleBoundary[]> {
    const allFiles = await glob('**/*', { cwd: this.rootPath, absolute: true });
    const srcFiles = allFiles.filter((f: string) =>
      structure.srcDirs.some(d => f.startsWith(d)) ||
      extname(f) === '.ts' || extname(f) === '.tsx' ||
      extname(f) === '.js' || extname(f) === '.jsx'
    );

    return [{
      id: 'flat-root',
      name: 'root',
      path: this.rootPath,
      type: 'domain',
      files: srcFiles,
      complexity: this.emptyComplexity(),
      ownership: this.emptyOwnership(),
      technologyStack: [],
    }];
  }

  private async buildDependencyGraph(modules: ModuleBoundary[]): Promise<DependencyEdge[]> {
    const edges: DependencyEdge[] = [];
    const modulePathMap = new Map<string, string>();
    for (const mod of modules) {
      modulePathMap.set(mod.path, mod.id);
    }

    for (const mod of modules) {
      for (const file of mod.files) {
        if (!/\.(ts|tsx|js|jsx|vue|svelte)$/.test(file)) continue;

        let content = this.fileContents.get(file);
        if (!content) {
          try {
            content = readFileSync(file, 'utf-8');
            this.fileContents.set(file, content);
          } catch {
            continue;
          }
        }

        const imports = this.extractImports(content);
        for (const imp of imports) {
          const resolvedPath = this.resolveImportPath(file, imp);
          if (!resolvedPath) continue;

          const targetModule = this.findModuleForFile(resolvedPath, modules);
          if (targetModule && targetModule.id !== mod.id) {
            const existingEdge = edges.find(e => e.from === mod.id && e.to === targetModule.id);
            if (existingEdge) {
              existingEdge.weight++;
            } else {
              edges.push({
                from: mod.id,
                to: targetModule.id,
                type: imp.type,
                weight: 1,
              });
            }
          }
        }
      }
    }

    return edges;
  }

  private extractImports(content: string): Array<{ path: string; type: DependencyEdge['type'] }> {
    const imports: Array<{ path: string; type: DependencyEdge['type'] }> = [];
    const importRegex = /(?:import|require)\s*(?:\(?\s*|from\s+['"])([^'"]+)['"]/g;
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const exportRegex = /export\s+.*\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({ path: match[1], type: 'import' });
    }
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push({ path: match[1], type: 'dynamic' });
    }
    while ((match = exportRegex.exec(content)) !== null) {
      imports.push({ path: match[1], type: 'import' });
    }

    return imports;
  }

  private resolveImportPath(fromFile: string, imp: { path: string; type: DependencyEdge['type'] }): string | null {
    if (imp.path.startsWith('.')) {
      const dir = join(fromFile, '..');
      let resolved = join(dir, imp.path);
      if (!existsSync(resolved)) {
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.js']) {
          if (existsSync(resolved + ext)) {
            resolved = resolved + ext;
            break;
          }
        }
      }
      return resolved;
    }

    if (imp.path.startsWith('@/') || imp.path.startsWith('#/')) {
      const alias = imp.path.replace(/^[@#]\//, '');
      return join(this.rootPath, 'src', alias);
    }

    return null;
  }

  private findModuleForFile(filePath: string, modules: ModuleBoundary[]): ModuleBoundary | null {
    for (const mod of modules) {
      if (filePath.startsWith(mod.path)) {
        return mod;
      }
    }
    return null;
  }

  private async calculateModuleComplexity(mod: ModuleBoundary): Promise<ModuleComplexity> {
    let totalLines = 0;
    let totalCyclomatic = 0;
    let maxNesting = 0;
    let fileCount = 0;

    for (const file of mod.files) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;

      let content = this.fileContents.get(file);
      if (!content) {
        try {
          content = readFileSync(file, 'utf-8');
          this.fileContents.set(file, content);
        } catch {
          continue;
        }
      }

      const lines = content.split('\n');
      totalLines += lines.length;
      fileCount++;

      totalCyclomatic += this.calculateCyclomaticComplexity(content);
      const nesting = this.calculateMaxNestingDepth(content);
      if (nesting > maxNesting) maxNesting = nesting;
    }

    const avgFileSize = fileCount > 0 ? totalLines / fileCount : 0;
    const score = this.computeComplexityScore(totalLines, totalCyclomatic, maxNesting, fileCount);

    return {
      linesOfCode: totalLines,
      cyclomaticComplexity: totalCyclomatic,
      nestingDepth: maxNesting,
      fileCount,
      avgFileSize,
      score,
    };
  }

  private calculateCyclomaticComplexity(content: string): number {
    let complexity = 1;
    const keywords = ['if', 'else if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', '&&', '||', '?'];
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b|\\?\\s*\\.`, 'g');
      const matches = content.match(regex);
      if (matches) complexity += matches.length;
    }
    return complexity;
  }

  private calculateMaxNestingDepth(content: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of content) {
      if (char === '{') {
        currentDepth++;
        if (currentDepth > maxDepth) maxDepth = currentDepth;
      } else if (char === '}') {
        currentDepth--;
      }
    }
    return maxDepth;
  }

  private computeComplexityScore(
    loc: number,
    cyclomatic: number,
    nesting: number,
    fileCount: number
  ): number {
    const locScore = Math.min(loc / 10000, 1) * 25;
    const cyclomaticScore = Math.min(cyclomatic / 500, 1) * 30;
    const nestingScore = Math.min(nesting / 10, 1) * 25;
    const sizeScore = Math.min(fileCount / 100, 1) * 20;
    return Math.round((locScore + cyclomaticScore + nestingScore + sizeScore) * 100) / 100;
  }

  private async analyzeOwnership(mod: ModuleBoundary): Promise<OwnershipInfo> {
    const sampleFiles = mod.files.slice(0, 20);
    const contributors = new Map<string, number>();
    let lastModified = new Date(0);

    for (const file of sampleFiles) {
      try {
        const stat = statSync(file);
        if (stat.mtime > lastModified) lastModified = stat.mtime;
        contributors.set('local', (contributors.get('local') || 0) + 1);
      } catch {}
    }

    const sortedContributors = Array.from(contributors.entries())
      .sort((a, b) => b[1] - a[1]);

    return {
      primaryOwner: sortedContributors[0]?.[0] || 'unknown',
      contributors: sortedContributors.map(c => c[0]),
      lastModified,
      changeFrequency: mod.files.length,
    };
  }

  private detectModuleTechnologies(mod: ModuleBoundary): string[] {
    const techs = new Set<string>();

    for (const file of mod.files) {
      const ext = extname(file);
      switch (ext) {
        case '.ts': case '.tsx': techs.add('typescript'); break;
        case '.js': case '.jsx': techs.add('javascript'); break;
        case '.py': techs.add('python'); break;
        case '.rs': techs.add('rust'); break;
        case '.go': techs.add('go'); break;
        case '.vue': techs.add('vue'); break;
        case '.svelte': techs.add('svelte'); break;
        case '.css': case '.scss': techs.add('css'); break;
      }

      const name = basename(file).toLowerCase();
      if (name.includes('react')) techs.add('react');
      if (name.includes('vue')) techs.add('vue');
      if (name.includes('angular')) techs.add('angular');
      if (name.includes('next')) techs.add('nextjs');
    }

    return Array.from(techs);
  }

  private async detectHotSpots(): Promise<HotSpot[]> {
    const hotSpots: HotSpot[] = [];
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: this.rootPath,
      absolute: true,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**'],
    });

    for (const file of files.slice(0, 200)) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }

      const complexityScore = this.calculateCyclomaticComplexity(content);
      const lines = content.split('\n').length;
      const normalizedComplexity = complexityScore / Math.max(lines / 100, 1);

      const bugDensity = this.countBugPatterns(content);
      const changeFrequency = this.estimateChangeFrequency(file);

      const riskLevel = this.classifyRiskLevel(normalizedComplexity, bugDensity, changeFrequency);

      hotSpots.push({
        filePath: relative(this.rootPath, file),
        changeFrequency,
        bugDensity,
        complexityScore: normalizedComplexity,
        riskLevel,
      });
    }

    return hotSpots
      .filter(h => h.riskLevel !== 'low')
      .sort((a, b) => this.riskScore(b) - this.riskScore(a))
      .slice(0, 50);
  }

  private countBugPatterns(content: string): number {
    let count = 0;
    const bugPatterns = [
      /TODO.*fix/gi,
      /FIXME/gi,
      /HACK/gi,
      /XXX/gi,
      /BUG/gi,
      /WORKAROUND/gi,
      /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g,
      /catch\s*\(\s*\w*\s*\)\s*\{\s*\/\/.*\s*\}/g,
    ];
    for (const pattern of bugPatterns) {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }

  private estimateChangeFrequency(filePath: string): number {
    for (const pattern of FILE_CHANGE_PATTERNS) {
      const name = basename(filePath);
      const glob = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
      if (name.toLowerCase().includes(glob.toLowerCase().replace('/', ''))) {
        return 0.8;
      }
    }

    const complexity = this.fileContents.has(filePath)
      ? this.calculateCyclomaticComplexity(this.fileContents.get(filePath)!)
      : 0;

    return Math.min(complexity / 50, 1);
  }

  private classifyRiskLevel(
    complexity: number,
    bugs: number,
    changeFreq: number
  ): HotSpot['riskLevel'] {
    const score = complexity * 0.4 + bugs * 0.3 + changeFreq * 0.3;
    if (score > 0.8) return 'critical';
    if (score > 0.6) return 'high';
    if (score > 0.3) return 'medium';
    return 'low';
  }

  private riskScore(hotspot: HotSpot): number {
    const riskMap = { critical: 4, high: 3, medium: 2, low: 1 };
    return riskMap[hotspot.riskLevel] + hotspot.complexityScore * 0.1;
  }

  private buildTechnologyMatrix(): TechnologyMatrix {
    const languages = new Map<string, AgentType[]>();
    const frameworks = new Map<string, AgentType[]>();
    const patterns = new Map<string, AgentType[]>();

    for (const lang of this.projectProfile.languages) {
      const agents = TECHNOLOGY_AGENT_MAP[lang.name.toLowerCase()] || ['feature-coder', 'code-reviewer'];
      languages.set(lang.name, agents);
    }

    for (const fw of this.projectProfile.frameworks) {
      const agents = FRAMEWORK_AGENT_MAP[fw.name.toLowerCase()] || ['feature-coder'];
      frameworks.set(fw.name, agents);
    }

    patterns.set('error-handling', ['bug-fixer', 'type-fixer']);
    patterns.set('testing', ['test-writer', 'e2e-test-engineer']);
    patterns.set('security', ['security-scanner', 'auth-architect']);
    patterns.set('performance', ['performance-profiler', 'cache-strategist']);
    patterns.set('documentation', ['doc-generator']);

    return { languages, frameworks, patterns };
  }

  private recommendDistribution(
    modules: ModuleBoundary[],
    edges: DependencyEdge[]
  ): RecommendedDistribution {
    const agentTypeScores = new Map<AgentType, number>();
    const moduleAssignments = new Map<string, AgentType[]>();

    for (const mod of modules) {
      const candidates = this.findBestAgentsForModule(mod, edges);
      moduleAssignments.set(mod.id, candidates);

      for (const agent of candidates) {
        agentTypeScores.set(agent, (agentTypeScores.get(agent) || 0) + 1);
      }
    }

    const sortedAgents = Array.from(agentTypeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([agent]) => agent);

    const parallelGroups = this.findParallelizableGroups(modules, edges);
    const sequentialChain = this.topologicalSort(modules, edges);

    return {
      preferredAgentTypes: sortedAgents.slice(0, 15),
      moduleAssignments,
      parallelizableModules: parallelGroups,
      sequentialChain,
    };
  }

  private findBestAgentsForModule(mod: ModuleBoundary, edges: DependencyEdge[]): AgentType[] {
    const candidates: AgentType[] = [];

    for (const tech of mod.technologyStack) {
      const techAgents = TECHNOLOGY_AGENT_MAP[tech] || [];
      candidates.push(...techAgents);
    }

    if (mod.complexity.score > 0.7) {
      candidates.push('refactorer', 'code-reviewer');
    }

    if (mod.files.some(f => f.includes('.test.') || f.includes('.spec.'))) {
      candidates.push('test-writer');
    }

    if (mod.files.some(f => f.includes('security') || f.includes('auth'))) {
      candidates.push('security-scanner');
    }

    const deps = edges.filter(e => e.to === mod.id);
    if (deps.length > 3) {
      candidates.push('architect');
    }

    const unique = [...new Set(candidates)];
    return unique.length > 0 ? unique : ['feature-coder'];
  }

  private findParallelizableGroups(
    modules: ModuleBoundary[],
    edges: DependencyEdge[]
  ): string[][] {
    const groups: string[][] = [];
    const visited = new Set<string>();

    const adjList = new Map<string, Set<string>>();
    for (const mod of modules) {
      adjList.set(mod.id, new Set());
    }
    for (const edge of edges) {
      adjList.get(edge.from)?.add(edge.to);
    }

    for (const mod of modules) {
      if (visited.has(mod.id)) continue;

      const group: string[] = [];
      const queue = [mod.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;

        const dependents = adjList.get(current) || new Set();
        const allDepsResolved = [...dependents].every(d => visited.has(d));

        if (allDepsResolved || dependents.size === 0) {
          group.push(current);
          visited.add(current);
        }
      }

      if (group.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  private topologicalSort(modules: ModuleBoundary[], edges: DependencyEdge[]): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const mod of modules) {
      inDegree.set(mod.id, 0);
      adjList.set(mod.id, []);
    }

    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      adjList.get(edge.from)?.push(edge.to);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjList.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  private emptyComplexity(): ModuleComplexity {
    return { linesOfCode: 0, cyclomaticComplexity: 0, nestingDepth: 0, fileCount: 0, avgFileSize: 0, score: 0 };
  }

  private emptyOwnership(): OwnershipInfo {
    return { primaryOwner: 'unknown', contributors: [], lastModified: new Date(), changeFrequency: 0 };
  }

  async getModuleFiles(moduleId: string, modules: ModuleBoundary[]): Promise<string[]> {
    const mod = modules.find(m => m.id === moduleId);
    return mod?.files || [];
  }

  getModuleComplexityReport(modules: ModuleBoundary[]): string {
    const lines = ['Module Complexity Report:', ''];
    for (const mod of modules.sort((a, b) => b.complexity.score - a.complexity.score)) {
      lines.push(`  ${mod.name} (${mod.type})`);
      lines.push(`    LOC: ${mod.complexity.linesOfCode} | Cyclomatic: ${mod.complexity.cyclomaticComplexity}`);
      lines.push(`    Nesting: ${mod.complexity.nestingDepth} | Files: ${mod.complexity.fileCount}`);
      lines.push(`    Score: ${mod.complexity.score}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}
