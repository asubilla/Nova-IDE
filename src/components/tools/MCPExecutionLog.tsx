import React, { useState } from 'react';
import { useMCPRegistryStore } from '../../store/mcpRegistryStore';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

export default function MCPExecutionLog() {
  const { executions } = useMCPRegistryStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

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
        }}
      >
        Execution Log ({executions.length})
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {executions.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 12 }}>
            No executions yet. Run a tool to see results here.
          </div>
        )}

        {executions.map((exec) => {
          const isExpanded = expandedId === exec.id;
          const statusColor = exec.status === 'success' ? THEME.green : exec.status === 'error' ? '#ff5252' : '#ffab40';
          const statusIcon = exec.status === 'success' ? '✓' : exec.status === 'error' ? '✗' : '⏳';

          return (
            <div
              key={exec.id}
              style={{
                borderBottom: `1px solid ${THEME.accent}11`,
                cursor: 'pointer',
              }}
              onClick={() => toggle(exec.id)}
            >
              <div
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: isExpanded ? `${THEME.accent}08` : 'transparent',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: `${statusColor}22`,
                    color: statusColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {statusIcon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#e0e0e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {exec.toolName}
                  </div>
                </div>
                {exec.timing.duration !== undefined && (
                  <div style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>
                    {exec.timing.duration}ms
                  </div>
                )}
                <div
                  style={{
                    fontSize: 10,
                    color: statusColor,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: `${statusColor}15`,
                    flexShrink: 0,
                  }}
                >
                  {exec.status}
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: '0 16px 12px 48px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Input:</div>
                  <pre
                    style={{
                      fontSize: 11,
                      color: THEME.accent2,
                      background: THEME.bg,
                      padding: 8,
                      borderRadius: 4,
                      overflow: 'auto',
                      margin: 0,
                      maxHeight: 120,
                    }}
                  >
                    {JSON.stringify(exec.input, null, 2)}
                  </pre>
                  {exec.output && (
                    <>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 8, marginBottom: 6 }}>Output:</div>
                      <pre
                        style={{
                          fontSize: 11,
                          color: exec.status === 'success' ? THEME.green : '#ff5252',
                          background: THEME.bg,
                          padding: 8,
                          borderRadius: 4,
                          overflow: 'auto',
                          margin: 0,
                          maxHeight: 120,
                        }}
                      >
                        {JSON.stringify(exec.output, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
