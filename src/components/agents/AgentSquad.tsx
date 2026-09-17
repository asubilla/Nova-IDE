import { useState } from 'react';

import { useAgentStore } from '../../store/agentStore';

const agentNames = [
  'Nova-Alpha', 'Nova-Beta', 'Nova-Gamma', 'Nova-Delta',
  'Nova-Epsilon', 'Nova-Zeta', 'Nova-Eta', 'Nova-Theta',
  'Nova-Iota', 'Nova-Kappa',
];

export default function AgentSquad() {
  const spawnAgent = useAgentStore((s) => s.spawnAgent);
  const agents = useAgentStore((s) => s.agents);
  const [count, setCount] = useState(2);
  const [maxParallel, setMaxParallel] = useState(3);
  const [autoHeal, setAutoHeal] = useState(false);
  const [launched, setLaunched] = useState(false);

  const runningCount = agents.filter((a) => a.status === 'running').length;

  const handleLaunch = () => {
    const tasks = ['Analyze codebase', 'Generate tests', 'Refactor modules', 'Review PRs', 'Update docs'];
    for (let i = 0; i < count; i++) {
      const name = agentNames[i % agentNames.length]!;
      const task = tasks[i % tasks.length]!;
      spawnAgent(name, task);
    }
    setLaunched(true);
    setTimeout(() => setLaunched(false), 2000);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0a0a0f',
        borderLeft: '1px solid #1e1f2e',
        display: 'flex',
        flexDirection: 'column',
        padding: 14,
      }}
    >
      <div style={{ borderBottom: '1px solid #1e1f2e', paddingBottom: 10, marginBottom: 14 }}>
        <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>
          AGENT SQUAD
        </span>
        <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
          {runningCount} running / {agents.length} total
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div>
          <label style={{ color: '#8a8a9a', fontSize: 11, display: 'block', marginBottom: 6 }}>
            Agent Count
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#6c5ce7' }}
            />
            <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>
              {count}
            </span>
          </div>
        </div>

        <div>
          <label style={{ color: '#8a8a9a', fontSize: 11, display: 'block', marginBottom: 6 }}>
            Max Parallel
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={1}
              max={8}
              value={maxParallel}
              onChange={(e) => setMaxParallel(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#6c5ce7' }}
            />
            <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>
              {maxParallel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#8a8a9a', fontSize: 11 }}>Auto-Heal</span>
          <button
            onClick={() => setAutoHeal(!autoHeal)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: 'none',
              background: autoHeal ? '#6c5ce7' : '#1e1f2e',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#e0e0e0',
                position: 'absolute',
                top: 3,
                left: autoHeal ? 21 : 3,
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleLaunch}
          style={{
            width: '100%',
            padding: '10px 0',
            background: launched ? '#00e676' : '#6c5ce7',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
            letterSpacing: 0.3,
          }}
        >
          {launched ? `Launched ${count} Agents` : `Launch ${count} Agents`}
        </button>

        {agents.length > 0 && (
          <div style={{ borderTop: '1px solid #1e1f2e', paddingTop: 10 }}>
            <div style={{ color: '#555', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Active Squad
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {agents.slice(0, 8).map((a) => (
                <span
                  key={a.id}
                  style={{
                    fontSize: 10,
                    color: a.status === 'running' ? '#00e676' : a.status === 'done' ? '#6c5ce7' : '#ffd600',
                    background: `${a.status === 'running' ? '#00e676' : a.status === 'done' ? '#6c5ce7' : '#ffd600'}15`,
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                >
                  {a.name}
                </span>
              ))}
              {agents.length > 8 && (
                <span style={{ fontSize: 10, color: '#555' }}>+{agents.length - 8}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
