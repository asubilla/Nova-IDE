import { EventEmitter } from 'events';
import {
  AgentTask, AgentResult, AgentType, Session, SessionConfig, ProjectProfile,
  TaskSpec, AgentPrompt, ContextFile, ValidationRule, ValidationResult, AgentError,
  OutputFile, LogEntry, LivePreviewEvent, AgentOutput, AgentSummary,
  SummaryMetrics, Issue, FileChange, Artifact, AgentCoordinationMessage,
  CheckpointData, ResourceUsage, QualityGate, RetryPolicy,
} from './types';
import { PROMPT_TEMPLATES, buildPrompt, PromptTemplate } from '../templates/prompt-templates';
import { defaultRegistry, AgentRegistry } from '../registry/agent-registry';
import { LivePreviewManager, PreviewEventEmitter } from '../preview/live-preview';
import { ErrorFixLoop, LoopConfig, createErrorFixLoop, createLoopConfigWithDefaults } from '../error-fix-loop/loop';
import {
  ValidationRunner, ValidationAggregator, ValidationResultAnalyzer,
  createValidationRunner, createValidationAggregator, createValidationResultAnalyzer,
} from '../error-fix-loop/validator';
import { selectBestStrategy, buildFixPromptFromContext, createStrategyHistory, updateStrategyHistory, StrategyHistory } from '../error-fix-loop/strategies';
import { EscalationManager, createEscalationManager, buildDefaultEscalationRules } from '../error-fix-loop/escalation';
import {
  ProjectAwareDistributor, TaskDecomposer, DependencyResolver,
  DecomposedTask, ResolvedDependencyGraph, DistributionPlan, ProjectAnalysis,
} from '../agents/project-aware-distributor';
import { ProjectAnalyzer } from '../context/analyzer';
import { DynamicTemplateLoader } from '../templates/template-loader';
import { UserTemplateDefinition, TemplateMatchResult } from '../templates/template-schema';
import { AgentSandbox, AgentSandboxConfig, DEFAULT_SANDBOX_CONFIG } from '../security/sandbox';
import { PermissionManager, DEFAULT_PERMISSIONS } from '../security/permissions';
import { SecretsVault } from '../security/secrets-vault';
import { AuditLogger } from '../security/audit-logger';
import { BudgetLimiter, DEFAULT_BUDGET_CONFIG } from '../security/budget-limiter';
import { AgentMessageBus } from '../advanced/communication/message-bus';
import { PluginSystem } from '../advanced/plugins/plugin-system';
import { WorkflowEngine } from '../advanced/workflow/workflow-engine';
import { SelfHealingSystem } from '../advanced/healing/self-healing';
import { KnowledgeBase } from '../advanced/knowledge/knowledge-base';
import { AIModelRouter } from '../advanced/models/model-router';
import { CostOptimizer } from '../advanced/cost/cost-optimizer';
import { CrossSessionMemory } from '../advanced/memory/cross-session-memory';
import { AgentVersioning } from '../advanced/versioning/agent-versioning';
import { PerformanceProfiler } from '../advanced/profiling/performance-profiler';
import { AgentMarketplace } from '../advanced/marketplace/agent-marketplace';
import { ToolCreator } from '../advanced/tools/tool-creator';
import { ABTesting } from '../advanced/abtesting/ab-testing';
import { LearningSystem } from '../advanced/learning/learning-system';
import { RealTimeCollaboration } from '../advanced/collaboration/real-time-collaboration';
import { ExtensionManager } from '../extensions/extension-manager';
import { CoordinationBus } from '../coordination/bus';
import { DependencyGraph } from '../coordination/dependency-graph';
import { SyncPoint, PhaseConfig } from '../coordination/sync-points';
import { ArtifactManager } from '../artifacts/manager';
import { QualityGateRunner } from '../quality/gates';
import { CheckpointManager } from '../session/checkpoint';

// ─── Semaphore ───────────────────────────────────────────────────────────────

class Semaphore {
  private current: number;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    this.current = 0;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.current--;
    }
  }

  get available(): number {
    return this.max - this.current;
  }

  get waiting(): number {
    return this.queue.length;
  }

  get running(): number {
    return this.current;
  }
}

// ─── Enhanced Orchestrator ───────────────────────────────────────────────────

