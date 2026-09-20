import { EventEmitter } from 'events';
import {
  AgentTask, AgentResult, AgentType, Session, SessionConfig, ProjectProfile,
  TaskSpec, AgentPrompt, ContextFile, ValidationRule, ValidationResult, AgentError,
  OutputFile, LogEntry, LivePreviewEvent, AgentOutput, AgentSummary,
  SummaryMetrics, Issue, FileChange, Artifact, ErrorFixLoopConfig,
  AgentCoordinationMessage, CheckpointData, ResourceUsage, AgentSpawnConfig,
  QualityGate,
} from './types';
import { PROMPT_TEMPLATES, buildPrompt } from '../templates/prompt-templates';
import { CoordinationBus } from '../coordination/bus';
import { DependencyGraph } from '../coordination/dependency-graph';
import { SyncPoint, PhaseConfig } from '../coordination/sync-points';
import { ArtifactManager } from '../artifacts/manager';
import { QualityGateRunner } from '../quality/gates';
import { CheckpointManager } from '../session/checkpoint';
import { ErrorFixLoop, LoopConfig, createErrorFixLoop, createLoopConfigWithDefaults } from '../error-fix-loop/loop';
import {
  ValidationRunner, ValidationAggregator, ValidationResultAnalyzer,
  createValidationRunner, createValidationAggregator, createValidationResultAnalyzer,
} from '../error-fix-loop/validator';
import { selectBestStrategy, buildFixPromptFromContext, createStrategyHistory, updateStrategyHistory, StrategyHistory } from '../error-fix-loop/strategies';
import { EscalationManager, createEscalationManager, buildDefaultEscalationRules } from '../error-fix-loop/escalation';
import { PreviewServer } from '../live-preview/server';
import { DashboardBuilder } from '../live-preview/dashboard';
import { ProjectDeepAnalyzer } from '../distribution/project-analyzer';
import { CapabilityRegistry } from '../distribution/capability-registry';
import { ProjectAwareDistributor } from '../distribution/distributor';
import { AgentScheduler, SchedulerEvent } from '../distribution/scheduler';
import { ResourceMonitor } from '../distribution/resource-monitor';
import { ProjectAnalyzer } from '../context/analyzer';

