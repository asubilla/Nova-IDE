import type { AgentTask, AgentType } from '../core/types';

export interface DependencyNode {
  taskId: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  phase: string;
  parallelGroup: number;
  estimatedTokens: number;
  timeoutMs: number;
}

export interface ParallelGroup {
  groupNumber: number;
  taskIds: string[];
  phase: string;
}

export interface CriticalPathResult {
  path: string[];
  totalEstimatedTokens: number;
  totalEstimatedDurationMs: number;
}

export interface DependencyResolutionStatus {
  taskId: string;
  totalDependencies: number;
  resolvedDependencies: number;
  allResolved: boolean;
  unresolvedDependencies: string[];
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private taskMap: Map<string, AgentTask> = new Map();

  addTask(task: AgentTask): void {
    this.taskMap.set(task.id, task);
    if (!this.nodes.has(task.id)) {
      this.nodes.set(task.id, {
        taskId: task.id,
        dependencies: new Set(),
        dependents: new Set(),
        phase: task.phase,
        parallelGroup: task.parallelGroup,
        estimatedTokens: task.estimatedTokens,
        timeoutMs: task.timeoutMs,
      });
    }
    for (const dep of task.dependencies) {
      this.addDependency(task.id, dep);
    }
  }

  removeTask(taskId: string): void {
    const node = this.nodes.get(taskId);
    if (!node) return;

    for (const dep of node.dependencies) {
      this.nodes.get(dep)?.dependents.delete(taskId);
    }
    for (const dep of node.dependents) {
      this.nodes.get(dep)?.dependencies.delete(taskId);
    }
    this.nodes.delete(taskId);
    this.taskMap.delete(taskId);
  }

  addDependency(taskId: string, dependsOn: string): void {
    const node = this.nodes.get(taskId);
    if (!node) throw new Error(`Task ${taskId} not found in graph`);
    if (!this.nodes.has(dependsOn)) {
      this.nodes.set(dependsOn, {
        taskId: dependsOn,
        dependencies: new Set(),
        dependents: new Set(),
        phase: '',
        parallelGroup: 0,
        estimatedTokens: 0,
        timeoutMs: 0,
      });
    }
    node.dependencies.add(dependsOn);
    this.nodes.get(dependsOn)!.dependents.add(taskId);
  }

  removeDependency(taskId: string, dependsOn: string): void {
    this.nodes.get(taskId)?.dependencies.delete(dependsOn);
    this.nodes.get(dependsOn)?.dependents.delete(taskId);
  }

