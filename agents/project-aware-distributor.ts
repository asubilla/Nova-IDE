import type {
  ProjectProfile,
  AgentType,
  AgentTask,
  AgentDistributionStrategy,
} from '../core/types';

export interface ProjectAnalysis {
  projectType:
    | 'monolith'
    | 'microservices'
    | 'serverless'
    | 'library'
    | 'cli'
    | 'mobile'
    | 'monorepo';
  primaryLanguage: string;
  languages: { name: string; percentage: number; complexity: number }[];
  frameworks: string[];
  architecture: string;
  teamSize: number;
  codebaseSize: 'small' | 'medium' | 'large' | 'enterprise';
  testCoverage: number;
  technicalDebt: 'low' | 'medium' | 'high' | 'critical';
  securityScore: number;
  performanceScore: number;
  areas: ProjectArea[];
}

export interface ProjectArea {
  name: string;
  path: string;
  type: 'source' | 'test' | 'config' | 'docs' | 'infrastructure';
  complexity: number;
  health: number;
  recentChanges: number;
  suggestedAgents: AgentType[];
}

export interface DistributionPlan {
  totalAgents: number;
  phases: DistributionPhase[];
  criticalPath: string[];
  parallelGroups: string[][];
  estimatedDurationMs: number;
  resourceRequirements: { totalMemoryMB: number; totalCpuPercent: number };
  riskLevel: 'low' | 'medium' | 'high';
}

export interface DistributionPhase {
  id: string;
  name: string;
  agentTypes: AgentType[];
  dependencies: string[];
  estimatedDurationMs: number;
  priority: number;
}

export interface DecomposedTask {
  id: string;
  description: string;
  suggestedAgentType: AgentType;
  priority: number;
  dependencies: string[];
  estimatedDurationMs: number;
  filesInvolved: string[];
  complexity: 'low' | 'medium' | 'high' | 'expert';
}

export interface ResolvedDependencyGraph {
  tasks: DecomposedTask[];
  edges: { from: string; to: string; type: 'hard' | 'soft' }[];
  levels: string[][];
  criticalPath: string[];
  totalDuration: number;
}

const AGENT_RESOURCE_MAP: Record<
  string,
  { memoryMB: number; cpuPercent: number; baseDurationMs: number }
> = {
  coder: { memoryMB: 512, cpuPercent: 30, baseDurationMs: 30000 },
  reviewer: { memoryMB: 256, cpuPercent: 20, baseDurationMs: 15000 },
  tester: { memoryMB: 512, cpuPercent: 40, baseDurationMs: 45000 },
  debugger: { memoryMB: 384, cpuPercent: 35, baseDurationMs: 25000 },
  architect: { memoryMB: 256, cpuPercent: 15, baseDurationMs: 20000 },
  devops: { memoryMB: 384, cpuPercent: 25, baseDurationMs: 35000 },
  security: { memoryMB: 256, cpuPercent: 20, baseDurationMs: 20000 },
  performance: { memoryMB: 384, cpuPercent: 30, baseDurationMs: 30000 },
  documentation: { memoryMB: 128, cpuPercent: 10, baseDurationMs: 10000 },
  refactoring: { memoryMB: 384, cpuPercent: 25, baseDurationMs: 40000 },
  migration: { memoryMB: 512, cpuPercent: 30, baseDurationMs: 50000 },
  analysis: { memoryMB: 256, cpuPercent: 15, baseDurationMs: 15000 },
};

const LANGUAGE_COMPLEXITY: Record<string, number> = {
  typescript: 0.7,
  javascript: 0.6,
  python: 0.5,
  java: 0.75,
  csharp: 0.75,
  go: 0.65,
  rust: 0.85,
  cpp: 0.9,
  c: 0.85,
  ruby: 0.55,
  php: 0.5,
  swift: 0.7,
  kotlin: 0.7,
  scala: 0.8,
  haskell: 0.9,
  elixir: 0.65,
};

const FRAMEWORK_PATTERNS: Record<string, string[]> = {
  react: ['frontend', 'spa', 'component'],
  vue: ['frontend', 'spa', 'component'],
  angular: ['frontend', 'spa', 'enterprise'],
  nextjs: ['frontend', 'ssr', 'fullstack'],
  nestjs: ['backend', 'api', 'enterprise'],
  express: ['backend', 'api', 'middleware'],
  fastify: ['backend', 'api', 'performance-profiler'],
  django: ['backend', 'api', 'batteries'],
  flask: ['backend', 'api', 'minimal'],
  spring: ['backend', 'api', 'enterprise'],
  laravel: ['backend', 'api', 'batteries'],
  rails: ['backend', 'api', 'batteries'],
  docker: ['infrastructure', 'containerization'],
  kubernetes: ['infrastructure', 'orchestration'],
  terraform: ['infrastructure', 'iac'],
  webpack: ['build', 'bundler'],
  vite: ['build', 'bundler', 'devserver'],
  jest: ['testing', 'unit'],
  pytest: ['testing', 'unit'],
  mocha: ['testing', 'unit'],
};

