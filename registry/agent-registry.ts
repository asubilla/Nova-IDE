import { AgentType } from '../core/types';

export interface AgentRegistration {
  type: AgentType;
  name: string;
  category: string;
  subcategory: string;
  complexity: 'low' | 'medium' | 'high' | 'expert';
  description: string;
  requiredCapabilities: string[];
  compatibleWith: AgentType[];
  conflictsWith: AgentType[];
  estimatedDurationMs: number;
  resourceProfile: { memoryMB: number; cpuPercent: number };
  tags: string[];
  priority: number;
  maxConcurrent: number;
}

export class AgentRegistry {
  private agents: Map<AgentType, AgentRegistration> = new Map();
  private categoryIndex: Map<string, AgentType[]> = new Map();
  private tagIndex: Map<string, AgentType[]> = new Map();
  private complexityIndex: Map<string, AgentType[]> = new Map();

  register(registration: AgentRegistration): void {
    this.agents.set(registration.type, registration);

    const categoryList = this.categoryIndex.get(registration.category) || [];
    categoryList.push(registration.type);
    this.categoryIndex.set(registration.category, categoryList);

    const complexityList = this.complexityIndex.get(registration.complexity) || [];
    complexityList.push(registration.type);
    this.complexityIndex.set(registration.complexity, complexityList);

    for (const tag of registration.tags) {
      const tagList = this.tagIndex.get(tag) || [];
      tagList.push(registration.type);
      this.tagIndex.set(tag, tagList);
    }
  }

  unregister(type: AgentType): void {
    const registration = this.agents.get(type);
    if (!registration) return;

    this.agents.delete(type);

    const categoryList = this.categoryIndex.get(registration.category);
    if (categoryList) {
      this.categoryIndex.set(registration.category, categoryList.filter(t => t !== type));
    }

    const complexityList = this.complexityIndex.get(registration.complexity);
    if (complexityList) {
      this.complexityIndex.set(registration.complexity, complexityList.filter(t => t !== type));
    }

    for (const tag of registration.tags) {
      const tagList = this.tagIndex.get(tag);
      if (tagList) {
        this.tagIndex.set(tag, tagList.filter(t => t !== type));
      }
    }
  }

  get(type: AgentType): AgentRegistration | undefined {
    return this.agents.get(type);
  }

  getByCategory(category: string): AgentRegistration[] {
    const types = this.categoryIndex.get(category) || [];
    return types.map(t => this.agents.get(t)!).filter(Boolean);
  }

  getByTag(tag: string): AgentRegistration[] {
    const types = this.tagIndex.get(tag) || [];
    return types.map(t => this.agents.get(t)!).filter(Boolean);
  }

  getByComplexity(complexity: string): AgentRegistration[] {
    const types = this.complexityIndex.get(complexity) || [];
    return types.map(t => this.agents.get(t)!).filter(Boolean);
  }

  getCompatibleAgents(type: AgentType): AgentRegistration[] {
    const registration = this.agents.get(type);
    if (!registration) return [];
    return registration.compatibleWith.map(t => this.agents.get(t)!).filter(Boolean);
  }

  getConflictingAgents(type: AgentType): AgentRegistration[] {
    const registration = this.agents.get(type);
    if (!registration) return [];
    return registration.conflictsWith.map(t => this.agents.get(t)!).filter(Boolean);
  }

  findAgentsForTask(requirements: {
    capabilities: string[];
    maxComplexity: string;
    tags: string[];
  }): AgentRegistration[] {
    const complexityOrder: Record<string, number> = {
      low: 0,
      medium: 1,
      high: 2,
      expert: 3,
    };
    const maxLevel = complexityOrder[requirements.maxComplexity] ?? 3;

    const results: AgentRegistration[] = [];
    for (const registration of this.agents.values()) {
      const complexityLevel = complexityOrder[registration.complexity] ?? 0;
      if (complexityLevel > maxLevel) continue;

      const hasCapabilities = requirements.capabilities.every(cap =>
        registration.requiredCapabilities.includes(cap) ||
        registration.tags.includes(cap)
      );
      if (!hasCapabilities) continue;

      const hasTags = requirements.tags.some(tag => registration.tags.includes(tag));
      if (requirements.tags.length > 0 && !hasTags) continue;

      results.push(registration);
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  getAgentsByPriority(): AgentRegistration[] {
    return Array.from(this.agents.values()).sort((a, b) => b.priority - a.priority);
  }

  getResourceEstimate(types: AgentType[]): { totalMemory: number; totalCpu: number } {
    let totalMemory = 0;
    let totalCpu = 0;

    for (const type of types) {
      const registration = this.agents.get(type);
      if (registration) {
        totalMemory += registration.resourceProfile.memoryMB;
        totalCpu += registration.resourceProfile.cpuPercent;
      }
    }

    return { totalMemory, totalCpu };
  }

  getStats(): { total: number; byCategory: Record<string, number>; byComplexity: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    const byComplexity: Record<string, number> = {};

    for (const registration of this.agents.values()) {
      byCategory[registration.category] = (byCategory[registration.category] || 0) + 1;
      byComplexity[registration.complexity] = (byComplexity[registration.complexity] || 0) + 1;
    }

    return {
      total: this.agents.size,
      byCategory,
      byComplexity,
    };
  }

  getAll(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  getCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }

  getTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }
}

const defaultRegistry = new AgentRegistry();

export { defaultRegistry };
export default defaultRegistry;
// ============================================================================
// CORE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'planner' as AgentType,
  name: 'Planner',
  category: 'core',
  subcategory: 'planning',
  complexity: 'high',
  description: 'Plans and decomposes complex tasks into manageable subtasks with dependencies and priorities',
  requiredCapabilities: ['task-decomposition', 'dependency-analysis', 'priority-assessment'],
  compatibleWith: ['architect', 'feature-coder', 'bug-fixer', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 512, cpuPercent: 35 },
  tags: ['planning', 'decomposition', 'strategy', 'coordination'],
  priority: 100,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'architect' as AgentType,
  name: 'Architect',
  category: 'core',
  subcategory: 'design',
  complexity: 'expert',
  description: 'Designs high-level system architecture and makes critical design decisions',
  requiredCapabilities: ['system-design', 'architecture-patterns', 'trade-off-analysis'],
  compatibleWith: ['planner', 'feature-coder', 'database-architect', 'api-designer'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 1024, cpuPercent: 45 },
  tags: ['architecture', 'design', 'system', 'planning'],
  priority: 95,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'feature-coder' as AgentType,
  name: 'Feature Coder',
  category: 'core',
  subcategory: 'implementation',
  complexity: 'medium',
  description: 'Implements new features based on specifications and design documents',
  requiredCapabilities: ['coding', 'feature-implementation', 'testing'],
  compatibleWith: ['planner', 'architect', 'test-writer', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 40 },
  tags: ['coding', 'features', 'implementation', 'development'],
  priority: 85,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'refactorer' as AgentType,
  name: 'Refactorer',
  category: 'core',
  subcategory: 'improvement',
  complexity: 'high',
  description: 'Refactors existing code to improve structure, readability, and maintainability',
  requiredCapabilities: ['code-analysis', 'refactoring-patterns', 'testing'],
  compatibleWith: ['feature-coder', 'code-reviewer', 'test-writer'],
  conflictsWith: [],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 512, cpuPercent: 35 },
  tags: ['refactoring', 'clean-code', 'improvement', 'quality'],
  priority: 75,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'bug-fixer' as AgentType,
  name: 'Bug Fixer',
  category: 'core',
  subcategory: 'repair',
  complexity: 'medium',
  description: 'Identifies and fixes bugs in existing code with minimal side effects',
  requiredCapabilities: ['debugging', 'root-cause-analysis', 'testing'],
  compatibleWith: ['planner', 'test-writer', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 384, cpuPercent: 30 },
  tags: ['bug-fix', 'debugging', 'repair', 'maintenance'],
  priority: 80,
  maxConcurrent: 3,
});