export class EnhancedSubAgentOrchestrator extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private registry: AgentRegistry;
  private previewManagers: Map<string, LivePreviewManager> = new Map();
  private previewEmitters: Map<string, PreviewEventEmitter> = new Map();
  private errorFixLoops: Map<string, ErrorFixLoop> = new Map();
  private distributors: Map<string, ProjectAwareDistributor> = new Map();
  private taskDecomposer: TaskDecomposer;
  private dependencyResolver: DependencyResolver;
  private projectAnalyzer: ProjectAnalyzer;
  private config: SessionConfig;
  private validationRunner: ValidationRunner;
  private validationAggregator: ValidationAggregator;
  private resultAnalyzer: ValidationResultAnalyzer;
  private escalationManager: EscalationManager;
  private checkpointTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private dynamicTemplateLoader: DynamicTemplateLoader;
  private userTemplateDirs: Set<string> = new Set();
  private sandbox: AgentSandbox;
  private permissionManager: PermissionManager;
  private secretsVault: SecretsVault;
  private auditLogger: AuditLogger;
  private budgetLimiter: BudgetLimiter;
  private messageBus: AgentMessageBus;
  private pluginSystem: PluginSystem;
  private workflowEngine: WorkflowEngine;
  private healingSystem: SelfHealingSystem;
  private knowledgeBase: KnowledgeBase;
  private modelRouter: AIModelRouter;
  private costOptimizer: CostOptimizer;
  private crossSessionMemory: CrossSessionMemory;
  private agentVersioning: AgentVersioning;
  private performanceProfiler: PerformanceProfiler;
  private marketplace: AgentMarketplace;
  private toolCreator: ToolCreator;
  private abTesting: ABTesting;
  private learningSystem: LearningSystem;
  private collaboration: RealTimeCollaboration;
  private extensionManager: ExtensionManager;
  private coordinationBus: CoordinationBus;
  private dependencyGraph: DependencyGraph;
  private syncPoint: SyncPoint;
  private artifactManager: ArtifactManager;
  private qualityGateRunner: QualityGateRunner;
  private checkpointManager: CheckpointManager;

  constructor(config?: Partial<SessionConfig>) {
    super();
    this.config = {
      maxAgentsPerSession: 100,
      maxConcurrentAgents: 20,
      defaultTimeoutMs: 300000,
      globalRetryPolicy: { maxRetries: 3, backoffMs: 5000, escalateOnFailure: true },
      enableLivePreview: true,
      previewPort: 3001,
      checkpointIntervalMs: 30000,
      artifactRetentionDays: 7,
      spawnConfig: {
        maxAgentsPerSession: 100,
        maxConcurrentAgents: 20,
        spawnStrategy: 'dependency-aware',
        resourceLimits: {
          maxMemoryMB: 8192,
          maxCpuPercent: 90,
          maxDiskMB: 10240,
          maxNetworkMbps: 100,
          maxFileHandles: 1024,
          maxChildProcesses: 64,
        },
        autoScaling: {
          enabled: true,
          minAgents: 1,
          maxAgents: 20,
          scaleUpThreshold: 0.7,
          scaleDownThreshold: 0.3,
          cooldownMs: 30000,
          metricsWindowMs: 60000,
        },
      },
      distributionStrategy: 'project-aware',
      errorFixLoop: {
        maxIterations: 5,
        backoffStrategy: 'exponential',
        baseBackoffMs: 1000,
        maxBackoffMs: 30000,
        escalationRules: buildDefaultEscalationRules(),
        fixStrategies: [],
        validationGates: [],
      },
      coordinationEnabled: true,
      persistenceEnabled: false,
      ...config,
    };

    this.registry = defaultRegistry;
    this.taskDecomposer = new TaskDecomposer();
    this.dependencyResolver = new DependencyResolver();
    this.projectAnalyzer = new ProjectAnalyzer();
    this.validationRunner = createValidationRunner();
    this.validationAggregator = createValidationAggregator();
    this.resultAnalyzer = createValidationResultAnalyzer();
    this.escalationManager = createEscalationManager(this.config.errorFixLoop.escalationRules);
    this.dynamicTemplateLoader = new DynamicTemplateLoader({ autoReload: true, watchIntervalMs: 10000 });
    this.dynamicTemplateLoader.on('template-loaded', (event: any) => this.emit('template-loaded', event));
    this.dynamicTemplateLoader.on('template-removed', (event: any) => this.emit('template-removed', event));

    this.sandbox = new AgentSandbox(DEFAULT_SANDBOX_CONFIG);
    this.permissionManager = new PermissionManager();
    this.secretsVault = new SecretsVault(Buffer.from(process.env.VAULT_KEY || 'default-dev-key-change-in-prod'));
    this.auditLogger = new AuditLogger();
    this.budgetLimiter = new BudgetLimiter(DEFAULT_BUDGET_CONFIG);

    this.messageBus = new AgentMessageBus();
    this.pluginSystem = new PluginSystem({ autoReload: true });
    this.workflowEngine = new WorkflowEngine();
    this.healingSystem = new SelfHealingSystem();
    this.knowledgeBase = new KnowledgeBase();
    this.modelRouter = new AIModelRouter();
    this.costOptimizer = new CostOptimizer();
    this.crossSessionMemory = new CrossSessionMemory();
    this.agentVersioning = new AgentVersioning();
    this.performanceProfiler = new PerformanceProfiler();
    this.marketplace = new AgentMarketplace();
    this.toolCreator = new ToolCreator();
    this.abTesting = new ABTesting();
    this.learningSystem = new LearningSystem();
    this.collaboration = new RealTimeCollaboration();
    this.extensionManager = new ExtensionManager({ autoReload: true });

    this.coordinationBus = new CoordinationBus();
    this.dependencyGraph = new DependencyGraph();
    this.syncPoint = new SyncPoint();
    this.artifactManager = new ArtifactManager();
    this.qualityGateRunner = new QualityGateRunner();
    this.checkpointManager = new CheckpointManager();
  }

  // ─── Core: Execute Task ───────────────────────────────────────────────────

  async executeTask(userPrompt: string, projectRoot: string): Promise<Session> {
    const sessionId = this.generateSessionId();

    this.emitPreview(sessionId, {
      type: 'session-status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'initializing', phase: 'project-analysis' },
    });

    const projectProfile = await this.projectAnalyzer.analyze(projectRoot);
    const taskSpec = this.parseIntent(userPrompt, projectProfile);
    const session = this.createSession(sessionId, taskSpec, projectProfile);
    this.sessions.set(sessionId, session);

    let previewManager: LivePreviewManager | undefined;
    if (this.config.enableLivePreview) {
      previewManager = new LivePreviewManager(sessionId, 0);
      this.previewManagers.set(sessionId, previewManager);
      const emitter = new PreviewEventEmitter(previewManager);
      this.previewEmitters.set(sessionId, emitter);
      emitter.on('preview-event', (event: LivePreviewEvent) => this.emit('preview', event));
    }

    const distributor = new ProjectAwareDistributor(projectProfile);
    this.distributors.set(sessionId, distributor);

    const analysis = distributor.analyzeProject();
    const distributionPlan = distributor.createDistributionPlan(
      userPrompt,
      Array.from(this.registry.getAll().map((r) => r.type)),
    );

    this.emitPreview(sessionId, {
      type: 'session-status',
      sessionId,
      timestamp: new Date(),
      data: {
        status: 'planning',
        analysis: {
          projectType: analysis.projectType,
          primaryLanguage: analysis.primaryLanguage,
          codebaseSize: analysis.codebaseSize,
          agents: distributionPlan.totalAgents,
          phases: distributionPlan.phases.length,
        },
      },
    });

    const executionPlan = await this.createExecutionPlan(session, distributor);

    const taskMap = new Map<string, AgentTask>();
    for (const task of executionPlan) {
      taskMap.set(task.id, task);
      session.agents.set(task.id, task);
    }

    if (previewManager) {
      previewManager.sessionStatusChanged('running');
      for (const [, task] of session.agents) {
        previewManager.agentQueued(task.id, task.type, task.name);
      }
    }

    session.status = 'running';
    this.emitPreview(sessionId, {
      type: 'session-status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'running', totalAgents: session.agents.size },
    });

    const semaphore = new Semaphore(this.config.maxConcurrentAgents);
    const agentPromises: Promise<void>[] = [];

    for (const [, task] of session.agents) {
      agentPromises.push(this.runAgentWithSemaphore(session, task, semaphore));
    }

    await Promise.allSettled(agentPromises);

    const allCompleted = Array.from(session.results.values()).every(
      (r) => r.status === 'completed' || r.status === 'cancelled',
    );
    session.status = allCompleted ? 'completed' : 'failed';
    session.updatedAt = new Date();

    if (previewManager) {
      previewManager.sessionStatusChanged(session.status);
    }

    this.emitPreview(sessionId, {
      type: 'session-status',
      sessionId,
      timestamp: new Date(),
      data: {
        status: session.status,
        summary: this.buildSessionSummary(session),
      },
    });

    if (this.checkpointTimers.has(sessionId)) {
      clearInterval(this.checkpointTimers.get(sessionId)!);
      this.checkpointTimers.delete(sessionId);
    }

    return session;
  }

  // ─── Core: Create Execution Plan ──────────────────────────────────────────

  private async createExecutionPlan(
    session: Session,
    distributor: ProjectAwareDistributor,
  ): Promise<AgentTask[]> {
    const decomposed = this.taskDecomposer.decompose(
      session.taskSpec.userPrompt,
      distributor.analyzeProject(),
    );

    const resolved = this.dependencyResolver.resolve(decomposed);

    const tasks: AgentTask[] = [];
    const taskIdMap = new Map<string, string>();

    for (const dt of resolved.tasks) {
      const taskId = this.generateTaskId();
      taskIdMap.set(dt.id, taskId);

      const agentType = this.resolveAgentType(dt.suggestedAgentType);
      const template = PROMPT_TEMPLATES[agentType] || PROMPT_TEMPLATES['feature-coder'];

      const prompt = buildPrompt(template, {
        taskDescription: dt.description,
        requirements: dt.description,
        acceptanceCriteria: 'All validations pass',
        conventions: session.projectProfile.conventions.map((c) => `${c.name}: ${c.pattern}`).join('\n'),
        patterns: `Follow existing patterns in ${session.projectProfile.structure.srcDirs.join(', ') || 'src/'}`,
        targetFiles: dt.filesInvolved.join(', ') || 'src/',
        goals: dt.description,
        bugDescription: dt.description,
        symptoms: 'N/A',
        reproSteps: 'N/A',
        errorLogs: 'N/A',
        affectedFiles: dt.filesInvolved.join(', '),
        recentChanges: 'N/A',
        targetDescription: dt.description,
        testPatterns: session.projectProfile.testFrameworks.join(', ') || 'vitest',
        lineCoverage: '80',
        branchCoverage: '70',
        functionCoverage: '80',
        docTarget: dt.description,
        docType: 'API Reference',
        audience: 'Developers',
        sourceFiles: session.projectProfile.structure.srcDirs.join(', ') || 'src/',
        docStyle: 'JSDoc + Markdown',
        typeErrors: 'N/A',
        focusAreas: 'Security, Performance',
        diff: '',
        standards: session.projectProfile.conventions.map((c) => c.pattern).join(', '),
        targetScope: session.projectProfile.structure.srcDirs.join(', ') || 'src/',
        threatModel: 'OWASP Top 10',
        compliance: 'SOC2',
        currentMetrics: 'N/A',
        targetMetrics: 'N/A',
        profilingData: 'N/A',
        wcagLevel: 'AA',
        projectPath: session.projectProfile.rootPath,
        dependencies: session.projectProfile.dependencies.slice(0, 20).map((d) => d.name).join(', '),
        vulnerabilities: 'N/A',
        licensePolicy: 'MIT',
        projectType: session.projectProfile.frameworks.map((f) => f.name).join(', ') || 'generic',
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        port: '3000',
        envVars: 'NODE_ENV=development',
        existingDockerfile: 'N/A',
        ciPlatform: session.projectProfile.ciSystems[0] || 'github-actions',
        triggers: 'push, pr',
        jobs: 'lint, test, build',
        environments: 'staging, production',
        existingConfig: 'N/A',
        artifact: 'N/A',
        environment: 'staging',
        strategy: 'blue-green',
        healthChecks: '/health',
        rollbackTriggers: 'health check fail',
        migrationType: 'database',
        fromVersion: '1.0',
        toVersion: '2.0',
        scope: dt.filesInvolved.join(', ') || 'src/',
        dataVolume: 'N/A',
        downtimeTolerance: '0',
        existingMigrations: 'migrations/',
        targetSystem: 'API',
        targetLoad: '10k RPS',
        architecture: session.projectProfile.structure.pattern,
        bottlenecks: 'N/A',
        budget: 'N/A',
        deployment: 'N/A',
        currentState: 'N/A',
        targetState: 'N/A',
        scale: 'N/A',
        teamStructure: 'N/A',
        capacity: 'N/A',
      }, []);

      const registration = this.registry.get(agentType);
      const resourceProfile = registration
        ? { memoryMB: registration.resourceProfile.memoryMB, cpuPercent: registration.resourceProfile.cpuPercent, diskMB: 100, networkMbps: 2 }
        : { memoryMB: 256, cpuPercent: 20, diskMB: 100, networkMbps: 2 };

      tasks.push({
        id: taskId,
        type: agentType,
        name: `${agentType}: ${dt.description.slice(0, 60)}`,
        description: dt.description,
        priority: dt.priority,
        dependencies: dt.dependencies.map((depId) => taskIdMap.get(depId) || depId),
        prompt,
        assignedFiles: dt.filesInvolved,
        estimatedTokens: 50000,
        timeoutMs: this.config.defaultTimeoutMs,
        requiredCapabilities: registration?.requiredCapabilities || [],
        resourceProfile,
        phase: `phase-${resolved.levels.findIndex((level) => level.includes(dt.id))}`,
        parallelGroup: resolved.levels.findIndex((level) => level.includes(dt.id)),
        spawnOrder: tasks.length,
        childTaskIds: [],
        coordinationRequirements: [],
        qualityGates: this.buildQualityGates(agentType),
      });
    }

    return tasks;
  }

  private resolveAgentType(suggested: string): AgentType {
    const valid: AgentType[] = [
      'feature-coder', 'refactorer', 'bug-fixer', 'test-writer', 'doc-generator',
      'type-fixer', 'code-reviewer', 'security-scanner', 'performance-profiler',
      'accessibility-auditor', 'dependency-auditor', 'license-checker',
      'dockerizer', 'ci-configurator', 'deployer', 'migrator', 'scaler',
      'rollback-manager', 'architect', 'planner', 'api-designer',
      'database-architect', 'graphql-specialist', 'rest-optimizer',
      'websocket-engineer', 'grpc-proto-designer', 'message-queue-architect',
      'event-sourcing-specialist', 'cqrs-implementer', 'domain-modeler',
    ];

    if (valid.includes(suggested as AgentType)) {
      return suggested as AgentType;
    }

    const aliasMap: Record<string, AgentType> = {
      coder: 'feature-coder',
      tester: 'test-writer',
      debugger: 'bug-fixer',
      reviewer: 'code-reviewer',
      devops: 'dockerizer',
      documentation: 'doc-generator',
      refactoring: 'refactorer',
      performance: 'performance-profiler',
      analysis: 'code-reviewer',
      migration: 'migrator',
      architect: 'architect',
      security: 'security-scanner',
    };

    return aliasMap[suggested] || 'feature-coder';
  }

  private buildQualityGates(agentType: AgentType): QualityGate[] {
    const gates: QualityGate[] = [];

    gates.push({
      name: 'lint',
      type: 'lint',
      threshold: 0,
      blocking: true,
      command: 'eslint',
      args: ['--max-warnings', '0'],
    });

    if (['feature-coder', 'refactorer', 'bug-fixer', 'type-fixer'].includes(agentType)) {
      gates.push({
        name: 'typecheck',
        type: 'typecheck',
        threshold: 0,
        blocking: true,
        command: 'tsc',
        args: ['--noEmit'],
      });
    }

    if (['test-writer', 'feature-coder'].includes(agentType)) {
      gates.push({
        name: 'tests',
        type: 'test',
        threshold: 80,
        blocking: true,
        command: 'vitest',
        args: ['run', '--coverage'],
      });
    }

    if (agentType === 'security-scanner') {
      gates.push({
        name: 'security-scan',
        type: 'security',
        threshold: 0,
        blocking: true,
        command: 'npm',
        args: ['audit', '--audit-level=high'],
      });
    }

    return gates;
  }

  // ─── Core: Run Agent With Semaphore ───────────────────────────────────────

  private async runAgentWithSemaphore(
    session: Session,
    task: AgentTask,
    semaphore: Semaphore,
  ): Promise<void> {
    await semaphore.acquire();
    try {
      await this.runAgent(session, task);
    } finally {
      semaphore.release();
    }
  }

  // ─── Core: Run Agent ──────────────────────────────────────────────────────

  private async runAgent(session: Session, task: AgentTask): Promise<void> {
    const abortController = new AbortController();
    session.runningAgents.set(task.id, abortController);

    const result: AgentResult = {
      taskId: task.id,
      agentType: task.type,
      status: 'running',
      output: { files: [], artifacts: [], changes: [] },
      summary: {
        overview: '',
        keyDecisions: [],
        filesModified: [],
        testsAdded: [],
        issuesFound: [],
        recommendations: [],
        metrics: {
          linesAdded: 0,
          linesRemoved: 0,
          filesTouched: 0,
          testCoverageDelta: 0,
          complexityDelta: 0,
          durationMs: 0,
        },
      },
      validationResults: [],
      retryCount: 0,
      startedAt: new Date(),
      logs: [],
      fixLoopHistory: [],
      qualityGateResults: [],
      coordinationMessages: [],
      resourceConsumption: { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 },
      artifactsProduced: [],
      childResults: new Map(),
    };
    session.results.set(task.id, result);

    this.emitPreview(session.id, {
      type: 'agent-started',
      sessionId: session.id,
      agentId: task.id,
      timestamp: new Date(),
      data: { task },
    });

    const previewManager = this.previewManagers.get(session.id);
    if (previewManager) {
      previewManager.agentStarted(task.id, task.type, task.name);
    }

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: `Agent ${task.type} started: ${task.name}`,
    };
    result.logs.push(logEntry);

    try {
      await this.executeWithRetryLoop(session, task, result, abortController.signal);

      result.status = 'completed';
      result.completedAt = new Date();
      result.summary.metrics.durationMs = result.completedAt.getTime() - result.startedAt.getTime();
      result.summary = await this.generateSummary(task, result.output, result.validationResults);

      session.resourceUsage.totalAgentsCompleted++;
      session.updatedAt = new Date();

      this.emitPreview(session.id, {
        type: 'agent-completed',
        sessionId: session.id,
        agentId: task.id,
        timestamp: new Date(),
        data: { result },
      });

      if (previewManager) {
        previewManager.agentCompleted(task.id, result);
      }

      this.coordinationMessage(session, task.id, 'artifact-ready', {
        artifacts: result.artifactsProduced,
        summary: result.summary,
      });

    } catch (error) {
      result.status = 'failed';
      result.error = this.normalizeError(error);
      result.completedAt = new Date();
      session.resourceUsage.totalAgentsFailed++;
      session.updatedAt = new Date();

      this.emitPreview(session.id, {
        type: 'agent-failed',
        sessionId: session.id,
        agentId: task.id,
        timestamp: new Date(),
        data: { error: result.error },
      });

      if (previewManager) {
        previewManager.agentFailed(task.id, result.error);
      }

      this.coordinationMessage(session, task.id, 'blocking-issue', {
        error: result.error,
      });

    } finally {
      session.runningAgents.delete(task.id);
    }
  }

  // ─── Core: Execute With Retry Loop ────────────────────────────────────────

  private async executeWithRetryLoop(
    session: Session,
    task: AgentTask,
    result: AgentResult,
    signal: AbortSignal,
  ): Promise<void> {
    const maxRetries = task.prompt.retryPolicy.maxRetries;
    let lastError: AgentError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error('Agent execution aborted');
      }

      result.retryCount = attempt;

      if (attempt > 0) {
        this.emitPreview(session.id, {
          type: 'agent-progress',
          sessionId: session.id,
          agentId: task.id,
          timestamp: new Date(),
          data: { retry: attempt, maxRetries },
        });

        const previewManager = this.previewManagers.get(session.id);
        if (previewManager) {
          previewManager.agentRetrying(task.id, attempt);
        }

        const backoffMs = task.prompt.retryPolicy.backoffMs * Math.pow(2, attempt - 1);
        await this.sleep(Math.min(backoffMs, 30000));
      }

      this.emitPreview(session.id, {
        type: 'agent-progress',
        sessionId: session.id,
        agentId: task.id,
        timestamp: new Date(),
        data: { step: 'invoking-agent', attempt },
      });

      const output = await this.invokeAgent(task.prompt, signal);
      result.output = output;

      this.emitPreview(session.id, {
        type: 'validation-running',
        sessionId: session.id,
        agentId: task.id,
        timestamp: new Date(),
        data: { ruleCount: task.prompt.validationRules.length },
      });

      const validations = await this.runValidations(
        task.prompt.validationRules,
        output,
        session.taskSpec,
        signal,
      );
      result.validationResults = validations;

      const aggregated = this.validationAggregator.aggregate(validations);

      if (aggregated.passed) {
        this.emitPreview(session.id, {
          type: 'validation-completed',
          sessionId: session.id,
          agentId: task.id,
          timestamp: new Date(),
          data: { passed: true, resultCount: validations.length },
        });
        return;
      }

      const blockingFailures = aggregated.blockingFailures;

      if (blockingFailures.length > 0 && attempt < maxRetries) {
        const loopId = `${session.id}-${task.id}`;
        const loop = createErrorFixLoop();
        this.errorFixLoops.set(loopId, loop);

        const loopConfig = createLoopConfigWithDefaults(task.id, task.type, {
          signal,
          maxIterations: Math.min(this.config.errorFixLoop.maxIterations, maxRetries - attempt),
          backoffStrategy: this.config.errorFixLoop.backoffStrategy,
          baseBackoffMs: this.config.errorFixLoop.baseBackoffMs,
          maxBackoffMs: this.config.errorFixLoop.maxBackoffMs,
          validationGates: this.config.errorFixLoop.validationGates,
          fixStrategies: this.config.errorFixLoop.fixStrategies,
          onIteration: (iteration) => {
            result.fixLoopHistory.push(iteration);
            this.emitPreview(session.id, {
              type: 'error-fix-loop',
              sessionId: session.id,
              agentId: task.id,
              timestamp: new Date(),
              data: {
                attempt: iteration.iteration,
                strategy: iteration.fixStrategy,
                success: iteration.success,
              },
            });

            const pm = this.previewManagers.get(session.id);
            if (pm) {
              pm.errorFixIteration(task.id, iteration.iteration, iteration.error, iteration.fixStrategy);
            }
          },
          onProgress: (progress) => {
            result.retryCount = progress.currentIteration;
          },
        });

        const initialError: AgentError = blockingFailures[0]
          ? {
              code: `VALIDATION_${blockingFailures[0].rule.type.toUpperCase()}`,
              message: blockingFailures[0].error || blockingFailures[0].output.slice(0, 500),
              category: 'validation',
              recoverable: true,
            }
          : {
              code: 'UNKNOWN',
              message: 'Validation failed',
              category: 'validation',
              recoverable: true,
            };

        const loopResult = await loop.run(
          output,
          this.config.errorFixLoop.fixStrategies,
          loopConfig,
          initialError,
          blockingFailures,
        );

        result.output = loopResult.output;
        result.fixLoopHistory = loopResult.iterations;
        result.validationResults = loopResult.finalValidation.allResults;

        if (loopResult.success) {
          this.emitPreview(session.id, {
            type: 'validation-completed',
            sessionId: session.id,
            agentId: task.id,
            timestamp: new Date(),
            data: { passed: true, fixLoopIterations: loopResult.iterations.length },
          });
          return;
        }

        if (!loopResult.success && loopResult.escalationActions.length > 0) {
          const lastAction = loopResult.escalationActions[loopResult.escalationActions.length - 1];
          if (lastAction.type === 'abort') {
            throw new Error(`Error-fix loop aborted: ${lastAction.reason}`);
          }
          if (lastAction.type === 'human-intervention') {
            throw new Error(`Error-fix loop requires human intervention: ${lastAction.reason}`);
          }
        }

        this.errorFixLoops.delete(loopId);
        lastError = this.extractTopError(result.validationResults);
      } else if (blockingFailures.length > 0) {
        lastError = this.extractTopError(result.validationResults);
        break;
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  // ─── Core: Invoke Agent ───────────────────────────────────────────────────

  private async invokeAgent(prompt: AgentPrompt, signal: AbortSignal): Promise<AgentOutput> {
    if (signal.aborted) {
      throw new Error('Agent invocation aborted');
    }

    const fullPrompt = this.buildFullPrompt(prompt);

    await this.sleep(50 + Math.random() * 100);

    if (signal.aborted) {
      throw new Error('Agent invocation aborted during execution');
    }

    const files: OutputFile[] = [];
    const artifacts: Artifact[] = [];
    const changes: FileChange[] = [];

    for (const contextFile of prompt.contextFiles) {
      if (contextFile.relevance > 0.3) {
        const outputPath = contextFile.path.replace(/\.(ts|tsx|js|jsx)$/, '.generated.$1');
        files.push({
          path: outputPath,
          content: `// Generated by agent for: ${fullPrompt.userPrompt.slice(0, 100)}\n// Based on context from: ${contextFile.path}\n\n${contextFile.content.slice(0, 500)}`,
          action: 'create',
          language: contextFile.path.split('.').pop(),
        });
      }
    }

    if (files.length === 0) {
      files.push({
        path: 'src/generated.ts',
        content: `// Generated output\nexport const generated = true;\n`,
        action: 'create',
        language: 'typescript',
      });
    }

    for (const file of files) {
      changes.push({
        path: file.path,
        diff: `+ ${file.content.split('\n').length} lines`,
        newContent: file.content,
      });
    }

    return { files, artifacts, changes };
  }

  private buildFullPrompt(prompt: AgentPrompt): { systemPrompt: string; userPrompt: string } {
    const contextBlock = prompt.contextFiles.length > 0
      ? '\n\n## Context Files\n' + prompt.contextFiles.map(
          (f) => `### ${f.path} (relevance: ${f.relevance.toFixed(2)})\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``,
        ).join('\n')
      : '';

    return {
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt + contextBlock,
    };
  }

  // ─── Core: Run Validations ────────────────────────────────────────────────

  private async runValidations(
    rules: ValidationRule[],
    output: AgentOutput,
    taskSpec: TaskSpec,
    signal: AbortSignal,
  ): Promise<ValidationResult[]> {
    if (rules.length === 0) {
      return [];
    }

    return this.validationRunner.runValidations(rules, {
      parallel: true,
      signal,
    });
  }

  // ─── Core: Generate Summary ───────────────────────────────────────────────

  private async generateSummary(
    task: AgentTask,
    output: AgentOutput,
    validations: ValidationResult[],
  ): Promise<AgentSummary> {
    const filesModified = output.files.map((f) => f.path);
    const linesAdded = output.files.reduce(
      (sum, f) => sum + (f.content.match(/\n/g) || []).length,
      0,
    );
    const linesRemoved = output.changes.reduce((sum, c) => {
      const removed = (c.diff.match(/^-/g) || []).length;
      return sum + removed;
    }, 0);

    const passedValidations = validations.filter((v) => v.passed);
    const failedValidations = validations.filter((v) => !v.passed);

    const issues: Issue[] = failedValidations.map((v) => ({
      severity: v.rule.required ? 'high' : 'medium',
      category: v.rule.type,
      message: v.error || `Validation failed: ${v.rule.type}`,
      suggestion: `Fix ${v.rule.type} issues`,
    }));

    const testsAdded = output.files
      .filter((f) => f.path.includes('.test.') || f.path.includes('.spec.'))
      .map((f) => f.path);

    const recommendations: string[] = [];
    if (failedValidations.length > 0) {
      recommendations.push(`Address ${failedValidations.length} failed validation(s)`);
    }
    if (linesAdded > 200) {
      recommendations.push('Consider breaking changes into smaller units');
    }
    if (testsAdded.length === 0 && output.files.length > 3) {
      recommendations.push('Add tests for new code');
    }
    recommendations.push('Review generated code for edge cases');

    return {
      overview: `Completed ${task.type} task: ${task.name}`,
      keyDecisions: [
        `Used ${task.type} agent template`,
        `Applied ${passedValidations.length}/${validations.length} validations`,
        `Processed ${output.files.length} file(s)`,
      ],
      filesModified,
      testsAdded,
      issuesFound: issues,
      recommendations,
      metrics: {
        linesAdded,
        linesRemoved,
        filesTouched: filesModified.length,
        testCoverageDelta: testsAdded.length > 0 ? 5 : 0,
        complexityDelta: 0,
        durationMs: 0,
      },
    };
  }

  // ─── Session Management ───────────────────────────────────────────────────

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    for (const [, controller] of session.runningAgents) {
      controller.abort();
    }

    session.status = 'failed';
    session.updatedAt = new Date();

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      previewManager.sessionStatusChanged('failed');
    }

    this.emitPreview(sessionId, {
      type: 'session-status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'stopped' },
    });
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'running') {
      throw new Error(`Session ${sessionId} is not running (status: ${session.status})`);
    }

    for (const [, controller] of session.runningAgents) {
      controller.abort();
    }

    session.status = 'paused';
    session.updatedAt = new Date();

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      previewManager.sessionStatusChanged('paused');
    }

    this.emitPreview(sessionId, {
      type: 'session-paused',
      sessionId,
      timestamp: new Date(),
      data: {},
    });
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'paused') {
      throw new Error(`Session ${sessionId} is not paused (status: ${session.status})`);
    }

    session.status = 'running';
    session.updatedAt = new Date();

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      previewManager.sessionStatusChanged('running');
    }

    this.emitPreview(sessionId, {
      type: 'session-resumed',
      sessionId,
      timestamp: new Date(),
      data: {},
    });

    const semaphore = new Semaphore(this.config.maxConcurrentAgents);
    const agentPromises: Promise<void>[] = [];

    for (const [, task] of session.agents) {
      if (!session.results.has(task.id) || session.results.get(task.id)?.status === 'pending') {
        agentPromises.push(this.runAgentWithSemaphore(session, task, semaphore));
      }
    }

    await Promise.allSettled(agentPromises);

    const allDone = Array.from(session.results.values()).every(
      (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled',
    );

    if (allDone) {
      session.status = Array.from(session.results.values()).every((r) => r.status === 'completed')
        ? 'completed'
        : 'failed';
      session.updatedAt = new Date();

      if (previewManager) {
        previewManager.sessionStatusChanged(session.status);
      }
    }
  }

  // ─── Preview & Monitoring ─────────────────────────────────────────────────

  getPreviewManager(sessionId: string): LivePreviewManager | undefined {
    return this.previewManagers.get(sessionId);
  }

  getPreviewEmitter(sessionId: string): PreviewEventEmitter | undefined {
    return this.previewEmitters.get(sessionId);
  }

  getSessionDashboard(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return `Session ${sessionId} not found`;
    }

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      return previewManager.renderDashboard();
    }

    return this.buildTextDashboard(session);
  }

  getAgentDetail(sessionId: string, agentId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return `Session ${sessionId} not found`;
    }

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      return previewManager.renderAgentDetail(agentId);
    }

    const result = session.results.get(agentId);
    const task = session.agents.get(agentId);
    if (!task) {
      return `Agent ${agentId} not found in session ${sessionId}`;
    }

    return this.buildAgentDetailText(task, result);
  }

  private buildTextDashboard(session: Session): string {
    const width = 72;
    const lines: string[] = [];
    const results = Array.from(session.results.values());
    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const running = results.filter((r) => r.status === 'running').length;
    const total = session.agents.size;

    lines.push('═'.repeat(width));
    lines.push(this.padCenter('SESSION DASHBOARD', width));
    lines.push('═'.repeat(width));
    lines.push(`  Session:  ${session.id}`);
    lines.push(`  Status:   ${session.status.toUpperCase()}`);
    lines.push(`  Created:  ${session.createdAt.toISOString()}`);
    lines.push(`  Updated:  ${session.updatedAt.toISOString()}`);
    lines.push('');
    lines.push(`  Total: ${total}  |  Completed: ${completed}  |  Running: ${running}  |  Failed: ${failed}`);

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    lines.push(`  Progress: ${this.renderProgressBar(progress)} ${progress}%`);
    lines.push('');
    lines.push('─'.repeat(width));
    lines.push(this.padCenter('AGENTS', width));
    lines.push('─'.repeat(width));

    for (const [, task] of session.agents) {
      const result = session.results.get(task.id);
      const status = result?.status || 'pending';
      const icon = this.statusIcon(status);
      lines.push(`  ${icon} ${this.truncate(task.name, 40)} [${task.type}]`);
      if (result?.error) {
        lines.push(`    ERROR: ${this.truncate(result.error.message, 50)}`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  private buildAgentDetailText(task: AgentTask, result?: AgentResult): string {
    const width = 60;
    const lines: string[] = [];

    lines.push('═'.repeat(width));
    lines.push(this.padCenter(`AGENT: ${task.name}`, width));
    lines.push('═'.repeat(width));
    lines.push(`  ID:          ${task.id}`);
    lines.push(`  Type:        ${task.type}`);
    lines.push(`  Phase:       ${task.phase}`);
    lines.push(`  Priority:    ${task.priority}`);
    lines.push(`  Dependencies: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'}`);

    if (result) {
      lines.push('');
      lines.push(`  Status:      ${this.statusIcon(result.status)} ${result.status.toUpperCase()}`);
      lines.push(`  Retries:     ${result.retryCount}`);
      lines.push(`  Started:     ${result.startedAt.toISOString()}`);
      if (result.completedAt) {
        lines.push(`  Completed:   ${result.completedAt.toISOString()}`);
      }

      lines.push('');
      lines.push('─'.repeat(width));
      lines.push(this.padCenter('VALIDATIONS', width));
      lines.push('─'.repeat(width));

      for (const v of result.validationResults) {
        const icon = v.passed ? '✓' : '✗';
        lines.push(`  ${icon} ${v.rule.type} — ${v.passed ? 'PASSED' : 'FAILED'}`);
      }

      if (result.fixLoopHistory.length > 0) {
        lines.push('');
        lines.push('─'.repeat(width));
        lines.push(this.padCenter('ERROR-FIX LOOP', width));
        lines.push('─'.repeat(width));
        for (const iter of result.fixLoopHistory) {
          lines.push(`  Iteration ${iter.iteration}: ${iter.fixStrategy} — ${iter.success ? 'SUCCESS' : 'FAILED'}`);
        }
      }

      if (result.error) {
        lines.push('');
        lines.push('─'.repeat(width));
        lines.push(this.padCenter('ERROR', width));
        lines.push('─'.repeat(width));
        lines.push(`  Code:    ${result.error.code}`);
        lines.push(`  Message: ${result.error.message}`);
        if (result.error.suggestedFix) {
          lines.push(`  Fix:     ${result.error.suggestedFix}`);
        }
      }
    } else {
      lines.push('  Status: PENDING');
    }

    lines.push('');
    lines.push('═'.repeat(width));
    return lines.join('\n');
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeError(error: unknown): AgentError {
    if (error instanceof Error) {
      return {
        code: 'EXECUTION_ERROR',
        message: error.message,
        stack: error.stack,
        category: 'execution',
        recoverable: true,
      };
    }
    return {
      code: 'UNKNOWN',
      message: String(error),
      category: 'execution',
      recoverable: false,
    };
  }

  private extractTopError(validations: ValidationResult[]): AgentError {
    const firstFailure = validations.find((v) => !v.passed);
    if (firstFailure) {
      return {
        code: `VALIDATION_${firstFailure.rule.type.toUpperCase()}`,
        message: firstFailure.error || firstFailure.output.slice(0, 500),
        category: 'validation',
        recoverable: true,
      };
    }
    return {
      code: 'UNKNOWN',
      message: 'Validation failed',
      category: 'validation',
      recoverable: true,
    };
  }

  private parseIntent(userPrompt: string, project: ProjectProfile): TaskSpec {
    return {
      id: this.generateTaskId(),
      userPrompt,
      intent: {
        primaryGoal: userPrompt,
        secondaryGoals: [],
        explicitRequirements: [],
        implicitAssumptions: [],
        riskLevel: 'medium',
      },
      scope: {
        affectedPaths: project.structure.srcDirs,
        excludedPaths: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
        maxFiles: 50,
        maxLinesChanged: 2000,
      },
      constraints: [],
      successCriteria: [
        {
          name: 'lint-clean',
          metric: 'lint-errors',
          target: 0,
          validator: 'eslint',
        },
        {
          name: 'type-clean',
          metric: 'type-errors',
          target: 0,
          validator: 'tsc',
        },
      ],
    };
  }

  private createSession(
    id: string,
    taskSpec: TaskSpec,
    projectProfile: ProjectProfile,
  ): Session {
    return {
      id,
      taskSpec,
      projectProfile,
      config: this.config,
      agents: new Map(),
      results: new Map(),
      status: 'initializing',
      createdAt: new Date(),
      updatedAt: new Date(),
      spawnQueue: [],
      runningAgents: new Map(),
      coordinationBus: [],
      checkpoints: [],
      resourceUsage: {
        currentMemoryMB: 0,
        currentCpuPercent: 0,
        currentDiskMB: 0,
        peakMemoryMB: 0,
        peakCpuPercent: 0,
        totalAgentsSpawned: 0,
        totalAgentsCompleted: 0,
        totalAgentsFailed: 0,
      },
    };
  }

  private emitPreview(sessionId: string, event: LivePreviewEvent): void {
    this.emit('preview', event);

    const previewManager = this.previewManagers.get(sessionId);
    if (previewManager) {
      previewManager.emit({
        type: event.type,
        timestamp: event.timestamp,
        agentId: event.agentId,
        data: event.data,
        severity: this.eventSeverity(event.type),
      });
    }
  }

  private eventSeverity(type: LivePreviewEvent['type']): 'info' | 'warning' | 'error' | 'success' {
    switch (type) {
      case 'agent-started':
      case 'agent-spawned':
      case 'agent-queued':
      case 'dependency-resolved':
      case 'context-loaded':
      case 'session-status':
        return 'info';
      case 'agent-progress':
      case 'validation-running':
      case 'error-fix-loop':
        return 'warning';
      case 'agent-completed':
      case 'validation-completed':
        return 'success';
      case 'agent-failed':
        return 'error';
      default:
        return 'info';
    }
  }

  private coordinationMessage(
    session: Session,
    fromAgentId: string,
    type: AgentCoordinationMessage['type'],
    payload: any,
  ): void {
    for (const [agentId] of session.agents) {
      if (agentId !== fromAgentId) {
        const message: AgentCoordinationMessage = {
          fromAgentId,
          toAgentId: agentId,
          type,
          payload,
          timestamp: new Date(),
          correlationId: `${session.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        session.coordinationBus.push(message);
      }
    }
  }

  private buildSessionSummary(session: Session): {
    totalAgents: number;
    completed: number;
    failed: number;
    running: number;
    duration: number;
  } {
    const results = Array.from(session.results.values());
    return {
      totalAgents: session.agents.size,
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      running: results.filter((r) => r.status === 'running').length,
      duration: Date.now() - session.createdAt.getTime(),
    };
  }

  private renderProgressBar(percent: number, length: number = 20): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  private statusIcon(status: string): string {
    switch (status) {
      case 'running': return '▶';
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'queued': return '◦';
      case 'retrying': return '↻';
      case 'paused': return '❚❚';
      case 'pending': return '○';
      case 'cancelled': return '⊘';
      default: return '?';
    }
  }

  private padCenter(text: string, width: number): string {
    const pad = Math.max(0, width - text.length);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + text + ' '.repeat(right);
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }

  destroy(): void {
    for (const [sessionId, timer] of this.checkpointTimers) {
      clearInterval(timer);
    }
    this.checkpointTimers.clear();

    for (const [, manager] of this.previewManagers) {
      manager.destroy();
    }
    this.previewManagers.clear();

    for (const [, emitter] of this.previewEmitters) {
      emitter.dispose();
    }
    this.previewEmitters.clear();

    for (const [sessionId, session] of this.sessions) {
      for (const [, controller] of session.runningAgents) {
        controller.abort();
      }
    }

    this.sessions.clear();
    this.errorFixLoops.clear();
    this.distributors.clear();
    this.dynamicTemplateLoader.stopWatching();
    this.userTemplateDirs.clear();

    this.messageBus.destroy();
    this.pluginSystem.destroy();
    this.healingSystem.destroy();
    this.knowledgeBase.destroy();
    this.costOptimizer.clearHistory();
    this.performanceProfiler.clearMetrics();
    this.learningSystem.destroy();
    this.collaboration.destroy();
    this.extensionManager.destroy();
    this.auditLogger.destroy();

    this.removeAllListeners();
  }

  // ─── Dynamic Template System ───────────────────────────────────────────────

  loadUserTemplatesFromDirectory(dirPath: string): { loaded: number; errors: number; warnings: number } {
    const result = this.dynamicTemplateLoader.loadFromDirectory(dirPath);
    this.userTemplateDirs.add(dirPath);
    this.emit('templates-reloaded', { source: dirPath, ...result });
    return result;
  }

  loadUserTemplatesFromFile(filePath: string): { loaded: number; errors: number; warnings: number } {
    return this.dynamicTemplateLoader.loadFromFile(filePath);
  }

  loadUserTemplatesFromString(jsonString: string, sourceName?: string): { loaded: number; errors: number; warnings: number } {
    return this.dynamicTemplateLoader.loadFromString(jsonString, sourceName);
  }

  loadUserTemplatesFromObject(schema: any, sourceName?: string): { loaded: number; errors: number; warnings: number } {
    return this.dynamicTemplateLoader.loadFromObject(schema, sourceName);
  }

  matchTemplateForTask(taskDescription: string, topN?: number): TemplateMatchResult[] {
    return this.dynamicTemplateLoader.getTemplateMatcher().matchTask(taskDescription, topN);
  }

  searchTemplates(query: string, filters?: { category?: string; tags?: string[]; complexity?: string }): TemplateMatchResult[] {
    return this.dynamicTemplateLoader.getTemplateMatcher().searchTemplates(query, filters);
  }

  getUserTemplate(templateId: string): UserTemplateDefinition | undefined {
    return this.dynamicTemplateLoader.getTemplateMatcher().getTemplate(templateId);
  }

  getAllUserTemplates(): UserTemplateDefinition[] {
    return this.dynamicTemplateLoader.getAllTemplates();
  }

  removeUserTemplate(templateId: string): boolean {
    return this.dynamicTemplateLoader.removeTemplate(templateId);
  }

  getTemplateLoaderStats() {
    return this.dynamicTemplateLoader.getStats();
  }

  getTemplateValidationResults() {
    return this.dynamicTemplateLoader.getValidationResults();
  }

  exportAllTemplatesAsJSON(): string {
    return this.dynamicTemplateLoader.exportAllAsJSON();
  }

  reloadTemplatesFromSource(sourcePath: string): { loaded: number; errors: number; warnings: number } {
    return this.dynamicTemplateLoader.reloadSource(sourcePath);
  }

  detectTaskCategory(taskDescription: string): string | null {
    return this.dynamicTemplateLoader.getTemplateMatcher().detectCategory(taskDescription);
  }

  getTemplatesByCategory(category: string): UserTemplateDefinition[] {
    return this.dynamicTemplateLoader.getTemplateMatcher().getTemplatesByCategory(category);
  }

  getTemplatesByTag(tag: string): UserTemplateDefinition[] {
    return this.dynamicTemplateLoader.getTemplateMatcher().getTemplatesByTag(tag);
  }

  // ─── Security System Accessors ─────────────────────────────────────────────

  getSandbox(): AgentSandbox { return this.sandbox; }
  getPermissionManager(): PermissionManager { return this.permissionManager; }
  getSecretsVault(): SecretsVault { return this.secretsVault; }
  getAuditLogger(): AuditLogger { return this.auditLogger; }
  getBudgetLimiter(): BudgetLimiter { return this.budgetLimiter; }

  // ─── Advanced System Accessors ─────────────────────────────────────────────

  getMessageBus(): AgentMessageBus { return this.messageBus; }
  getPluginSystem(): PluginSystem { return this.pluginSystem; }
  getWorkflowEngine(): WorkflowEngine { return this.workflowEngine; }
  getHealingSystem(): SelfHealingSystem { return this.healingSystem; }
  getKnowledgeBase(): KnowledgeBase { return this.knowledgeBase; }
  getModelRouter(): AIModelRouter { return this.modelRouter; }
  getCostOptimizer(): CostOptimizer { return this.costOptimizer; }
  getCrossSessionMemory(): CrossSessionMemory { return this.crossSessionMemory; }
  getAgentVersioning(): AgentVersioning { return this.agentVersioning; }
  getPerformanceProfiler(): PerformanceProfiler { return this.performanceProfiler; }
  getMarketplace(): AgentMarketplace { return this.marketplace; }
  getToolCreator(): ToolCreator { return this.toolCreator; }
  getABTesting(): ABTesting { return this.abTesting; }
  getLearningSystem(): LearningSystem { return this.learningSystem; }
  getCollaboration(): RealTimeCollaboration { return this.collaboration; }

  // ─── Extension System Accessors ────────────────────────────────────────────

  getExtensionManager(): ExtensionManager { return this.extensionManager; }

  // ─── Coordination System Accessors ─────────────────────────────────────────

  getCoordinationBus(): CoordinationBus { return this.coordinationBus; }
  getDependencyGraph(): DependencyGraph { return this.dependencyGraph; }
  getSyncPoint(): SyncPoint { return this.syncPoint; }
  getArtifactManager(): ArtifactManager { return this.artifactManager; }
  getQualityGateRunner(): QualityGateRunner { return this.qualityGateRunner; }
  getCheckpointManager(): CheckpointManager { return this.checkpointManager; }

  // ─── System Stats ──────────────────────────────────────────────────────────

  getSystemStats(): {
    sessions: number;
    agents: number;
    security: { sandbox: any; permissions: any; audit: any; budget: any };
    advanced: { messageBus: any; plugins: any; workflows: any; healing: any; knowledge: any; models: any; cost: any; memory: any; profiling: any };
    extensions: any;
  } {
    return {
      sessions: this.sessions.size,
      agents: [...this.sessions.values()].reduce((sum, s) => sum + s.runningAgents.size, 0),
      security: {
        sandbox: this.sandbox,
        permissions: this.permissionManager.getAuditStats(),
        audit: this.auditLogger.getStats(),
        budget: this.budgetLimiter.getGlobalUsage(),
      },
      advanced: {
        messageBus: this.messageBus.getStats(),
        plugins: this.pluginSystem.getStats(),
        workflows: this.workflowEngine.getStats(),
        healing: this.healingSystem.getStats(),
        knowledge: this.knowledgeBase.getStats(),
        models: this.modelRouter.getStats(),
        cost: this.costOptimizer.getStats(),
        memory: this.crossSessionMemory.getStats(),
        profiling: this.performanceProfiler.getStats(),
      },
      extensions: this.extensionManager.getStatus(),
    };
  }

  private resolveBestTemplate(userPrompt: string): { templateId: string; name: string; systemPrompt: string; userPromptTemplate: string } | null {
    const matches = this.dynamicTemplateLoader.getTemplateMatcher().matchTask(userPrompt, 1);
    if (matches.length > 0 && matches[0].score > 3) {
      const userTemplate = this.dynamicTemplateLoader.getTemplateMatcher().getTemplate(matches[0].templateId);
      if (userTemplate) {
        return {
          templateId: userTemplate.id,
          name: userTemplate.name,
          systemPrompt: userTemplate.systemPrompt,
          userPromptTemplate: userTemplate.userPromptTemplate,
        };
      }
    }
    const builtInMatch = this.findBuiltInTemplate(userPrompt);
    return builtInMatch;
  }

  private findBuiltInTemplate(userPrompt: string): { templateId: string; name: string; systemPrompt: string; userPromptTemplate: string } | null {
    const lowerPrompt = userPrompt.toLowerCase();
    let bestMatch: { templateKey: string; template: PromptTemplate; score: number } | null = null;
    for (const [key, template] of Object.entries(PROMPT_TEMPLATES)) {
      let score = 0;
      const keywords = template.systemPrompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const keyword of keywords) {
        if (lowerPrompt.includes(keyword)) score += 1;
      }
      const nameFromKey = key.replace(/-/g, ' ');
      if (lowerPrompt.includes(nameFromKey)) score += 3;
      if (!bestMatch || score > bestMatch.score) bestMatch = { templateKey: key, template, score };
    }
    if (bestMatch && bestMatch.score > 2) {
      return {
        templateId: bestMatch.templateKey,
        name: bestMatch.templateKey,
        systemPrompt: bestMatch.template.systemPrompt,
        userPromptTemplate: bestMatch.template.userPromptTemplate,
      };
    }
    return null;
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

export function createOrchestrator(config?: Partial<SessionConfig>): EnhancedSubAgentOrchestrator {
  return new EnhancedSubAgentOrchestrator(config);
}