  topologicalSort(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        throw new Error(
          `Cycle detected involving task ${taskId}. ` +
          `Dependency chain: ${this.getCyclePath(taskId).join(' -> ')}`
        );
      }
      visiting.add(taskId);
      const node = this.nodes.get(taskId);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }
      visiting.delete(taskId);
      visited.add(taskId);
      result.push(taskId);
    };

    for (const taskId of this.nodes.keys()) {
      visit(taskId);
    }
    return result;
  }

  private getCyclePath(startTask: string): string[] {
    const path = [startTask];
    const visited = new Set<string>([startTask]);
    let current = startTask;

    while (true) {
      const node = this.nodes.get(current);
      if (!node) break;
      let found = false;
      for (const dep of node.dependencies) {
        if (dep === startTask) {
          path.push(dep);
          return path;
        }
        if (!visited.has(dep)) {
          visited.add(dep);
          path.push(dep);
          current = dep;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    return path;
  }

  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        const cycleStart = path.indexOf(taskId);
        if (cycleStart >= 0) {
          cycles.push([...path.slice(cycleStart), taskId]);
        }
        return;
      }
      visiting.add(taskId);
      path.push(taskId);
      const node = this.nodes.get(taskId);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }
      path.pop();
      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const taskId of this.nodes.keys()) {
      visit(taskId);
    }
    return cycles;
  }

  getParallelGroups(): ParallelGroup[] {
    const sorted = this.topologicalSort();
    const groups: Map<string, ParallelGroup> = new Map();
    const phaseMap: Map<string, number> = new Map();

    for (const taskId of sorted) {
      const node = this.nodes.get(taskId);
      if (!node) continue;

      let maxDepPhase = 0;
      for (const dep of node.dependencies) {
        const depPhase = phaseMap.get(dep) || 0;
        maxDepPhase = Math.max(maxDepPhase, depPhase);
      }

      const phaseNum = maxDepPhase + 1;
      phaseMap.set(taskId, phaseNum);
      const phaseKey = `${node.phase || 'default'}:${phaseNum}`;

      if (!groups.has(phaseKey)) {
        groups.set(phaseKey, {
          groupNumber: phaseNum,
          taskIds: [],
          phase: node.phase || 'default',
        });
      }
      groups.get(phaseKey)!.taskIds.push(taskId);
    }

    return Array.from(groups.values()).sort((a, b) => a.groupNumber - b.groupNumber);
  }

  getCriticalPath(): CriticalPathResult {
    const sorted = this.topologicalSort();
    const distances: Map<string, number> = new Map();
    const predecessors: Map<string, string | null> = new Map();

    for (const taskId of sorted) {
      const node = this.nodes.get(taskId);
      if (!node) continue;

      let maxDist = 0;
      let pred: string | null = null;
      for (const dep of node.dependencies) {
        const depDist = (distances.get(dep) || 0) + (this.nodes.get(dep)?.timeoutMs || 0);
        if (depDist > maxDist) {
          maxDist = depDist;
          pred = dep;
        }
      }
      distances.set(taskId, maxDist);
      predecessors.set(taskId, pred);
    }

    let maxTotal = 0;
    let endTask = '';
    for (const [taskId, dist] of distances) {
      const node = this.nodes.get(taskId)!;
      const total = dist + node.timeoutMs;
      if (total > maxTotal) {
        maxTotal = total;
        endTask = taskId;
      }
    }

    const path: string[] = [];
    let current: string | null = endTask;
    while (current) {
      path.unshift(current);
      current = predecessors.get(current) ?? null;
    }

    let totalTokens = 0;
    for (const taskId of path) {
      totalTokens += this.nodes.get(taskId)?.estimatedTokens || 0;
    }

    return {
      path,
      totalEstimatedTokens: totalTokens,
      totalEstimatedDurationMs: maxTotal,
    };
  }

  getDependencyResolutionStatus(
    resolvedTasks: Set<string>
  ): DependencyResolutionStatus[] {
    const statuses: DependencyResolutionStatus[] = [];
    for (const [taskId, node] of this.nodes) {
      const total = node.dependencies.size;
      let resolved = 0;
      const unresolved: string[] = [];
      for (const dep of node.dependencies) {
        if (resolvedTasks.has(dep)) {
          resolved++;
        } else {
          unresolved.push(dep);
        }
      }
      statuses.push({
        taskId,
        totalDependencies: total,
        resolvedDependencies: resolved,
        allResolved: resolved === total,
        unresolvedDependencies: unresolved,
      });
    }
    return statuses;
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.taskMap.get(taskId);
  }

  getNode(taskId: string): DependencyNode | undefined {
    return this.nodes.get(taskId);
  }

  getTasksInPhase(phase: string): string[] {
    const tasks: string[] = [];
    for (const [taskId, node] of this.nodes) {
      if (node.phase === phase) tasks.push(taskId);
    }
    return tasks;
  }

  getReadyTasks(completedTasks: Set<string>): string[] {
    const ready: string[] = [];
    for (const [taskId, node] of this.nodes) {
      if (completedTasks.has(taskId)) continue;
      const allDepsMet = [...node.dependencies].every((dep) => completedTasks.has(dep));
      if (allDepsMet) ready.push(taskId);
    }
    return ready;
  }

  size(): number {
    return this.nodes.size;
  }

  clear(): void {
    this.nodes.clear();
    this.taskMap.clear();
  }
}