export class SubAgentOrchestrator extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private runningAgents: Map<string, AbortController> = new Map();
  private previewServer?: PreviewServer;
  private dashboardBuilders: Map<string, DashboardBuilder> = new Map();

  private coordinationBus: CoordinationBus;
  private dependencyGraph: DependencyGraph;
  private syncPoint: SyncPoint;
  private artifactManager: ArtifactManager;
  private qualityGateRunner: QualityGateRunner;
  private checkpointManager: CheckpointManager;
  private validationRunner: ValidationRunner;
  private validationAggregator: ValidationAggregator;
  private resultAnalyzer: ValidationResultAnalyzer;
  private escalationManager: EscalationManager;
  private projectAnalyzer: ProjectAnalyzer;
  private capabilityRegistry: CapabilityRegistry;
  private distributor?: ProjectAwareDistributor;
  private scheduler?: AgentScheduler;
  private resourceMonitor: ResourceMonitor;

  private checkpointTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: SessionConfig) {
    super();
    const defaults: SessionConfig = {
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
        resourceLimits: { maxMemoryMB: 8192, maxCpuPercent: 90, maxDiskMB: 10240, maxNetworkMbps: 100, maxFileHandles: 1024, maxChildProcesses: 64 },
        autoScaling: { enabled: true, minAgents: 1, maxAgents: 20, scaleUpThreshold: 0.7, scaleDownThreshold: 0.3, cooldownMs: 30000, metricsWindowMs: 60000 },
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
      persistenceEnabled: true,
    };
    this.config = { ...defaults, ...config };

    this.coordinationBus = new CoordinationBus();
    this.dependencyGraph = new DependencyGraph();
    this.syncPoint = new SyncPoint();
    this.artifactManager = new ArtifactManager({ maxAgeMs: this.config.artifactRetentionDays * 86400000 });
    this.qualityGateRunner = new QualityGateRunner();
    this.checkpointManager = new CheckpointManager({
      intervalMs: this.config.checkpointIntervalMs,
      persistenceEnabled: this.config.persistenceEnabled,
      persistencePath: this.config.persistencePath || '.checkpoints',
    });
    this.validationRunner = createValidationRunner();
    this.validationAggregator = createValidationAggregator();
    this.resultAnalyzer = createValidationResultAnalyzer();
    this.escalationManager = createEscalationManager(this.config.errorFixLoop.escalationRules);
    this.projectAnalyzer = new ProjectAnalyzer();
    this.capabilityRegistry = new CapabilityRegistry();
    this.resourceMonitor = new ResourceMonitor(
      this.config.spawnConfig.resourceLimits,
      this.config.spawnConfig.autoScaling,
      this.config.maxConcurrentAgents,
    );
  }

  async executeTask(userPrompt: string, projectRoot: string): Promise<Session> {
    const sessionId = this.generateSessionId();

    const projectProfile = await this.projectAnalyzer.analyze(projectRoot);
    const taskSpec = await this.parseIntent(userPrompt, projectProfile);
    const session = this.createSession(sessionId, taskSpec, projectProfile);
    this.sessions.set(sessionId, session);

    if (this.config.enableLivePreview) {
      this.previewServer = new PreviewServer(this.config.previewPort);
      await this.previewServer.start();
      this.dashboardBuilders.set(sessionId, new DashboardBuilder(sessionId));
    }

    this.resourceMonitor.start();
    this.checkpointManager.startPeriodicCheckpointing(session);

    this.checkpointTimer = setInterval(() => {
      this.checkpointManager.createCheckpoint(session);
      this.emitPreview(session.id, {
        type: 'checkpoint-created',
        sessionId: session.id,
        timestamp: new Date(),
        data: {
          completedAgents: Array.from(session.results.entries()).filter(([, r]) => r.status === 'completed').map(([id]) => id),
          runningAgents: Array.from(this.runningAgents.keys()),
          queuedAgents: session.spawnQueue.map(t => t.id),
        },
      });
    }, this.config.checkpointIntervalMs);

    try {
      await this.runSession(session);
      return session;
    } finally {
      if (this.checkpointTimer) {
        clearInterval(this.checkpointTimer);
        this.checkpointTimer = null;
      }
      this.checkpointManager.stopPeriodicCheckpointing();
      this.resourceMonitor.stop();
      if (this.previewServer) {
        await this.previewServer.stop();
      }
    }
  }

  private async runSession(session: Session): Promise<void> {
    session.status = 'planning';
    this.emitPreview(session.id, {
      type: 'session-status', sessionId: session.id, timestamp: new Date(),
      data: { status: 'planning' },
    });

    const taskMap = new Map<string, AgentTask>();
    const tasks = this.createExecutionPlan(session);
    for (const task of tasks) {
      taskMap.set(task.id, task);
      session.agents.set(task.id, task);
      this.dependencyGraph.addTask(task);
    }

    this.capabilityRegistry = new CapabilityRegistry();
    this.distributor = new ProjectAwareDistributor(session.projectProfile, this.capabilityRegistry);
    const distributionResult = await this.distributor.distribute(taskMap, session.projectProfile);
    session.distributionResult = distributionResult;
    session.spawnQueue = Array.from(distributionResult.assignedAgents.values());

    this.syncPoint.configurePhases(
      distributionResult.distributionPlan.phases.map((phase, i) => ({
        phaseNumber: i,
        name: phase.name,
        agentIds: phase.agents,
      }))
    );

    this.scheduler = new AgentScheduler(this.capabilityRegistry, this.resourceMonitor, {
      maxConcurrentAgents: this.config.maxConcurrentAgents,
    });

    this.scheduler.onEvent((event: SchedulerEvent) => this.handleSchedulerEvent(session, event));

    session.status = 'running';
    this.emitPreview(session.id, {
      type: 'session-status', sessionId: session.id, timestamp: new Date(),
      data: { status: 'running', totalAgents: session.spawnQueue.length },
    });

    this.scheduler.start(distributionResult);

    await this.waitForSessionCompletion(session);

    session.status = session.results.size === session.agents.size &&
      Array.from(session.results.values()).every(r => r.status === 'completed')
        ? 'completed' : 'failed';

    session.updatedAt = new Date();
    this.emitPreview(session.id, {
      type: 'session-status', sessionId: session.id, timestamp: new Date(),
      data: { status: session.status },
    });

    this.checkpointManager.createCheckpoint(session);
    this.artifactManager.cleanup();
  }

  private async waitForSessionCompletion(session: Session): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkComplete = () => {
        const allDone = Array.from(session.results.values()).every(
          r => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled'
        );
        const allSpawned = session.results.size >= session.agents.size;

        if (allDone && allSpawned) {
          resolve();
        } else {
          setTimeout(checkComplete, 200);
        }
      };

      checkComplete();
    });
  }

  private handleSchedulerEvent(session: Session, event: SchedulerEvent): void {
    switch (event.type) {
      case 'agent-spawned': {
        const task = session.agents.get(event.agentId);
        if (task) {
          this.spawnAgent(session, task);
        }
        break;
      }
      case 'agent-queued':
        this.emitPreview(session.id, {
          type: 'agent-queued', sessionId: session.id, agentId: event.agentId,
          timestamp: new Date(), data: { position: event.priority },
        });
        break;
      case 'agent-completed':
        break;
      case 'agent-failed':
        break;
      case 'queue-empty':
        break;
    }
  }

  private async spawnAgent(session: Session, task: AgentTask): Promise<void> {
    const abortController = new AbortController();
    this.runningAgents.set(task.id, abortController);

    const result: AgentResult = {
      taskId: task.id,
      agentType: task.type,
      status: 'running',
      output: { files: [], artifacts: [], changes: [] },
      summary: {
        overview: '', keyDecisions: [], filesModified: [], testsAdded: [],
        issuesFound: [], recommendations: [],
        metrics: { linesAdded: 0, linesRemoved: 0, filesTouched: 0, testCoverageDelta: 0, complexityDelta: 0, durationMs: 0 },
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

    this.resourceMonitor.trackAgent(task.id, task.resourceProfile);

    this.coordinationBus.subscribeSession(session.id, task.id);

    this.emitPreview(session.id, {
      type: 'agent-spawned', sessionId: session.id, agentId: task.id,
      timestamp: new Date(), data: { agentType: task.type, taskName: task.name },
    });

    this.emitPreview(session.id, {
      type: 'agent-started', sessionId: session.id, agentId: task.id,
      timestamp: new Date(), data: { task },
    });

    try {
      await this.executeAgentLifecycle(session, task, result, abortController.signal);

      result.status = 'completed';
      result.completedAt = new Date();
      result.summary.metrics.durationMs = result.completedAt.getTime() - result.startedAt.getTime();

      this.emitPreview(session.id, {
        type: 'agent-completed', sessionId: session.id, agentId: task.id,
        timestamp: new Date(), data: { result },
      });

      this.publishCoordinationMessage(session.id, task.id, 'artifact-ready', {
        artifacts: result.artifactsProduced,
        summary: result.summary,
      });
    } catch (error) {
      result.status = 'failed';
      result.error = this.normalizeError(error);
      result.completedAt = new Date();

      this.emitPreview(session.id, {
        type: 'agent-failed', sessionId: session.id, agentId: task.id,
        timestamp: new Date(), data: { error: result.error },
      });

      this.publishCoordinationMessage(session.id, task.id, 'blocking-issue', {
        error: result.error,
      });
    } finally {
      this.runningAgents.delete(task.id);
      this.resourceMonitor.untrackAgent(task.id);

      if (this.scheduler) {
        if (result.status === 'completed') {
          this.scheduler.completeAgent(task.id, result);
        } else if (result.status === 'failed') {
          this.scheduler.failAgent(task.id, result.error?.message || 'Unknown error');
        }
      }
    }
  }

  private async executeAgentLifecycle(
    session: Session,
    task: AgentTask,
    result: AgentResult,
    signal: AbortSignal,
  ): Promise<void> {
    const contextFiles = await this.buildContext(session.projectProfile, task.type);
    task.prompt.contextFiles = contextFiles;

    this.emitPreview(session.id, {
      type: 'context-loaded', sessionId: session.id, agentId: task.id,
      timestamp: new Date(), data: { fileCount: contextFiles.length, files: contextFiles.map(f => f.path) },
    });

    await this.waitForDependencies(session, task, signal);

    const output = await this.invokeAgent(task.prompt, signal);
    result.output = output;

    const validationResults = await this.runValidations(task.prompt.validationRules, output, session.taskSpec, signal, task.id, session.id);
    result.validationResults = validationResults;

    const aggregated = this.validationAggregator.aggregate(validationResults);

    if (!aggregated.passed && aggregated.blockingFailures.length > 0) {
      await this.runErrorFixLoop(session, task, result, output, aggregated.blockingFailures, signal);
    }

    if (task.qualityGates.length > 0) {
      const gateResult = await this.qualityGateRunner.runTaskGates(task);
      result.qualityGateResults = gateResult.results.map(r => ({
        gate: r.gate,
        passed: r.passed,
        value: r.value,
        threshold: r.threshold,
        output: r.output,
        durationMs: r.durationMs,
      }));
    }

    for (const artifact of result.output.artifacts) {
      const record = this.artifactManager.store(artifact, task.id, task.type, {
        tags: [task.type, session.id],
      });
      result.artifactsProduced.push(record.artifact);
    }

    result.summary = await this.generateSummary(task, result.output, validationResults);
  }

  private async runErrorFixLoop(
    session: Session,
    task: AgentTask,
    result: AgentResult,
    currentOutput: AgentOutput,
    failures: ValidationResult[],
    signal: AbortSignal,
  ): Promise<void> {
    const loop = createErrorFixLoop();
    const loopConfig = createLoopConfigWithDefaults(task.id, task.type, {
      signal,
      maxIterations: this.config.errorFixLoop.maxIterations,
      backoffStrategy: this.config.errorFixLoop.backoffStrategy,
      baseBackoffMs: this.config.errorFixLoop.baseBackoffMs,
      maxBackoffMs: this.config.errorFixLoop.maxBackoffMs,
      validationGates: this.config.errorFixLoop.validationGates,
      fixStrategies: this.config.errorFixLoop.fixStrategies,
      onIteration: (iteration) => {
        result.fixLoopHistory.push(iteration);
        this.emitPreview(session.id, {
          type: 'error-fix-loop', sessionId: session.id, agentId: task.id,
          timestamp: new Date(), data: { attempt: iteration.iteration, maxRetries: this.config.errorFixLoop.maxIterations, strategy: iteration.fixStrategy },
        });
      },
      onProgress: (progress) => {
        result.retryCount = progress.currentIteration;
      },
    });

    const initialError: AgentError = failures.length > 0
      ? {
        code: `VALIDATION_${failures[0].rule.type.toUpperCase()}`,
        message: failures[0].error || failures[0].output.slice(0, 500),
        category: 'validation',
        recoverable: true,
      }
      : { code: 'UNKNOWN', message: 'Unknown validation failure', category: 'validation', recoverable: true };

    const loopResult = await loop.run(currentOutput, this.config.errorFixLoop.fixStrategies, loopConfig, initialError, failures);

    result.output = loopResult.output;
    result.fixLoopHistory = loopResult.iterations;
    result.validationResults = loopResult.finalValidation.allResults;

    if (!loopResult.success && loopResult.escalationActions.length > 0) {
      const lastAction = loopResult.escalationActions[loopResult.escalationActions.length - 1];
      if (lastAction.type === 'abort' || lastAction.type === 'human-intervention') {
        throw new Error(`Error-fix loop failed: ${lastAction.reason}`);
      }
    }
  }

  private async waitForDependencies(session: Session, task: AgentTask, signal: AbortSignal): Promise<void> {
    if (task.dependencies.length === 0) return;

    const depStatuses = this.dependencyGraph.getDependencyResolutionStatus(
      new Set(Array.from(session.results.entries()).filter(([, r]) => r.status === 'completed').map(([id]) => id))
    );

    const taskStatus = depStatuses.find(s => s.taskId === task.id);
    if (!taskStatus || taskStatus.allResolved) return;

    this.emitPreview(session.id, {
      type: 'dependency-resolved', sessionId: session.id, agentId: task.id,
      timestamp: new Date(), data: { unresolvedDeps: taskStatus.unresolvedDependencies },
    });

    return new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (signal.aborted) {
          clearInterval(checkInterval);
          reject(new Error('Aborted while waiting for dependencies'));
          return;
        }

        const resolved = new Set(
          Array.from(session.results.entries())
            .filter(([, r]) => r.status === 'completed')
            .map(([id]) => id)
        );

        const allMet = task.dependencies.every(dep => resolved.has(dep));
        if (allMet) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
    });
  }

  private publishCoordinationMessage(
    sessionId: string,
    fromAgentId: string,
    type: AgentCoordinationMessage['type'],
    payload: any,
  ): void {
    const agents = this.sessions.get(sessionId)?.agents;
    if (!agents) return;

    for (const [agentId] of agents) {
      if (agentId !== fromAgentId) {
        this.coordinationBus.publish({
          fromAgentId,
          toAgentId: agentId,
          type,
          payload,
          timestamp: new Date(),
          correlationId: this.coordinationBus.generateCorrelationId(),
        });
      }
    }
  }

  private async invokeAgent(prompt: AgentPrompt, signal: AbortSignal): Promise<AgentOutput> {
    if (signal.aborted) throw new Error('Agent aborted');
    await this.sleep(100);
    return { files: [], artifacts: [], changes: [] };
  }

  private async runValidations(
    rules: ValidationRule[],
    output: AgentOutput,
    taskSpec: TaskSpec,
    signal: AbortSignal,
    agentId: string,
    sessionId: string,
  ): Promise<ValidationResult[]> {
    return this.validationRunner.runValidations(rules, { parallel: true, signal });
  }

  private async generateSummary(task: AgentTask, output: AgentOutput, validations: ValidationResult[]): Promise<AgentSummary> {
    const filesModified = output.files.map(f => f.path);
    const linesAdded = output.files.reduce((sum, f) => sum + (f.content.match(/\n/g) || []).length, 0);
    return {
      overview: `Completed ${task.name} (${task.type})`,
      keyDecisions: [`Used ${task.type} agent template`, `Applied ${validations.filter(v => v.passed).length}/${validations.length} validations`],
      filesModified,
      testsAdded: output.files.filter(f => f.path.includes('.test.') || f.path.includes('.spec.')).map(f => f.path),
      issuesFound: validations.filter(v => !v.passed).map(v => ({
        severity: v.rule.required ? 'high' : 'medium',
        category: v.rule.type,
        message: v.error || 'Validation failed',
        suggestion: `Fix ${v.rule.type} errors`,
      })),
      recommendations: ['Run full test suite', 'Review generated code'],
      metrics: { linesAdded, linesRemoved: 0, filesTouched: filesModified.length, testCoverageDelta: 0, complexityDelta: 0, durationMs: 0 },
    };
  }

  private async parseIntent(userPrompt: string, project: ProjectProfile): Promise<TaskSpec> {
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
      scope: { affectedPaths: [], excludedPaths: ['node_modules', '.git', 'dist', 'build'], maxFiles: 50, maxLinesChanged: 2000 },
      constraints: [],
      successCriteria: [],
    };
  }

  private createExecutionPlan(session: Session): AgentTask[] {
    const tasks: AgentTask[] = [];
    const taskTypes: AgentType[] = ['planner', 'feature-coder', 'test-writer', 'code-reviewer', 'type-fixer'];

    for (let i = 0; i < taskTypes.length; i++) {
      const type = taskTypes[i];
      const template = PROMPT_TEMPLATES[type];
      const prompt = buildPrompt(template, {
        taskDescription: session.taskSpec.userPrompt,
        requirements: 'Implement feature with tests and documentation',
        acceptanceCriteria: 'All tests pass, typecheck clean, lint clean',
        conventions: session.projectProfile.conventions.map(c => `${c.name}: ${c.pattern}`).join('\n'),
        patterns: 'Follow existing component patterns in src/components',
        targetFiles: 'src/components, src/hooks',
        goals: 'Improve readability and maintainability',
        bugDescription: 'Fix reported issue',
        symptoms: 'Error on user action',
        reproSteps: '1. Login 2. Click button 3. Error',
        errorLogs: 'TypeError: Cannot read property',
        affectedFiles: 'src/components/Button.tsx',
        recentChanges: 'Recent refactor of auth',
        targetDescription: 'New feature components',
        testPatterns: 'Use vitest + testing-library',
        lineCoverage: '80', branchCoverage: '70', functionCoverage: '80',
        docTarget: 'New API', docType: 'API Reference', audience: 'Developers',
        sourceFiles: 'src/api', docStyle: 'JSDoc + Markdown',
        typeErrors: 'TS2304: Cannot find name',
        focusAreas: 'Security, Performance',
        diff: '', standards: 'Project coding standards',
        targetScope: 'src/',
        threatModel: 'OWASP Top 10', compliance: 'SOC2',
        currentMetrics: 'LCP: 2.5s', targetMetrics: 'LCP: <1.5s',
        profilingData: 'Flamegraph attached',
        wcagLevel: 'AA', projectPath: session.projectProfile.rootPath,
        dependencies: 'package.json', vulnerabilities: 'npm audit output',
        licensePolicy: 'MIT only', projectType: 'nextjs',
        buildCommand: 'npm run build', startCommand: 'npm start',
        port: '3000', envVars: 'NODE_ENV=production',
        existingDockerfile: 'none', ciPlatform: 'github-actions',
        triggers: 'push, pr', jobs: 'lint, test, build, deploy',
        environments: 'staging, production',
        existingConfig: '.github/workflows/ci.yml',
        artifact: 'docker image', environment: 'staging',
        strategy: 'blue-green', healthChecks: '/health endpoint',
        rollbackTriggers: 'health check fail',
        migrationType: 'database', fromVersion: '1.0', toVersion: '2.0',
        scope: 'users table', dataVolume: '1M rows',
        downtimeTolerance: '0', existingMigrations: 'migrations/',
        targetSystem: 'API', targetLoad: '10k RPS',
        architecture: 'microservices', bottlenecks: 'database',
        budget: '$500/month', deployment: 'v1.2.3',
        currentState: 'v1.2.3', targetState: 'v1.2.2',
        additionalRequirements: 'Build user dashboard', constraints: 'Budget, timeline',
        scale: '10k users', teamStructure: '5 engineers', capacity: '5 engineers',
      }, []);

      tasks.push({
        id: `task-${i + 1}`,
        type,
        name: `${type} for: ${session.taskSpec.userPrompt.slice(0, 50)}`,
        description: `Execute ${type} task`,
        priority: 10 - i,
        dependencies: i === 0 ? [] : [`task-${i}`],
        prompt,
        assignedFiles: [],
        estimatedTokens: 50000,
        timeoutMs: this.config.defaultTimeoutMs,
        requiredCapabilities: [],
        resourceProfile: { memoryMB: 256, cpuPercent: 20, diskMB: 100, networkMbps: 2 },
        phase: `phase-${i}`,
        parallelGroup: i,
        spawnOrder: i,
        childTaskIds: [],
        coordinationRequirements: [],
        qualityGates: [],
      });
    }

    return tasks;
  }

  private async buildContext(profile: ProjectProfile, agentType: AgentType): Promise<ContextFile[]> {
    return this.projectAnalyzer.buildContextForAgent(profile, agentType, profile.rootPath);
  }

  private createSession(id: string, taskSpec: TaskSpec, projectProfile: ProjectProfile): Session {
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
        currentMemoryMB: 0, currentCpuPercent: 0, currentDiskMB: 0,
        peakMemoryMB: 0, peakCpuPercent: 0,
        totalAgentsSpawned: 0, totalAgentsCompleted: 0, totalAgentsFailed: 0,
      },
    };
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
    return { code: 'UNKNOWN', message: String(error), category: 'execution', recoverable: false };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private emitPreview(sessionId: string, event: LivePreviewEvent): void {
    this.emit('preview', event);
    if (this.previewServer) {
      this.previewServer.broadcast(event);
    }
    const dashboard = this.dashboardBuilders.get(sessionId);
    if (dashboard) {
      dashboard.processEvent(event);
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getDashboard(sessionId: string) {
    return this.dashboardBuilders.get(sessionId)?.build();
  }

  getResourceDashboard() {
    return this.resourceMonitor.getDashboard();
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      for (const [agentId, controller] of this.runningAgents) {
        if (session.agents.has(agentId)) {
          controller.abort();
        }
      }
      session.status = 'paused';
      this.emitPreview(sessionId, {
        type: 'session-paused', sessionId, timestamp: new Date(), data: {},
      });
    }
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'paused') {
      session.status = 'running';
      this.emitPreview(sessionId, {
        type: 'session-resumed', sessionId, timestamp: new Date(), data: {},
      });
    }
  }

  destroy(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }
    this.coordinationBus.reset();
    this.dependencyGraph.clear();
    this.syncPoint.reset();
    this.artifactManager.clear();
    this.resourceMonitor.stop();
    if (this.scheduler) {
      this.scheduler.stop();
    }
    this.sessions.clear();
    this.runningAgents.clear();
    this.dashboardBuilders.clear();
    this.removeAllListeners();
  }
}
