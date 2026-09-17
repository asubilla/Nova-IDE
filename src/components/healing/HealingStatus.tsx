import React from 'react';
import { useHealingStore } from '../../store/healingStore';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

export default function HealingStatus() {
  const { events } = useHealingStore();
  const today = new Date().toDateString();
  const todayRepairs = events.filter(
    (e) => (e.eventType === 'fix' || e.eventType === 'success') && new Date(e.timestamp).toDateString() === today
  ).length;
  const todayErrors = events.filter(
    (e) => e.eventType === 'error' && new Date(e.timestamp).toDateString() === today
  ).length;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: THEME.panel,
        border: `1px solid ${THEME.accent}33`,
        borderRadius: 8,
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: THEME.green,
          boxShadow: `0 0 8px ${THEME.green}88`,
          animation: 'healing-pulse 2s infinite',
        }}
      />
      <span style={{ color: THEME.green, fontWeight: 600 }}>Healing Active</span>
      <span style={{ color: '#444' }}>|</span>
      <span style={{ color: '#888' }}>
        <span style={{ color: THEME.green }}>{todayRepairs}</span> repairs
      </span>
      <span style={{ color: '#888' }}>
        <span style={{ color: todayErrors > 0 ? '#ff5252' : '#888' }}>{todayErrors}</span> errors
      </span>
    </div>
  );
}
