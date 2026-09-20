export interface AgentPrompt {
  systemPrompt: string;
  userPrompt: string;
  contextFiles: ContextFile[];
  toolPermissions: ToolPermission[];
  validationRules: ValidationRule[];
  retryPolicy: RetryPolicy;
  expectedOutput: OutputSchema;
}

export interface ContextFile {
  path: string;
  content: string;
  relevance: number;
  type: 'source' | 'test' | 'config' | 'doc' | 'dependency';
}

export interface ToolPermission {
  tool: string;
  allowed: boolean;
  params?: Record<string, any>;
}

export interface ValidationRule {
  type: 'lint' | 'typecheck' | 'test' | 'custom';
  command: string;
  args?: string[];
  timeoutMs: number;
  required: boolean;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  escalateOnFailure: boolean;
}

export interface OutputSchema {
  type: 'code' | 'json' | 'markdown' | 'diff' | 'mixed';
  schema?: Record<string, any>;
  example?: string;
}

export interface AgentTask {
  id: string;
  type: AgentType;
  name: string;
  description: string;
  priority: number;
  dependencies: string[];
  prompt: AgentPrompt;
  assignedFiles: string[];
  estimatedTokens: number;
  timeoutMs: number;
  requiredCapabilities: string[];
  resourceProfile: ResourceProfile;
  phase: string;
  parallelGroup: number;
  spawnOrder: number;
  parentTaskId?: string;
  childTaskIds: string[];
  coordinationRequirements: CoordinationRequirement[];
  qualityGates: QualityGate[];
}

export interface CoordinationRequirement {
  type: 'shared-context' | 'artifact-dependency' | 'sequential-execution' | 'mutual-exclusion' | 'sync-point';
  targetAgentId?: string;
  targetAgentType?: AgentType;
  description: string;
  requiredArtifacts?: string[];
}

export interface QualityGate {
  name: string;
  type: 'lint' | 'typecheck' | 'test' | 'security' | 'performance' | 'coverage' | 'custom';
  threshold: number;
  blocking: boolean;
  command: string;
  args: string[];
}

export type AgentType = string;

export interface AgentResult {
  taskId: string;
  agentType: AgentType;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'paused' | 'cancelled';
  output: AgentOutput;
  summary: AgentSummary;
  validationResults: ValidationResult[];
  retryCount: number;
  startedAt: Date;
  completedAt?: Date;
  error?: AgentError;
  logs: LogEntry[];
  fixLoopHistory: FixLoopIteration[];
  qualityGateResults: QualityGateResult[];
  coordinationMessages: AgentCoordinationMessage[];
  resourceConsumption: ResourceProfile;
  artifactsProduced: Artifact[];
  childResults: Map<string, AgentResult>;
}

export interface FixLoopIteration {
  iteration: number;
  timestamp: Date;
  error: AgentError;
  fixStrategy: string;
  promptUsed: string;
  output: AgentOutput;
  validationResults: ValidationResult[];
  success: boolean;
  durationMs: number;
}

export interface QualityGateResult {
  gate: QualityGate;
  passed: boolean;
  value: number;
  threshold: number;
  output: string;
  durationMs: number;
}

export interface AgentOutput {
  files: OutputFile[];
  artifacts: Artifact[];
  changes: FileChange[];
}

export interface OutputFile {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
  language?: string;
}

export interface Artifact {
  name: string;
  type: string;
  data: any;
}

export interface FileChange {
  path: string;
  diff: string;
  oldContent?: string;
  newContent: string;
}

export interface AgentSummary {
  overview: string;
  keyDecisions: string[];
  filesModified: string[];
  testsAdded: string[];
  issuesFound: Issue[];
  recommendations: string[];
  metrics: SummaryMetrics;
}

export interface SummaryMetrics {
  linesAdded: number;
  linesRemoved: number;
  filesTouched: number;
  testCoverageDelta: number;
  complexityDelta: number;
  durationMs: number;
}

export interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ValidationResult {
  rule: ValidationRule;
  passed: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface AgentError {
  code: string;
  message: string;
  stack?: string;
  category: 'validation' | 'execution' | 'timeout' | 'context' | 'tool';
  recoverable: boolean;
  suggestedFix?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

export interface ProjectProfile {
  rootPath: string;
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  testFrameworks: string[];
  lintTools: string[];
  ciSystems: string[];
  packageManagers: string[];
  structure: ProjectStructure;
  conventions: Convention[];
  dependencies: Dependency[];
  size: ProjectSize;
  gitInfo: GitInfo;
  files?: string[];
}

export interface LanguageInfo {
  name: string;
  version?: string;
  percentage: number;
  files: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'library' | 'tool';
}

export interface ProjectStructure {
  pattern: 'feature-folders' | 'layered' | 'modular' | 'monorepo' | 'flat';
  srcDirs: string[];
  testDirs: string[];
  configDirs: string[];
}

export interface Convention {
  name: string;
  pattern: string;
  examples: string[];
  enforcement: 'strict' | 'warning' | 'none';
}

export interface Dependency {
  name: string;
  version: string;
  type: 'prod' | 'dev' | 'peer';
  vulnerabilityCount: number;
}

export interface ProjectSize {
  totalFiles: number;
  totalLines: number;
  sourceFiles: number;
  testFiles: number;
  configFiles: number;
}

export interface GitInfo {
  branch: string;
  lastCommit: string;
  uncommittedChanges: number;
  contributors: number;
}

export interface TaskSpec {
  id: string;
  userPrompt: string;
  intent: UserIntent;
  scope: TaskScope;
  constraints: Constraint[];
  successCriteria: SuccessCriterion[];
}

export interface UserIntent {
  primaryGoal: string;
  secondaryGoals: string[];
  explicitRequirements: string[];
  implicitAssumptions: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface TaskScope {
  affectedPaths: string[];
  excludedPaths: string[];
  maxFiles: number;
  maxLinesChanged: number;
}

export interface Constraint {
  type: 'budget' | 'time' | 'quality' | 'security' | 'compatibility';
  value: any;
  strict: boolean;
}

export interface SuccessCriterion {
  name: string;
  metric: string;
  target: any;
  validator: string;
}

export interface SessionConfig {
  maxAgentsPerSession: number;
  maxConcurrentAgents: number;
  defaultTimeoutMs: number;
  globalRetryPolicy: RetryPolicy;
  enableLivePreview: boolean;
  previewPort: number;
  checkpointIntervalMs: number;
  artifactRetentionDays: number;
  spawnConfig: AgentSpawnConfig;
  distributionStrategy: AgentDistributionStrategy['type'];
  errorFixLoop: ErrorFixLoopConfig;
  coordinationEnabled: boolean;
  persistenceEnabled: boolean;
  persistencePath?: string;
}

export interface Session {
  id: string;
  taskSpec: TaskSpec;
  projectProfile: ProjectProfile;
  config: SessionConfig;
  agents: Map<string, AgentTask>;
  results: Map<string, AgentResult>;
  status: 'initializing' | 'planning' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  checkpointId?: string;
  spawnQueue: AgentTask[];
  runningAgents: Map<string, AbortController>;
  coordinationBus: AgentCoordinationMessage[];
  checkpoints: CheckpointData[];
  resourceUsage: ResourceUsage;
  distributionResult?: ProjectAwareDistributionResult;
}

export interface ResourceUsage {
  currentMemoryMB: number;
  currentCpuPercent: number;
  currentDiskMB: number;
  peakMemoryMB: number;
  peakCpuPercent: number;
  totalAgentsSpawned: number;
  totalAgentsCompleted: number;
  totalAgentsFailed: number;
}

export interface LivePreviewEvent {
  type: 'agent-started' | 'agent-progress' | 'agent-completed' | 'agent-failed' | 'validation-running' | 'validation-completed' | 'error-fix-loop' | 'session-status' | 'agent-spawned' | 'agent-queued' | 'dependency-resolved' | 'context-loaded' | 'tool-invoked' | 'checkpoint-created' | 'session-paused' | 'session-resumed';
  sessionId: string;
  agentId?: string;
  timestamp: Date;
  data: any;
}

export interface AgentSpawnConfig {
  maxAgentsPerSession: number;
  maxConcurrentAgents: number;
  spawnStrategy: 'parallel' | 'sequential' | 'dependency-aware' | 'priority-based';
  resourceLimits: ResourceLimits;
  autoScaling: AutoScalingConfig;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkMbps: number;
  maxFileHandles: number;
  maxChildProcesses: number;
}

export interface AutoScalingConfig {
  enabled: boolean;
  minAgents: number;
  maxAgents: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownMs: number;
  metricsWindowMs: number;
}

export interface AgentDistributionStrategy {
  type: 'project-aware' | 'skill-based' | 'load-balanced' | 'affinity-based' | 'hybrid';
  projectProfile: ProjectProfile;
  agentCapabilities: Map<AgentType, AgentCapability>;
  taskRequirements: TaskRequirements;
}

export interface AgentCapability {
  type: AgentType;
  skills: string[];
  complexity: 'low' | 'medium' | 'high' | 'expert';
  estimatedDurationMs: number;
  requiredTools: string[];
  compatibleWith: AgentType[];
  conflictsWith: AgentType[];
  resourceProfile: ResourceProfile;
}

export interface ResourceProfile {
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkMbps: number;
}

export interface TaskRequirements {
  requiredSkills: string[];
  preferredAgentTypes: AgentType[];
  excludedAgentTypes: AgentType[];
  maxComplexity: 'low' | 'medium' | 'high' | 'expert';
  estimatedTokens: number;
  parallelizable: boolean;
  dependencies: string[];
}

export interface ErrorFixLoopConfig {
  maxIterations: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear' | 'adaptive';
  baseBackoffMs: number;
  maxBackoffMs: number;
  escalationRules: EscalationRule[];
  fixStrategies: FixStrategy[];
  validationGates: ValidationGate[];
}

export interface EscalationRule {
  condition: 'retry-exhausted' | 'critical-failure' | 'timeout' | 'resource-exhausted' | 'custom';
  action: 'spawn-specialist' | 'split-task' | 'reduce-scope' | 'human-intervention' | 'abort';
  targetAgentType?: AgentType;
  customCondition?: (context: ErrorContext) => boolean;
}

export interface FixStrategy {
  name: string;
  description: string;
  applicableErrors: string[];
  promptTemplate: string;
  successRate: number;
  costEstimate: number;
}

export interface ValidationGate {
  name: string;
  type: 'lint' | 'typecheck' | 'test' | 'security' | 'performance' | 'custom';
  command: string;
  args: string[];
  threshold: number;
  blocking: boolean;
  timeoutMs: number;
}

export interface ErrorContext {
  agentId: string;
  agentType: AgentType;
  attempt: number;
  error: AgentError;
  previousOutput: AgentOutput;
  validationResults: ValidationResult[];
  projectProfile: ProjectProfile;
  taskSpec: TaskSpec;
}

export interface AgentCoordinationMessage {
  fromAgentId: string;
  toAgentId: string;
  type: 'dependency-resolved' | 'context-shared' | 'artifact-ready' | 'blocking-issue' | 'sync-request' | 'handoff';
  payload: any;
  timestamp: Date;
  correlationId: string;
}

export interface CheckpointData {
  sessionId: string;
  timestamp: Date;
  completedAgents: string[];
  runningAgents: string[];
  queuedAgents: string[];
  agentResults: Map<string, AgentResult>;
  sharedContext: Map<string, any>;
  coordinationLog: AgentCoordinationMessage[];
}

export interface ProjectAwareDistributionResult {
  assignedAgents: Map<string, AgentTask>;
  distributionPlan: DistributionPlan;
  resourceAllocation: ResourceAllocation;
  estimatedCompletionMs: number;
  riskAssessment: RiskAssessment;
}

export interface DistributionPlan {
  phases: DistributionPhase[];
  criticalPath: string[];
  parallelGroups: string[][];
  bottlenecks: Bottleneck[];
}

export interface DistributionPhase {
  phaseId: string;
  name: string;
  agents: string[];
  dependencies: string[];
  estimatedDurationMs: number;
  requiredResources: ResourceProfile;
}

export interface ResourceAllocation {
  totalAgents: number;
  concurrentAgents: number;
  memoryAllocatedMB: number;
  cpuAllocatedPercent: number;
  diskAllocatedMB: number;
  perAgent: Map<string, ResourceProfile>;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  mitigations: Mitigation[];
}

export interface RiskFactor {
  type: 'resource' | 'dependency' | 'complexity' | 'timeout' | 'quality' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedAgents: string[];
  probability: number;
  impact: number;
}

export interface Mitigation {
  factorType: RiskFactor['type'];
  action: string;
  cost: number;
  effectiveness: number;
}

export interface Bottleneck {
  agentId: string;
  type: 'resource' | 'dependency' | 'skill' | 'external';
  severity: number;
  description: string;
  suggestedResolution: string;
}