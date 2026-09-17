import { useState, useRef } from 'react';
import type { Workflow, WorkflowNode, WorkflowEdge, AgentStatus } from '../../types/agent';

const uid = () => Math.random().toString(36).slice(2, 10);

const statusColors: Record<AgentStatus, string> = {
  running: '#00e676',
  waiting: '#ffd600',
  done: '#6c5ce7',
  error: '#ff5252',
};

const initialWorkflow: Workflow = {
  id: 'wf-1',
  name: 'Deployment Pipeline',
  nodes: [
    { id: 'n1', label: 'Build', status: 'done', x: 80, y: 60 },
    { id: 'n2', label: 'Test', status: 'running', x: 280, y: 60 },
    { id: 'n3', label: 'Lint', status: 'waiting', x: 180, y: 180 },
    { id: 'n4', label: 'Deploy', status: 'waiting', x: 380, y: 180 },
  ],
  edges: [
    { from: 'n1', to: 'n2' },
    { from: 'n1', to: 'n3' },
    { from: 'n2', to: 'n4' },
    { from: 'n3', to: 'n4' },
  ],
};

export default function WorkflowEditor() {
  const [wf, setWf] = useState<Workflow>(initialWorkflow);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent, nodeId: string) => {
    const node = wf.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDragging(nodeId);
    setOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === dragging ? { ...n, x: e.clientX - offset.x, y: e.clientY - offset.y } : n,
      ),
    }));
  };

  const addNode = () => {
    const id = uid();
    setWf((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id, label: `Node ${prev.nodes.length + 1}`, status: 'waiting', x: 200, y: 120 }],
    }));
  };

  const removeNode = (id: string) => {
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
    }));
  };

  const toggleStatus = (id: string) => {
    const order: AgentStatus[] = ['waiting', 'running', 'done', 'error'];
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== id) return n;
        const idx = order.indexOf(n.status);
        return { ...n, status: order[(idx + 1) % order.length] };
      }),
    }));
  };

  const connect = (from: string, to: string) => {
    if (from === to) return;
    setWf((prev) => ({
      ...prev,
      edges: [...prev.edges, { from, to }],
    }));
  };

  const [connectMode, setConnectMode] = useState<{ from: string } | null>(null);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e1f2e', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600 }}>{wf.name}</span>
        <button
          onClick={addNode}
          style={{
            background: '#6c5ce7',
            border: 'none',
            color: '#fff',
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Node
        </button>
        {connectMode && (
          <span style={{ color: '#6c5ce7', fontSize: 11 }}>Click a node to connect from "{connectMode.from}"</span>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} onPointerMove={onPointerMove}>
        <svg ref={svgRef} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
          {wf.edges.map((edge, i) => {
            const fromNode = wf.nodes.find((n) => n.id === edge.from);
            const toNode = wf.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            return (
              <line
                key={i}
                x1={fromNode.x + 50}
                y1={fromNode.y + 20}
                x2={toNode.x + 50}
                y2={toNode.y + 20}
                stroke="#2a2b3d"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#2a2b3d" />
            </marker>
          </defs>
        </svg>

        {wf.nodes.map((node) => (
          <div
            key={node.id}
            onPointerDown={(e) => onPointerDown(e, node.id)}
            onClick={() => {
              if (connectMode) {
                connect(connectMode.from, node.id);
                setConnectMode(null);
              }
            }}
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: 100,
              padding: '8px 10px',
              background: '#13141f',
              border: `1px solid ${statusColors[node.status]}40`,
              borderRadius: 6,
              cursor: 'grab',
              userSelect: 'none',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: statusColors[node.status],
                  boxShadow: node.status === 'running' ? `0 0 6px ${statusColors.running}` : 'none',
                }}
              />
              <span style={{ color: '#e0e0e0', fontSize: 11, fontWeight: 500 }}>{node.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleStatus(node.id); }}
                style={{
                  flex: 1,
                  background: '#0a0a0f',
                  border: '1px solid #1e1f2e',
                  color: '#555',
                  fontSize: 9,
                  padding: '2px 0',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                status
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConnectMode({ from: node.id }); }}
                style={{
                  background: '#0a0a0f',
                  border: '1px solid #1e1f2e',
                  color: '#555',
                  fontSize: 9,
                  padding: '2px 4px',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                →
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                style={{
                  background: '#0a0a0f',
                  border: '1px solid #1e1f2e',
                  color: '#ff5252',
                  fontSize: 9,
                  padding: '2px 4px',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
