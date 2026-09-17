import React, { useState, useRef, useCallback } from 'react';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
};

const toolbarButtons = [
  { label: 'Auto-Fix', icon: '\u2713' },
  { label: 'Issue List', icon: '\u26a0' },
  { label: 'Memory', icon: '\u2605' },
  { label: 'Preview', icon: '\u25b6' },
  { label: 'MCP', icon: '\u2726' },
];

interface ChatInputProps {
  onSend: (content: string) => void;
  isLoading?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: `1px solid ${colors.border}`,
        background: colors.surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '8px 8px 8px 14px',
          transition: 'border-color 0.2s',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Nova AI anything..."
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: colors.text,
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'none',
            fontFamily: "'Inter', sans-serif",
            maxHeight: 160,
            minHeight: 24,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: value.trim() && !isLoading ? colors.accent : colors.border,
            color: value.trim() && !isLoading ? '#fff' : colors.secondary,
            cursor: value.trim() && !isLoading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          {isLoading ? (
            <span style={{ fontSize: 12 }}>...</span>
          ) : (
            <span style={{ transform: 'rotate(-45deg)', display: 'inline-block' }}>&#9654;</span>
          )}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 8,
          flexWrap: 'wrap',
        }}
      >
        {toolbarButtons.map((btn) => (
          <button
            key={btn.label}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: 'transparent',
              color: colors.secondary,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = colors.accent + '60';
              e.currentTarget.style.color = colors.text;
              e.currentTarget.style.background = colors.accent + '10';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.color = colors.secondary;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: 11 }}>{btn.icon}</span>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};
