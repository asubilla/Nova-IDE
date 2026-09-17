import { useAgentStore } from '../../store/agentStore';

const statusStyles: Record<string, { color: string; bg: string }> = {
  running: { color: '#00e676', bg: '#00e67618' },
  done:    { color: '#6c5ce7', bg: '#6c5ce718' },
  waiting: { color: '#ffd600', bg: '#ffd60018' },
  error:   { color: '#ff5252', bg: '#ff525218' },
};

const progressColor: Record<string, string> = {
  running: '#00e676',
  done: '#6c5ce7',
  waiting: '#ffd600',
  error: '#ff5252',
};

const statusLabels: Record<string, string> = {
  running: 'RUNNING',
  done: 'DONE',
  waiting: 'QUEUED',
  error: 'ERROR',
};

export default function AgentMonitor() {
  const agents = useAgentStore((s) => s.agents);
  const tasks = useAgentStore((s) => s.tasks);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0a0a0f',
        borderTop: '1px solid #1e1f2e',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #1e1f2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>
          TASK MONITOR
        </span>
        <span style={{ color: '#555', fontSize: 11 }}>
          {agents.filter((a) => a.status === 'running').length} active / {tasks.length} tasks
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {agents.length === 0 && (
          <div style={{ color: '#333', fontSize: 12, textAlign: 'center', marginTop: 30 }}>
            Spawn agents to begin
          </div>
        )}

        {agents.map((agent) => {
          const st = statusStyles[agent.status] ?? statusStyles.waiting!;
          return (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #111118',
              }}
            >
              <div style={{ flex: '0 0 120px' }}>
                <div style={{ color: '#e0e0e0', fontSize: 12, fontWeight: 500 }}>{agent.name}</div>
                <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>{agent.task}</div>
              </div>

              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: st.color,
                  background: st.bg,
                  padding: '3px 8px',
                  borderRadius: 4,
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}
              >
                {statusLabels[agent.status] ?? agent.status.toUpperCase()}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: '#1a1b2e', borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${agent.progress}%`,
                        background: progressColor[agent.status] ?? '#555',
                        borderRadius: 2,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ color: '#555', fontSize: 10, flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
                    {agent.progress}%
                  </span>
                </div>
              </div>

              <span style={{ color: '#333', fontSize: 10, flexShrink: 0 }}>
                {Math.floor((Date.now() - agent.startTime) / 1000)}s
              </span>
            </div>
          );
        })}

        {tasks.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid #111118', paddingTop: 8 }}>
            <div style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>TASKS</div>
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                  borderBottom: '1px solid #0d0d12',
                }}
              >
                <span style={{ color: '#e0e0e0', fontSize: 12, flex: 1 }}>{task.title}</span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: statusStyles.running!.color,
                    background: statusStyles.running!.bg,
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                >
                  {task.status.replace('-', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
