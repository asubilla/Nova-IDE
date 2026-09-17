import React, { useState } from 'react';
import { useMCPRegistryStore } from '../../store/mcpRegistryStore';
import MCPToolCard from './MCPToolCard';

const CATEGORIES = [
  'All',
  'Development',
  'Testing',
  'Database',
  'Payments',
  'Design',
  'Communication',
  'Project Management',
  'Deployment',
  'DevOps',
  'Cloud',
  'AI',
  'Productivity',
  'Monitoring',
  'Security',
];

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

export default function MCPBrowser() {
  const { searchQuery, filteredServers, searchTools } = useMCPRegistryStore();
  const [activeCategory, setActiveCategory] = useState('All');

  const displayed = activeCategory === 'All'
    ? filteredServers
    : filteredServers.filter((s) => s.category === activeCategory);

  return (
    <div style={{ display: 'flex', height: '100%', background: THEME.bg, color: '#e0e0e0', fontFamily: 'monospace' }}>
      <aside
        style={{
          width: 200,
          background: THEME.panel,
          borderRight: `1px solid ${THEME.accent}33`,
          padding: '16px 0',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '0 12px 12px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          Categories
        </div>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: activeCategory === cat ? `${THEME.accent}22` : 'transparent',
              border: 'none',
              color: activeCategory === cat ? THEME.accent : '#aaa',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              fontFamily: 'monospace',
              borderLeft: activeCategory === cat ? `3px solid ${THEME.accent}` : '3px solid transparent',
            }}
          >
            {cat}
          </button>
        ))}
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${THEME.accent}22` }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            <span style={{ color: THEME.accent }}>MCP</span>{' '}
            <span style={{ color: THEME.accent2 }}>Tool Registry</span>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => searchTools(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                background: THEME.bg,
                border: `1px solid ${THEME.accent}44`,
                borderRadius: 6,
                color: '#e0e0e0',
                fontSize: 14,
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#666',
                fontSize: 14,
              }}
            >
              &#x1F50D;
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
            alignContent: 'start',
          }}
        >
          {displayed.map((server) => (
            <MCPToolCard key={server.name} server={server} />
          ))}
          {displayed.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: 40, fontSize: 14 }}>
              No tools found
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
