import React from 'react';

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

const GITHUB_ISSUES_URL = 'https://github.com/nova-ide/nova-ide/issues/new';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#e0e0e0',
  fontFamily: "'JetBrains Mono', monospace",
  padding: '2rem',
  textAlign: 'center',
};

const iconStyle: React.CSSProperties = {
  fontSize: '4rem',
  marginBottom: '1.5rem',
  color: '#ff5252',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 600,
  marginBottom: '1rem',
  color: '#ffffff',
};

const messageStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#9e9e9e',
  maxWidth: '600px',
  marginBottom: '2rem',
  padding: '1rem',
  backgroundColor: '#12121a',
  borderRadius: '8px',
  border: '1px solid #1e1e2e',
  wordBreak: 'break-word',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  backgroundColor: '#ff5252',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 0.2s',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  backgroundColor: 'transparent',
  color: '#ff5252',
  border: '1px solid #ff5252',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  transition: 'background-color 0.2s',
};

export function ErrorFallback({ error, onReset }: ErrorFallbackProps): React.ReactElement {
  const isDev = import.meta.env.VITE_DEBUG === 'true';

  return (
    <div style={containerStyle}>
      <div style={iconStyle}>⚠</div>
      <h1 style={headingStyle}>Something went wrong</h1>
      <div style={messageStyle}>
        {error?.message ?? 'An unexpected error occurred.'}
      </div>
      {isDev && error?.stack && (
        <pre
          style={{
            ...messageStyle,
            textAlign: 'left',
            fontSize: '0.75rem',
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          {error.stack}
        </pre>
      )}
      <div style={buttonRowStyle}>
        <button
          style={primaryButtonStyle}
          onClick={onReset}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#d32f2f';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ff5252';
          }}
        >
          Try Again
        </button>
        <a
          href={GITHUB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={secondaryButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 82, 82, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          Report on GitHub
        </a>
      </div>
    </div>
  );
}
