import {
  AgentType,
  AgentCapability,
  ResourceProfile,
  TaskRequirements,
} from '../core/types';

export interface CapabilityEntry {
  type: AgentType;
  capability: AgentCapability;
  registeredAt: Date;
  lastUsed?: Date;
  usageCount: number;
  averageDurationMs: number;
  successRate: number;
}

export interface SkillMatch {
  agentType: AgentType;
  score: number;
  matchingSkills: string[];
  resourceFit: number;
}

export interface ConflictInfo {
  agentA: AgentType;
  agentB: AgentType;
  reason: string;
  severity: 'soft' | 'hard';
}

export interface AffinityRule {
  agents: AgentType[];
  bonus: number;
  reason: string;
}

export interface AgentResourceEstimate {
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkMbps: number;
  estimatedDurationMs: number;
}

const DEFAULT_RESOURCE_PROFILES: Record<string, ResourceProfile> = {
  default: { memoryMB: 128, cpuPercent: 15, diskMB: 50, networkMbps: 1 },
  'feature-coder': { memoryMB: 256, cpuPercent: 20, diskMB: 100, networkMbps: 2 },
  'refactorer': { memoryMB: 256, cpuPercent: 25, diskMB: 80, networkMbps: 1 },
  'bug-fixer': { memoryMB: 192, cpuPercent: 15, diskMB: 60, networkMbps: 1 },
  'test-writer': { memoryMB: 192, cpuPercent: 15, diskMB: 80, networkMbps: 1 },
  'code-reviewer': { memoryMB: 128, cpuPercent: 10, diskMB: 40, networkMbps: 1 },
  'security-scanner': { memoryMB: 256, cpuPercent: 30, diskMB: 100, networkMbps: 5 },
  'performance-profiler': { memoryMB: 512, cpuPercent: 40, diskMB: 150, networkMbps: 2 },
  'doc-generator': { memoryMB: 128, cpuPercent: 10, diskMB: 30, networkMbps: 1 },
  'type-fixer': { memoryMB: 192, cpuPercent: 15, diskMB: 50, networkMbps: 1 },
  'accessibility-auditor': { memoryMB: 128, cpuPercent: 10, diskMB: 30, networkMbps: 1 },
  'dependency-auditor': { memoryMB: 128, cpuPercent: 15, diskMB: 200, networkMbps: 10 },
  'dockerizer': { memoryMB: 256, cpuPercent: 20, diskMB: 500, networkMbps: 5 },
  'ci-configurator': { memoryMB: 128, cpuPercent: 10, diskMB: 50, networkMbps: 2 },
  'deployer': { memoryMB: 192, cpuPercent: 15, diskMB: 200, networkMbps: 10 },
  'architect': { memoryMB: 128, cpuPercent: 10, diskMB: 30, networkMbps: 1 },
  'api-designer': { memoryMB: 128, cpuPercent: 10, diskMB: 30, networkMbps: 1 },
  'database-architect': { memoryMB: 192, cpuPercent: 15, diskMB: 80, networkMbps: 2 },
  'cache-strategist': { memoryMB: 192, cpuPercent: 15, diskMB: 50, networkMbps: 2 },
  'chaos-engineer': { memoryMB: 512, cpuPercent: 50, diskMB: 200, networkMbps: 10 },
  'load-test-specialist': { memoryMB: 512, cpuPercent: 50, diskMB: 200, networkMbps: 20 },
  'e2e-test-engineer': { memoryMB: 256, cpuPercent: 25, diskMB: 100, networkMbps: 5 },
  'penetration-tester': { memoryMB: 256, cpuPercent: 30, diskMB: 100, networkMbps: 10 },
};

