import { PatternConfig, OrchestrationResult, OrchestrationPattern, PatternStatus } from '../types/orchestration';

interface OrchestrationState {
  patterns: PatternConfig[];
  currentWorkflow: OrchestrationResult | null;
  executionHistory: OrchestrationResult[];
  executePattern: (patternId: string) => void;
  getAvailablePatterns: () => PatternConfig[];
  cancelExecution: () => void;
  resetWorkflow: () => void;
}

const defaultPatterns: PatternConfig[] = [
  {
    id: 'sequential-code-review',
    name: 'Sequential Code Review',
    description: 'Analyzer -> Reviewer -> Optimizer pipeline for thorough code analysis',
    participants: ['Analyzer', 'Reviewer', 'Optimizer'],
    pattern: 'sequential',
  },
  {
    id: 'concurrent-research',
    name: 'Concurrent Research',
    description: 'Multiple agents research topics simultaneously and merge findings',
    participants: ['WebSearch', 'DocReader', 'CodeSearch'],
    pattern: 'concurrent',
  },
  {
    id: 'handoff-debugging',
    name: 'Handoff Debugging',
    description: 'Debugger hands off to fixer, then to verifier for complete resolution',
    participants: ['Debugger', 'Fixer', 'Verifier'],
    pattern: 'handoff',
  },
  {
    id: 'group-brainstorm',
    name: 'Group Brainstorm',
    description: 'Multiple agents collaborate and discuss to generate creative solutions',
    participants: ['Architect', 'Designer', 'Developer'],
    pattern: 'group',
  },
  {
    id: 'magentic-optimization',
    name: 'Magentic Optimization',
    description: 'Self-directed agent autonomously plans and executes optimization tasks',
    participants: ['MagenticAgent'],
    pattern: 'magentic',
  },
];

export const createOrchestrationStore = (): OrchestrationState => {
  let state: OrchestrationState = {
    patterns: defaultPatterns,
    currentWorkflow: null,
    executionHistory: [],
    executePattern: () => {},
    getAvailablePatterns: () => [],
    cancelExecution: () => {},
    resetWorkflow: () => {},
  };

  const listeners = new Set<() => void>();

  const setState = (partial: Partial<OrchestrationState>) => {
    state = { ...state, ...partial };
    listeners.forEach((l) => l());
  };

  state.executePattern = (patternId: string) => {
    const pattern = state.patterns.find((p) => p.id === patternId);
    if (!pattern) return;

    const result: OrchestrationResult = {
      id: `exec-${Date.now()}`,
      pattern,
      status: 'running',
      output: '',
      timing: {
        startedAt: Date.now(),
        completedAt: null,
        duration: null,
      },
      steps: pattern.participants.map((name, i) => ({
        id: `step-${i}`,
        agentId: name.toLowerCase().replace(/\s+/g, '-'),
        agentName: name,
        input: '',
        output: '',
        status: 'pending' as PatternStatus,
        startedAt: null,
        completedAt: null,
      })),
    };

    setState({ currentWorkflow: result });

    simulateExecution(pattern, (updated) => {
      setState({ currentWorkflow: updated });
    }, (completed) => {
      setState((prev) => ({
        currentWorkflow: completed,
        executionHistory: [...(prev?.executionHistory ?? state.executionHistory), completed],
      }));
    });
  };

  state.getAvailablePatterns = () => state.patterns;

  state.cancelExecution = () => {
    if (state.currentWorkflow) {
      setState({
        currentWorkflow: {
          ...state.currentWorkflow,
          status: 'cancelled',
          timing: {
            ...state.currentWorkflow.timing,
            completedAt: Date.now(),
            duration: Date.now() - state.currentWorkflow.timing.startedAt,
          },
        },
      });
    }
  };

  state.resetWorkflow = () => {
    setState({ currentWorkflow: null });
  };

  return {
    ...state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
  };
};

function simulateExecution(
  pattern: PatternConfig,
  onUpdate: (result: OrchestrationResult) => void,
  onComplete: (result: OrchestrationResult) => void,
) {
  const result: OrchestrationResult = {
    id: `exec-${Date.now()}`,
    pattern,
    status: 'running',
    output: '',
    timing: { startedAt: Date.now(), completedAt: null, duration: null },
    steps: pattern.participants.map((name, i) => ({
      id: `step-${i}`,
      agentId: name.toLowerCase().replace(/\s+/g, '-'),
      agentName: name,
      input: '',
      output: '',
      status: 'pending' as PatternStatus,
      startedAt: null,
      completedAt: null,
    })),
  };

  let stepIndex = 0;
  const processStep = () => {
    if (stepIndex >= result.steps.length) {
      result.status = 'completed';
      result.output = 'Workflow completed successfully';
      result.timing.completedAt = Date.now();
      result.timing.duration = result.timing.completedAt - result.timing.startedAt;
      onComplete(result);
      return;
    }

    const step = result.steps[stepIndex];
    step.status = 'running';
    step.startedAt = Date.now();
    step.input = `Input for ${step.agentName}`;
    onUpdate({ ...result, steps: [...result.steps] });

    setTimeout(() => {
      step.status = 'completed';
      step.completedAt = Date.now();
      step.output = `Output from ${step.agentName}`;
      onUpdate({ ...result, steps: [...result.steps] });
      stepIndex++;
      processStep();
    }, 500 + Math.random() * 1000);
  };

  processStep();
}
