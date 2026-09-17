import React, { useState, useMemo } from 'react';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
  green: '#00b894',
  cyan: '#00cec9',
};

interface MCPTool {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

const sampleTools: MCPTool[] = [
  { id: '1', name: 'read_file', description: 'Read the contents of a file from the workspace', category: 'FileSystem', enabled: true },
  { id: '2', name: 'write_file', description: 'Write content to a file in the workspace', category: 'FileSystem', enabled: true },
  { id: '3', name: 'list_directory', description: 'List all files and subdirectories in a path', category: 'FileSystem', enabled: true },
  { id: '4', name: 'search_files', description: 'Search for files matching a glob pattern', category: 'FileSystem', enabled: true },
  { id: '5', name: 'run_terminal', description: 'Execute a terminal command', category: 'Execution', enabled: true },
  { id: '6', name: 'get_diagnostics', description: 'Get lint and type-check diagnostics for a file', category: 'Diagnostics', enabled: true },
  { id: '7', name: 'git_status', description: 'Get the current git status of the repository', category: 'Git', enabled: true },
  { id: '8', name: 'git_diff', description: 'Show diff of uncommitted changes', category: 'Git', enabled: false },
  { id: '9', name: 'http_request', description: 'Make an HTTP request to a specified URL', category: 'Network', enabled: true },
  { id: '10', name: 'database_query', description: 'Execute a read-only SQL query', category: 'Database', enabled: false },
];

export const MCPToolsPanel: React.FC = () => {
  const [search, setSearch] = useState('');
  const [tools, setTools] = useState<MCPTool[]>(sampleTools);

  const filtered = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [search, tools]);

  const toggleTool = (id: string) => {
    setTools((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const categories = useMemo(() => {
    const cats = new Map<string, MCPTool[]>();
    filtered.forEach((t) => {
      if (!cats.has(t.category)) cats.set(t.category, []);
      cats.get(t.category)!.push(t);
    });
    return cats;
  }, [filtered]);

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
          MCP Tools
        </span>
        <span style={{ fontSize: 11, color: colors.secondary }}>
          {tools.filter((t) => t.enabled).length}/{tools.length} active
        </span>
      </div>

      <div style={{ padding: '10px 16px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools..."
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {Array.from(categories.entries()).map(([category, catTools]) => (
          <div key={category} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.secondary,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              {category}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {catTools.map((tool) => (
                <div
                  key={tool.id}
                  style={{
                    background: colors.bg,
                    border: `1px solid ${tool.enabled ? colors.accent + '30' : colors.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.accent + '50';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = tool.enabled
                      ? colors.accent + '30'
                      : colors.border;
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: tool.enabled ? colors.cyan : colors.secondary,
                        fontFamily: "'Fira Code', 'Consolas', monospace",
                      }}
                    >
                      {tool.name}
                    </span>
                    <button
                      onClick={() => toggleTool(tool.id)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: 'none',
                        background: tool.enabled ? colors.green + '20' : colors.border,
                        color: tool.enabled ? colors.green : colors.secondary,
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'all 0.2s',
                      }}
                    >
                      {tool.enabled ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: colors.secondary,
                      lineHeight: 1.4,
                    }}
                  >
                    {tool.description}
                  </div>

                  <button
                    onClick={() => toggleTool(tool.id)}
                    style={{
                      marginTop: 2,
                      padding: '5px 0',
                      borderRadius: 5,
                      border: `1px solid ${colors.accent + '30'}`,
                      background: colors.accent + '10',
                      color: colors.accent,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.accent + '25';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = colors.accent + '10';
                    }}
                  >
                    Execute
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: colors.secondary,
              fontSize: 13,
            }}
          >
            No tools found
          </div>
        )}
      </div>
    </div>
  );
};