const CONFLICT_RULES: ConflictInfo[] = [
  { agentA: 'feature-coder', agentB: 'refactorer', reason: 'Both modify source files concurrently', severity: 'hard' },
  { agentA: 'feature-coder', agentB: 'bug-fixer', reason: 'Potential file overlap in source', severity: 'hard' },
  { agentA: 'deployer', agentB: 'rollback-manager', reason: 'Mutually exclusive operations', severity: 'hard' },
  { agentA: 'security-scanner', agentB: 'feature-coder', reason: 'Scanner may flag in-progress changes', severity: 'soft' },
  { agentA: 'performance-profiler', agentB: 'feature-coder', reason: 'Profiler needs stable codebase', severity: 'soft' },
  { agentA: 'code-reviewer', agentB: 'feature-coder', reason: 'Review should happen after coding', severity: 'soft' },
  { agentA: 'type-fixer', agentB: 'feature-coder', reason: 'Type fixes overlap with feature changes', severity: 'hard' },
  { agentA: 'test-writer', agentB: 'feature-coder', reason: 'Tests should be written against stable code', severity: 'soft' },
  { agentA: 'dockerizer', agentB: 'deployer', reason: 'Docker build and deploy conflict', severity: 'hard' },
  { agentA: 'migrator', agentB: 'feature-coder', reason: 'Migrations should complete before features', severity: 'hard' },
];

const AFFINITY_RULES: AffinityRule[] = [
  { agents: ['feature-coder', 'test-writer'], bonus: 0.2, reason: 'Tests immediately validate features' },
  { agents: ['feature-coder', 'type-fixer'], bonus: 0.15, reason: 'Type fixes complement features' },
  { agents: ['refactorer', 'code-reviewer'], bonus: 0.2, reason: 'Reviewer validates refactoring quality' },
  { agents: ['security-scanner', 'bug-fixer'], bonus: 0.15, reason: 'Fix security bugs found by scanner' },
  { agents: ['architect', 'feature-coder'], bonus: 0.1, reason: 'Architecture guides feature implementation' },
  { agents: ['doc-generator', 'feature-coder'], bonus: 0.1, reason: 'Docs written alongside features' },
  { agents: ['api-designer', 'feature-coder'], bonus: 0.2, reason: 'API design drives feature implementation' },
  { agents: ['performance-profiler', 'cache-strategist'], bonus: 0.15, reason: 'Profiling identifies caching opportunities' },
  { agents: ['test-writer', 'e2e-test-engineer'], bonus: 0.1, reason: 'Unit and E2E tests complement each other' },
];

