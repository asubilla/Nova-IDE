import React, { useState } from 'react';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  expanded?: boolean;
}

interface AgentStatus {
  name: string;
  status: 'online' | 'busy' | 'offline';
}

interface SidebarProps {
  width?: number;
}

const defaultFiles: FileNode[] = [
  {
    id: '1',
    name: 'src',
    type: 'folder',
    expanded: true,
    children: [
      {
        id: '2',
        name: 'components',
        type: 'folder',
        expanded: true,
        children: [
          { id: '3', name: 'TitleBar.tsx', type: 'file' },
          { id: '4', name: 'Sidebar.tsx', type: 'file' },
          { id: '5', name: 'MainLayout.tsx', type: 'file' },
        ],
      },
      {
        id: '6',
        name: 'orchestration',
        type: 'folder',
        children: [
          { id: '7', name: 'OrchestrationPanel.tsx', type: 'file' },
          { id: '8', name: 'PatternCard.tsx', type: 'file' },
        ],
      },
      { id: '9', name: 'types.ts', type: 'file' },
      { id: '10', name: 'store.ts', type: 'file' },
      { id: '11', name: 'App.tsx', type: 'file' },
    ],
  },
  {
    id: '12',
    name: 'config',
    type: 'folder',
    children: [
      { id: '13', name: 'defaults.ts', type: 'file' },
      { id: '14', name: 'models.ts', type: 'file' },
    ],
  },
  { id: '15', name: 'package.json', type: 'file' },
  { id: '16', name: 'tsconfig.json', type: 'file' },
  { id: '17', name: 'README.md', type: 'file' },
];

const agentStatuses: AgentStatus[] = [
  { name: 'Code Assistant', status: 'online' },
  { name: 'Debugger', status: 'busy' },
  { name: 'Reviewer', status: 'online' },
  { name: 'Architect', status: 'offline' },
];

const FileIcon: React.FC<{ type: 'file' | 'folder'; expanded?: boolean }> = ({ type, expanded }) => {
  if (type === 'folder') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={expanded ? '#6c5ce7' : '#7a7c94'} opacity={expanded ? 1 : 0.7}>
        <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z" />
      </svg>
    );
  }
  const ext = '';
  const colors: Record<string, string> = {
    tsx: '#00d2ff',
    ts: '#3178c6',
    json: '#e4e4f0',
    md: '#00e676',
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors[ext] || '#7a7c94'} strokeWidth="1.5">
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" />
      <path d="M14 2V8H20" />
    </svg>
  );
};

const FileTreeItem: React.FC<{
  node: FileNode;
  depth: number;
  onToggle: (id: string) => void;
}> = ({ node, depth, onToggle }) => {
  const [expanded, setExpanded] = useState(node.expanded ?? false);

  const handleClick = () => {
    if (node.type === 'folder') {
      setExpanded(!expanded);
      onToggle(node.id);
    }
  };

  return (
    <>
      <div
        className="sidebar-file-item"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        {node.type === 'folder' && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7a7c94"
            strokeWidth="2"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <path d="M9 18L15 12L9 6" />
          </svg>
        )}
        {node.type === 'file' && <span style={{ width: 12 }} />}
        <FileIcon type={node.type} expanded={expanded} />
        <span className="sidebar-file-name">{node.name}</span>
      </div>
      {expanded && node.children?.map((child) => (
        <FileTreeItem key={child.id} node={child} depth={depth + 1} onToggle={onToggle} />
      ))}
    </>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ width = 260 }) => {
  const [files] = useState(defaultFiles);

  const handleToggle = (_id: string) => {};

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>EXPLORER</span>
        </div>
        <div className="sidebar-file-tree">
          {files.map((node) => (
            <FileTreeItem key={node.id} node={node} depth={0} onToggle={handleToggle} />
          ))}
        </div>
      </div>

      <div className="sidebar-agent-status">
        <div className="sidebar-section-header">
          <span>AGENT STATUS</span>
        </div>
        <div className="sidebar-agent-chips">
          {agentStatuses.map((agent) => (
            <div key={agent.name} className="sidebar-agent-chip">
              <span className={`sidebar-agent-dot status-${agent.status}`} />
              <span className="sidebar-agent-name">{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
