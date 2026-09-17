import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Agent {
  id: string;
  name: string;
  status: 'running' | 'done' | 'waiting' | 'error';
  task: string;
  progress: number;
}

interface FileNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileNode[];
}

interface SidebarProps {
  width: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onFileOpen: (path: string) => void;
  agents: Agent[];
}

const statusColors: Record<string, string> = {
  running: '#00e676',
  done: '#6c5ce7',
  waiting: '#ffd600',
  error: '#ff5252',
};

const FileIcon: React.FC<{ isDirectory: boolean; expanded?: boolean }> = ({ isDirectory, expanded }) => {
  if (isDirectory) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={expanded ? '#6c5ce7' : '#7a7c94'} opacity={expanded ? 1 : 0.7}>
        <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a7c94" strokeWidth="1.5">
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" />
      <path d="M14 2V8H20" />
    </svg>
  );
};

const FileTreeItem: React.FC<{
  node: FileNode;
  depth: number;
  onFileOpen: (path: string) => void;
}> = ({ node, depth, onFileOpen }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[]>(node.children || []);

  const handleClick = async () => {
    if (node.is_directory) {
      if (!expanded && children.length === 0) {
        try {
          const entries = await invoke<FileNode[]>('list_directory', { path: node.path });
          setChildren(entries);
        } catch (e) {
          console.warn('Failed to list directory:', e);
        }
      }
      setExpanded(!expanded);
    } else {
      onFileOpen(node.path);
    }
  };

  return (
    <>
      <div
        className="sidebar-file-item"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        {node.is_directory && (
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
        {!node.is_directory && <span style={{ width: 12 }} />}
        <FileIcon isDirectory={node.is_directory} expanded={expanded} />
        <span className="sidebar-file-name">{node.name}</span>
      </div>
      {expanded && children.map((child) => (
        <FileTreeItem key={child.path} node={child} depth={depth + 1} onFileOpen={onFileOpen} />
      ))}
    </>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  width,
  activeTab,
  onTabChange,
  onFileOpen,
  agents,
}) => {
  const [files, setFiles] = useState<FileNode[]>([]);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const result = await invoke<FileNode[]>('list_directory', { path: '.' });
        setFiles(result);
      } catch (e) {
        console.warn('Failed to load file tree:', e);
      }
    };
    loadFiles();
  }, []);

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>EXPLORER</span>
        </div>
        <div className="sidebar-file-tree">
          {files.map((node) => (
            <FileTreeItem key={node.path} node={node} depth={0} onFileOpen={onFileOpen} />
          ))}
        </div>
      </div>

      <div className="sidebar-agent-status">
        <div className="sidebar-section-header">
          <span>AGENT STATUS</span>
        </div>
        <div className="sidebar-agent-chips">
          {agents.map((agent) => (
            <div key={agent.id} className="sidebar-agent-chip">
              <span
                className="sidebar-agent-dot"
                style={{ backgroundColor: statusColors[agent.status] || '#555' }}
              />
              <span className="sidebar-agent-name">{agent.name}</span>
            </div>
          ))}
          {agents.length === 0 && (
            <span style={{ color: '#555', fontSize: 11 }}>No agents active</span>
          )}
        </div>
      </div>
    </div>
  );
};