const AGENT_SKILLS: Record<AgentType, string[]> = {
  'feature-coder': ['implementation', 'coding', 'typescript', 'javascript', 'react', 'api', 'ui', 'backend', 'frontend', 'fullstack', 'database'],
  'refactorer': ['refactoring', 'code-quality', 'clean-code', 'solid-principles', 'design-patterns', 'typescript', 'javascript'],
  'bug-fixer': ['debugging', 'error-resolution', 'root-cause-analysis', 'typescript', 'javascript', 'log-analysis'],
  'test-writer': ['unit-testing', 'integration-testing', 'testing', 'jest', 'vitest', 'mocha', 'assertions', 'mocking'],
  'doc-generator': ['documentation', 'api-docs', 'readme', 'jsdoc', 'typedoc', 'markdown'],
  'type-fixer': ['typescript', 'type-safety', 'generics', 'type-inference', 'strict-mode'],
  'code-reviewer': ['code-review', 'best-practices', 'quality-assurance', 'feedback'],
  'security-scanner': ['security-audit', 'vulnerability-detection', 'owasp', 'sast', 'dependency-scanning'],
  'performance-profiler': ['profiling', 'optimization', 'memory-analysis', 'cpu-profiling', 'bundle-analysis'],
  'accessibility-auditor': ['a11y', 'wcag', 'aria', 'screen-reader', 'keyboard-navigation'],
  'dependency-auditor': ['dependency-analysis', 'version-checking', 'vulnerability-scanning', 'license-compliance'],
  'license-checker': ['license-compliance', 'sbom', 'legal-review'],
  'dockerizer': ['docker', 'containerization', 'dockerfile', 'docker-compose'],
  'ci-configurator': ['ci-cd', 'github-actions', 'gitlab-ci', 'pipeline'],
  'deployer': ['deployment', 'release', 'blue-green', 'canary', 'rollout'],
  'migrator': ['migration', 'database-migration', 'schema-migration', 'data-migration'],
  'architect': ['architecture', 'design-decisions', 'system-design', 'trade-offs'],
  'api-designer': ['api-design', 'rest', 'openapi', 'swagger', 'contract-first'],
  'database-architect': ['database-design', 'schema', 'normalization', 'indexing', 'query-optimization'],
  'graphql-specialist': ['graphql', 'schema-design', 'resolvers', 'subscriptions'],
  'cache-strategist': ['caching', 'redis', 'cdn', 'invalidation', 'ttl'],
  'auth-architect': ['authentication', 'authorization', 'oauth2', 'jwt', 'rbac'],
  'e2e-test-engineer': ['e2e-testing', 'playwright', 'cypress', 'browser-automation'],
  'visual-regression-tester': ['visual-testing', 'screenshot-comparison', 'ui-regression'],
  'performance-test-engineer': ['load-testing', 'stress-testing', 'benchmarking'],
  'load-test-specialist': ['load-testing', 'k6', 'artillery', ' Gatling'],
  'chaos-engineer': ['chaos-engineering', 'fault-injection', 'resilience-testing'],
  'contract-test-implementer': ['contract-testing', 'pact', 'api-validation'],
  'penetration-tester': ['penetration-testing', 'ethical-hacking', 'exploit-testing'],
  'test-automation-architect': ['test-automation', 'framework-design', 'ci-integration'],
  'health-check-implementer': ['health-checks', 'monitoring', 'probes', 'readiness'],
  'metrics-collector': ['metrics', 'prometheus', 'grafana', 'telemetry'],
  'tracing-instrumenter': ['distributed-tracing', 'opentelemetry', 'jaeger', 'zipkin'],
  'logging-architect': ['logging', 'structured-logging', 'log-aggregation', 'elk'],
  'config-manager': ['configuration', 'env-management', 'secrets', 'feature-flags'],
  'feature-flag-manager': ['feature-flags', 'toggles', 'gradual-rollout', 'a-b-testing'],
  'kubernetes-operator-developer': ['kubernetes', 'operator-pattern', 'crds', 'controllers'],
  'helm-chart-designer': ['helm', 'kubernetes-packaging', 'values', 'templates'],
  'terraform-module-author': ['terraform', 'infrastructure-as-code', 'providers'],
  'cost-optimizer': ['cost-optimization', 'finops', 'resource-rightsizing'],
  'data-engineer': ['data-pipelines', 'etl', 'streaming', 'batch-processing'],
  'ml-ops-engineer': ['ml-ops', 'model-deployment', 'training-pipelines'],
  'search-architect': ['search', 'elasticsearch', 'full-text-search', 'ranking'],
};

