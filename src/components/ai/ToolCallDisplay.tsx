import React from 'react';

import type { ToolCall } from '../../types/ai';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
  green: '#00b894',
  red: '#e17055',
  yellow: '#fdcb6e',
};

const statusStyles: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: colors.yellow, bg: colors.yellow + '15', label: 'Pending' },
  running: { color: colors.accent, bg: colors.accent + '15', label: 'Running' },
  success: { color: colors.green, bg: colors.green + '15', label: 'Success' },
  error: { color: colors.red, bg: colors.red + '15', label: 'Error' },
};

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const status = statusStyles[toolCall.status] || statusStyles.pending!;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        fontFamily: "'Fira Code', 'Consolas', monospace",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span style={{ color: colors.accent, fontWeight: 600 }}>
          {toolCall.name}
        </span>
        <span
          style={{
            padding: '2px 7px',
            borderRadius: 6,
            background: status.bg,
            color: status.color,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {status.label}
        </span>
      </div>

      {Object.keys(toolCall.args).length > 0 && (
        <div
          style={{
            background: '#0d0d15',
            borderRadius: 4,
            padding: '6px 8px',
            marginBottom: 6,
            color: colors.secondary,
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(toolCall.args, null, 2)}
        </div>
      )}

      {toolCall.result !== undefined && (
        <div
          style={{
            color: toolCall.status === 'error' ? colors.red : colors.green,
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {typeof toolCall.result === 'string'
            ? toolCall.result
            : JSON.stringify(toolCall.result, null, 2)}
        </div>
      )}
    </div>
  );
};
