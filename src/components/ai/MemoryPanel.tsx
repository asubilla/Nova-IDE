import React, { useState, useMemo } from 'react';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
};

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  date: string;
  relevance: number;
  tags: string[];
}

const sampleEntries: MemoryEntry[] = [
  {
    id: '1',
    title: 'Project Architecture',
    content: 'Nova IDE uses a plugin-based architecture with React frontend and Zustand state management.',
    date: '2026-09-15',
    relevance: 0.95,
    tags: ['architecture', 'nova-ide'],
  },
  {
    id: '2',
    title: 'Dark Theme Colors',
    content: 'Primary bg: #0a0a0f, accent: #6c5ce7, text: #e4e4f0, secondary: #7a7c94',
    date: '2026-09-14',
    relevance: 0.88,
    tags: ['design', 'theme'],
  },
  {
    id: '3',
    title: 'API Integration Pattern',
    content: 'All API calls go through a centralized service layer with automatic retry and error handling.',
    date: '2026-09-13',
    relevance: 0.76,
    tags: ['api', 'patterns'],
  },
  {
    id: '4',
    title: 'User Preference: Vim Keybindings',
    content: 'User prefers vim-style keybindings for code navigation and editing.',
    date: '2026-09-12',
    relevance: 0.62,
    tags: ['preferences', 'keybindings'],
  },
];

export const MemoryPanel: React.FC = () => {
  const [search, setSearch] = useState('');
  const [entries] = useState<MemoryEntry[]>(sampleEntries);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [search, entries]);

  const getRelevanceColor = (score: number) => {
    if (score >= 0.9) return '#00b894';
    if (score >= 0.7) return '#fdcb6e';
    return colors.secondary;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: colors.surface,
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
          Memory
        </span>
        <span style={{ fontSize: 11, color: colors.secondary }}>
          {filtered.length} entries
        </span>
      </div>

      <div style={{ padding: '10px 16px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.text,
            fontSize: 13,
            outline: 'none',
            fontFamily: "'Inter', sans-serif",
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 16px 16px',
        }}
      >
        {filtered.map((entry) => {
          const relColor = getRelevanceColor(entry.relevance);
          return (
            <div
              key={entry.id}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 8,
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.accent + '40';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border;
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.text,
                  }}
                >
                  {entry.title}
                </span>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: relColor + '18',
                    color: relColor,
                    fontSize: 10,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(entry.relevance * 100).toFixed(0)}%
                </span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: colors.secondary,
                  lineHeight: 1.5,
                  marginBottom: 8,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {entry.content}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: colors.accent + '12',
                        color: colors.accent,
                        fontSize: 10,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: colors.secondary }}>
                  {entry.date}
                </span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: colors.secondary,
              fontSize: 13,
            }}
          >
            No memory entries found
          </div>
        )}
      </div>
    </div>
  );
};
