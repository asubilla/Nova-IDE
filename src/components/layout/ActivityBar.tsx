import React, { useState } from 'react';

interface ActivityBarProps {
  activeItem?: string;
  onItemSelect?: (item: string) => void;
}

interface ActivityItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const ExplorerIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z" />
  </svg>
);

const SearchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21L16.65 16.65" />
  </svg>
);

const GitIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M12 8V12M8 16L12 12" />
  </svg>
);

const AgentIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.5" fill="currentColor" />
    <circle cx="15" cy="10" r="1.5" fill="currentColor" />
    <path d="M9 15C9 15 10 16 12 16C14 16 15 15 15 15" />
  </svg>
);

const McpIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2L4 6V12C4 17.5 7.8 22.7 12 24C16.2 22.7 20 17.5 20 12V6L12 2Z" />
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
  </svg>
);

const MemoryIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9.5 2H14.5L16 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4H8L9.5 2Z" />
    <path d="M12 11V17M9 14H15" />
  </svg>
);

const BrowserIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12H22" />
    <path d="M12 2C14.5 4.7 16 8.3 16 12C16 15.7 14.5 19.3 12 22C9.5 19.3 8 15.7 8 12C8 8.3 9.5 4.7 12 2Z" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15C19.1 15.6 19.2 16.3 19.7 16.8L19.8 16.9C20.2 17.3 20.2 18 19.8 18.4L18.6 19.6C18.2 20 17.5 20 17.1 19.6L17 19.5C16.5 20 15.8 20.1 15.2 19.8L13.7 18.8C13.1 18.4 12.8 17.7 12.8 17V16.9C12.8 16.2 12.5 15.5 12 15L11.9 14.9C11.5 14.5 11.5 13.8 11.9 13.4L13 12.3C13.4 11.9 13.4 11.2 13 10.8L12.9 10.7C12.4 10.2 12.3 9.5 12.6 8.9L13.6 7.4C14 6.8 14.7 6.5 15.4 6.8L15.5 6.9C16.2 7.2 16.9 7.1 17.5 6.7L18.7 5.5C19.1 5.1 19.1 4.4 18.7 4L17.5 2.8C17.1 2.4 16.4 2.4 16 2.8L15.9 2.9C15.3 3.3 14.6 3.4 14 3.1L12.5 2.1C11.9 1.7 11.2 1.7 10.6 2.1L9.1 3.1C8.5 3.4 7.8 3.3 7.2 2.9L7.1 2.8C6.7 2.4 6 2.4 5.6 2.8L4.4 4C4 4.4 4 5.1 4.4 5.5L5.5 6.7C6.1 7.1 6.8 7.2 7.5 6.9L7.6 6.8C8.3 6.5 9 6.8 9.4 7.4L10.4 8.9C10.7 9.5 10.6 10.2 10.1 10.7L10 10.8C9.6 11.2 9.6 11.9 10 12.3L11.1 13.4C11.5 13.8 11.5 14.5 11.1 14.9L11 15C10.5 15.5 10.4 16.2 10.4 16.9V17C10.4 17.7 10.1 18.4 9.5 18.8L8 19.8C7.4 20.1 6.7 20 6.2 19.5L6.1 19.6C5.7 20 5 20 4.6 19.6L3.4 18.4C3 18 3 17.3 3.4 16.9L3.5 16.8C4 16.3 4.1 15.6 3.8 15" />
  </svg>
);

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <ExplorerIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'git', label: 'Git', icon: <GitIcon />, badge: 3 },
  { id: 'agents', label: 'Agents', icon: <AgentIcon />, badge: 5 },
  { id: 'mcp', label: 'MCP', icon: <McpIcon /> },
  { id: 'memory', label: 'Memory', icon: <MemoryIcon /> },
  { id: 'browser', label: 'Browser', icon: <BrowserIcon /> },
];

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem = 'explorer',
  onItemSelect,
}) => {
  const [active, setActive] = useState(activeItem);

  const handleClick = (id: string) => {
    setActive(id);
    onItemSelect?.(id);
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {items.map((item) => (
          <button
            key={item.id}
            className={`activity-bar-item ${active === item.id ? 'active' : ''}`}
            title={item.label}
            onClick={() => handleClick(item.id)}
          >
            {active === item.id && <span className="activity-bar-indicator" />}
            <span className="activity-bar-icon">{item.icon}</span>
            {item.badge !== undefined && (
              <span className="activity-bar-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        <button
          className={`activity-bar-item ${active === 'settings' ? 'active' : ''}`}
          title="Settings"
          onClick={() => handleClick('settings')}
        >
          {active === 'settings' && <span className="activity-bar-indicator" />}
          <span className="activity-bar-icon"><SettingsIcon /></span>
        </button>
      </div>
    </div>
  );
};
