import React from 'react';
import { PatternConfig } from '../../types/orchestration';

interface PatternCardProps {
  pattern: PatternConfig;
  onUse: (pattern: PatternConfig) => void;
  disabled?: boolean;
}

const patternIcons: Record<string, React.ReactNode> = {
  sequential: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="1.5">
      <rect x="2" y="6" width="6" height="6" rx="1" />
      <rect x="9" y="6" width="6" height="6" rx="1" />
      <rect x="16" y="6" width="6" height="6" rx="1" />
      <path d="M8 9H9M15 9H16" />
      <path d="M5 14L5 18L12 18L12 14M19 14L19 18L12 18" />
    </svg>
  ),
  concurrent: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="1.5">
      <circle cx="12" cy="5" r="3" />
      <circle cx="5" cy="18" r="3" />
      <circle cx="19" cy="18" r="3" />
      <path d="M12 8V13M12 13L6 16M12 13L18 16" />
    </svg>
  ),
  handoff: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00e676" strokeWidth="1.5">
      <circle cx="6" cy="12" r="4" />
      <circle cx="18" cy="12" r="4" />
      <path d="M10 10L14 14M14 10L10 14" />
      <path d="M10 12H14" strokeDasharray="2 2" />
    </svg>
  ),
  group: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffa726" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <circle cx="5" cy="18" r="3" />
      <circle cx="19" cy="18" r="3" />
      <circle cx="12" cy="18" r="3" />
      <path d="M10 10L6 16M14 10L18 16M12 12V16" strokeDasharray="2 2" />
    </svg>
  ),
  magentic: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e040fb" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="#e040fb" opacity="0.3" />
      <path d="M12 4V6M12 18V20M4 12H6M18 12H20" />
      <path d="M7.05 7.05L8.46 8.46M15.54 15.54L16.95 16.95M7.05 16.95L8.46 15.54M15.54 8.46L16.95 7.05" />
    </svg>
  ),
};

const patternColors: Record<string, string> = {
  sequential: '#6c5ce7',
  concurrent: '#00d2ff',
  handoff: '#00e676',
  group: '#ffa726',
  magentic: '#e040fb',
};

export const PatternCard: React.FC<PatternCardProps> = ({ pattern, onUse, disabled }) => {
  const color = patternColors[pattern.pattern] || '#6c5ce7';

  return (
    <div
      className="pattern-card"
      style={{ borderColor: `${color}20` }}
    >
      <div className="pattern-card-icon" style={{ color }}>
        {patternIcons[pattern.pattern]}
      </div>
      <div className="pattern-card-content">
        <h3 className="pattern-card-name">{pattern.name}</h3>
        <p className="pattern-card-description">{pattern.description}</p>
        <div className="pattern-card-meta">
          <span className="pattern-card-participants">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="7" r="4" />
              <path d="M2 21V17C2 14.8 3.8 13 6 13H12C14.2 13 16 14.8 16 17V21" />
              <circle cx="17" cy="7" r="3" />
              <path d="M22 21V18C22 16.3 20.7 15 19 15H17" />
            </svg>
            {pattern.participants.length} agents
          </span>
          <span className="pattern-card-type" style={{ color }}>{pattern.pattern}</span>
        </div>
      </div>
      <button
        className="pattern-card-btn"
        style={{ background: color }}
        onClick={() => onUse(pattern)}
        disabled={disabled}
      >
        Use Pattern
      </button>
    </div>
  );
};
