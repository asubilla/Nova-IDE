import React, { useState, useRef, useEffect } from 'react';

interface TitleBarProps {
  onOpenSettings?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const menuItems = ['File', 'Edit', 'View', 'Agent', 'Tools', 'Help'];

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z"
              stroke="#6c5ce7"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M12 6L17 9V15L12 18L7 15V9L12 6Z"
              fill="#6c5ce7"
              opacity="0.3"
            />
            <text x="12" y="15" textAnchor="middle" fill="#6c5ce7" fontSize="8" fontWeight="bold">
              N
            </text>
          </svg>
          <span className="titlebar-title">NOVA IDE</span>
        </div>
        <nav className="titlebar-menu">
          {menuItems.map((item) => (
            <button key={item} className="titlebar-menu-item">
              {item}
            </button>
          ))}
        </nav>
      </div>

      <div className="titlebar-center">
        <div className={`titlebar-search ${searchFocused ? 'focused' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a7c94" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21L16.65 16.65" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search files, commands, agents..."
            className="titlebar-search-input"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="titlebar-search-hint">Ctrl+K</kbd>
        </div>
      </div>

      <div className="titlebar-right">
        <div className="titlebar-dots">
          <span className="titlebar-dot dot-close" />
          <span className="titlebar-dot dot-minimize" />
          <span className="titlebar-dot dot-maximize" />
        </div>
      </div>
    </div>
  );
};
