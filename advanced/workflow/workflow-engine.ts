import { EventEmitter } from 'events';

export interface WorkflowNode {
  id: string;
  name: string;
  type: 'agent-task' | 'condition' | 'parallel' | 'loop' | 'transform' | 'wait' | 'custom';
  config: Record<string, any>;
  dependencies: string[];
  timeout?: number;
  retryPolicy?: { maxRetries: number; backoffMs: number };
  conditions?: WorkflowCondition[];
  outputs?: Record<string, any>;
}

export interface WorkflowCondition { field: string; operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists'; value: any; }

export interface WorkflowEdge { from: string; to: string; condition?: WorkflowCondition; }

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, any>;
  timeout?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  nodeStates: Map<string, NodeExecutionState>;
  variables: Record<string, any>;
  error?: string;
}

export interface NodeExecutionState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';
  startedAt?: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
  retryCount: number;
}

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private nodeExecutors: Map<string, (node: WorkflowNode, context: any) => Promise<any>> = new Map();

  constructor() { super(); this.registerDefaultExecutors(); }

  private registerDefaultExecutors(): void {
    this.nodeExecutors.set('agent-task', async (node, context) => { return { agentTask: node.config, context }; });
    this.nodeExecutors.set('condition', async (node, context) => { const expr = node.config.expression; return { result: this.evaluateExpression(expr, context) }; });
    this.nodeExecutors.set('parallel', async (node, context) => { return { parallel: true, branches: node.config.branches }; });
    this.nodeExecutors.set('loop', async (node, context) => { return { loop: true, iterations: node.config.iterations || 1 }; });
    this.nodeExecutors.set('transform', async (node, context) => { return { transformed: true, data: context }; });
    this.nodeExecutors.set('wait', async (node, context) => { const ms = node.config.ms || 1000; await new Promise(r => setTimeout(r, ms)); return { waited: ms }; });
    this.nodeExecutors.set('custom', async (node, context) => { return { custom: true, config: node.config }; });
  }

  registerExecutor(type: string, executor: (node: WorkflowNode, context: any) => Promise<any>): void { this.nodeExecutors.set(type, executor); }

  registerWorkflow(workflow: WorkflowDefinition): void {
    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    this.workflows.set(workflow.id, workflow);
  }

  validateWorkflow(workflow: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.from)) errors.push(`Edge references unknown node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) errors.push(`Edge references unknown node: ${edge.to}`);
    }
    for (const node of workflow.nodes) {
      for (const dep of node.dependencies) { if (!nodeIds.has(dep)) errors.push(`Node "${node.id}" depends on unknown node: ${dep}`); }
      if (!this.nodeExecutors.has(node.type)) errors.push(`Unknown node type: ${node.type}`);
    }
    if (this.hasCycle(workflow)) errors.push('Workflow contains a cycle');
    return { valid: errors.length === 0, errors };
  }

  private hasCycle(workflow: WorkflowDefinition): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjList = new Map<string, string[]>();
    for (const node of workflow.nodes) adjList.set(node.id, []);
    for (const edge of workflow.edges) adjList.get(edge.from)?.push(edge.to);
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const neighbor of adjList.get(nodeId) || []) {
        if (inStack.has(neighbor)) return true;
        if (!visited.has(neighbor) && dfs(neighbor)) return true;
      }
      inStack.delete(nodeId);
      return false;
    };
    for (const node of workflow.nodes) { if (!visited.has(node.id) && dfs(node.id)) return true; }
    return false;
  }

  async executeWorkflow(workflowId: string, initialVariables?: Record<string, any>): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow "${workflowId}" not found`);
    const execution: WorkflowExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId, status: 'running', startedAt: new Date(), nodeStates: new Map(),
      variables: { ...workflow.variables, ...initialVariables },
    };
    this.executions.set(execution.id, execution);
    this.emit('workflow-started', { executionId: execution.id, workflowId });
    try {
      await this.executeWorkflowNodes(workflow, execution);
      execution.status = 'completed'; execution.completedAt = new Date();
      this.emit('workflow-completed', { executionId: execution.id });
    } catch (error) {
      execution.status = 'failed'; execution.error = (error as Error).message; execution.completedAt = new Date();
      this.emit('workflow-failed', { executionId: execution.id, error: execution.error });
    }
    return execution;
  }

  private async executeWorkflowNodes(workflow: WorkflowDefinition, execution: WorkflowExecution): Promise<void> {
    const completedNodes = new Set<string>();
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));

    while (completedNodes.size < workflow.nodes.length) {
      const readyNodes = workflow.nodes.filter(node =>
        !completedNodes.has(node.id) && node.dependencies.every(dep => completedNodes.has(dep))
      );
      if (readyNodes.length === 0) break;

      await Promise.all(readyNodes.map(async (node) => {
        const state: NodeExecutionState = { nodeId: node.id, status: 'pending', retryCount: 0 };
        execution.nodeStates.set(node.id, state);
        state.status = 'running'; state.startedAt = new Date();
        this.emit('node-started', { executionId: execution.id, nodeId: node.id });

        try {
          const context = { variables: execution.variables, nodeOutputs: this.getNodeOutputs(workflow, execution, node.id) };
          const executor = this.nodeExecutors.get(node.type);
          if (!executor) throw new Error(`No executor for type: ${node.type}`);
          state.output = await executor(node, context);
          state.status = 'completed'; state.completedAt = new Date();
          completedNodes.add(node.id);
          this.emit('node-completed', { executionId: execution.id, nodeId: node.id });
        } catch (error) {
          if (node.retryPolicy && state.retryCount < node.retryPolicy.maxRetries) {
            state.retryCount++; state.status = 'retrying';
            await new Promise(r => setTimeout(r, node.retryPolicy!.backoffMs));
          } else {
            state.status = 'failed'; state.error = (error as Error).message; state.completedAt = new Date();
            throw error;
          }
        }
      }));
    }
  }

  private getNodeOutputs(workflow: WorkflowDefinition, execution: WorkflowExecution, nodeId: string): Record<string, any> {
    const outputs: Record<string, any> = {};
    const incomingEdges = workflow.edges.filter(e => e.to === nodeId);
    for (const edge of incomingEdges) {
      const sourceState = execution.nodeStates.get(edge.from);
      if (sourceState?.output) outputs[edge.from] = sourceState.output;
    }
    return outputs;
  }

  private evaluateExpression(expr: string, context: any): boolean {
    try { return Boolean(eval(expr)); } catch { return false; }
  }

  pauseExecution(executionId: string): boolean {
    const exec = this.executions.get(executionId);
    if (exec && exec.status === 'running') { exec.status = 'paused'; this.emit('workflow-paused', { executionId }); return true; }
    return false;
  }

  resumeExecution(executionId: string): boolean {
    const exec = this.executions.get(executionId);
    if (exec && exec.status === 'paused') { exec.status = 'running'; this.emit('workflow-resumed', { executionId }); return true; }
    return false;
  }

  cancelExecution(executionId: string): boolean {
    const exec = this.executions.get(executionId);
    if (exec && (exec.status === 'running' || exec.status === 'paused')) { exec.status = 'cancelled'; exec.completedAt = new Date(); this.emit('workflow-cancelled', { executionId }); return true; }
    return false;
  }

  getWorkflow(id: string): WorkflowDefinition | undefined { return this.workflows.get(id); }
  getAllWorkflows(): WorkflowDefinition[] { return [...this.workflows.values()]; }
  getExecution(id: string): WorkflowExecution | undefined { return this.executions.get(id); }
  getStats(): { workflows: number; executions: number; running: number; completed: number; failed: number } {
    let running = 0, completed = 0, failed = 0;
    for (const exec of this.executions.values()) { if (exec.status === 'running') running++; else if (exec.status === 'completed') completed++; else if (exec.status === 'failed') failed++; }
    return { workflows: this.workflows.size, executions: this.executions.size, running, completed, failed };
  }
}