export class CapabilityRegistry {
  private entries: Map<AgentType, CapabilityEntry> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const agentTypes = Object.keys(AGENT_SKILLS) as AgentType[];
    for (const type of agentTypes) {
      const resourceProfile = DEFAULT_RESOURCE_PROFILES[type] || DEFAULT_RESOURCE_PROFILES.default;
      const capability: AgentCapability = {
        type,
        skills: AGENT_SKILLS[type] || [],
        complexity: this.estimateComplexity(type),
        estimatedDurationMs: this.estimateDuration(type),
        requiredTools: this.estimateRequiredTools(type),
        compatibleWith: this.findCompatibleAgents(type),
        conflictsWith: this.findConflictingAgents(type),
        resourceProfile,
      };

      this.entries.set(type, {
        type,
        capability,
        registeredAt: new Date(),
        usageCount: 0,
        averageDurationMs: capability.estimatedDurationMs,
        successRate: 1.0,
      });
    }
  }

  private estimateComplexity(type: AgentType): AgentCapability['complexity'] {
    const highComplexity = [
      'architect', 'database-architect', 'chaos-engineer', 'load-test-specialist',
      'kubernetes-operator-developer', 'distributed-lock-implementer', 'consensus-algorithm-specialist',
    ];
    const expertComplexity = [
      'security-scanner', 'performance-profiler', 'penetration-tester',
      'ml-ops-engineer', 'data-engineer', 'search-architect',
    ];
    const lowComplexity = [
      'doc-generator', 'license-checker', 'health-check-implementer',
    ];

    if (expertComplexity.includes(type)) return 'expert';
    if (highComplexity.includes(type)) return 'high';
    if (lowComplexity.includes(type)) return 'low';
    return 'medium';
  }

  private estimateDuration(type: AgentType): number {
    const durations: Record<string, number> = {
      'feature-coder': 180000,
      'refactorer': 150000,
      'bug-fixer': 120000,
      'test-writer': 120000,
      'doc-generator': 60000,
      'type-fixer': 90000,
      'code-reviewer': 60000,
      'security-scanner': 180000,
      'performance-profiler': 240000,
      'architect': 60000,
      'deployer': 120000,
      'dockerizer': 90000,
      'ci-configurator': 90000,
      'test-automation-architect': 180000,
      'e2e-test-engineer': 150000,
      'chaos-engineer': 300000,
      'load-test-specialist': 300000,
    };
    return durations[type] || 120000;
  }

  private estimateRequiredTools(type: AgentType): string[] {
    const toolMap: Record<string, string[]> = {
      'test-writer': ['node', 'jest', 'vitest'],
      'e2e-test-engineer': ['node', 'playwright', 'cypress'],
      'type-fixer': ['node', 'tsc'],
      'code-reviewer': ['git'],
      'security-scanner': ['node', 'npm-audit', 'snyk'],
      'dockerizer': ['docker'],
      'ci-configurator': ['git'],
      'deployer': ['git', 'kubectl', 'docker'],
      'kubernetes-operator-developer': ['kubectl', 'helm'],
      'terraform-module-author': ['terraform'],
      'performance-profiler': ['node', 'clinic'],
    };
    return toolMap[type] || ['node'];
  }

  private findCompatibleAgents(type: AgentType): AgentType[] {
    const compatMap: Record<string, AgentType[]> = {
      'feature-coder': ['test-writer', 'type-fixer', 'doc-generator', 'code-reviewer'],
      'refactorer': ['code-reviewer', 'test-writer', 'type-fixer'],
      'bug-fixer': ['test-writer', 'code-reviewer'],
      'test-writer': ['feature-coder', 'e2e-test-engineer', 'code-reviewer'],
      'code-reviewer': ['feature-coder', 'refactorer', 'security-scanner'],
      'security-scanner': ['bug-fixer', 'code-reviewer'],
      'architect': ['feature-coder', 'api-designer', 'database-architect'],
      'api-designer': ['feature-coder', 'architect'],
    };
    return compatMap[type] || [];
  }

  private findConflictingAgents(type: AgentType): AgentType[] {
    return CONFLICT_RULES
      .filter(r => r.agentA === type && r.severity === 'hard')
      .map(r => r.agentB);
  }

  register(type: AgentType, capability: AgentCapability): void {
    this.entries.set(type, {
      type,
      capability,
      registeredAt: new Date(),
      usageCount: 0,
      averageDurationMs: capability.estimatedDurationMs,
      successRate: 1.0,
    });
  }

  getCapability(type: AgentType): AgentCapability | undefined {
    return this.entries.get(type)?.capability;
  }

  getEntry(type: AgentType): CapabilityEntry | undefined {
    return this.entries.get(type);
  }

  getAllCapabilities(): Map<AgentType, AgentCapability> {
    const result = new Map<AgentType, AgentCapability>();
    for (const [type, entry] of this.entries) {
      result.set(type, entry.capability);
    }
    return result;
  }

  findBestAgents(requirements: TaskRequirements, maxResults: number = 5): SkillMatch[] {
    const matches: SkillMatch[] = [];

    for (const [type, entry] of this.entries) {
      if (requirements.excludedAgentTypes.includes(type)) continue;
      if (requirements.preferredAgentTypes.length > 0 &&
          !requirements.preferredAgentTypes.includes(type)) {
        const score = this.calculateMatchScore(type, requirements, entry);
        if (score.score > 0.3) {
          matches.push(score);
        }
        continue;
      }

      const score = this.calculateMatchScore(type, requirements, entry);
      if (score.score > 0) {
        matches.push(score);
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private calculateMatchScore(type: AgentType, requirements: TaskRequirements, entry: CapabilityEntry): SkillMatch {
    const capability = entry.capability;
    const matchingSkills: string[] = [];

    for (const reqSkill of requirements.requiredSkills) {
      if (capability.skills.some(s =>
        s.toLowerCase().includes(reqSkill.toLowerCase()) ||
        reqSkill.toLowerCase().includes(s.toLowerCase())
      )) {
        matchingSkills.push(reqSkill);
      }
    }

    const skillScore = requirements.requiredSkills.length > 0
      ? matchingSkills.length / requirements.requiredSkills.length
      : 0.5;

    const complexityMap: Record<string, number> = { low: 1, medium: 2, high: 3, expert: 4 };
    const agentComplexity = complexityMap[capability.complexity] || 2;
    const maxComplexity = complexityMap[requirements.maxComplexity] || 4;
    const complexityFit = agentComplexity <= maxComplexity ? 1 : 0.3;

    const resourceFit = 1.0;

    const preferredBonus = requirements.preferredAgentTypes.includes(type) ? 0.2 : 0;

    const score = skillScore * 0.5 + complexityFit * 0.2 + resourceFit * 0.2 + preferredBonus;

    return {
      agentType: type,
      score: Math.round(score * 100) / 100,
      matchingSkills,
      resourceFit,
    };
  }

  detectConflicts(agentTypes: AgentType[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    for (let i = 0; i < agentTypes.length; i++) {
      for (let j = i + 1; j < agentTypes.length; j++) {
        const conflict = CONFLICT_RULES.find(r =>
          (r.agentA === agentTypes[i] && r.agentB === agentTypes[j]) ||
          (r.agentA === agentTypes[j] && r.agentB === agentTypes[i])
        );
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  getAffinityBonus(agentTypes: AgentType[]): number {
    let bonus = 0;
    for (const rule of AFFINITY_RULES) {
      const allPresent = rule.agents.every(a => agentTypes.includes(a));
      if (allPresent) {
        bonus += rule.bonus;
      }
    }
    return Math.min(bonus, 0.5);
  }

  estimateResources(agentType: AgentType, taskSize: 'small' | 'medium' | 'large' = 'medium'): AgentResourceEstimate {
    const base = DEFAULT_RESOURCE_PROFILES[agentType] || DEFAULT_RESOURCE_PROFILES.default;
    const entry = this.entries.get(agentType);

    const sizeMultipliers: Record<string, number> = { small: 0.5, medium: 1.0, large: 2.0 };
    const multiplier = sizeMultipliers[taskSize] || 1.0;

    return {
      memoryMB: Math.round(base.memoryMB * multiplier),
      cpuPercent: Math.round(base.cpuPercent * multiplier),
      diskMB: Math.round(base.diskMB * multiplier),
      networkMbps: Math.round(base.networkMbps * multiplier * 10) / 10,
      estimatedDurationMs: entry ? entry.averageDurationMs * multiplier : 120000 * multiplier,
    };
  }

  updateUsageStats(type: AgentType, durationMs: number, success: boolean): void {
    const entry = this.entries.get(type);
    if (!entry) return;

    entry.usageCount++;
    entry.lastUsed = new Date();
    entry.averageDurationMs = (entry.averageDurationMs * (entry.usageCount - 1) + durationMs) / entry.usageCount;
    entry.successRate = (entry.successRate * (entry.usageCount - 1) + (success ? 1 : 0)) / entry.usageCount;
  }

  getConflictRules(): ConflictInfo[] {
    return [...CONFLICT_RULES];
  }

  getAffinityRules(): AffinityRule[] {
    return [...AFFINITY_RULES];
  }

  canRunInParallel(agentA: AgentType, agentB: AgentType): boolean {
    const conflict = CONFLICT_RULES.find(r =>
      (r.agentA === agentA && r.agentB === agentB) ||
      (r.agentA === agentB && r.agentB === agentA)
    );
    return !conflict || conflict.severity === 'soft';
  }

  getResourceProfile(agentType: AgentType): ResourceProfile {
    return DEFAULT_RESOURCE_PROFILES[agentType] || DEFAULT_RESOURCE_PROFILES.default;
  }
}
