import React, { useState, useRef, useEffect } from 'react';
import type { Provider } from '../../types/ai';

const colors = {
  bg: '#0a0a0f',
  accent: '#6c5ce7',
  text: '#e4e4f0',
  secondary: '#7a7c94',
  surface: '#12121a',
  border: '#1e1e2e',
  cyan: '#00cec9',
  green: '#00b894',
};

const modelColors: Record<string, string> = {
  'Claude 4 Opus': '#6c5ce7',
  'Claude 4 Sonnet': '#a29bfe',
  'Claude 3.5 Haiku': '#ddd6fe',
  'GPT-4o': '#00b894',
  'GPT-4o-mini': '#55efc4',
  'Gemini 2.5 Pro': '#0984e3',
  'Gemini 2.5 Flash': '#74b9ff',
};

interface ProviderSelectorProps {
  providers: Provider[];
  currentProvider: Provider | null;
  currentModel: string;
  onSelect: (provider: Provider, modelId: string) => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  providers,
  currentProvider,
  currentModel,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const badgeColor = modelColors[currentModel] || colors.accent;

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          color: colors.text,
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          transition: 'border-color 0.2s',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 10,
            background: badgeColor + '20',
            color: badgeColor,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {currentModel || 'Select Model'}
        </span>
        <span style={{ color: colors.secondary, fontSize: 10 }}>
          {isOpen ? '\u25b2' : '\u25bc'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: 11,
              fontWeight: 600,
              color: colors.secondary,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            Providers & Models
          </div>

          {providers.map((provider) => (
            <div key={provider.id}>
              <div
                style={{
                  padding: '8px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.secondary,
                  background: colors.bg + '80',
                  letterSpacing: 0.5,
                }}
              >
                {provider.name}
              </div>
              {provider.models.map((model) => {
                const isActive = currentProvider?.id === provider.id && currentModel === model;
                const color = modelColors[model] || colors.accent;
                return (
                  <button
                    key={model}
                    onClick={() => {
                      onSelect(provider, model);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 14px',
                      border: 'none',
                      background: isActive ? color + '12' : 'transparent',
                      color: colors.text,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontFamily: "'Inter', sans-serif",
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = colors.bg;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isActive && (
                        <span style={{ color: colors.green, fontSize: 12 }}>\u2713</span>
                      )}
                      {model}
                    </span>
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: 8,
                        background: color + '18',
                        color,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {model.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