const TASK_KEYWORD_MAP: Record<string, AgentType[]> = {
  fix: ['bug-fixer', 'feature-coder'],
  bug: ['bug-fixer', 'feature-coder'],
  error: ['bug-fixer', 'feature-coder'],
  crash: ['bug-fixer', 'feature-coder'],
  debug: ['bug-fixer'],
  test: ['test-writer'],
  spec: ['test-writer'],
  coverage: ['test-writer'],
  refactor: ['refactorer', 'architect'],
  restructure: ['refactorer', 'architect'],
  clean: ['refactorer'],
  optimize: ['performance-profiler', 'refactorer'],
  performance: ['performance-profiler'],
  speed: ['performance-profiler'],
  slow: ['performance-profiler'],
  memory: ['performance-profiler'],
  security: ['security-scanner'],
  vulnerability: ['security-scanner'],
  auth: ['security-scanner'],
  encrypt: ['security-scanner'],
  deploy: ['deployer'],
  ci: ['deployer'],
  cd: ['deployer'],
  docker: ['deployer'],
  kubernetes: ['deployer'],
  pipeline: ['deployer'],
  documentation: ['doc-generator'],
  readme: ['doc-generator'],
  doc: ['doc-generator'],
  api: ['feature-coder', 'architect'],
  endpoint: ['feature-coder', 'architect'],
  feature: ['feature-coder', 'architect'],
  implement: ['feature-coder'],
  create: ['feature-coder', 'architect'],
  build: ['feature-coder', 'architect'],
  migrate: ['migrator', 'feature-coder'],
  migration: ['migrator', 'feature-coder'],
  upgrade: ['migrator', 'feature-coder'],
  architecture: ['architect'],
  design: ['architect'],
  plan: ['architect'],
  analyze: ['code-reviewer'],
  review: ['code-reviewer'],
  audit: ['code-reviewer', 'security-scanner'],
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateId(): string {
  return `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function classifyCodebaseSize(totalFiles: number): ProjectAnalysis['codebaseSize'] {
  if (totalFiles < 50) return 'small';
  if (totalFiles < 500) return 'medium';
  if (totalFiles < 5000) return 'large';
  return 'enterprise';
}

function classifyTechnicalDebt(
  ratio: number,
): ProjectAnalysis['technicalDebt'] {
  if (ratio < 0.1) return 'low';
  if (ratio < 0.25) return 'medium';
  if (ratio < 0.5) return 'high';
  return 'critical';
}

export class ProjectAwareDistributor {
  private projectProfile: ProjectProfile;
  private analysis: ProjectAnalysis;

  constructor(projectProfile: ProjectProfile) {
    this.projectProfile = projectProfile;
    this.analysis = this.analyzeProject();
  }

  analyzeProject(): ProjectAnalysis {
    const projectType = this.detectProjectType() as ProjectAnalysis['projectType'];
    const languages = this.extractLanguages();
    const frameworks = this.extractFrameworks();
    const architecture = this.detectArchitecturePattern();
    const teamSize = this.estimateTeamSize();
    const healthMetrics = this.assessCodebaseHealth();
    const areas = this.identifyProjectAreas();
    const primaryLanguage =
      languages.length > 0
        ? languages.sort((a, b) => b.percentage - a.percentage)[0].name
        : 'unknown';

    const codebaseSize = classifyCodebaseSize(
      areas.filter((a) => a.type === 'source').length * 25,
    );

    return {
      projectType,
      primaryLanguage,
      languages,
      frameworks,
      architecture,
      teamSize,
      codebaseSize,
      testCoverage: healthMetrics.testCoverage,
      technicalDebt: healthMetrics.technicalDebt,
      securityScore: healthMetrics.securityScore,
      performanceScore: healthMetrics.performanceScore,
      areas,
    };
  }

  detectProjectType(): string {
    const files = this.projectProfile.files ?? [];
    const configFiles = files.filter(
      (f: string) =>
        f.endsWith('package.json') ||
        f.endsWith('tsconfig.json') ||
        f.endsWith('Cargo.toml') ||
        f.endsWith('go.mod') ||
        f.endsWith('pyproject.toml'),
    );
    const hasDocker = files.some(
      (f: string) => f.includes('Dockerfile') || f.includes('docker-compose'),
    );
    const hasK8s = files.some(
      (f: string) => f.includes('k8s') || f.includes('kubernetes'),
    );
    const hasServerless =
      files.some(
        (f: string) =>
          f.includes('serverless.yml') || f.includes('SAM') || f.includes('function'),
      );
    const hasMobile = files.some(
      (f: string) =>
        f.includes('android') ||
        f.includes('ios') ||
        f.includes('.xcodeproj') ||
        f.includes('Podfile'),
    );
    const hasMultiplePackages = files.filter((f: string) => f.endsWith('package.json'))
      .length > 1;
    const hasWorkspaces = files.some(
      (f: string) => f.includes('lerna.json') || f.includes('pnpm-workspace'),
    );

    if (hasMultiplePackages || hasWorkspaces) return 'monorepo';
    if (hasMobile) return 'mobile';
    if (hasServerless) return 'serverless';
    if (hasK8s && hasDocker) return 'microservices';
    if (hasDocker) return 'microservices';

    const isLibrary = files.some(
      (f: string) =>
        f.includes('src/index') &&
        (f.includes('package.json') || f.includes('setup.py')),
    );
    if (isLibrary && !files.some((f: string) => f.includes('server'))) return 'library';

    const isCLI = files.some(
      (f: string) =>
        f.includes('bin/') ||
        f.includes('cli.') ||
        f.includes('commander') ||
        f.includes('yargs'),
    );
    if (isCLI) return 'cli';

    return 'monolith';
  }

  extractLanguages(): { name: string; percentage: number; complexity: number }[] {
    const files = this.projectProfile.files ?? [];
    const extCounts: Record<string, number> = {};
    const extToLang: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      hs: 'haskell',
      ex: 'elixir',
      exs: 'elixir',
    };

    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase();
      if (ext && extToLang[ext]) {
        const lang = extToLang[ext];
        extCounts[lang] = (extCounts[lang] || 0) + 1;
      }
    }

    const total = Object.values(extCounts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return [{ name: 'typescript', percentage: 100, complexity: 0.7 }];
    }

    return Object.entries(extCounts)
      .map(([name, count]) => ({
        name,
        percentage: Math.round((count / total) * 100),
        complexity: LANGUAGE_COMPLEXITY[name] ?? 0.5,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  extractFrameworks(): string[] {
    const files = this.projectProfile.files ?? [];
    const detected: string[] = [];

    const frameworkIndicators: Record<string, string[]> = {
      react: ['react', 'jsx', 'tsx', 'next.config'],
      vue: ['vue', 'nuxt.config'],
      angular: ['angular', '@angular'],
      nextjs: ['next.config', '.next'],
      nestjs: ['@nestjs', 'nest-cli'],
      express: ['express'],
      fastify: ['fastify'],
      django: ['django', 'manage.py'],
      flask: ['flask'],
      spring: ['spring', 'pom.xml'],
      laravel: ['laravel'],
      rails: ['rails', 'Gemfile'],
      docker: ['Dockerfile', 'docker-compose'],
      kubernetes: ['k8s', 'kubernetes', 'helm'],
      terraform: ['terraform', '.tf'],
      webpack: ['webpack.config'],
      vite: ['vite.config'],
      jest: ['jest.config', '.test.', '.spec.'],
      pytest: ['pytest', 'conftest.py'],
      mocha: ['.mocharc', 'mocha'],
    };

    for (const file of files) {
      for (const [framework, indicators] of Object.entries(frameworkIndicators)) {
        if (
          indicators.some(
            (indicator) =>
              file.toLowerCase().includes(indicator.toLowerCase()),
          )
        ) {
          if (!detected.includes(framework)) {
            detected.push(framework);
          }
        }
      }
    }

    return detected;
  }

  assessCodebaseHealth(): {
    testCoverage: number;
    technicalDebt: 'low' | 'medium' | 'high' | 'critical';
    securityScore: number;
    performanceScore: number;
  } {
    const files = this.projectProfile.files ?? [];
    const testFiles = files.filter(
      (f) =>
        f.includes('.test.') ||
        f.includes('.spec.') ||
        f.includes('test/') ||
        f.includes('__tests__/'),
    );
    const sourceFiles = files.filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py')) &&
        !f.includes('.test.') &&
        !f.includes('.spec.'),
    );

    const testRatio =
      sourceFiles.length > 0 ? testFiles.length / sourceFiles.length : 0;
    const testCoverage = Math.min(100, Math.round(testRatio * 150));

    const configFiles = files.filter(
      (f) =>
        f.includes('.eslintrc') ||
        f.includes('tsconfig') ||
        f.includes('prettier') ||
        f.includes('.editorconfig'),
    );
    const hasCI = files.some(
      (f) =>
        f.includes('.github/workflows') ||
        f.includes('.gitlab-ci') ||
        f.includes('Jenkinsfile'),
    );
    const hasLinting = configFiles.some((f) => f.includes('.eslintrc'));

    let debtScore = 0;
    if (!hasLinting) debtScore += 0.2;
    if (!hasCI) debtScore += 0.15;
    if (testRatio < 0.3) debtScore += 0.25;
    if (files.length > 1000 && testRatio < 0.1) debtScore += 0.2;

    const technicalDebt = classifyTechnicalDebt(debtScore);

    const securityIndicators = files.filter(
      (f) =>
        f.includes('.env') ||
        f.includes('secret') ||
        f.includes('credential') ||
        f.includes('auth'),
    );
    const hasSecurityConfig = files.some(
      (f) =>
        f.includes('.snyk') ||
        f.includes('security-scanner') ||
        f.includes('owasp'),
    );
    const securityScore = Math.min(
      100,
      60 +
        (hasSecurityConfig ? 20 : 0) -
        Math.min(20, securityIndicators.length * 2),
    );

    const perfScore = Math.min(
      100,
      50 + testRatio * 30 + (hasCI ? 10 : 0) + (hasLinting ? 10 : 0),
    );

    return {
      testCoverage,
      technicalDebt,
      securityScore: Math.max(0, securityScore),
      performanceScore: Math.max(0, Math.round(perfScore)),
    };
  }

  identifyProjectAreas(): ProjectArea[] {
    const files = this.projectProfile.files ?? [];
    const pathMap = new Map<string, string[]>();

    for (const file of files) {
      const parts = file.replace(/\\/g, '/').split('/');
      if (parts.length >= 2) {
        const areaName = parts.slice(0, Math.min(2, parts.length)).join('/');
        if (!pathMap.has(areaName)) {
          pathMap.set(areaName, []);
        }
        pathMap.get(areaName)!.push(file);
      }
    }

    const areas: ProjectArea[] = [];

    for (const [name, areaFiles] of pathMap) {
      const isTest = areaFiles.some(
        (f) => f.includes('test') || f.includes('spec') || f.includes('__tests__'),
      );
      const isConfig = areaFiles.some(
        (f) =>
          f.includes('config') ||
          f.includes('.rc') ||
          f.endsWith('.json') ||
          f.endsWith('.yml') ||
          f.endsWith('.yaml'),
      );
      const isDocs = areaFiles.some(
        (f) =>
          f.includes('docs') ||
          f.includes('readme') ||
          f.endsWith('.md') ||
          f.endsWith('.mdx'),
      );
      const isInfra = areaFiles.some(
        (f) =>
          f.includes('docker') ||
          f.includes('k8s') ||
          f.includes('terraform') ||
          f.includes('.tf') ||
          f.includes('deploy'),
      );

      let type: ProjectArea['type'] = 'source';
      if (isTest) type = 'test';
      else if (isConfig) type = 'config';
      else if (isDocs) type = 'docs';
      else if (isInfra) type = 'infrastructure';

      const complexity = this.assessAreaComplexity(name);
      const health = this.assessAreaHealth(name);

      areas.push({
        name,
        path: name,
        type,
        complexity,
        health,
        recentChanges: Math.floor(hashString(name) % 20),
        suggestedAgents: this.getAgentRecommendationsForArea(type, complexity, health),
      });
    }

    return areas.slice(0, 25);
  }

  private getAgentRecommendationsForArea(
    type: ProjectArea['type'],
    complexity: number,
    health: number,
  ): AgentType[] {
    const agents: AgentType[] = [];

    switch (type) {
      case 'source':
        agents.push('feature-coder');
        if (complexity > 0.7) agents.push('architect');
        if (health < 0.4) agents.push('refactorer');
        break;
      case 'test':
        agents.push('test-writer');
        if (health < 0.5) agents.push('feature-coder');
        break;
      case 'config':
        agents.push('deployer');
        if (complexity > 0.6) agents.push('architect');
        break;
      case 'docs':
        agents.push('doc-generator');
        break;
      case 'infrastructure':
        agents.push('deployer');
        if (complexity > 0.7) agents.push('security-scanner');
        break;
    }

    return agents.length > 0 ? agents : ['code-reviewer'];
  }

  assessAreaComplexity(areaPath: string): number {
    const hash = hashString(areaPath);
    return (hash % 100) / 100;
  }

  assessAreaHealth(areaPath: string): number {
    const hash = hashString(areaPath + ':health');
    return 0.3 + ((hash % 70) / 100);
  }

  detectArchitecturePattern(): string {
    const frameworks = this.extractFrameworks();
    const files = this.projectProfile.files ?? [];

    if (frameworks.includes('kubernetes') || frameworks.includes('docker')) {
      return 'microservices';
    }
    if (frameworks.some((f) => ['nextjs', 'nuxt'].includes(f))) {
      return 'fullstack-ssr';
    }
    if (frameworks.some((f) => ['react', 'vue', 'angular'].includes(f))) {
      return 'spa-frontend';
    }
    if (frameworks.some((f) => ['express', 'fastify', 'nest'].includes(f))) {
      return 'rest-api';
    }
    if (frameworks.some((f) => ['django', 'rails', 'laravel'].includes(f))) {
      return 'mvc';
    }

    const hasMultipleServices =
      files.filter((f) => f.includes('service')).length > 3;
    if (hasMultipleServices) return 'service-oriented';

    return 'monolithic';
  }

  estimateTeamSize(): number {
    const files = this.projectProfile.files ?? [];
    const uniqueDirs = new Set(
      files.map((f) => f.replace(/\\/g, '/').split('/').slice(0, 2).join('/')),
    );
    const complexity = this.extractLanguages().reduce(
      (max, lang) => Math.max(max, lang.complexity),
      0,
    );
    const base = Math.ceil(uniqueDirs.size / 3);
    return Math.max(1, Math.min(50, Math.round(base * (1 + complexity))));
  }

  createDistributionPlan(
    taskDescription: string,
    availableAgentTypes: AgentType[],
  ): DistributionPlan {
    const required = this.identifyRequiredAgents(taskDescription);
    const agents = required.filter((a) => availableAgentTypes.includes(a));
    const allAgents = agents.length > 0 ? agents : availableAgentTypes.slice(0, 3);

    const dependencies = this.resolveDependencies(allAgents);
    const phases = this.createPhasesFromAgents(allAgents, dependencies);
    const parallelGroups = this.groupParallelAgents(allAgents, dependencies);
    const criticalPath = this.findCriticalPath(phases);
    const estimatedPhases = this.estimatePhaseDurations(phases);
    const resourceRequirements = this.calculateResourceRequirements(allAgents);

    const totalDuration = estimatedPhases.reduce(
      (sum, p) => sum + p.estimatedDurationMs,
      0,
    );

    const plan: DistributionPlan = {
      totalAgents: allAgents.length,
      phases: estimatedPhases,
      criticalPath,
      parallelGroups,
      estimatedDurationMs: totalDuration,
      resourceRequirements,
      riskLevel: this.assessRisk({
        totalAgents: allAgents.length,
        phases: estimatedPhases,
        criticalPath,
        parallelGroups,
        estimatedDurationMs: totalDuration,
        resourceRequirements,
        riskLevel: 'low',
      }),
    };

    return plan;
  }

  identifyRequiredAgents(taskDescription: string): AgentType[] {
    const mapped = this.mapTaskToAgentTypes(taskDescription);
    return Array.from(mapped.entries())
      .filter(([, info]) => info.relevance > 0.3)
      .sort((a, b) => b[1].relevance - a[1].relevance)
      .map(([agentType]) => agentType);
  }

  identifyOptionalAgents(
    taskDescription: string,
    plan: DistributionPlan,
  ): AgentType[] {
    const mapped = this.mapTaskToAgentTypes(taskDescription);
    const usedAgents = new Set(
      plan.phases.flatMap((p) => p.agentTypes),
    );

    return Array.from(mapped.entries())
      .filter(
        ([agentType, info]) =>
          info.relevance > 0.1 &&
          !usedAgents.has(agentType) &&
          info.priority < 0.7,
      )
      .map(([agentType]) => agentType);
  }

  resolveDependencies(agents: AgentType[]): string[][] {
    const dependencyRules: Record<string, string[]> = {
      tester: ['feature-coder'],
      reviewer: ['feature-coder'],
      debugger: ['feature-coder'],
      documentation: ['feature-coder', 'architect'],
      devops: ['feature-coder'],
      security: ['feature-coder', 'architect'],
      performance: ['feature-coder'],
      refactoring: ['feature-coder', 'architect'],
      migration: ['feature-coder', 'architect'],
    };

    const edges: string[][] = [];
    for (const agent of agents) {
      const deps = dependencyRules[agent] ?? [];
      for (const dep of deps) {
        if (agents.includes(dep as AgentType)) {
          edges.push([dep, agent]);
        }
      }
    }

    return edges;
  }

  findCriticalPath(phases: DistributionPhase[]): string[] {
    if (phases.length === 0) return [];

    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const duration = new Map<string, number>();

    for (const phase of phases) {
      adjList.set(phase.id, []);
      inDegree.set(phase.id, 0);
      duration.set(phase.id, phase.estimatedDurationMs);
    }

    for (const phase of phases) {
      for (const dep of phase.dependencies) {
        if (adjList.has(dep)) {
          adjList.get(dep)!.push(phase.id);
          inDegree.set(phase.id, (inDegree.get(phase.id) ?? 0) + 1);
        }
      }
    }

    const earliest = new Map<string, number>();
    const queue: string[] = [];

    for (const phase of phases) {
      if ((inDegree.get(phase.id) ?? 0) === 0) {
        earliest.set(phase.id, 0);
        queue.push(phase.id);
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currEnd = earliest.get(curr)! + (duration.get(curr) ?? 0);

      for (const next of adjList.get(curr) ?? []) {
        const prevEnd = earliest.get(next) ?? 0;
        earliest.set(next, Math.max(prevEnd, currEnd));
        const newDegree = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDegree);
        if (newDegree === 0) {
          queue.push(next);
        }
      }
    }

    let maxEnd = 0;
    let lastPhase = phases[0]?.id ?? '';
    for (const [id, end] of earliest) {
      const total = end + (duration.get(id) ?? 0);
      if (total > maxEnd) {
        maxEnd = total;
        lastPhase = id;
      }
    }

    const criticalPath: string[] = [lastPhase];
    let current = lastPhase;
    const visited = new Set<string>([current]);

    while (true) {
      let found = false;
      for (const [id, edges] of adjList) {
        if (edges.includes(current) && !visited.has(id)) {
          const idEnd = earliest.get(id)! + (duration.get(id) ?? 0);
          if (Math.abs(idEnd - (earliest.get(current) ?? 0)) < 1) {
            criticalPath.unshift(id);
            visited.add(id);
            current = id;
            found = true;
            break;
          }
        }
      }
      if (!found) break;
    }

    return criticalPath;
  }

  groupParallelAgents(
    agents: AgentType[],
    dependencies: string[][],
  ): string[][] {
    const depMap = new Map<string, Set<string>>();
    for (const agent of agents) {
      depMap.set(agent, new Set());
    }

    for (const [from, to] of dependencies) {
      if (depMap.has(to)) {
        depMap.get(to)!.add(from);
      }
    }

    const groups: string[][] = [];
    const assigned = new Set<string>();

    while (assigned.size < agents.length) {
      const group: string[] = [];
      for (const agent of agents) {
        if (assigned.has(agent)) continue;
        const deps = depMap.get(agent);
        if (!deps || [...deps].every((d) => assigned.has(d))) {
          group.push(agent);
        }
      }
      if (group.length === 0) {
        for (const agent of agents) {
          if (!assigned.has(agent)) {
            group.push(agent);
            break;
          }
        }
      }
      for (const g of group) {
        assigned.add(g);
      }
      groups.push(group);
    }

    return groups;
  }

  estimatePhaseDurations(phases: DistributionPhase[]): DistributionPhase[] {
    return phases.map((phase) => {
      const baseDuration = phase.agentTypes.reduce((sum, agent) => {
        const resources = AGENT_RESOURCE_MAP[agent];
        return sum + (resources?.baseDurationMs ?? 20000);
      }, 0);

      const parallelism = Math.max(1, phase.agentTypes.length * 0.6);
      const estimatedDurationMs = Math.round(baseDuration / parallelism);

      return { ...phase, estimatedDurationMs };
    });
  }

  calculateResourceRequirements(
    agents: AgentType[],
  ): { totalMemoryMB: number; totalCpuPercent: number } {
    let totalMemoryMB = 0;
    let totalCpuPercent = 0;

    for (const agent of agents) {
      const resources = AGENT_RESOURCE_MAP[agent];
      if (resources) {
        totalMemoryMB += resources.memoryMB;
        totalCpuPercent += resources.cpuPercent;
      } else {
        totalMemoryMB += 256;
        totalCpuPercent += 20;
      }
    }

    return {
      totalMemoryMB: Math.round(totalMemoryMB),
      totalCpuPercent: Math.min(100, Math.round(totalCpuPercent)),
    };
  }

  assessRisk(plan: DistributionPlan): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    if (plan.totalAgents > 8) riskScore += 2;
    else if (plan.totalAgents > 5) riskScore += 1;

    if (plan.criticalPath.length > 5) riskScore += 2;
    else if (plan.criticalPath.length > 3) riskScore += 1;

    if (plan.resourceRequirements.totalCpuPercent > 80) riskScore += 2;
    else if (plan.resourceRequirements.totalCpuPercent > 60) riskScore += 1;

    if (plan.resourceRequirements.totalMemoryMB > 3000) riskScore += 2;
    else if (plan.resourceRequirements.totalMemoryMB > 2000) riskScore += 1;

    if (plan.estimatedDurationMs > 300000) riskScore += 1;

    if (riskScore >= 5) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  optimizeForSpeed(plan: DistributionPlan): DistributionPlan {
    const optimized = { ...plan };

    optimized.phases = plan.phases.map((phase) => ({
      ...phase,
      agentTypes: phase.agentTypes.length > 1 ? phase.agentTypes : phase.agentTypes,
      estimatedDurationMs: Math.round(phase.estimatedDurationMs * 0.8),
    }));

    optimized.parallelGroups = this.groupParallelAgents(
      plan.phases.flatMap((p) => p.agentTypes),
      this.resolveDependencies(plan.phases.flatMap((p) => p.agentTypes)),
    );

    optimized.estimatedDurationMs = optimized.phases.reduce(
      (sum, p) => sum + p.estimatedDurationMs,
      0,
    );

    optimized.resourceRequirements = {
      totalMemoryMB: Math.round(plan.resourceRequirements.totalMemoryMB * 1.2),
      totalCpuPercent: Math.min(
        100,
        Math.round(plan.resourceRequirements.totalCpuPercent * 1.3),
      ),
    };

    return optimized;
  }

  optimizeForQuality(plan: DistributionPlan): DistributionPlan {
    const optimized = { ...plan };

    const hasReviewer = plan.phases.some((p) =>
      p.agentTypes.includes('code-reviewer' as AgentType),
    );
    if (!hasReviewer && optimized.phases.length > 0) {
      const lastPhase = optimized.phases[optimized.phases.length - 1];
      optimized.phases[optimized.phases.length - 1] = {
        ...lastPhase,
        agentTypes: [...lastPhase.agentTypes, 'code-reviewer' as AgentType],
        estimatedDurationMs: Math.round(lastPhase.estimatedDurationMs * 1.3),
      };
    }

    const hasTester = plan.phases.some((p) =>
      p.agentTypes.includes('test-writer' as AgentType),
    );
    if (!hasTester && optimized.phases.length > 0) {
      const lastPhase = optimized.phases[optimized.phases.length - 1];
      optimized.phases[optimized.phases.length - 1] = {
        ...lastPhase,
        agentTypes: [...lastPhase.agentTypes, 'test-writer' as AgentType],
        estimatedDurationMs: Math.round(lastPhase.estimatedDurationMs * 1.2),
      };
    }

    optimized.estimatedDurationMs = optimized.phases.reduce(
      (sum, p) => sum + p.estimatedDurationMs,
      0,
    );

    optimized.resourceRequirements = {
      totalMemoryMB: Math.round(plan.resourceRequirements.totalMemoryMB * 1.1),
      totalCpuPercent: Math.min(
        100,
        Math.round(plan.resourceRequirements.totalCpuPercent * 1.15),
      ),
    };

    return optimized;
  }

  optimizeForCost(plan: DistributionPlan): DistributionPlan {
    const optimized = { ...plan };

    optimized.phases = plan.phases.map((phase) => {
      if (phase.agentTypes.length > 2) {
        const trimmed = phase.agentTypes.slice(0, 2);
        return {
          ...phase,
          agentTypes: trimmed,
          estimatedDurationMs: Math.round(phase.estimatedDurationMs * 1.15),
        };
      }
      return phase;
    });

    optimized.totalAgents = optimized.phases.reduce(
      (sum, p) => sum + p.agentTypes.length,
      0,
    );

    optimized.estimatedDurationMs = optimized.phases.reduce(
      (sum, p) => sum + p.estimatedDurationMs,
      0,
    );

    optimized.resourceRequirements = {
      totalMemoryMB: Math.round(plan.resourceRequirements.totalMemoryMB * 0.8),
      totalCpuPercent: Math.round(plan.resourceRequirements.totalCpuPercent * 0.75),
    };

    return optimized;
  }

  balancePlan(plan: DistributionPlan): DistributionPlan {
    const speed = this.optimizeForSpeed(plan);
    const quality = this.optimizeForQuality(plan);
    const cost = this.optimizeForCost(plan);

    const balanced: DistributionPlan = {
      ...plan,
      totalAgents: Math.round(
        (speed.totalAgents + quality.totalAgents + cost.totalAgents) / 3,
      ),
      phases: plan.phases.map((phase, i) => ({
        ...phase,
        estimatedDurationMs: Math.round(
          ((speed.phases[i]?.estimatedDurationMs ?? phase.estimatedDurationMs) +
            (quality.phases[i]?.estimatedDurationMs ?? phase.estimatedDurationMs) +
            (cost.phases[i]?.estimatedDurationMs ?? phase.estimatedDurationMs)) /
            3,
        ),
      })),
      estimatedDurationMs: Math.round(
        (speed.estimatedDurationMs +
          quality.estimatedDurationMs +
          cost.estimatedDurationMs) /
          3,
      ),
      resourceRequirements: {
        totalMemoryMB: Math.round(
          (speed.resourceRequirements.totalMemoryMB +
            quality.resourceRequirements.totalMemoryMB +
            cost.resourceRequirements.totalMemoryMB) /
            3,
        ),
        totalCpuPercent: Math.round(
          (speed.resourceRequirements.totalCpuPercent +
            quality.resourceRequirements.totalCpuPercent +
            cost.resourceRequirements.totalCpuPercent) /
            3,
        ),
      },
    };

    balanced.riskLevel = this.assessRisk(balanced);
    return balanced;
  }

  mapTaskToAgentTypes(
    taskDescription: string,
  ): Map<AgentType, { relevance: number; priority: number }> {
    const result = new Map<AgentType, { relevance: number; priority: number }>();
    const lower = taskDescription.toLowerCase();

    const wordScores = new Map<string, number>();
    for (const [keyword, agents] of Object.entries(TASK_KEYWORD_MAP)) {
      if (lower.includes(keyword)) {
        const existing = wordScores.get(keyword) ?? 0;
        wordScores.set(keyword, existing + 1);
        for (const agent of agents) {
          const prev = result.get(agent) ?? { relevance: 0, priority: 0 };
          result.set(agent, {
            relevance: Math.min(1, prev.relevance + 0.25),
            priority: Math.min(1, prev.priority + 0.15),
          });
        }
      }
    }

    const areaHints = this.analysis.areas;
    for (const area of areaHints) {
      for (const agent of area.suggestedAgents) {
        if (lower.includes(area.name.toLowerCase())) {
          const prev = result.get(agent) ?? { relevance: 0, priority: 0 };
          result.set(agent, {
            relevance: Math.min(1, prev.relevance + 0.15),
            priority: prev.priority,
          });
        }
      }
    }

    if (result.size === 0) {
      result.set('feature-coder', { relevance: 0.5, priority: 0.5 });
      result.set('code-reviewer', { relevance: 0.3, priority: 0.3 });
    }

    return result;
  }

  getAgentRecommendations(area: ProjectArea): AgentType[] {
    const base = this.getAgentRecommendationsForArea(
      area.type,
      area.complexity,
      area.health,
    );

    if (area.complexity > 0.8 && !base.includes('architect' as AgentType)) {
      base.push('architect' as AgentType);
    }
    if (area.health < 0.3 && !base.includes('refactorer' as AgentType)) {
      base.push('refactorer' as AgentType);
    }

    return base;
  }

  getSuggestedAgentCount(): number {
    const sizeMap: Record<string, number> = {
      small: 2,
      medium: 4,
      large: 6,
      enterprise: 8,
    };
    const base = sizeMap[this.analysis.codebaseSize] ?? 3;
    const complexityFactor =
      this.analysis.languages.reduce((max, l) => Math.max(max, l.complexity), 0);
    return Math.max(2, Math.min(12, Math.round(base * (0.8 + complexityFactor * 0.4))));
  }

  private createPhasesFromAgents(
    agents: AgentType[],
    dependencies: string[][],
  ): DistributionPhase[] {
    const groups = this.groupParallelAgents(agents, dependencies);
    const phases: DistributionPhase[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const agentDeps: string[] = [];

      for (const agent of group) {
        for (const [from, to] of dependencies) {
          if (to === agent && !group.includes(from)) {
            agentDeps.push(`phase-${i - 1}`);
          }
        }
      }

      phases.push({
        id: `phase-${i}`,
        name: `Phase ${i + 1}: ${group.join(', ')}`,
        agentTypes: group as AgentType[],
        dependencies: [...new Set(agentDeps)],
        estimatedDurationMs: 0,
        priority: i + 1,
      });
    }

    return phases;
  }
}

export class TaskDecomposer {
  private decomposedIdCounter = 0;

  decompose(
    userPrompt: string,
    projectAnalysis: ProjectAnalysis,
  ): DecomposedTask[] {
    const tasks: DecomposedTask[] = [];
    const sentences = userPrompt
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    for (const sentence of sentences) {
      const subtasks = this.decomposeSentence(sentence, projectAnalysis);
      tasks.push(...subtasks);
    }

    if (tasks.length === 0) {
      tasks.push({
        id: generateTaskId(),
        description: userPrompt,
        suggestedAgentType: 'feature-coder',
        priority: 1,
        dependencies: [],
        estimatedDurationMs: 30000,
        filesInvolved: [],
        complexity: 'medium',
      });
    }

    this.resolveInterTaskDependencies(tasks);
    this.sortTasksByPriority(tasks);

    return tasks;
  }

  private decomposeSentence(
    sentence: string,
    analysis: ProjectAnalysis,
  ): DecomposedTask[] {
    const tasks: DecomposedTask[] = [];
    const lower = sentence.toLowerCase();

    const actionSegments = this.splitOnActions(lower);

    for (const segment of actionSegments) {
      if (segment.trim().length < 3) continue;

      const agentType = this.classifySegment(segment, analysis);
      const complexity = this.estimateSegmentComplexity(segment, analysis);
      const priority = this.estimateSegmentPriority(segment);
      const estimatedDuration = this.estimateSegmentDuration(
        segment,
        agentType,
        complexity,
      );
      const files = this.extractFileHints(segment, analysis);

      tasks.push({
        id: generateTaskId(),
        description: segment.trim(),
        suggestedAgentType: agentType,
        priority,
        dependencies: [],
        estimatedDurationMs: estimatedDuration,
        filesInvolved: files,
        complexity,
      });
    }

    return tasks;
  }

  private splitOnActions(text: string): string[] {
    const conjunctions = [
      ' and ',
      ' then ',
      ' also ',
      ' additionally ',
      ' furthermore ',
      ' next ',
      ' after that ',
      ' plus ',
      ' as well as ',
    ];

    let segments: string[] = [text];
    for (const conj of conjunctions) {
      const newSegments: string[] = [];
      for (const seg of segments) {
        newSegments.push(...seg.split(conj));
      }
      segments = newSegments;
    }

    const actionVerbs = [
      'add',
      'create',
      'build',
      'fix',
      'update',
      'refactor',
      'remove',
      'delete',
      'implement',
      'change',
      'modify',
      'improve',
      'optimize',
      'test',
      'review',
      'deploy',
      'configure',
      'setup',
      'install',
      'migrate',
    ];

    const splitPoints: { index: number; length: number }[] = [];
    for (const segment of segments) {
      for (const verb of actionVerbs) {
        const regex = new RegExp(`(?:^|(?<=\\.\\s))(?:i\\s+)?(?:to\\s+)?${verb}\\b`, 'gi');
        let match;
        while ((match = regex.exec(segment)) !== null) {
          if (match.index > 0) {
            splitPoints.push({ index: match.index, length: match[0].length });
          }
        }
      }
    }

    if (splitPoints.length > 1) {
      const refined: string[] = [];
      let lastIdx = 0;
      for (const sp of splitPoints.sort((a, b) => a.index - b.index)) {
        if (sp.index > lastIdx) {
          refined.push(text.slice(lastIdx, sp.index).trim());
        }
        lastIdx = sp.index;
      }
      if (lastIdx < text.length) {
        refined.push(text.slice(lastIdx).trim());
      }
      if (refined.length > 0) {
        return refined;
      }
    }

    return segments;
  }

  private classifySegment(
    segment: string,
    analysis: ProjectAnalysis,
  ): AgentType {
    let bestAgent: AgentType = 'feature-coder';
    let bestScore = 0;

    for (const [keyword, agents] of Object.entries(TASK_KEYWORD_MAP)) {
      if (segment.includes(keyword)) {
        for (const agent of agents) {
          const score = 1;
          if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
          }
        }
      }
    }

    if (analysis.testCoverage < 30 && segment.includes('test')) {
      return 'test-writer';
    }

    if (analysis.technicalDebt === 'critical' && segment.includes('refactor')) {
      return 'refactorer';
    }

    return bestAgent;
  }

  private estimateSegmentComplexity(
    segment: string,
    analysis: ProjectAnalysis,
  ): DecomposedTask['complexity'] {
    let score = 0;

    if (segment.length > 100) score += 2;
    else if (segment.length > 50) score += 1;

    const complexWords = [
      'architecture',
      'migrator',
      'performance-profiler',
      'security-scanner',
      'encryption',
      'concurrent',
      'distributed',
      'optimize',
      'refactor',
      'integration',
    ];
    for (const word of complexWords) {
      if (segment.includes(word)) score += 1;
    }

    if (analysis.codebaseSize === 'enterprise') score += 1;
    if (analysis.codebaseSize === 'large') score += 0.5;

    const primaryLang =
      analysis.languages.length > 0 ? analysis.languages[0] : null;
    if (primaryLang && primaryLang.complexity > 0.8) score += 1;

    if (score >= 5) return 'expert';
    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  private estimateSegmentPriority(segment: string): number {
    const urgentKeywords = [
      'critical',
      'urgent',
      'asap',
      'immediately',
      'security-scanner',
      'vulnerability',
      'crash',
      'broken',
      'failing',
    ];
    const highKeywords = ['fix', 'bug', 'error', 'issue', 'problem'];
    const mediumKeywords = ['improve', 'optimize', 'update', 'change'];

    for (const kw of urgentKeywords) {
      if (segment.includes(kw)) return 1;
    }
    for (const kw of highKeywords) {
      if (segment.includes(kw)) return 2;
    }
    for (const kw of mediumKeywords) {
      if (segment.includes(kw)) return 3;
    }
    return 4;
  }

  private estimateSegmentDuration(
    segment: string,
    agentType: AgentType,
    complexity: DecomposedTask['complexity'],
  ): number {
    const base = AGENT_RESOURCE_MAP[agentType]?.baseDurationMs ?? 20000;

    const complexityMultiplier: Record<string, number> = {
      low: 0.5,
      medium: 1.0,
      high: 1.8,
      expert: 3.0,
    };

    const wordCount = segment.split(/\s+/).length;
    const lengthFactor = Math.max(1, wordCount / 20);

    return Math.round(
      base * (complexityMultiplier[complexity] ?? 1) * Math.min(2, lengthFactor),
    );
  }

  private extractFileHints(
    segment: string,
    analysis: ProjectAnalysis,
  ): string[] {
    const hints: string[] = [];

    const filePattern = /[\w/.-]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|rb|php)/g;
    let match;
    while ((match = filePattern.exec(segment)) !== null) {
      hints.push(match[0]);
    }

    const areaNames = analysis.areas.map((a) => a.name.toLowerCase());
    for (const area of analysis.areas) {
      if (segment.includes(area.name.toLowerCase())) {
        hints.push(area.path);
      }
    }

    return [...new Set(hints)];
  }

  private resolveInterTaskDependencies(tasks: DecomposedTask[]): void {
    for (let i = 0; i < tasks.length; i++) {
      for (let j = 0; j < i; j++) {
        const earlier = tasks[j];
        const later = tasks[i];

        if (
          later.filesInvolved.some((f) =>
            earlier.filesInvolved.includes(f),
          ) &&
          earlier.filesInvolved.length > 0
        ) {
          if (!later.dependencies.includes(earlier.id)) {
            later.dependencies.push(earlier.id);
          }
        }

        if (
          earlier.suggestedAgentType === later.suggestedAgentType &&
          earlier.priority <= later.priority
        ) {
          if (!later.dependencies.includes(earlier.id)) {
            later.dependencies.push(earlier.id);
          }
        }
      }
    }
  }

  private sortTasksByPriority(tasks: DecomposedTask[]): void {
    tasks.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.dependencies.length - b.dependencies.length;
    });
  }
}

export class DependencyResolver {
  resolve(tasks: DecomposedTask[]): ResolvedDependencyGraph {
    const taskMap = new Map<string, DecomposedTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const edges: ResolvedDependencyGraph['edges'] = [];
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (taskMap.has(depId)) {
          edges.push({
            from: depId,
            to: task.id,
            type: 'hard',
          });
        }
      }
    }

    const implicitEdges = this.detectImplicitDependencies(tasks, taskMap);
    edges.push(...implicitEdges);

    const levels = this.topologicalSortWithLevels(tasks, edges);
    const criticalPath = this.computeCriticalPath(tasks, edges, levels);
    const totalDuration = this.computeTotalDuration(tasks, levels);

    return {
      tasks,
      edges,
      levels,
      criticalPath,
      totalDuration,
    };
  }

  private detectImplicitDependencies(
    tasks: DecomposedTask[],
    taskMap: Map<string, DecomposedTask>,
  ): ResolvedDependencyGraph['edges'] {
    const edges: ResolvedDependencyGraph['edges'] = [];

    const agentQueues = new Map<string, DecomposedTask[]>();
    for (const task of tasks) {
      const agentType = task.suggestedAgentType;
      if (!agentQueues.has(agentType)) {
        agentQueues.set(agentType, []);
      }
      agentQueues.get(agentType)!.push(task);
    }

    for (const [, queue] of agentQueues) {
      for (let i = 1; i < queue.length; i++) {
        edges.push({
          from: queue[i - 1].id,
          to: queue[i].id,
          type: 'soft',
        });
      }
    }

    const fileToTasks = new Map<string, DecomposedTask[]>();
    for (const task of tasks) {
      for (const file of task.filesInvolved) {
        if (!fileToTasks.has(file)) {
          fileToTasks.set(file, []);
        }
        fileToTasks.get(file)!.push(task);
      }
    }

    for (const [, fileTasks] of fileToTasks) {
      if (fileTasks.length > 1) {
        for (let i = 1; i < fileTasks.length; i++) {
          const alreadyHasEdge = edges.some(
            (e) =>
              (e.from === fileTasks[i - 1].id && e.to === fileTasks[i].id) ||
              (e.from === fileTasks[i].id && e.to === fileTasks[i - 1].id),
          );
          if (!alreadyHasEdge) {
            edges.push({
              from: fileTasks[i - 1].id,
              to: fileTasks[i].id,
              type: 'soft',
            });
          }
        }
      }
    }

    return edges;
  }

  private topologicalSortWithLevels(
    tasks: DecomposedTask[],
    edges: ResolvedDependencyGraph['edges'],
  ): string[][] {
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const task of tasks) {
      adjList.set(task.id, []);
      inDegree.set(task.id, 0);
    }

    for (const edge of edges) {
      if (adjList.has(edge.from)) {
        adjList.get(edge.from)!.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      }
    }

    const levels: string[][] = [];
    const queue: string[] = [];

    for (const task of tasks) {
      if ((inDegree.get(task.id) ?? 0) === 0) {
        queue.push(task.id);
      }
    }

    while (queue.length > 0) {
      const level: string[] = [...queue];
      levels.push(level);
      queue.length = 0;

      for (const nodeId of level) {
        for (const neighbor of adjList.get(nodeId) ?? []) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    const remaining = tasks.filter(
      (t) => !levels.flat().includes(t.id),
    );
    if (remaining.length > 0) {
      levels.push(remaining.map((t) => t.id));
    }

    return levels;
  }

  private computeCriticalPath(
    tasks: DecomposedTask[],
    edges: ResolvedDependencyGraph['edges'],
    levels: string[][],
  ): string[] {
    const taskMap = new Map<string, DecomposedTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const earliest = new Map<string, number>();
    const predecessor = new Map<string, string | null>();

    for (const level of levels) {
      for (const taskId of level) {
        const task = taskMap.get(taskId);
        if (!task) continue;

        let maxEarliest = 0;
        let pred: string | null = null;

        for (const edge of edges) {
          if (edge.to === taskId) {
            const predEarliest =
              (earliest.get(edge.from) ?? 0) +
              (taskMap.get(edge.from)?.estimatedDurationMs ?? 0);
            if (predEarliest > maxEarliest) {
              maxEarliest = predEarliest;
              pred = edge.from;
            }
          }
        }

        earliest.set(taskId, maxEarliest);
        predecessor.set(taskId, pred);
      }
    }

    let maxEnd = 0;
    let endTask = '';
    for (const [taskId, start] of earliest) {
      const task = taskMap.get(taskId);
      if (task) {
        const end = start + task.estimatedDurationMs;
        if (end > maxEnd) {
          maxEnd = end;
          endTask = taskId;
        }
      }
    }

    const path: string[] = [];
    let current: string | null = endTask;
    while (current !== null) {
      path.unshift(current);
      current = predecessor.get(current) ?? null;
    }

    return path;
  }

  private computeTotalDuration(
    tasks: DecomposedTask[],
    levels: string[][],
  ): number {
    const taskMap = new Map<string, DecomposedTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    let totalDuration = 0;
    for (const level of levels) {
      let maxDuration = 0;
      for (const taskId of level) {
        const task = taskMap.get(taskId);
        if (task && task.estimatedDurationMs > maxDuration) {
          maxDuration = task.estimatedDurationMs;
        }
      }
      totalDuration += maxDuration;
    }

    return totalDuration;
  }
}
