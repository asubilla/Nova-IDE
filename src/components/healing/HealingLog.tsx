import React from 'react';
import { useHealingStore } from '../../store/healingStore';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

const TYPE_CONFIG = {
  retry: { icon: '\u{1F504}', color: '#ffab40', label: 'Retry' },
  fix: { icon: '\u{2705}', color: THEME.green, label: 'Fixed' },
  error: { icon: '\u{274C}', color: '#ff5252', label: 'Error' },
  success: { icon: '\u{2705}', color: THEME.green, label: 'Success' },
};

export default function HealingLog() {
  const { events } = useHealingStore();

  return (
    <div
      style={{
        height: '100%',
        background: THEME.panel,
        border: `1px solid ${THEME.accent}33`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${THEME.accent}22`,
          fontSize: 13,
          fontWeight: 700,
          color: THEME.accent,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: THEME.green }}>&#x25CF;</span>
        Healing Log
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {events.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 12 }}>
            Waiting for healing events...
          </div>
        )}

        {events.map((event) => {
          const config = TYPE_CONFIG[event.type];
          const time = new Date(event.timestamp);

          return (
            <div
              key={event.id}
              style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${THEME.accent}11`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                animation: 'healing-fade-in 0.3s ease',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: `${config.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {config.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: config.color,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: `${config.color}15`,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {config.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#666' }}>
                    {time.toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>{event.message}</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Agent: {event.agentId}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