// ============================================================================
// DATABASE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'database-architect' as AgentType,
  name: 'Database Architect',
  category: 'database',
  subcategory: 'design',
  complexity: 'expert',
  description: 'Designs database schemas, relationships, indexes, and migration strategies',
  requiredCapabilities: ['database-design', 'schema-modeling', 'optimization'],
  compatibleWith: ['architect', 'sql-specialist', 'data-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['database', 'schema', 'design', 'migration'],
  priority: 85,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'sql-specialist' as AgentType,
  name: 'SQL Specialist',
  category: 'database',
  subcategory: 'query',
  complexity: 'high',
  description: 'Writes and optimizes complex SQL queries, stored procedures, and views',
  requiredCapabilities: ['sql', 'query-optimization', 'database-knowledge'],
  compatibleWith: ['database-architect', 'data-engineer'],
  conflictsWith: ['nosql-specialist'],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['sql', 'database', 'query', 'optimization'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'nosql-specialist' as AgentType,
  name: 'NoSQL Specialist',
  category: 'database',
  subcategory: 'document',
  complexity: 'high',
  description: 'Designs and implements NoSQL solutions including document, key-value, and graph databases',
  requiredCapabilities: ['nosql', 'document-modeling', 'distributed-systems'],
  compatibleWith: ['database-architect', 'data-engineer'],
  conflictsWith: ['sql-specialist'],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['nosql', 'mongodb', 'dynamodb', 'document'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'data-engineer' as AgentType,
  name: 'Data Engineer',
  category: 'database',
  subcategory: 'pipeline',
  complexity: 'high',
  description: 'Builds data pipelines, ETL processes, and data transformation workflows',
  requiredCapabilities: ['data-pipeline', 'etl', 'data-modeling'],
  compatibleWith: ['database-architect', 'ml-engineer', 'data-analyst'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 768, cpuPercent: 40 },
  tags: ['data', 'pipeline', 'etl', 'transformation'],
  priority: 70,
  maxConcurrent: 2,
});
// ============================================================================
// API AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'api-designer' as AgentType,
  name: 'API Designer',
  category: 'api',
  subcategory: 'design',
  complexity: 'high',
  description: 'Designs RESTful APIs with proper resource modeling, versioning, and documentation',
  requiredCapabilities: ['api-design', 'rest', 'openapi'],
  compatibleWith: ['architect', 'rest-optimizer', 'graphql-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['api', 'rest', 'design', 'openapi'],
  priority: 80,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'graphql-specialist' as AgentType,
  name: 'GraphQL Specialist',
  category: 'api',
  subcategory: 'graphql',
  complexity: 'high',
  description: 'Designs GraphQL schemas, resolvers, and optimizes query performance',
  requiredCapabilities: ['graphql', 'schema-design', 'resolver-implementation'],
  compatibleWith: ['api-designer', 'frontend-performance'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['graphql', 'api', 'schema', 'query'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'rest-optimizer' as AgentType,
  name: 'REST Optimizer',
  category: 'api',
  subcategory: 'optimization',
  complexity: 'medium',
  description: 'Optimizes REST API performance, caching, and response times',
  requiredCapabilities: ['rest', 'caching', 'performance'],
  compatibleWith: ['api-designer', 'cache-strategist'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 256, cpuPercent: 20 },
  tags: ['rest', 'api', 'optimization', 'caching'],
  priority: 60,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'websocket-engineer' as AgentType,
  name: 'WebSocket Engineer',
  category: 'api',
  subcategory: 'realtime',
  complexity: 'high',
  description: 'Implements real-time WebSocket communication with proper connection management',
  requiredCapabilities: ['websocket', 'realtime', 'connection-management'],
  compatibleWith: ['api-designer', 'event-sourcing-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 35 },
  tags: ['websocket', 'realtime', 'push', 'connection'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'grpc-proto-designer' as AgentType,
  name: 'gRPC Proto Designer',
  category: 'api',
  subcategory: 'grpc',
  complexity: 'high',
  description: 'Designs gRPC protocol buffer definitions and implements service contracts',
  requiredCapabilities: ['grpc', 'protobuf', 'service-contracts'],
  compatibleWith: ['api-designer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['grpc', 'protobuf', 'rpc', 'microservices'],
  priority: 55,
  maxConcurrent: 2,
});

// ============================================================================
// MESSAGING AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'message-queue-architect' as AgentType,
  name: 'Message Queue Architect',
  category: 'messaging',
  subcategory: 'architecture',
  complexity: 'expert',
  description: 'Designs message queue architectures with proper patterns and guarantees',
  requiredCapabilities: ['message-queue', 'async-messaging', 'distributed-systems'],
  compatibleWith: ['architect', 'event-sourcing-specialist', 'cqrs-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['messaging', 'queue', 'async', 'distributed'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'event-sourcing-specialist' as AgentType,
  name: 'Event Sourcing Specialist',
  category: 'messaging',
  subcategory: 'pattern',
  complexity: 'expert',
  description: 'Implements event sourcing patterns with event stores and projections',
  requiredCapabilities: ['event-sourcing', 'event-store', 'projections'],
  compatibleWith: ['message-queue-architect', 'cqrs-implementer', 'domain-modeler'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 1024, cpuPercent: 40 },
  tags: ['event-sourcing', 'events', 'projections', 'audit'],
  priority: 65,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'cqrs-implementer' as AgentType,
  name: 'CQRS Implementer',
  category: 'messaging',
  subcategory: 'pattern',
  complexity: 'expert',
  description: 'Implements Command Query Responsibility Segregation with proper read/write separation',
  requiredCapabilities: ['cqrs', 'command-handling', 'query-optimization'],
  compatibleWith: ['event-sourcing-specialist', 'message-queue-architect', 'domain-modeler'],
  conflictsWith: [],
  estimatedDurationMs: 140000,
  resourceProfile: { memoryMB: 896, cpuPercent: 38 },
  tags: ['cqrs', 'commands', 'queries', 'separation'],
  priority: 60,
  maxConcurrent: 1,
});

// ============================================================================
// DDD AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'domain-modeler' as AgentType,
  name: 'Domain Modeler',
  category: 'ddd',
  subcategory: 'modeling',
  complexity: 'expert',
  description: 'Creates domain models using Domain-Driven Design principles and patterns',
  requiredCapabilities: ['domain-driven-design', 'domain-modeling', 'ubiquitous-language'],
  compatibleWith: ['architect', 'bounded-context-designer', 'aggregate-designer'],
  conflictsWith: [],
  estimatedDurationMs: 180000,
  resourceProfile: { memoryMB: 768, cpuPercent: 30 },
  tags: ['ddd', 'domain', 'modeling', 'business-logic'],
  priority: 80,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'bounded-context-designer' as AgentType,
  name: 'Bounded Context Designer',
  category: 'ddd',
  subcategory: 'context-mapping',
  complexity: 'expert',
  description: 'Identifies and designs bounded contexts with proper context mapping',
  requiredCapabilities: ['bounded-context', 'context-mapping', 'strategic-design'],
  compatibleWith: ['domain-modeler', 'architect'],
  conflictsWith: [],
  estimatedDurationMs: 160000,
  resourceProfile: { memoryMB: 640, cpuPercent: 28 },
  tags: ['ddd', 'bounded-context', 'context-map', 'boundaries'],
  priority: 75,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'aggregate-designer' as AgentType,
  name: 'Aggregate Designer',
  category: 'ddd',
  subcategory: 'tactical',
  complexity: 'high',
  description: 'Designs aggregates, entities, and value objects with proper consistency boundaries',
  requiredCapabilities: ['aggregates', 'entities', 'value-objects'],
  compatibleWith: ['domain-modeler', 'repository-pattern-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['ddd', 'aggregate', 'entity', 'value-object'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'repository-pattern-implementer' as AgentType,
  name: 'Repository Pattern Implementer',
  category: 'ddd',
  subcategory: 'tactical',
  complexity: 'medium',
  description: 'Implements repository patterns for data access abstraction',
  requiredCapabilities: ['repository-pattern', 'data-access', 'abstraction'],
  compatibleWith: ['aggregate-designer', 'database-architect'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['repository', 'data-access', 'pattern', 'abstraction'],
  priority: 60,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'unit-of-work-implementer' as AgentType,
  name: 'Unit of Work Implementer',
  category: 'ddd',
  subcategory: 'tactical',
  complexity: 'medium',
  description: 'Implements unit of work pattern for transaction management',
  requiredCapabilities: ['unit-of-work', 'transaction-management', 'change-tracking'],
  compatibleWith: ['repository-pattern-implementer', 'database-architect'],
  conflictsWith: [],
  estimatedDurationMs: 55000,
  resourceProfile: { memoryMB: 320, cpuPercent: 18 },
  tags: ['unit-of-work', 'transaction', 'consistency', 'change-tracking'],
  priority: 55,
  maxConcurrent: 3,
});
// ============================================================================
// DESIGN PATTERN AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'factory-pattern-implementer' as AgentType,
  name: 'Factory Pattern Implementer',
  category: 'patterns',
  subcategory: 'creational',
  complexity: 'medium',
  description: 'Implements factory patterns for object creation and dependency management',
  requiredCapabilities: ['factory-pattern', 'object-creation', 'dependency-management'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['factory', 'creational', 'pattern', 'creation'],
  priority: 50,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'builder-pattern-implementer' as AgentType,
  name: 'Builder Pattern Implementer',
  category: 'patterns',
  subcategory: 'creational',
  complexity: 'medium',
  description: 'Implements builder patterns for complex object construction',
  requiredCapabilities: ['builder-pattern', 'object-construction', 'fluent-interface'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['builder', 'creational', 'pattern', 'construction'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'strategy-pattern-implementer' as AgentType,
  name: 'Strategy Pattern Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements strategy patterns for interchangeable algorithms',
  requiredCapabilities: ['strategy-pattern', 'algorithm-encapsulation', 'polymorphism'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['strategy', 'behavioral', 'pattern', 'algorithm'],
  priority: 50,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'observer-pattern-implementer' as AgentType,
  name: 'Observer Pattern Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements observer patterns for event notification and pub-sub',
  requiredCapabilities: ['observer-pattern', 'event-notification', 'pub-sub'],
  compatibleWith: ['event-sourcing-specialist', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 38000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['observer', 'behavioral', 'pattern', 'events'],
  priority: 50,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'decorator-pattern-implementer' as AgentType,
  name: 'Decorator Pattern Implementer',
  category: 'patterns',
  subcategory: 'structural',
  complexity: 'medium',
  description: 'Implements decorator patterns for dynamic behavior extension',
  requiredCapabilities: ['decorator-pattern', 'composition', 'behavior-extension'],
  compatibleWith: ['middleware-architect', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['decorator', 'structural', 'pattern', 'extension'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'adapter-pattern-implementer' as AgentType,
  name: 'Adapter Pattern Implementer',
  category: 'patterns',
  subcategory: 'structural',
  complexity: 'medium',
  description: 'Implements adapter patterns for interface compatibility',
  requiredCapabilities: ['adapter-pattern', 'interface-conversion', 'compatibility'],
  compatibleWith: ['api-designer', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 32000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['adapter', 'structural', 'pattern', 'compatibility'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'facade-pattern-implementer' as AgentType,
  name: 'Facade Pattern Implementer',
  category: 'patterns',
  subcategory: 'structural',
  complexity: 'medium',
  description: 'Implements facade patterns for simplified complex subsystem access',
  requiredCapabilities: ['facade-pattern', 'simplification', 'subsystem-abstraction'],
  compatibleWith: ['architect', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['facade', 'structural', 'pattern', 'simplification'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'proxy-pattern-implementer' as AgentType,
  name: 'Proxy Pattern Implementer',
  category: 'patterns',
  subcategory: 'structural',
  complexity: 'medium',
  description: 'Implements proxy patterns for access control and lazy loading',
  requiredCapabilities: ['proxy-pattern', 'access-control', 'lazy-loading'],
  compatibleWith: ['security-scanner', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 33000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['proxy', 'structural', 'pattern', 'access'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'chain-of-responsibility-implementer' as AgentType,
  name: 'Chain of Responsibility Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements chain of responsibility for sequential request processing',
  requiredCapabilities: ['chain-of-responsibility', 'request-processing', 'pipeline'],
  compatibleWith: ['middleware-architect', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 36000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['chain', 'behavioral', 'pattern', 'pipeline'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'command-pattern-implementer' as AgentType,
  name: 'Command Pattern Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements command patterns for encapsulation and undo/redo functionality',
  requiredCapabilities: ['command-pattern', 'action-encapsulation', 'undo-redo'],
  compatibleWith: ['cqrs-implementer', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['command', 'behavioral', 'pattern', 'undo'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'state-pattern-implementer' as AgentType,
  name: 'State Pattern Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements state patterns for managing object state transitions',
  requiredCapabilities: ['state-pattern', 'state-management', 'transitions'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 34000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['state', 'behavioral', 'pattern', 'transition'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'template-method-implementer' as AgentType,
  name: 'Template Method Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'medium',
  description: 'Implements template method patterns for algorithm skeleton definition',
  requiredCapabilities: ['template-method', 'algorithm-skeleton', 'subclass-customization'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['template', 'behavioral', 'pattern', 'skeleton'],
  priority: 40,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'visitor-pattern-implementer' as AgentType,
  name: 'Visitor Pattern Implementer',
  category: 'patterns',
  subcategory: 'behavioral',
  complexity: 'high',
  description: 'Implements visitor patterns for operations on object structures',
  requiredCapabilities: ['visitor-pattern', 'traversal', 'operation-separation'],
  compatibleWith: ['feature-coder', 'refactorer'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 320, cpuPercent: 18 },
  tags: ['visitor', 'behavioral', 'pattern', 'traversal'],
  priority: 40,
  maxConcurrent: 3,
});
// ============================================================================
// INFRASTRUCTURE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'middleware-architect' as AgentType,
  name: 'Middleware Architect',
  category: 'infrastructure',
  subcategory: 'middleware',
  complexity: 'high',
  description: 'Designs and implements middleware pipelines for request/response processing',
  requiredCapabilities: ['middleware', 'pipeline-design', 'cross-cutting-concerns'],
  compatibleWith: ['architect', 'guard-implementer', 'interceptor-designer'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['middleware', 'pipeline', 'cross-cutting', 'processing'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'interceptor-designer' as AgentType,
  name: 'Interceptor Designer',
  category: 'infrastructure',
  subcategory: 'interception',
  complexity: 'medium',
  description: 'Designs interceptors for request/response modification and logging',
  requiredCapabilities: ['interceptor', 'request-modification', 'response-modification'],
  compatibleWith: ['middleware-architect', 'logging-architect'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 320, cpuPercent: 20 },
  tags: ['interceptor', 'request', 'response', 'logging'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'guard-implementer' as AgentType,
  name: 'Guard Implementer',
  category: 'infrastructure',
  subcategory: 'security',
  complexity: 'medium',
  description: 'Implements route guards and access control decorators',
  requiredCapabilities: ['route-guards', 'access-control', 'authentication'],
  compatibleWith: ['auth-architect', 'middleware-architect'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 18 },
  tags: ['guard', 'access', 'auth', 'route'],
  priority: 55,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'pipe-transformer' as AgentType,
  name: 'Pipe Transformer',
  category: 'infrastructure',
  subcategory: 'transformation',
  complexity: 'low',
  description: 'Implements data transformation pipes for input/output validation and formatting',
  requiredCapabilities: ['pipes', 'data-transformation', 'validation'],
  compatibleWith: ['middleware-architect', 'api-designer'],
  conflictsWith: [],
  estimatedDurationMs: 25000,
  resourceProfile: { memoryMB: 192, cpuPercent: 12 },
  tags: ['pipe', 'transform', 'validation', 'format'],
  priority: 45,
  maxConcurrent: 6,
});

defaultRegistry.register({
  type: 'exception-filter-designer' as AgentType,
  name: 'Exception Filter Designer',
  category: 'infrastructure',
  subcategory: 'error-handling',
  complexity: 'medium',
  description: 'Designs exception filters for centralized error handling and formatting',
  requiredCapabilities: ['exception-handling', 'error-filtering', 'error-formatting'],
  compatibleWith: ['middleware-architect', 'bug-fixer'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['exception', 'error', 'filter', 'handling'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'health-check-implementer' as AgentType,
  name: 'Health Check Implementer',
  category: 'infrastructure',
  subcategory: 'monitoring',
  complexity: 'low',
  description: 'Implements health check endpoints and liveness/readiness probes',
  requiredCapabilities: ['health-checks', 'monitoring', 'probes'],
  compatibleWith: ['metrics-collector', 'tracing-instrumenter'],
  conflictsWith: [],
  estimatedDurationMs: 20000,
  resourceProfile: { memoryMB: 192, cpuPercent: 10 },
  tags: ['health', 'check', 'probe', 'monitoring'],
  priority: 40,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'metrics-collector' as AgentType,
  name: 'Metrics Collector',
  category: 'infrastructure',
  subcategory: 'observability',
  complexity: 'medium',
  description: 'Implements metrics collection for application performance monitoring',
  requiredCapabilities: ['metrics', 'collection', 'prometheus'],
  compatibleWith: ['tracing-instrumenter', 'logging-architect'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['metrics', 'collection', 'prometheus', 'monitoring'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'tracing-instrumenter' as AgentType,
  name: 'Tracing Instrumenter',
  category: 'infrastructure',
  subcategory: 'observability',
  complexity: 'high',
  description: 'Instruments distributed tracing for request flow visualization',
  requiredCapabilities: ['tracing', 'distributed-tracing', 'opentelemetry'],
  compatibleWith: ['metrics-collector', 'logging-architect'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['tracing', 'opentelemetry', 'distributed', 'span'],
  priority: 50,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'logging-architect' as AgentType,
  name: 'Logging Architect',
  category: 'infrastructure',
  subcategory: 'observability',
  complexity: 'medium',
  description: 'Designs structured logging architecture with correlation and levels',
  requiredCapabilities: ['logging', 'structured-logging', 'correlation'],
  compatibleWith: ['metrics-collector', 'tracing-instrumenter'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 384, cpuPercent: 18 },
  tags: ['logging', 'structured', 'correlation', 'levels'],
  priority: 50,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'config-manager' as AgentType,
  name: 'Config Manager',
  category: 'infrastructure',
  subcategory: 'configuration',
  complexity: 'medium',
  description: 'Manages application configuration with environment-specific overrides',
  requiredCapabilities: ['configuration', 'environment', 'feature-toggles'],
  compatibleWith: ['feature-flag-manager', 'ab-testing-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['config', 'configuration', 'environment', 'settings'],
  priority: 45,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'feature-flag-manager' as AgentType,
  name: 'Feature Flag Manager',
  category: 'infrastructure',
  subcategory: 'feature-management',
  complexity: 'medium',
  description: 'Implements feature flag systems for gradual rollouts and A/B testing',
  requiredCapabilities: ['feature-flags', 'rollout', 'experimentation'],
  compatibleWith: ['config-manager', 'ab-testing-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['feature-flag', 'rollout', 'toggle', 'experiment'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'ab-testing-implementer' as AgentType,
  name: 'A/B Testing Implementer',
  category: 'infrastructure',
  subcategory: 'experimentation',
  complexity: 'medium',
  description: 'Implements A/B testing infrastructure with statistical analysis',
  requiredCapabilities: ['ab-testing', 'experimentation', 'statistical-analysis'],
  compatibleWith: ['feature-flag-manager', 'config-manager'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 320, cpuPercent: 20 },
  tags: ['ab-test', 'experiment', 'statistical', 'comparison'],
  priority: 45,
  maxConcurrent: 2,
});
// ============================================================================
// SECURITY AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'auth-architect' as AgentType,
  name: 'Auth Architect',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'expert',
  description: 'Designs comprehensive authentication and authorization systems',
  requiredCapabilities: ['authentication', 'authorization', 'security-design'],
  compatibleWith: ['guard-implementer', 'oauth2-implementer', 'jwt-token-manager'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['auth', 'authentication', 'authorization', 'security'],
  priority: 90,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'security-scanner' as AgentType,
  name: 'Security Scanner',
  category: 'security',
  subcategory: 'scanning',
  complexity: 'high',
  description: 'Scans codebases for security vulnerabilities and provides remediation',
  requiredCapabilities: ['vulnerability-scanning', 'sast', 'dependency-audit'],
  compatibleWith: ['penetration-tester', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 1024, cpuPercent: 50 },
  tags: ['security', 'scan', 'vulnerability', 'sast'],
  priority: 85,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'encryption-specialist' as AgentType,
  name: 'Encryption Specialist',
  category: 'security',
  subcategory: 'cryptography',
  complexity: 'expert',
  description: 'Implements encryption at rest and in transit with proper key management',
  requiredCapabilities: ['encryption', 'cryptography', 'key-management'],
  compatibleWith: ['certificate-manager', 'secrets-manager'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['encryption', 'crypto', 'aes', 'rsa'],
  priority: 75,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'compliance-officer' as AgentType,
  name: 'Compliance Officer',
  category: 'security',
  subcategory: 'compliance',
  complexity: 'high',
  description: 'Ensures code and architecture meet regulatory compliance requirements',
  requiredCapabilities: ['compliance', 'gdpr', 'hipaa', 'soc2'],
  compatibleWith: ['security-scanner', 'secrets-manager'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['compliance', 'regulation', 'gdpr', 'audit'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'penetration-tester' as AgentType,
  name: 'Penetration Tester',
  category: 'security',
  subcategory: 'testing',
  complexity: 'expert',
  description: 'Performs penetration testing and identifies attack vectors',
  requiredCapabilities: ['penetration-testing', 'attack-simulation', 'exploit-analysis'],
  compatibleWith: ['security-scanner', 'security-test-auditor'],
  conflictsWith: [],
  estimatedDurationMs: 180000,
  resourceProfile: { memoryMB: 768, cpuPercent: 45 },
  tags: ['pentest', 'attack', 'exploit', 'penetration'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'session-manager' as AgentType,
  name: 'Session Manager',
  category: 'security',
  subcategory: 'session',
  complexity: 'medium',
  description: 'Implements secure session management with proper lifecycle handling',
  requiredCapabilities: ['session-management', 'token-handling', 'secure-cookies'],
  compatibleWith: ['auth-architect', 'jwt-token-manager'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 256, cpuPercent: 18 },
  tags: ['session', 'cookie', 'token', 'lifecycle'],
  priority: 55,
  maxConcurrent: 3,
});
defaultRegistry.register({
  type: 'csrf-protector' as AgentType,
  name: 'CSRF Protector',
  category: 'security',
  subcategory: 'web-security',
  complexity: 'medium',
  description: 'Implements CSRF protection with token-based validation',
  requiredCapabilities: ['csrf-protection', 'token-validation', 'form-security'],
  compatibleWith: ['auth-architect', 'middleware-architect'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 192, cpuPercent: 12 },
  tags: ['csrf', 'token', 'form', 'web-security'],
  priority: 60,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'xss-sanitizer' as AgentType,
  name: 'XSS Sanitizer',
  category: 'security',
  subcategory: 'web-security',
  complexity: 'medium',
  description: 'Implements XSS prevention through input sanitization and output encoding',
  requiredCapabilities: ['xss-prevention', 'input-sanitization', 'output-encoding'],
  compatibleWith: ['security-scanner', 'middleware-architect'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['xss', 'sanitization', 'encoding', 'input'],
  priority: 60,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'sql-injection-preventer' as AgentType,
  name: 'SQL Injection Preventer',
  category: 'security',
  subcategory: 'injection',
  complexity: 'medium',
  description: 'Implements SQL injection prevention through parameterized queries and ORM usage',
  requiredCapabilities: ['sql-injection-prevention', 'parameterized-queries', 'orm-security'],
  compatibleWith: ['database-architect', 'security-scanner'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 192, cpuPercent: 12 },
  tags: ['sql-injection', 'parameterized', 'orm', 'prevention'],
  priority: 65,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'path-traversal-guard' as AgentType,
  name: 'Path Traversal Guard',
  category: 'security',
  subcategory: 'file-security',
  complexity: 'low',
  description: 'Implements path traversal prevention for file system operations',
  requiredCapabilities: ['path-traversal-prevention', 'file-system-security', 'input-validation'],
  compatibleWith: ['security-scanner', 'middleware-architect'],
  conflictsWith: [],
  estimatedDurationMs: 20000,
  resourceProfile: { memoryMB: 128, cpuPercent: 10 },
  tags: ['path-traversal', 'filesystem', 'validation', 'guard'],
  priority: 50,
  maxConcurrent: 6,
});

defaultRegistry.register({
  type: 'secrets-manager' as AgentType,
  name: 'Secrets Manager',
  category: 'security',
  subcategory: 'secrets',
  complexity: 'high',
  description: 'Manages secrets, API keys, and sensitive configuration with rotation',
  requiredCapabilities: ['secrets-management', 'key-rotation', 'vault-integration'],
  compatibleWith: ['encryption-specialist', 'config-manager', 'certificate-manager'],
  conflictsWith: [],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['secrets', 'vault', 'keys', 'rotation'],
  priority: 75,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'certificate-manager' as AgentType,
  name: 'Certificate Manager',
  category: 'security',
  subcategory: 'pki',
  complexity: 'high',
  description: 'Manages TLS certificates, renewal, and certificate chain validation',
  requiredCapabilities: ['certificate-management', 'pki', 'tls-certificates'],
  compatibleWith: ['tls-configurator', 'secrets-manager'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['certificate', 'tls', 'pki', 'renewal'],
  priority: 60,
  maxConcurrent: 2,
});
defaultRegistry.register({
  type: 'tls-configurator' as AgentType,
  name: 'TLS Configurator',
  category: 'security',
  subcategory: 'transport',
  complexity: 'medium',
  description: 'Configures TLS settings, cipher suites, and protocol versions',
  requiredCapabilities: ['tls-configuration', 'cipher-suites', 'protocol-management'],
  compatibleWith: ['certificate-manager', 'encryption-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['tls', 'transport', 'cipher', 'protocol'],
  priority: 55,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'mfa-implementer' as AgentType,
  name: 'MFA Implementer',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'medium',
  description: 'Implements multi-factor authentication with TOTP, SMS, and push notifications',
  requiredCapabilities: ['mfa', 'totp', 'sms-verification', 'push-notifications'],
  compatibleWith: ['auth-architect', 'session-manager'],
  conflictsWith: [],
  estimatedDurationMs: 55000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['mfa', '2fa', 'totp', 'verification'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'sso-integrator' as AgentType,
  name: 'SSO Integrator',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'high',
  description: 'Integrates Single Sign-On with SAML, OIDC, and enterprise identity providers',
  requiredCapabilities: ['sso', 'saml', 'oidc', 'identity-provider'],
  compatibleWith: ['auth-architect', 'oauth2-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['sso', 'saml', 'oidc', 'identity'],
  priority: 65,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'oauth2-implementer' as AgentType,
  name: 'OAuth2 Implementer',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'high',
  description: 'Implements OAuth2 flows including authorization code, client credentials, and PKCE',
  requiredCapabilities: ['oauth2', 'authorization-flows', 'token-management'],
  compatibleWith: ['auth-architect', 'jwt-token-manager', 'sso-integrator'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['oauth2', 'oauth', 'authorization', 'pkce'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'jwt-token-manager' as AgentType,
  name: 'JWT Token Manager',
  category: 'security',
  subcategory: 'tokens',
  complexity: 'medium',
  description: 'Implements JWT token creation, validation, refresh, and blacklisting',
  requiredCapabilities: ['jwt', 'token-creation', 'token-validation', 'refresh-tokens'],
  compatibleWith: ['auth-architect', 'session-manager', 'oauth2-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 320, cpuPercent: 18 },
  tags: ['jwt', 'token', 'refresh', 'blacklist'],
  priority: 65,
  maxConcurrent: 3,
});
defaultRegistry.register({
  type: 'rbac-designer' as AgentType,
  name: 'RBAC Designer',
  category: 'security',
  subcategory: 'authorization',
  complexity: 'high',
  description: 'Designs role-based access control systems with hierarchical permissions',
  requiredCapabilities: ['rbac', 'role-management', 'permission-design'],
  compatibleWith: ['auth-architect', 'abac-policy-engine'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['rbac', 'role', 'permission', 'access-control'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'abac-policy-engine' as AgentType,
  name: 'ABAC Policy Engine',
  category: 'security',
  subcategory: 'authorization',
  complexity: 'expert',
  description: 'Implements attribute-based access control with policy evaluation engines',
  requiredCapabilities: ['abac', 'policy-engine', 'attribute-evaluation'],
  compatibleWith: ['rbac-designer', 'auth-architect'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 640, cpuPercent: 30 },
  tags: ['abac', 'policy', 'attribute', 'access-control'],
  priority: 60,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'webauthn-implementer' as AgentType,
  name: 'WebAuthn Implementer',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'high',
  description: 'Implements WebAuthn for passwordless and cross-platform authentication',
  requiredCapabilities: ['webauthn', 'fido2', 'passwordless'],
  compatibleWith: ['auth-architect', 'passkey-manager'],
  conflictsWith: [],
  estimatedDurationMs: 85000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['webauthn', 'fido2', 'passwordless', 'biometric'],
  priority: 60,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'passkey-manager' as AgentType,
  name: 'Passkey Manager',
  category: 'security',
  subcategory: 'authentication',
  complexity: 'high',
  description: 'Manages passkey lifecycle including creation, authentication, and recovery',
  requiredCapabilities: ['passkeys', 'credential-management', 'recovery'],
  compatibleWith: ['webauthn-implementer', 'auth-architect'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 448, cpuPercent: 25 },
  tags: ['passkey', 'credential', 'recovery', 'sync'],
  priority: 55,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'rate-limiter-implementer' as AgentType,
  name: 'Rate Limiter Implementer',
  category: 'security',
  subcategory: 'protection',
  complexity: 'medium',
  description: 'Implements rate limiting with sliding window, token bucket, and leaky bucket algorithms',
  requiredCapabilities: ['rate-limiting', 'throttling', 'algorithm-implementation'],
  compatibleWith: ['middleware-architect', 'throttle-controller'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 256, cpuPercent: 18 },
  tags: ['rate-limit', 'throttle', 'protection', 'algorithm'],
  priority: 60,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'throttle-controller' as AgentType,
  name: 'Throttle Controller',
  category: 'security',
  subcategory: 'protection',
  complexity: 'medium',
  description: 'Controls request throttling with configurable policies and user tiers',
  requiredCapabilities: ['throttling', 'tier-management', 'policy-enforcement'],
  compatibleWith: ['rate-limiter-implementer', 'middleware-architect'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['throttle', 'tier', 'policy', 'control'],
  priority: 55,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'quota-manager' as AgentType,
  name: 'Quota Manager',
  category: 'security',
  subcategory: 'protection',
  complexity: 'medium',
  description: 'Manages resource quotas and usage tracking for API consumers',
  requiredCapabilities: ['quota-management', 'usage-tracking', 'limit-enforcement'],
  compatibleWith: ['rate-limiter-implementer', 'config-manager'],
  conflictsWith: [],
  estimatedDurationMs: 38000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['quota', 'usage', 'limit', 'tracking'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'circuit-breaker-implementer' as AgentType,
  name: 'Circuit Breaker Implementer',
  category: 'security',
  subcategory: 'resilience',
  complexity: 'medium',
  description: 'Implements circuit breaker patterns for fault tolerance and graceful degradation',
  requiredCapabilities: ['circuit-breaker', 'fault-tolerance', 'fallback'],
  compatibleWith: ['retry-policy-designer', 'bulkhead-isolator'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['circuit-breaker', 'fault-tolerance', 'fallback', 'resilience'],
  priority: 55,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'retry-policy-designer' as AgentType,
  name: 'Retry Policy Designer',
  category: 'security',
  subcategory: 'resilience',
  complexity: 'medium',
  description: 'Designs retry policies with exponential backoff, jitter, and circuit integration',
  requiredCapabilities: ['retry-policy', 'exponential-backoff', 'jitter'],
  compatibleWith: ['circuit-breaker-implementer', 'timeout-manager'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 192, cpuPercent: 12 },
  tags: ['retry', 'backoff', 'jitter', 'resilience'],
  priority: 50,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'timeout-manager' as AgentType,
  name: 'Timeout Manager',
  category: 'security',
  subcategory: 'resilience',
  complexity: 'low',
  description: 'Manages request and connection timeouts with configurable policies',
  requiredCapabilities: ['timeout-management', 'connection-lifecycle', 'policy-configuration'],
  compatibleWith: ['circuit-breaker-implementer', 'retry-policy-designer'],
  conflictsWith: [],
  estimatedDurationMs: 25000,
  resourceProfile: { memoryMB: 192, cpuPercent: 10 },
  tags: ['timeout', 'connection', 'policy', 'lifecycle'],
  priority: 45,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'bulkhead-isolator' as AgentType,
  name: 'Bulkhead Isolator',
  category: 'security',
  subcategory: 'resilience',
  complexity: 'medium',
  description: 'Implements bulkhead patterns for resource isolation and failure containment',
  requiredCapabilities: ['bulkhead', 'resource-isolation', 'failure-containment'],
  compatibleWith: ['circuit-breaker-implementer', 'timeout-manager'],
  conflictsWith: [],
  estimatedDurationMs: 32000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['bulkhead', 'isolation', 'containment', 'resilience'],
  priority: 50,
  maxConcurrent: 3,
});
// ============================================================================
// TESTING AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'test-writer' as AgentType,
  name: 'Test Writer',
  category: 'testing',
  subcategory: 'unit',
  complexity: 'medium',
  description: 'Writes comprehensive unit tests with proper mocking and assertions',
  requiredCapabilities: ['unit-testing', 'mocking', 'assertions'],
  compatibleWith: ['feature-coder', 'bug-fixer', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['testing', 'unit', 'mock', 'assertion'],
  priority: 80,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'unit-test-writer' as AgentType,
  name: 'Unit Test Writer',
  category: 'testing',
  subcategory: 'unit',
  complexity: 'medium',
  description: 'Writes focused unit tests for individual functions and classes',
  requiredCapabilities: ['unit-testing', 'test-design', 'boundary-testing'],
  compatibleWith: ['feature-coder', 'test-writer'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 320, cpuPercent: 22 },
  tags: ['unit-test', 'function', 'class', 'boundary'],
  priority: 75,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'integration-test-writer' as AgentType,
  name: 'Integration Test Writer',
  category: 'testing',
  subcategory: 'integration',
  complexity: 'high',
  description: 'Writes integration tests for API endpoints, databases, and service interactions',
  requiredCapabilities: ['integration-testing', 'api-testing', 'database-testing'],
  compatibleWith: ['test-writer', 'api-designer', 'database-architect'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['integration', 'api', 'database', 'service'],
  priority: 70,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'e2e-test-writer' as AgentType,
  name: 'E2E Test Writer',
  category: 'testing',
  subcategory: 'e2e',
  complexity: 'high',
  description: 'Writes end-to-end tests simulating complete user workflows',
  requiredCapabilities: ['e2e-testing', 'browser-automation', 'workflow-testing'],
  compatibleWith: ['test-writer', 'react-specialist', 'vue-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['e2e', 'workflow', 'browser', 'automation'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'contract-test-writer' as AgentType,
  name: 'Contract Test Writer',
  category: 'testing',
  subcategory: 'contract',
  complexity: 'high',
  description: 'Writes contract tests to verify API compatibility between services',
  requiredCapabilities: ['contract-testing', 'pact', 'api-contracts'],
  compatibleWith: ['api-designer', 'integration-test-writer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['contract', 'pact', 'api', 'compatibility'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'load-test-engineer' as AgentType,
  name: 'Load Test Engineer',
  category: 'testing',
  subcategory: 'performance',
  complexity: 'high',
  description: 'Designs and runs load tests to validate system performance under stress',
  requiredCapabilities: ['load-testing', 'performance-testing', 'stress-testing'],
  compatibleWith: ['performance-profiler', 'scaler'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 640, cpuPercent: 40 },
  tags: ['load', 'performance', 'stress', 'throughput'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'chaos-engineer' as AgentType,
  name: 'Chaos Engineer',
  category: 'testing',
  subcategory: 'chaos',
  complexity: 'expert',
  description: 'Designs chaos experiments to test system resilience and fault tolerance',
  requiredCapabilities: ['chaos-engineering', 'fault-injection', 'resilience-testing'],
  compatibleWith: ['circuit-breaker-implementer', 'bulkhead-isolator'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['chaos', 'fault-injection', 'resilience', 'experiment'],
  priority: 55,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'security-test-auditor' as AgentType,
  name: 'Security Test Auditor',
  category: 'testing',
  subcategory: 'security',
  complexity: 'high',
  description: 'Audits code for security vulnerabilities and generates compliance reports',
  requiredCapabilities: ['security-audit', 'vulnerability-assessment', 'compliance-reporting'],
  compatibleWith: ['security-scanner', 'penetration-tester', 'compliance-officer'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 640, cpuPercent: 35 },
  tags: ['security', 'audit', 'vulnerability', 'compliance'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'visual-regression-tester' as AgentType,
  name: 'Visual Regression Tester',
  category: 'testing',
  subcategory: 'visual',
  complexity: 'medium',
  description: 'Detects visual regressions through screenshot comparison and pixel analysis',
  requiredCapabilities: ['visual-testing', 'screenshot-comparison', 'pixel-analysis'],
  compatibleWith: ['e2e-test-writer', 'css-design-system', 'frontend-performance'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['visual', 'regression', 'screenshot', 'pixel'],
  priority: 55,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'mutation-testing-specialist' as AgentType,
  name: 'Mutation Testing Specialist',
  category: 'testing',
  subcategory: 'mutation',
  complexity: 'high',
  description: 'Runs mutation testing to validate test quality and coverage effectiveness',
  requiredCapabilities: ['mutation-testing', 'test-quality', 'coverage-analysis'],
  compatibleWith: ['test-writer', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 640, cpuPercent: 35 },
  tags: ['mutation', 'test-quality', 'coverage', 'effectiveness'],
  priority: 50,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'property-based-tester' as AgentType,
  name: 'Property-Based Tester',
  category: 'testing',
  subcategory: 'property',
  complexity: 'high',
  description: 'Implements property-based testing with generative data and invariant checking',
  requiredCapabilities: ['property-based-testing', 'generative-testing', 'invariant-checking'],
  compatibleWith: ['test-writer', 'unit-test-writer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 448, cpuPercent: 28 },
  tags: ['property', 'generative', 'invariant', 'hypothesis'],
  priority: 50,
  maxConcurrent: 2,
});
// ============================================================================
// DEVOPS AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'dockerizer' as AgentType,
  name: 'Dockerizer',
  category: 'devops',
  subcategory: 'containerization',
  complexity: 'medium',
  description: 'Creates optimized Dockerfiles and docker-compose configurations',
  requiredCapabilities: ['docker', 'containerization', 'image-optimization'],
  compatibleWith: ['kubernetes-engineer', 'helm-chart-designer'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['docker', 'container', 'dockerfile', 'compose'],
  priority: 70,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'kubernetes-engineer' as AgentType,
  name: 'Kubernetes Engineer',
  category: 'devops',
  subcategory: 'orchestration',
  complexity: 'expert',
  description: 'Designs and manages Kubernetes deployments, services, and configurations',
  requiredCapabilities: ['kubernetes', 'kubectl', 'helm', 'resource-management'],
  compatibleWith: ['dockerizer', 'helm-chart-designer', 'argocd-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['kubernetes', 'k8s', 'orchestration', 'deploy'],
  priority: 75,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'helm-chart-designer' as AgentType,
  name: 'Helm Chart Designer',
  category: 'devops',
  subcategory: 'packaging',
  complexity: 'high',
  description: 'Designs Helm charts with templates, values, and release management',
  requiredCapabilities: ['helm', 'chart-design', 'templating', 'values-management'],
  compatibleWith: ['kubernetes-engineer', 'dockerizer'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['helm', 'chart', 'template', 'release'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'argocd-specialist' as AgentType,
  name: 'ArgoCD Specialist',
  category: 'devops',
  subcategory: 'gitops',
  complexity: 'high',
  description: 'Implements GitOps workflows with ArgoCD for declarative deployments',
  requiredCapabilities: ['argocd', 'gitops', 'declarative-deployment'],
  compatibleWith: ['kubernetes-engineer', 'github-actions-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['argocd', 'gitops', 'declarative', 'sync'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'terraform-module-author' as AgentType,
  name: 'Terraform Module Author',
  category: 'devops',
  subcategory: 'iac',
  complexity: 'high',
  description: 'Authors reusable Terraform modules for infrastructure provisioning',
  requiredCapabilities: ['terraform', 'iac', 'module-design', 'provider-management'],
  compatibleWith: ['ansible-playbook-writer', 'kubernetes-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['terraform', 'iac', 'module', 'provisioning'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'ansible-playbook-writer' as AgentType,
  name: 'Ansible Playbook Writer',
  category: 'devops',
  subcategory: 'automation',
  complexity: 'high',
  description: 'Writes Ansible playbooks for configuration management and automation',
  requiredCapabilities: ['ansible', 'playbook-writing', 'configuration-management'],
  compatibleWith: ['terraform-module-author', 'kubernetes-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 448, cpuPercent: 25 },
  tags: ['ansible', 'playbook', 'configuration', 'automation'],
  priority: 60,
  maxConcurrent: 2,
});
defaultRegistry.register({
  type: 'github-actions-engineer' as AgentType,
  name: 'GitHub Actions Engineer',
  category: 'devops',
  subcategory: 'ci-cd',
  complexity: 'medium',
  description: 'Designs GitHub Actions workflows for CI/CD pipelines',
  requiredCapabilities: ['github-actions', 'workflow-design', 'ci-cd'],
  compatibleWith: ['gitlab-ci-engineer', 'ci-configurator'],
  conflictsWith: [],
  estimatedDurationMs: 55000,
  resourceProfile: { memoryMB: 384, cpuPercent: 22 },
  tags: ['github', 'actions', 'workflow', 'ci-cd'],
  priority: 65,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'gitlab-ci-engineer' as AgentType,
  name: 'GitLab CI Engineer',
  category: 'devops',
  subcategory: 'ci-cd',
  complexity: 'medium',
  description: 'Designs GitLab CI/CD pipelines with stages, jobs, and caching',
  requiredCapabilities: ['gitlab-ci', 'pipeline-design', 'caching'],
  compatibleWith: ['github-actions-engineer', 'ci-configurator'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['gitlab', 'ci', 'pipeline', 'stages'],
  priority: 60,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'cost-optimizer' as AgentType,
  name: 'Cost Optimizer',
  category: 'devops',
  subcategory: 'optimization',
  complexity: 'high',
  description: 'Analyzes and optimizes cloud infrastructure costs and resource utilization',
  requiredCapabilities: ['cost-analysis', 'resource-optimization', 'cloud-pricing'],
  compatibleWith: ['kubernetes-engineer', 'terraform-module-author', 'scaler'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['cost', 'optimization', 'cloud', 'pricing'],
  priority: 55,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'disaster-recovery-architect' as AgentType,
  name: 'Disaster Recovery Architect',
  category: 'devops',
  subcategory: 'recovery',
  complexity: 'expert',
  description: 'Designs disaster recovery plans with backup, failover, and restoration procedures',
  requiredCapabilities: ['disaster-recovery', 'backup', 'failover', 'restoration'],
  compatibleWith: ['kubernetes-engineer', 'terraform-module-author'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 768, cpuPercent: 30 },
  tags: ['disaster-recovery', 'backup', 'failover', 'rto'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'deployer' as AgentType,
  name: 'Deployer',
  category: 'devops',
  subcategory: 'deployment',
  complexity: 'medium',
  description: 'Executes deployment procedures with rollback capabilities and health checks',
  requiredCapabilities: ['deployment', 'rollback', 'health-checks'],
  compatibleWith: ['kubernetes-engineer', 'rollback-manager', 'ci-configurator'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 320, cpuPercent: 20 },
  tags: ['deploy', 'release', 'rollback', 'health'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'rollback-manager' as AgentType,
  name: 'Rollback Manager',
  category: 'devops',
  subcategory: 'recovery',
  complexity: 'medium',
  description: 'Manages deployment rollbacks with state preservation and recovery verification',
  requiredCapabilities: ['rollback', 'state-preservation', 'recovery-verification'],
  compatibleWith: ['deployer', 'kubernetes-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 35000,
  resourceProfile: { memoryMB: 256, cpuPercent: 18 },
  tags: ['rollback', 'recovery', 'state', 'verification'],
  priority: 60,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'ci-configurator' as AgentType,
  name: 'CI Configurator',
  category: 'devops',
  subcategory: 'ci-cd',
  complexity: 'medium',
  description: 'Configures and optimizes CI/CD environments with caching and parallelization',
  requiredCapabilities: ['ci-configuration', 'caching', 'parallelization'],
  compatibleWith: ['github-actions-engineer', 'gitlab-ci-engineer', 'deployer'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 320, cpuPercent: 20 },
  tags: ['ci', 'configuration', 'caching', 'parallel'],
  priority: 55,
  maxConcurrent: 3,
});
// ============================================================================
// FRONTEND AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'react-specialist' as AgentType,
  name: 'React Specialist',
  category: 'frontend',
  subcategory: 'framework',
  complexity: 'high',
  description: 'Builds and optimizes React applications with hooks, context, and performance patterns',
  requiredCapabilities: ['react', 'hooks', 'state-management', 'component-design'],
  compatibleWith: ['vue-specialist', 'frontend-performance', 'accessibility-expert'],
  conflictsWith: ['vue-specialist'],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['react', 'hooks', 'jsx', 'component'],
  priority: 75,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'vue-specialist' as AgentType,
  name: 'Vue Specialist',
  category: 'frontend',
  subcategory: 'framework',
  complexity: 'high',
  description: 'Builds and optimizes Vue applications with Composition API and reactivity',
  requiredCapabilities: ['vue', 'composition-api', 'reactivity', 'component-design'],
  compatibleWith: ['react-specialist', 'frontend-performance', 'accessibility-expert'],
  conflictsWith: ['react-specialist'],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['vue', 'composition-api', 'sfc', 'component'],
  priority: 70,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'css-design-system' as AgentType,
  name: 'CSS Design System',
  category: 'frontend',
  subcategory: 'styling',
  complexity: 'high',
  description: 'Creates design systems with CSS, custom properties, and responsive patterns',
  requiredCapabilities: ['css', 'design-system', 'responsive-design', 'custom-properties'],
  compatibleWith: ['react-specialist', 'vue-specialist', 'accessibility-expert'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 384, cpuPercent: 22 },
  tags: ['css', 'design-system', 'responsive', 'custom-properties'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'frontend-performance' as AgentType,
  name: 'Frontend Performance',
  category: 'frontend',
  subcategory: 'performance',
  complexity: 'high',
  description: 'Optimizes frontend performance with lazy loading, code splitting, and caching',
  requiredCapabilities: ['web-performance', 'lazy-loading', 'code-splitting', 'caching'],
  compatibleWith: ['react-specialist', 'vue-specialist', 'cache-strategist'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['performance', 'lazy-loading', 'code-split', 'optimization'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'accessibility-expert' as AgentType,
  name: 'Accessibility Expert',
  category: 'frontend',
  subcategory: 'a11y',
  complexity: 'high',
  description: 'Implements WCAG compliance, ARIA patterns, and assistive technology support',
  requiredCapabilities: ['accessibility', 'wcag', 'aria', 'assistive-technology'],
  compatibleWith: ['react-specialist', 'vue-specialist', 'css-design-system'],
  conflictsWith: [],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 384, cpuPercent: 22 },
  tags: ['accessibility', 'a11y', 'wcag', 'aria'],
  priority: 65,
  maxConcurrent: 2,
});
// ============================================================================
// BACKEND AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'nodejs-specialist' as AgentType,
  name: 'Node.js Specialist',
  category: 'backend',
  subcategory: 'runtime',
  complexity: 'high',
  description: 'Builds and optimizes Node.js applications with event-driven and stream patterns',
  requiredCapabilities: ['nodejs', 'event-driven', 'streams', 'async-programming'],
  compatibleWith: ['python-specialist', 'go-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['nodejs', 'node', 'typescript', 'express'],
  priority: 75,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'python-specialist' as AgentType,
  name: 'Python Specialist',
  category: 'backend',
  subcategory: 'runtime',
  complexity: 'high',
  description: 'Builds and optimizes Python applications with Django, FastAPI, and async patterns',
  requiredCapabilities: ['python', 'django', 'fastapi', 'async-programming'],
  compatibleWith: ['nodejs-specialist', 'go-specialist', 'ml-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['python', 'django', 'fastapi', 'async'],
  priority: 75,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'go-specialist' as AgentType,
  name: 'Go Specialist',
  category: 'backend',
  subcategory: 'runtime',
  complexity: 'high',
  description: 'Builds high-performance Go applications with goroutines, channels, and interfaces',
  requiredCapabilities: ['go', 'goroutines', 'channels', 'concurrency'],
  compatibleWith: ['rust-specialist', 'nodejs-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['go', 'golang', 'concurrency', 'performance'],
  priority: 70,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'rust-specialist' as AgentType,
  name: 'Rust Specialist',
  category: 'backend',
  subcategory: 'runtime',
  complexity: 'expert',
  description: 'Builds systems-level Rust applications with memory safety and zero-cost abstractions',
  requiredCapabilities: ['rust', 'ownership', 'systems-programming', 'unsafe'],
  compatibleWith: ['go-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['rust', 'systems', 'memory-safety', 'performance'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'java-kotlin-specialist' as AgentType,
  name: 'Java/Kotlin Specialist',
  category: 'backend',
  subcategory: 'runtime',
  complexity: 'high',
  description: 'Builds enterprise Java and Kotlin applications with Spring Boot and reactive patterns',
  requiredCapabilities: ['java', 'kotlin', 'spring-boot', 'jvm'],
  compatibleWith: ['nodejs-specialist', 'python-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 640, cpuPercent: 30 },
  tags: ['java', 'kotlin', 'spring', 'jvm'],
  priority: 70,
  maxConcurrent: 3,
});
// ============================================================================
// MOBILE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'react-native-developer' as AgentType,
  name: 'React Native Developer',
  category: 'mobile',
  subcategory: 'cross-platform',
  complexity: 'high',
  description: 'Builds cross-platform mobile applications with React Native and native modules',
  requiredCapabilities: ['react-native', 'cross-platform', 'native-modules'],
  compatibleWith: ['flutter-developer', 'react-specialist', 'ios-native-developer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 640, cpuPercent: 32 },
  tags: ['react-native', 'mobile', 'cross-platform', 'ios', 'android'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'flutter-developer' as AgentType,
  name: 'Flutter Developer',
  category: 'mobile',
  subcategory: 'cross-platform',
  complexity: 'high',
  description: 'Builds cross-platform mobile applications with Flutter and Dart',
  requiredCapabilities: ['flutter', 'dart', 'widget-tree', 'state-management'],
  compatibleWith: ['react-native-developer', 'android-native-developer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 640, cpuPercent: 32 },
  tags: ['flutter', 'dart', 'mobile', 'cross-platform'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'ios-native-developer' as AgentType,
  name: 'iOS Native Developer',
  category: 'mobile',
  subcategory: 'native',
  complexity: 'high',
  description: 'Builds native iOS applications with Swift, SwiftUI, and UIKit',
  requiredCapabilities: ['swift', 'swiftui', 'uikit', 'ios-sdk'],
  compatibleWith: ['react-native-developer', 'android-native-developer'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['ios', 'swift', 'swiftui', 'uikit'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'android-native-developer' as AgentType,
  name: 'Android Native Developer',
  category: 'mobile',
  subcategory: 'native',
  complexity: 'high',
  description: 'Builds native Android applications with Kotlin, Jetpack Compose, and Android SDK',
  requiredCapabilities: ['kotlin', 'jetpack-compose', 'android-sdk', 'material-design'],
  compatibleWith: ['ios-native-developer', 'flutter-developer'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['android', 'kotlin', 'jetpack', 'material'],
  priority: 65,
  maxConcurrent: 2,
});
// ============================================================================
// AI/ML AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'ml-engineer' as AgentType,
  name: 'ML Engineer',
  category: 'ai-ml',
  subcategory: 'engineering',
  complexity: 'expert',
  description: 'Builds and deploys machine learning models with training pipelines and monitoring',
  requiredCapabilities: ['machine-learning', 'model-training', 'deployment'],
  compatibleWith: ['llm-specialist', 'data-analyst', 'recommendation-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 2048, cpuPercent: 70 },
  tags: ['ml', 'machine-learning', 'training', 'deployment'],
  priority: 75,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'llm-specialist' as AgentType,
  name: 'LLM Specialist',
  category: 'ai-ml',
  subcategory: 'nlp',
  complexity: 'expert',
  description: 'Integrates and fine-tunes large language models for specific use cases',
  requiredCapabilities: ['llm', 'prompt-engineering', 'fine-tuning', 'rag'],
  compatibleWith: ['ml-engineer', 'search-architect', 'vector-db-designer'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 1024, cpuPercent: 60 },
  tags: ['llm', 'gpt', 'prompt', 'fine-tuning'],
  priority: 75,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'data-analyst' as AgentType,
  name: 'Data Analyst',
  category: 'ai-ml',
  subcategory: 'analysis',
  complexity: 'high',
  description: 'Analyzes data patterns, generates insights, and creates visualization dashboards',
  requiredCapabilities: ['data-analysis', 'visualization', 'statistics'],
  compatibleWith: ['ml-engineer', 'data-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 640, cpuPercent: 35 },
  tags: ['data', 'analysis', 'visualization', 'statistics'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'recommendation-engineer' as AgentType,
  name: 'Recommendation Engineer',
  category: 'ai-ml',
  subcategory: 'recommendation',
  complexity: 'high',
  description: 'Builds recommendation engines with collaborative and content-based filtering',
  requiredCapabilities: ['recommendation', 'collaborative-filtering', 'content-based'],
  compatibleWith: ['ml-engineer', 'search-architect', 'vector-db-designer'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 768, cpuPercent: 40 },
  tags: ['recommendation', 'filtering', 'personalization', 'ranking'],
  priority: 60,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'search-architect' as AgentType,
  name: 'Search Architect',
  category: 'ai-ml',
  subcategory: 'search',
  complexity: 'high',
  description: 'Designs search systems with full-text search, ranking, and relevance tuning',
  requiredCapabilities: ['search', 'full-text-search', 'ranking', 'relevance'],
  compatibleWith: ['llm-specialist', 'vector-db-designer', 'recommendation-engineer'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 768, cpuPercent: 35 },
  tags: ['search', 'elasticsearch', 'ranking', 'relevance'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'vector-db-designer' as AgentType,
  name: 'Vector DB Designer',
  category: 'ai-ml',
  subcategory: 'vector',
  complexity: 'high',
  description: 'Designs vector database schemas for embeddings, similarity search, and RAG pipelines',
  requiredCapabilities: ['vector-database', 'embeddings', 'similarity-search'],
  compatibleWith: ['ml-engineer', 'llm-specialist', 'search-architect'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['vector', 'embedding', 'similarity', 'rag'],
  priority: 60,
  maxConcurrent: 2,
});
// ============================================================================
// MONITORING AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'metrics-engineer' as AgentType,
  name: 'Metrics Engineer',
  category: 'monitoring',
  subcategory: 'metrics',
  complexity: 'high',
  description: 'Designs and implements metrics dashboards with Prometheus and Grafana',
  requiredCapabilities: ['metrics', 'prometheus', 'grafana', 'dashboards'],
  compatibleWith: ['tracing-specialist', 'alerting-designer'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['metrics', 'prometheus', 'grafana', 'dashboard'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'tracing-specialist' as AgentType,
  name: 'Tracing Specialist',
  category: 'monitoring',
  subcategory: 'tracing',
  complexity: 'high',
  description: 'Implements distributed tracing with Jaeger, Zipkin, and OpenTelemetry',
  requiredCapabilities: ['distributed-tracing', 'jaeger', 'opentelemetry'],
  compatibleWith: ['metrics-engineer', 'logging-architect'],
  conflictsWith: [],
  estimatedDurationMs: 65000,
  resourceProfile: { memoryMB: 512, cpuPercent: 25 },
  tags: ['tracing', 'jaeger', 'zipkin', 'opentelemetry'],
  priority: 55,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'alerting-designer' as AgentType,
  name: 'Alerting Designer',
  category: 'monitoring',
  subcategory: 'alerting',
  complexity: 'medium',
  description: 'Designs alerting rules, escalation policies, and on-call rotations',
  requiredCapabilities: ['alerting', 'alertmanager', 'escalation', 'on-call'],
  compatibleWith: ['metrics-engineer', 'incident-responder'],
  conflictsWith: [],
  estimatedDurationMs: 50000,
  resourceProfile: { memoryMB: 384, cpuPercent: 20 },
  tags: ['alerting', 'alertmanager', 'escalation', 'on-call'],
  priority: 55,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'incident-responder' as AgentType,
  name: 'Incident Responder',
  category: 'monitoring',
  subcategory: 'incident',
  complexity: 'high',
  description: 'Manages incident response with triage, mitigation, and post-mortem analysis',
  requiredCapabilities: ['incident-response', 'triage', 'mitigation', 'post-mortem'],
  compatibleWith: ['alerting-designer', 'logging-architect'],
  conflictsWith: [],
  estimatedDurationMs: 90000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['incident', 'response', 'triage', 'post-mortem'],
  priority: 65,
  maxConcurrent: 1,
});
// ============================================================================
// PERFORMANCE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'cache-strategist' as AgentType,
  name: 'Cache Strategist',
  category: 'performance',
  subcategory: 'caching',
  complexity: 'high',
  description: 'Designs caching strategies with Redis, CDN, and multi-tier cache invalidation',
  requiredCapabilities: ['caching', 'redis', 'cdn', 'cache-invalidation'],
  compatibleWith: ['frontend-performance', 'rest-optimizer', 'performance-profiler'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 512, cpuPercent: 28 },
  tags: ['cache', 'redis', 'cdn', 'invalidation'],
  priority: 70,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'performance-profiler' as AgentType,
  name: 'Performance Profiler',
  category: 'performance',
  subcategory: 'profiling',
  complexity: 'high',
  description: 'Profiles application performance to identify bottlenecks and optimization opportunities',
  requiredCapabilities: ['profiling', 'flame-graphs', 'memory-profiling'],
  compatibleWith: ['cache-strategist', 'load-test-engineer', 'scaler'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 640, cpuPercent: 35 },
  tags: ['profiling', 'flame-graph', 'memory', 'bottleneck'],
  priority: 65,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'performance-test-engineer' as AgentType,
  name: 'Performance Test Engineer',
  category: 'performance',
  subcategory: 'testing',
  complexity: 'high',
  description: 'Designs and executes performance tests to validate system benchmarks',
  requiredCapabilities: ['performance-testing', 'benchmarking', 'load-generation'],
  compatibleWith: ['load-test-engineer', 'performance-profiler'],
  conflictsWith: [],
  estimatedDurationMs: 75000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['performance', 'benchmark', 'load', 'throughput'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'scaler' as AgentType,
  name: 'Scaler',
  category: 'performance',
  subcategory: 'scaling',
  complexity: 'high',
  description: 'Implements auto-scaling policies and horizontal/vertical scaling strategies',
  requiredCapabilities: ['auto-scaling', 'horizontal-scaling', 'vertical-scaling'],
  compatibleWith: ['kubernetes-engineer', 'performance-profiler', 'cost-optimizer'],
  conflictsWith: [],
  estimatedDurationMs: 65000,
  resourceProfile: { memoryMB: 448, cpuPercent: 25 },
  tags: ['scaling', 'auto-scaling', 'horizontal', 'vertical'],
  priority: 65,
  maxConcurrent: 2,
});
// ============================================================================
// SPECIALIZED AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'ecommerce-specialist' as AgentType,
  name: 'E-commerce Specialist',
  category: 'specialized',
  subcategory: 'domain',
  complexity: 'high',
  description: 'Builds e-commerce features including product catalogs, carts, and checkout flows',
  requiredCapabilities: ['e-commerce', 'product-catalog', 'shopping-cart', 'checkout'],
  compatibleWith: ['payment-specialist', 'search-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 100000,
  resourceProfile: { memoryMB: 640, cpuPercent: 32 },
  tags: ['ecommerce', 'product', 'cart', 'checkout'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'payment-specialist' as AgentType,
  name: 'Payment Specialist',
  category: 'specialized',
  subcategory: 'domain',
  complexity: 'expert',
  description: 'Implements payment processing with Stripe, PayPal, and PCI compliance',
  requiredCapabilities: ['payment-processing', 'stripe', 'pci-compliance', 'fraud-detection'],
  compatibleWith: ['ecommerce-specialist', 'security-scanner', 'encryption-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 120000,
  resourceProfile: { memoryMB: 640, cpuPercent: 35 },
  tags: ['payment', 'stripe', 'pci', 'fraud'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'notification-specialist' as AgentType,
  name: 'Notification Specialist',
  category: 'specialized',
  subcategory: 'domain',
  complexity: 'medium',
  description: 'Implements notification systems with email, SMS, push, and in-app messaging',
  requiredCapabilities: ['notifications', 'email', 'sms', 'push-notifications'],
  compatibleWith: ['message-queue-architect', 'email-template-designer'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 384, cpuPercent: 22 },
  tags: ['notification', 'email', 'sms', 'push'],
  priority: 55,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'search-specialist' as AgentType,
  name: 'Search Specialist',
  category: 'specialized',
  subcategory: 'domain',
  complexity: 'high',
  description: 'Implements search functionality with full-text search, filters, and autocomplete',
  requiredCapabilities: ['search', 'full-text', 'autocomplete', 'filtering'],
  compatibleWith: ['search-architect', 'ecommerce-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 80000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['search', 'autocomplete', 'filter', 'full-text'],
  priority: 60,
  maxConcurrent: 2,
});

defaultRegistry.register({
  type: 'cdn-optimizer' as AgentType,
  name: 'CDN Optimizer',
  category: 'specialized',
  subcategory: 'optimization',
  complexity: 'medium',
  description: 'Optimizes CDN configuration for static assets, caching, and edge computing',
  requiredCapabilities: ['cdn', 'static-assets', 'edge-computing', 'cache-policies'],
  compatibleWith: ['cache-strategist', 'frontend-performance'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 320, cpuPercent: 18 },
  tags: ['cdn', 'static', 'edge', 'cache'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'email-template-designer' as AgentType,
  name: 'Email Template Designer',
  category: 'specialized',
  subcategory: 'domain',
  complexity: 'low',
  description: 'Designs responsive email templates with cross-client compatibility',
  requiredCapabilities: ['email-design', 'html-email', 'responsive-email'],
  compatibleWith: ['notification-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 192, cpuPercent: 12 },
  tags: ['email', 'template', 'responsive', 'html'],
  priority: 40,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'localization-expert' as AgentType,
  name: 'Localization Expert',
  category: 'specialized',
  subcategory: 'i18n',
  complexity: 'medium',
  description: 'Implements internationalization and localization with i18n frameworks and RTL support',
  requiredCapabilities: ['i18n', 'l10n', 'rtl-support', 'locale-management'],
  compatibleWith: ['react-specialist', 'vue-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 55000,
  resourceProfile: { memoryMB: 320, cpuPercent: 18 },
  tags: ['i18n', 'l10n', 'localization', 'rtl'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'image-processor' as AgentType,
  name: 'Image Processor',
  category: 'specialized',
  subcategory: 'media',
  complexity: 'medium',
  description: 'Implements image processing pipelines with resizing, compression, and format conversion',
  requiredCapabilities: ['image-processing', 'compression', 'format-conversion', 'optimization'],
  compatibleWith: ['cdn-optimizer', 'frontend-performance'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 384, cpuPercent: 25 },
  tags: ['image', 'processing', 'compression', 'optimization'],
  priority: 45,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'pdf-generator' as AgentType,
  name: 'PDF Generator',
  category: 'specialized',
  subcategory: 'document',
  complexity: 'medium',
  description: 'Generates PDF documents with templates, charts, and dynamic content',
  requiredCapabilities: ['pdf-generation', 'templating', 'chart-rendering'],
  compatibleWith: ['notification-specialist', 'feature-coder'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 384, cpuPercent: 22 },
  tags: ['pdf', 'document', 'template', 'chart'],
  priority: 40,
  maxConcurrent: 3,
});
// ============================================================================
// DOCUMENTATION AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'doc-generator' as AgentType,
  name: 'Doc Generator',
  category: 'documentation',
  subcategory: 'generation',
  complexity: 'medium',
  description: 'Generates API documentation, README files, and inline code documentation',
  requiredCapabilities: ['documentation', 'api-docs', 'readme-generation'],
  compatibleWith: ['technical-writer', 'code-commentator'],
  conflictsWith: [],
  estimatedDurationMs: 45000,
  resourceProfile: { memoryMB: 256, cpuPercent: 15 },
  tags: ['documentation', 'api-docs', 'readme', 'generation'],
  priority: 55,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'technical-writer' as AgentType,
  name: 'Technical Writer',
  category: 'documentation',
  subcategory: 'writing',
  complexity: 'medium',
  description: 'Writes technical documentation including architecture guides and user manuals',
  requiredCapabilities: ['technical-writing', 'architecture-documentation', 'user-guides'],
  compatibleWith: ['doc-generator', 'changelog-manager'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 256, cpuPercent: 12 },
  tags: ['technical-writing', 'guide', 'manual', 'architecture'],
  priority: 50,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'code-commentator' as AgentType,
  name: 'Code Commentator',
  category: 'documentation',
  subcategory: 'commenting',
  complexity: 'low',
  description: 'Adds meaningful code comments, JSDoc/TSDoc annotations, and documentation blocks',
  requiredCapabilities: ['code-commenting', 'jsdoc', 'tsdoc', 'documentation-blocks'],
  compatibleWith: ['doc-generator', 'code-reviewer'],
  conflictsWith: [],
  estimatedDurationMs: 30000,
  resourceProfile: { memoryMB: 192, cpuPercent: 10 },
  tags: ['comments', 'jsdoc', 'tsdoc', 'annotation'],
  priority: 40,
  maxConcurrent: 6,
});

defaultRegistry.register({
  type: 'changelog-manager' as AgentType,
  name: 'Changelog Manager',
  category: 'documentation',
  subcategory: 'changelog',
  complexity: 'low',
  description: 'Manages changelogs following semantic versioning and conventional commits',
  requiredCapabilities: ['changelog', 'semver', 'conventional-commits'],
  compatibleWith: ['technical-writer', 'doc-generator'],
  conflictsWith: [],
  estimatedDurationMs: 25000,
  resourceProfile: { memoryMB: 192, cpuPercent: 10 },
  tags: ['changelog', 'semver', 'versioning', 'commits'],
  priority: 40,
  maxConcurrent: 4,
});

// ============================================================================
// CODE QUALITY AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'code-reviewer' as AgentType,
  name: 'Code Reviewer',
  category: 'code-quality',
  subcategory: 'review',
  complexity: 'high',
  description: 'Reviews code for quality, security, performance, and adherence to standards',
  requiredCapabilities: ['code-review', 'best-practices', 'security-review'],
  compatibleWith: ['feature-coder', 'bug-fixer', 'refactorer', 'lint-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 60000,
  resourceProfile: { memoryMB: 512, cpuPercent: 30 },
  tags: ['review', 'quality', 'best-practices', 'standards'],
  priority: 80,
  maxConcurrent: 3,
});

defaultRegistry.register({
  type: 'type-fixer' as AgentType,
  name: 'Type Fixer',
  category: 'code-quality',
  subcategory: 'typing',
  complexity: 'medium',
  description: 'Fixes TypeScript type errors and adds proper type annotations',
  requiredCapabilities: ['typescript', 'type-inference', 'type-annotations'],
  compatibleWith: ['code-reviewer', 'refactorer', 'lint-specialist'],
  conflictsWith: [],
  estimatedDurationMs: 40000,
  resourceProfile: { memoryMB: 320, cpuPercent: 20 },
  tags: ['typescript', 'types', 'annotations', 'inference'],
  priority: 55,
  maxConcurrent: 4,
});

defaultRegistry.register({
  type: 'lint-specialist' as AgentType,
  name: 'Lint Specialist',
  category: 'code-quality',
  subcategory: 'linting',
  complexity: 'low',
  description: 'Configures and applies linting rules for consistent code style',
  requiredCapabilities: ['eslint', 'prettier', 'code-style'],
  compatibleWith: ['code-reviewer', 'type-fixer'],
  conflictsWith: [],
  estimatedDurationMs: 25000,
  resourceProfile: { memoryMB: 192, cpuPercent: 10 },
  tags: ['lint', 'eslint', 'prettier', 'style'],
  priority: 50,
  maxConcurrent: 6,
});

// ============================================================================
// ARCHITECTURE AGENTS
// ============================================================================
defaultRegistry.register({
  type: 'service-mesh-architect' as AgentType,
  name: 'Service Mesh Architect',
  category: 'architecture',
  subcategory: 'mesh',
  complexity: 'expert',
  description: 'Designs service mesh topologies with Istio, Linkerd, or Envoy',
  requiredCapabilities: ['service-mesh', 'istio', 'envoy', 'mTLS'],
  compatibleWith: ['architect', 'kubernetes-engineer', 'distributed-lock-implementer'],
  conflictsWith: [],
  estimatedDurationMs: 150000,
  resourceProfile: { memoryMB: 1024, cpuPercent: 40 },
  tags: ['service-mesh', 'istio', 'envoy', 'mtls'],
  priority: 70,
  maxConcurrent: 1,
});

defaultRegistry.register({
  type: 'distributed-lock-implementer' as AgentType,
  name: 'Distributed Lock Implementer',
  category: 'architecture',
  subcategory: 'distributed',
  complexity: 'high',
  description: 'Implements distributed locking with Redis, ZooKeeper, or etcd',
  requiredCapabilities: ['distributed-locking', 'redis', 'consensus'],
  compatibleWith: ['database-architect', 'message-queue-architect'],
  conflictsWith: [],
  estimatedDurationMs: 70000,
  resourceProfile: { memoryMB: 448, cpuPercent: 25 },
  tags: ['distributed', 'lock', 'redis', 'consensus'],
  priority: 55,
  maxConcurrent: 2,
});