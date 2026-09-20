import {
  Session,
  AgentTask,
  AgentType,
  ProjectProfile,
  ProjectAwareDistributionResult,
  DistributionPlan,
  DistributionPhase,
  ResourceAllocation,
  ResourceProfile,
  RiskAssessment,
  RiskFactor,
  Mitigation,
  Bottleneck,
  AgentSpawnConfig,
} from '../core/types';
import {
  ProjectDeepAnalyzer,
  DeepProjectAnalysis,
  ModuleBoundary,
  DependencyEdge,
} from './project-analyzer';
import { CapabilityRegistry, SkillMatch, ConflictInfo } from './capability-registry';

export interface DistributionConstraints {
  maxConcurrentAgents: number;
  maxTotalMemoryMB: number;
  maxTotalCpuPercent: number;
  priorityWeights: {
    priority: number;
    complexity: number;
    dependency: number;
    resourceEfficiency: number;
  };
}

interface TaskNode {
  task: AgentTask;
  dependencies: Set<string>;
  dependents: Set<string>;
  assignedAgent: AgentType | null;
  estimatedDurationMs: number;
  resourceProfile: ResourceProfile;
  phase: number;
  parallelGroup: number;
}

interface ScheduleResult {
  phases: DistributionPhase[];
  criticalPath: string[];
  parallelGroups: string[][];
  estimatedTotalMs: number;
}

export class ProjectAwareDistributor {
  private projectAnalyzer: ProjectDeepAnalyzer;
  private capabilityRegistry: CapabilityRegistry;
  private constraints: DistributionConstraints;

  constructor(
    projectProfile: ProjectProfile,
    capabilityRegistry: CapabilityRegistry,
    constraints?: Partial<DistributionConstraints>
  ) {
    this.projectAnalyzer = new ProjectDeepAnalyzer(projectProfile);
    this.capabilityRegistry = capabilityRegistry;
    this.constraints = {
      maxConcurrentAgents: 6,
      maxTotalMemoryMB: 4096,
      maxTotalCpuPercent: 80,
      priorityWeights: {
        priority: 0.3,
        complexity: 0.25,
        dependency: 0.25,
        resourceEfficiency: 0.2,
      },
      ...constraints,
    };
  }

  async distribute(
    tasks: Map<string, AgentTask>,
    projectProfile: ProjectProfile
  ): Promise<ProjectAwareDistributionResult> {
    const projectAnalysis = await this.projectAnalyzer.analyze();
    const taskNodes = this.buildTaskGraph(tasks);
    const assignedTasks = this.assignAgentsToTasks(taskNodes, projectAnalysis);
    const schedule = this.scheduleTasks(assignedTasks);
    const resourceAllocation = this.calculateResourceAllocation(assignedTasks);
    const riskAssessment = this.assessRisks(assignedTasks, schedule, resourceAllocation);
    const bottlenecks = this.identifyBottlenecks(assignedTasks, schedule);

    this.applyMitigations(assignedTasks, riskAssessment, bottlenecks);

    const assignedAgentMap = new Map<string, AgentTask>();
    for (const node of assignedTasks) {
      assignedAgentMap.set(node.task.id, node.task);
    }

    return {
      assignedAgents: assignedAgentMap,
      distributionPlan: {
        phases: schedule.phases,
        criticalPath: schedule.criticalPath,
        parallelGroups: schedule.parallelGroups,
        bottlenecks,
      },
      resourceAllocation,
      estimatedCompletionMs: schedule.estimatedTotalMs,
      riskAssessment,
    };
  }

  private buildTaskGraph(tasks: Map<string, AgentTask>): TaskNode[] {
    const nodes: TaskNode[] = [];

    for (const [, task] of tasks) {
      const resourceEstimate = this.capabilityRegistry.estimateResources(
        task.type,
        this.classifyTaskSize(task)
      );

      nodes.push({
        task,
        dependencies: new Set(task.dependencies),
        dependents: new Set(),
        assignedAgent: null,
        estimatedDurationMs: resourceEstimate.estimatedDurationMs,
        resourceProfile: {
          memoryMB: resourceEstimate.memoryMB,
          cpuPercent: resourceEstimate.cpuPercent,
          diskMB: resourceEstimate.diskMB,
          networkMbps: resourceEstimate.networkMbps,
        },
        phase: -1,
        parallelGroup: -1,
      });
    }

    for (const node of nodes) {
      for (const depId of node.dependencies) {
        const depNode = nodes.find(n => n.task.id === depId);
        if (depNode) {
          depNode.dependents.add(node.task.id);
        }
      }
    }

    return nodes;
  }

