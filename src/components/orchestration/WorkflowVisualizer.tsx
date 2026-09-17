import React, { useEffect, useState } from 'react';
import { OrchestrationResult } from '../../types/orchestration';

interface WorkflowVisualizerProps {
  result: OrchestrationResult;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

const statusColors: Record<string, string> = {
  pending: '#4a4c64',
  running: '#6c5ce7',
  completed: '#00e676',
  failed: '#ff5252',
  cancelled: '#ffa726',
};

export const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({ result }) => {
  const [animatedEdges, setAnimatedEdges] = useState<Set<string>>(new Set());

  const nodeCount = result.steps.length;
  const svgWidth = 400;
  const svgHeight = Math.max(200, nodeCount * 80 + 40);

  const positions: NodePosition[] = result.steps.map((_, i) => ({
    id: result.steps[i].id,
    x: svgWidth / 2,
    y: 50 + i * 80,
  }));

  useEffect(() => {
    const runningSteps = result.steps
      .filter((s) => s.status === 'running')
      .map((s) => s.id);

    if (runningSteps.length > 0) {
      const interval = setInterval(() => {
        setAnimatedEdges((prev) => {
          const next = new Set(prev);
          runningSteps.forEach((id) => {
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
          });
          return next;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [result.steps]);

  return (
    <div className="workflow-visualizer">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#4a4c64" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {positions.map((pos, i) => {
          if (i === positions.length - 1) return null;
          const nextPos = positions[i + 1];
          const edgeId = `${pos.id}-${nextPos.id}`;
          const isAnimated = animatedEdges.has(pos.id);

          return (
            <g key={edgeId}>
              <line
                x1={pos.x}
                y1={pos.y + 20}
                x2={nextPos.x}
                y2={nextPos.y - 20}
                stroke={isAnimated ? '#6c5ce7' : '#1a1b2e'}
                strokeWidth={isAnimated ? 2 : 1}
                markerEnd="url(#arrowhead)"
                filter={isAnimated ? 'url(#glow)' : undefined}
              />
              {isAnimated && (
                <circle
                  r="3"
                  fill="#6c5ce7"
                  filter="url(#glow)"
                >
                  <animateMotion
                    dur="1s"
                    repeatCount="indefinite"
                    path={`M${pos.x},${pos.y + 20} L${nextPos.x},${nextPos.y - 20}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {positions.map((pos, i) => {
          const step = result.steps[i];
          const color = statusColors[step.status] || '#4a4c64';

          return (
            <g key={step.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="18"
                fill={`${color}15`}
                stroke={color}
                strokeWidth={step.status === 'running' ? 2 : 1}
                filter={step.status === 'running' ? 'url(#glow)' : undefined}
              />
              {step.status === 'running' && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="18"
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="10 5"
                  opacity="0.5"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${pos.x} ${pos.y}`}
                    to={`360 ${pos.x} ${pos.y}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {step.status === 'completed' && (
                <path
                  d={`M${pos.x - 6},${pos.y} L${pos.x - 2},${pos.y + 4} L${pos.x + 6},${pos.y - 4}`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {step.status === 'failed' && (
                <>
                  <line x1={pos.x - 5} y1={pos.y - 5} x2={pos.x + 5} y2={pos.y + 5} stroke={color} strokeWidth="2" />
                  <line x1={pos.x + 5} y1={pos.y - 5} x2={pos.x - 5} y2={pos.y + 5} stroke={color} strokeWidth="2" />
                </>
              )}
              <text
                x={pos.x}
                y={pos.y + 35}
                textAnchor="middle"
                fill="#e4e4f0"
                fontSize="11"
                fontFamily="system-ui"
              >
                {step.agentName}
              </text>
              <text
                x={pos.x}
                y={pos.y + 50}
                textAnchor="middle"
                fill="#7a7c94"
                fontSize="9"
                fontFamily="system-ui"
              >
                {step.status}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
