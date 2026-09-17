import React, { useState } from 'react';
import type { MCPServer } from '../../types/mcp-registry';
import { useMCPRegistryStore } from '../../store/mcpRegistryStore';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

const CATEGORY_ICONS: Record<string, string> = {
  Development: '&#x1F4BB;',
  Testing: '&#x1F9EA;',
  Database: '&#x1F5C4;',
  Payments: '&#x1F4B3;',
  Design: '&#x1F3A8;',
  Communication: '&#x1F4AC;',
  'Project Management': '&#x1F4CB;',
  Deployment: '&#x1F680;',
  DevOps: '&#x2699;',
  Cloud: '&#x2601;',
  AI: '&#x1F916;',
  Productivity: '&#x26A1;',
  Monitoring: '&#x1F4CA;',
  Security: '&#x1F512;',
};

export default function MCPToolCard({ server }: { server: MCPServer }) {
  const { executeTool } = useMCPRegistryStore();
  const [execCount, setExecCount] = useState(0);
  const [installed, setInstalled] = useState(false);

  const handleInstall = () => {
    setInstalled((prev) => !prev);
  };

  const handleRun = () => {
    const tool = server.tools[0];
    if (!tool) return;
    const input: Record<string, unknown> = {};
    Object.keys(tool.parameters).forEach((k) => {
      input[k] = `sample_${k}`;
    });
    executeTool(server.name, tool.name, input);
    setExecCount((c) => c + 1);
  };

  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.accent}33`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `${THEME.accent}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
          }}
          dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[server.category] || '&#x1F527;' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#e0e0e0' }}>{server.name}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{server.category}</div>
        </div>
        {execCount > 0 && (
          <div
            style={{
              background: `${THEME.accent2}22`,
              color: THEME.accent2,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {execCount}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.5 }}>{server.description}</div>

      <div style={{ fontSize: 11, color: '#666' }}>
        {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}: {server.tools.map((t) => t.name).join(', ')}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={handleInstall}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 6,
            border: `1px solid ${installed ? THEME.green : THEME.accent}44`,
            background: installed ? `${THEME.green}22` : `${THEME.accent}22`,
            color: installed ? THEME.green : THEME.accent,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          {installed ? 'Installed' : 'Install'}
        </button>
        <button
          onClick={handleRun}
          disabled={!installed}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 6,
            border: `1px solid ${THEME.accent2}44`,
            background: installed ? `${THEME.accent2}22` : '#1a1a2e',
            color: installed ? THEME.accent2 : '#555',
            cursor: installed ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          Run
        </button>
      </div>
    </div>
  );
}
