import React, { useState } from 'react';

import { PatternConfig, OrchestrationResult } from '../../types/orchestration';

import { PatternCard } from './PatternCard';
import { WorkflowVisualizer } from './WorkflowVisualizer';

const patterns: PatternConfig[] = [
  {
    id: 'sequential',
    name: 'Sequential',
    description: 'Agents execute in a defined order, each receiving the output of the previous one.',
    participants: ['Analyzer', 'Reviewer', 'Optimizer'],
    pattern: 'sequential',
  },
  {
    id: 'concurrent',
    name: 'Concurrent',
    description: 'Multiple agents run simultaneously, processing tasks in parallel for faster results.',
    participants: ['WebSearch', 'DocReader', 'CodeSearch'],
    pattern: 'concurrent',
  },
  {
    id: 'handoff',
    name: 'Handoff',
    description: 'Agents pass control to each other based on context and expertise.',
    participants: ['Debugger', 'Fixer', 'Verifier'],
    pattern: 'handoff',
  },
  {
    id: 'group',
    name: 'Group Chat',
    description: 'Multiple agents collaborate in a shared discussion to solve complex problems.',
    participants: ['Architect', 'Designer', 'Developer'],
    pattern: 'group',
  },
  {
    id: 'magentic',
    name: 'Magentic',
    description: 'A self-directed agent autonomously plans and executes multi-step tasks.',
    participants: ['MagenticAgent'],
    pattern: 'magentic',
  },
];

export const OrchestrationPanel: React.FC = () => {
  const [selectedPattern, setSelectedPattern] = useState<PatternConfig | null>(null);
  const [currentResult, setCurrentResult] = useState<OrchestrationResult | null>(null);
  const [executing, setExecuting] = useState(false);

  const handleUsePattern = (pattern: PatternConfig) => {
    setSelectedPattern(pattern);
    setExecuting(true);

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
        input: `Task for ${name}`,
        output: '',
        status: i === 0 ? 'running' as const : 'pending' as const,
        startedAt: i === 0 ? Date.now() : null,
        completedAt: null,
      })),
    };

    setCurrentResult(result);

    let stepIndex = 0;
    const processStep = () => {
      if (stepIndex >= result.steps.length) {
        result.status = 'completed';
        result.output = 'Workflow completed successfully';
        result.timing.completedAt = Date.now();
        result.timing.duration = result.timing.completedAt - result.timing.startedAt;
        setCurrentResult({ ...result });
        setExecuting(false);
        return;
      }

      result.steps[stepIndex]!.status = 'running';
      setCurrentResult({ ...result, steps: [...result.steps] });

      setTimeout(() => {
        result.steps[stepIndex]!.status = 'completed';
        result.steps[stepIndex]!.output = `Output from ${result.steps[stepIndex]!.agentName}`;
        result.steps[stepIndex]!.completedAt = Date.now();
        stepIndex++;
        processStep();
      }, 600 + Math.random() * 800);
    };

    processStep();
  };

  return (
    <div className="orchestration-panel">
      <div className="orchestration-header">
        <h2 className="orchestration-title">Orchestration Patterns</h2>
        <p className="orchestration-subtitle">Choose a pattern to orchestrate your AI agents</p>
      </div>

      {currentResult ? (
        <div className="orchestration-active">
          <WorkflowVisualizer result={currentResult} />
          <div className="orchestration-result-info">
            <div className="orchestration-status">
              <span className={`status-dot status-${currentResult.status}`} />
              <span>{currentResult.status}</span>
            </div>
            {currentResult.timing.duration && (
              <span className="orchestration-duration">
                {currentResult.timing.duration}ms
              </span>
            )}
          </div>
          <button
            className="orchestration-cancel-btn"
            onClick={() => { setCurrentResult(null); setSelectedPattern(null); setExecuting(false); }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="pattern-grid">
          {patterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              onUse={handleUsePattern}
              disabled={executing}
            />
          ))}
        </div>
      )}
    </div>
  );
};
