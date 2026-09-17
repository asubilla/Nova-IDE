import { useAgentStore } from '../../store/agentStore';

const statusConfig: Record<string, { color: string; label: string; pulse: boolean }> = {
  running: { color: '#00e676', label: 'Running', pulse: true },
  waiting: { color: '#ffd600', label: 'Waiting', pulse: false },
  done:    { color: '#6c5ce7', label: 'Done', pulse: false },
  error:   { color: '#ff5252', label: 'Error', pulse: false },
};

export default function AgentStatus() {
  const agents = useAgentStore((s) => s.agents);
  const killAgent = useAgentStore((s) => s.killAgent);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0a0a0f',
        borderLeft: '1px solid #1e1f2e',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e1f2e' }}>
        <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>
          AGENTS
        </span>
        <span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>{agents.length}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {agents.length === 0 && (
          <div style={{ color: '#333', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
            No active agents
          </div>
        )}

        {agents.map((agent) => {
          const cfg = statusConfig[agent.status] ?? statusConfig.waiting;
          return (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: '#13141f',
                border: '1px solid #1e1f2e',
                borderRadius: 6,
                position: 'relative',
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: cfg.color,
                    boxShadow: cfg.pulse ? `0 0 8px ${cfg.color}` : 'none',
                    animation: cfg.pulse ? 'pulse 2s ease-in-out infinite' : 'none',
                  }}
                />
                {cfg.pulse && (
                  <style>{`
                    @keyframes pulse {
                      0%, 100% { opacity: 1; transform: scale(1); }
                      50% { opacity: 0.5; transform: scale(1.3); }
                    }
                  `}</style>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e0e0e0', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.name}
                </div>
                <div style={{ color: '#555', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.task}
                </div>
                {agent.status === 'running' && (
                  <div style={{ marginTop: 4, height: 2, background: '#1a1b2e', borderRadius: 1 }}>
                    <div style={{ height: '100%', width: `${agent.progress}%`, background: cfg.color, borderRadius: 1, transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>

              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: cfg.color,
                  background: `${cfg.color}15`,
                  padding: '2px 6px',
                  borderRadius: 3,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                {cfg.label}
              </span>

              <button
                onClick={() => killAgent(agent.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ff5252')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