  private classifyTaskSize(task: AgentTask): 'small' | 'medium' | 'large' {
    if (task.assignedFiles.length <= 3 && task.estimatedTokens < 5000) return 'small';
    if (task.assignedFiles.length > 10 || task.estimatedTokens > 20000) return 'large';
    return 'medium';
  }

  private assignAgentsToTasks(
    nodes: TaskNode[],
    projectAnalysis: DeepProjectAnalysis
  ): TaskNode[] {
    for (const node of nodes) {
      const bestAgent = this.findBestAgentForTask(node, projectAnalysis);
      node.assignedAgent = bestAgent;
      node.task.type = bestAgent;

      const resourceEstimate = this.capabilityRegistry.estimateResources(
        bestAgent,
        this.classifyTaskSize(node.task)
      );
      node.estimatedDurationMs = resourceEstimate.estimatedDurationMs;
      node.resourceProfile = {
        memoryMB: resourceEstimate.memoryMB,
        cpuPercent: resourceEstimate.cpuPercent,
        diskMB: resourceEstimate.diskMB,
        networkMbps: resourceEstimate.networkMbps,
      };
    }

    this.resolveConflicts(nodes);

    return nodes;
  }

  private findBestAgentForTask(
    node: TaskNode,
    projectAnalysis: DeepProjectAnalysis
  ): AgentType {
    const task = node.task;

    const requirements = {
      requiredSkills: task.requiredCapabilities,
      preferredAgentTypes: [task.type],
      excludedAgentTypes: [] as AgentType[],
      maxComplexity: 'expert' as const,
      estimatedTokens: task.estimatedTokens,
      parallelizable: task.dependencies.length === 0,
      dependencies: task.dependencies,
    };

    const skillMatches = this.capabilityRegistry.findBestAgents(requirements, 10);

    const moduleContext = this.findModuleContext(task, projectAnalysis);

    let bestMatch: SkillMatch | null = null;
    let bestScore = -1;

    for (const match of skillMatches) {
      let score = match.score;

      if (moduleContext) {
        const techBonus = this.calculateTechnologyBonus(match.agentType, moduleContext);
        score += techBonus;
      }

      const affinityBonus = this.capabilityRegistry.getAffinityBonus(
        this.getDependentAgentTypes(node, [])
      );
      score += affinityBonus;

      score += this.calculatePriorityBonus(match.agentType, task.priority);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    return bestMatch?.agentType || task.type;
  }

  private findModuleContext(
    task: AgentTask,
    projectAnalysis: DeepProjectAnalysis
  ): ModuleBoundary | null {
    for (const mod of projectAnalysis.modules) {
      const overlap = task.assignedFiles.filter(f =>
        mod.files.some(mf => mf.includes(f) || f.includes(mf))
      );
      if (overlap.length > 0) return mod;
    }
    return null;
  }

  private calculateTechnologyBonus(agentType: AgentType, module: ModuleBoundary): number {
    const techMatrix = this.projectAnalyzer['buildTechnologyMatrix']();
    let bonus = 0;

    for (const tech of module.technologyStack) {
      const langAgents = techMatrix.languages.get(tech) || [];
      const fwAgents = techMatrix.frameworks.get(tech) || [];

      if (langAgents.includes(agentType)) bonus += 0.1;
      if (fwAgents.includes(agentType)) bonus += 0.1;
    }

    return Math.min(bonus, 0.2);
  }

  private getDependentAgentTypes(node: TaskNode, visited: string[]): AgentType[] {
    if (visited.includes(node.task.id)) return [];
    visited.push(node.task.id);

    const types: AgentType[] = [node.assignedAgent!];

    for (const depId of node.dependencies) {
      const depNode = this.findNodeById(depId);
      if (depNode) {
        types.push(...this.getDependentAgentTypes(depNode, visited));
      }
    }

    return [...new Set(types)];
  }

  private findNodeById(id: string): TaskNode | undefined {
    return this.currentNodes?.find(n => n.task.id === id);
  }

  private currentNodes: TaskNode[] | null = null;

  private calculatePriorityBonus(agentType: AgentType, priority: number): number {
    const capability = this.capabilityRegistry.getCapability(agentType);
    if (!capability) return 0;

    const priorityNorm = Math.min(priority / 10, 1);
    return priorityNorm * 0.1;
  }

  private resolveConflicts(nodes: TaskNode[]): void {
    const conflictPairs = this.capabilityRegistry.getConflictRules();

    for (const node of nodes) {
      for (const otherNode of nodes) {
        if (node.task.id === otherNode.task.id) continue;

        const isHardConflict = conflictPairs.some(c =>
          c.severity === 'hard' &&
          ((c.agentA === node.assignedAgent && c.agentB === otherNode.assignedAgent) ||
           (c.agentA === otherNode.assignedAgent && c.agentB === node.assignedAgent))
        );

        if (isHardConflict) {
          const sameFileConflict = node.task.assignedFiles.some(f =>
            otherNode.task.assignedFiles.includes(f)
          );

          if (sameFileConflict) {
            const alternatives = this.capabilityRegistry.findBestAgents({
              requiredSkills: node.task.requiredCapabilities,
              preferredAgentTypes: [],
              excludedAgentTypes: [otherNode.assignedAgent!],
              maxComplexity: 'expert',
              estimatedTokens: node.task.estimatedTokens,
              parallelizable: true,
              dependencies: [],
            }, 3);

            if (alternatives.length > 0) {
              node.assignedAgent = alternatives[0].agentType;
              node.task.type = alternatives[0].agentType;
            }
          }
        }
      }
    }
  }

  private scheduleTasks(nodes: TaskNode[]): ScheduleResult {
    this.currentNodes = nodes;

    const phases = this.topologicalPhaseAssignment(nodes);
    const parallelGroups = this.identifyParallelGroups(nodes, phases);
    const criticalPath = this.findCriticalPath(nodes);
    const estimatedTotalMs = this.calculateTotalDuration(nodes, phases);

    return { phases, criticalPath, parallelGroups, estimatedTotalMs };
  }

  private topologicalPhaseAssignment(nodes: TaskNode[]): DistributionPhase[] {
    const phaseMap = new Map<string, number>();
    const phaseAgents = new Map<number, string[]>();
    const phaseDuration = new Map<number, number>();
    const phaseResources = new Map<number, ResourceProfile>();

    const assignPhase = (node: TaskNode, visited: Set<string>): number => {
      if (phaseMap.has(node.task.id)) return phaseMap.get(node.task.id)!;
      if (visited.has(node.task.id)) return 0;
      visited.add(node.task.id);

      let maxDepPhase = -1;
      for (const depId of node.dependencies) {
        const depNode = nodes.find(n => n.task.id === depId);
        if (depNode) {
          const depPhase = assignPhase(depNode, new Set(visited));
          if (depPhase > maxDepPhase) maxDepPhase = depPhase;
        }
      }

      const phase = maxDepPhase + 1;
      phaseMap.set(node.task.id, phase);
      node.phase = phase;

      if (!phaseAgents.has(phase)) phaseAgents.set(phase, []);
      phaseAgents.get(phase)!.push(node.task.id);

      const currentDuration = phaseDuration.get(phase) || 0;
      phaseDuration.set(phase, currentDuration + node.estimatedDurationMs);

      const currentResources = phaseResources.get(phase) || { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 };
      phaseResources.set(phase, {
        memoryMB: currentResources.memoryMB + node.resourceProfile.memoryMB,
        cpuPercent: Math.min(currentResources.cpuPercent + node.resourceProfile.cpuPercent, 100),
        diskMB: currentResources.diskMB + node.resourceProfile.diskMB,
        networkMbps: currentResources.networkMbps + node.resourceProfile.networkMbps,
      });

      return phase;
    };

    for (const node of nodes) {
      assignPhase(node, new Set());
    }

    const phases: DistributionPhase[] = [];
    const sortedPhases = Array.from(phaseMap.values()).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

    for (const phaseNum of sortedPhases) {
      const agents = phaseAgents.get(phaseNum) || [];
      const deps = this.findPhaseDependencies(phaseNum, nodes, phaseMap);

      phases.push({
        phaseId: `phase-${phaseNum}`,
        name: `Phase ${phaseNum + 1}`,
        agents,
        dependencies: deps,
        estimatedDurationMs: phaseDuration.get(phaseNum) || 0,
        requiredResources: phaseResources.get(phaseNum) || { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 },
      });
    }

    return phases;
  }

  private findPhaseDependencies(phase: number, nodes: TaskNode[], phaseMap: Map<string, number>): string[] {
    const deps = new Set<string>();
    for (const node of nodes) {
      if (phaseMap.get(node.task.id) === phase) {
        for (const depId of node.dependencies) {
          const depPhase = phaseMap.get(depId);
          if (depPhase !== undefined && depPhase < phase) {
            deps.add(`phase-${depPhase}`);
          }
        }
      }
    }
    return Array.from(deps);
  }

  private identifyParallelGroups(nodes: TaskNode[], phases: DistributionPhase[]): string[][] {
    const groups: string[][] = [];

    for (const phase of phases) {
      if (phase.agents.length > 1) {
        const subGroups = this.splitParallelGroup(phase.agents, nodes);
        groups.push(...subGroups);
      }
    }

    return groups;
  }

  private splitParallelGroup(agentIds: string[], nodes: TaskNode[]): string[][] {
    const groups: string[][] = [];
    const used = new Set<string>();

    for (const id of agentIds) {
      if (used.has(id)) continue;

      const group = [id];
      used.add(id);
      const node = nodes.find(n => n.task.id === id);
      if (!node) continue;

      for (const otherId of agentIds) {
        if (used.has(otherId)) continue;
        const otherNode = nodes.find(n => n.task.id === otherId);
        if (!otherNode) continue;

        const canParallel = this.capabilityRegistry.canRunInParallel(
          node.assignedAgent!,
          otherNode.assignedAgent!
        );

        const noFileConflict = !node.task.assignedFiles.some(f =>
          otherNode.task.assignedFiles.includes(f)
        );

        if (canParallel && noFileConflict) {
          group.push(otherId);
          used.add(otherId);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private findCriticalPath(nodes: TaskNode[]): string[] {
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    for (const node of nodes) {
      dist.set(node.task.id, 0);
      prev.set(node.task.id, null);
    }

    const sorted = this.topologicalSort(nodes);

    for (const nodeId of sorted) {
      const node = nodes.find(n => n.task.id === nodeId)!;
      const currentDist = dist.get(nodeId) || 0;

      for (const depId of node.dependencies) {
        const depDist = dist.get(depId) || 0;
        const newDist = depDist + (nodes.find(n => n.task.id === depId)?.estimatedDurationMs || 0);
        if (newDist > currentDist) {
          dist.set(nodeId, newDist);
          prev.set(nodeId, depId);
        }
      }
    }

    let maxDist = 0;
    let maxNode: string | null = null;
    for (const [id, d] of dist) {
      if (d > maxDist) {
        maxDist = d;
        maxNode = id;
      }
    }

    const path: string[] = [];
    let current = maxNode;
    while (current) {
      path.unshift(current);
      current = prev.get(current) || null;
    }

    return path;
  }

  private topologicalSort(nodes: TaskNode[]): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.task.id, 0);
      adjList.set(node.task.id, []);
    }

    for (const node of nodes) {
      for (const depId of node.dependencies) {
        adjList.get(depId)?.push(node.task.id);
        inDegree.set(node.task.id, (inDegree.get(node.task.id) || 0) + 1);
      }
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

  private calculateTotalDuration(nodes: TaskNode[], phases: DistributionPhase[]): number {
    let total = 0;
    for (const phase of phases) {
      const phaseNodes = nodes.filter(n => phase.agents.includes(n.task.id));
      const maxDuration = Math.max(...phaseNodes.map(n => n.estimatedDurationMs));
      total += maxDuration;
    }
    return total;
  }

  private calculateResourceAllocation(nodes: TaskNode[]): ResourceAllocation {
    let totalMemory = 0;
    let totalCpu = 0;
    let totalDisk = 0;
    let maxConcurrent = 0;
    const perAgent = new Map<string, ResourceProfile>();

    const phaseMap = new Map<string, number>();
    for (const node of nodes) {
      phaseMap.set(node.task.id, node.phase);
    }

    const maxPhase = Math.max(...Array.from(phaseMap.values()), 0);

    for (let p = 0; p <= maxPhase; p++) {
      const phaseNodes = nodes.filter(n => n.phase === p);
      const phaseMem = phaseNodes.reduce((sum, n) => sum + n.resourceProfile.memoryMB, 0);
      const phaseCpu = phaseNodes.reduce((sum, n) => sum + n.resourceProfile.cpuPercent, 0);
      const phaseDisk = phaseNodes.reduce((sum, n) => sum + n.resourceProfile.diskMB, 0);

      if (phaseMem > totalMemory) totalMemory = phaseMem;
      if (phaseCpu > totalCpu) totalCpu = phaseCpu;
      if (phaseDisk > totalDisk) totalDisk = phaseDisk;
      if (phaseNodes.length > maxConcurrent) maxConcurrent = phaseNodes.length;
    }

    for (const node of nodes) {
      perAgent.set(node.task.id, node.resourceProfile);
    }

    return {
      totalAgents: nodes.length,
      concurrentAgents: maxConcurrent,
      memoryAllocatedMB: totalMemory,
      cpuAllocatedPercent: Math.min(totalCpu, 100),
      diskAllocatedMB: totalDisk,
      perAgent,
    };
  }

  private assessRisks(
    nodes: TaskNode[],
    schedule: ScheduleResult,
    resourceAllocation: ResourceAllocation
  ): RiskAssessment {
    const factors: RiskFactor[] = [];

    if (resourceAllocation.memoryAllocatedMB > this.constraints.maxTotalMemoryMB * 0.8) {
      factors.push({
        type: 'resource',
        severity: 'high',
        description: `Memory allocation (${resourceAllocation.memoryAllocatedMB}MB) approaching limit (${this.constraints.maxTotalMemoryMB}MB)`,
        affectedAgents: Array.from(resourceAllocation.perAgent.keys()),
        probability: 0.7,
        impact: 0.8,
      });
    }

    if (resourceAllocation.concurrentAgents > this.constraints.maxConcurrentAgents) {
      factors.push({
        type: 'resource',
        severity: 'medium',
        description: `Concurrent agents (${resourceAllocation.concurrentAgents}) exceed recommended limit (${this.constraints.maxConcurrentAgents})`,
        affectedAgents: [],
        probability: 0.5,
        impact: 0.5,
      });
    }

    const highComplexityTasks = nodes.filter(n =>
      n.estimatedDurationMs > 300000
    );
    if (highComplexityTasks.length > 0) {
      factors.push({
        type: 'timeout',
        severity: 'medium',
        description: `${highComplexityTasks.length} tasks estimated to take >5 minutes`,
        affectedAgents: highComplexityTasks.map(n => n.task.id),
        probability: 0.4,
        impact: 0.6,
      });
    }

    const tasksWithDeps = nodes.filter(n => n.dependencies.size > 3);
    if (tasksWithDeps.length > 0) {
      factors.push({
        type: 'dependency',
        severity: 'medium',
        description: `${tasksWithDeps.length} tasks have >3 dependencies, increasing cascade risk`,
        affectedAgents: tasksWithDeps.map(n => n.task.id),
        probability: 0.3,
        impact: 0.7,
      });
    }

    const allAgents = nodes.map(n => n.assignedAgent!).filter(Boolean);
    const conflicts = this.capabilityRegistry.detectConflicts(allAgents);
    if (conflicts.length > 0) {
      factors.push({
        type: 'complexity',
        severity: 'low',
        description: `${conflicts.length} potential agent conflicts detected`,
        affectedAgents: conflicts.flatMap(c => [c.agentA, c.agentB]),
        probability: 0.2,
        impact: 0.3,
      });
    }

    const overallLevel = this.calculateOverallRiskLevel(factors);
    const mitigations = this.suggestMitigations(factors);

    return {
      level: overallLevel,
      factors,
      mitigations,
    };
  }

  private calculateOverallRiskLevel(factors: RiskFactor[]): RiskAssessment['level'] {
    if (factors.some(f => f.severity === 'critical')) return 'critical';
    if (factors.some(f => f.severity === 'high')) return 'high';
    if (factors.length > 2) return 'medium';
    if (factors.length > 0) return 'low';
    return 'low';
  }

  private suggestMitigations(factors: RiskFactor[]): Mitigation[] {
    const mitigations: Mitigation[] = [];

    for (const factor of factors) {
      switch (factor.type) {
        case 'resource':
          mitigations.push({
            factorType: 'resource',
            action: 'Reduce concurrent agents or increase resource limits',
            cost: 0.3,
            effectiveness: 0.8,
          });
          break;
        case 'timeout':
          mitigations.push({
            factorType: 'timeout',
            action: 'Split large tasks into smaller subtasks or increase timeout',
            cost: 0.4,
            effectiveness: 0.7,
          });
          break;
        case 'dependency':
          mitigations.push({
            factorType: 'dependency',
            action: 'Review dependency graph for optimization opportunities',
            cost: 0.2,
            effectiveness: 0.5,
          });
          break;
        case 'complexity':
          mitigations.push({
            factorType: 'complexity',
            action: 'Simplify agent coordination or use sequential execution',
            cost: 0.5,
            effectiveness: 0.6,
          });
          break;
        default:
          mitigations.push({
            factorType: factor.type,
            action: 'Review and adjust distribution plan',
            cost: 0.1,
            effectiveness: 0.4,
          });
      }
    }

    return mitigations;
  }

  private identifyBottlenecks(nodes: TaskNode[], schedule: ScheduleResult): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    const criticalPathSet = new Set(schedule.criticalPath);
    for (const nodeId of schedule.criticalPath) {
      const node = nodes.find(n => n.task.id === nodeId);
      if (node && node.dependencies.size > 2) {
        bottlenecks.push({
          agentId: nodeId,
          type: 'dependency',
          severity: 0.7,
          description: `Task on critical path has ${node.dependencies.size} dependencies`,
          suggestedResolution: 'Consider parallelizing independent subtasks',
        });
      }
    }

    const phaseResourceUsage = new Map<number, ResourceProfile>();
    for (const node of nodes) {
      const current = phaseResourceUsage.get(node.phase) || { memoryMB: 0, cpuPercent: 0, diskMB: 0, networkMbps: 0 };
      phaseResourceUsage.set(node.phase, {
        memoryMB: current.memoryMB + node.resourceProfile.memoryMB,
        cpuPercent: current.cpuPercent + node.resourceProfile.cpuPercent,
        diskMB: current.diskMB + node.resourceProfile.diskMB,
        networkMbps: current.networkMbps + node.resourceProfile.networkMbps,
      });
    }

    for (const [phase, resources] of phaseResourceUsage) {
      if (resources.cpuPercent > this.constraints.maxTotalCpuPercent) {
        const phaseNodes = nodes.filter(n => n.phase === phase);
        bottlenecks.push({
          agentId: phaseNodes[0]?.task.id || 'unknown',
          type: 'resource',
          severity: 0.8,
          description: `Phase ${phase + 1} CPU usage (${resources.cpuPercent}%) exceeds limit`,
          suggestedResolution: 'Reduce concurrent agents in this phase or defer low-priority tasks',
        });
      }
    }

    const agentsWithHighComplexity = nodes.filter(n =>
      n.assignedAgent && !this.capabilityRegistry.canRunInParallel(n.assignedAgent, n.assignedAgent)
    );

    return bottlenecks;
  }

  private applyMitigations(
    nodes: TaskNode[],
    riskAssessment: RiskAssessment,
    bottlenecks: Bottleneck[]
  ): void {
    for (const mitigation of riskAssessment.mitigations) {
      if (mitigation.effectiveness > 0.5 && mitigation.cost < 0.5) {
        switch (mitigation.factorType) {
          case 'resource':
            this.applyResourceMitigation(nodes);
            break;
          case 'timeout':
            this.applyTimeoutMitigation(nodes);
            break;
        }
      }
    }

    for (const bottleneck of bottlenecks) {
      if (bottleneck.type === 'resource' && bottleneck.severity > 0.7) {
        this.splitResourceHeavyTask(nodes, bottleneck.agentId);
      }
    }
  }

  private applyResourceMitigation(nodes: TaskNode[]): void {
    const heavyNodes = nodes
      .sort((a, b) => b.resourceProfile.memoryMB - a.resourceProfile.memoryMB)
      .slice(0, 3);

    for (const node of heavyNodes) {
      node.resourceProfile.memoryMB = Math.round(node.resourceProfile.memoryMB * 0.8);
    }
  }

  private applyTimeoutMitigation(nodes: TaskNode[]): void {
    const longTasks = nodes.filter(n => n.estimatedDurationMs > 300000);
    for (const node of longTasks) {
      if (node.task.childTaskIds.length === 0) {
        node.estimatedDurationMs = Math.round(node.estimatedDurationMs * 0.7);
      }
    }
  }

  private splitResourceHeavyTask(nodes: TaskNode[], taskId: string): void {
    const node = nodes.find(n => n.task.id === taskId);
    if (node && node.resourceProfile.memoryMB > 512) {
      node.resourceProfile.memoryMB = Math.round(node.resourceProfile.memoryMB * 0.6);
      node.estimatedDurationMs = Math.round(node.estimatedDurationMs * 0.8);
    }
  }
}
