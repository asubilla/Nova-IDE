import type { Card } from '../../types/kanban';
import type { Agent } from '../../types/agent';

const statusBadgeColor: Record<string, string> = {
  backlog: '#555',
  todo: '#ffd600',
  'in-progress': '#6c5ce7',
  done: '#00e676',
};

const agentDotColor: Record<string, string> = {
  running: '#00e676',
  waiting: '#ffd600',
  done: '#6c5ce7',
  error: '#ff5252',
};

interface Props {
  card: Card;
  agent: Agent | null;
}

export default function AgentCard({ card, agent }: Props) {
  return (
    <div
      style={{
        background: '#0d0d14',
        border: '1px solid #1e1f2e',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2a2b3d')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e1f2e')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
          {card.title}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: statusBadgeColor[card.status] ?? '#555',
            background: `${statusBadgeColor[card.status] ?? '#555'}18`,
            padding: '2px 6px',
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          {card.status.replace('-', ' ')}
        </span>
      </div>

      {card.assignee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: agent ? agentDotColor[agent.status] : '#555',
              boxShadow: agent?.status === 'running' ? `0 0 6px ${agentDotColor.running}` : 'none',
            }}
          />
          <span style={{ color: '#8a8a9a', fontSize: 11 }}>{card.assignee}</span>
        </div>
      )}

      {card.progress > 0 && (
        <div>
          <div
            style={{
              height: 3,
              background: '#1a1b2e',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${card.progress}%`,
                background: card.status === 'done' ? '#00e676' : '#6c5ce7',
                borderRadius: 2,
                transition: 'width 0.3s',
              }}
            />
          </div>
          <span style={{ color: '#555', fontSize: 10, marginTop: 2, display: 'block' }}>
            {card.progress}%
          </span>
        </div>
      )}

      {card.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {card.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                color: '#6c5ce7',
                background: '#6c5ce718',
                padding: '1px 6px',
                borderRadius: 3,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
