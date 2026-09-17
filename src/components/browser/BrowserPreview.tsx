import React from 'react';
import { useBrowserStore } from '../../store/browserStore';
import BrowserControls from './BrowserControls';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

export default function BrowserPreview() {
  const { currentUrl, screenshot, pages } = useBrowserStore();
  const currentPage = pages.find((p) => p.url === currentUrl);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: THEME.bg,
        borderRadius: 8,
        border: `1px solid ${THEME.accent}33`,
        overflow: 'hidden',
      }}
    >
      <BrowserControls />

      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#000',
        }}
      >
        {screenshot ? (
          <img
            src={screenshot.dataUrl}
            alt="Screenshot"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48, opacity: 0.15 }}>&#x1F310;</div>
            <div style={{ color: '#555', fontSize: 13, fontFamily: 'monospace' }}>
              {currentUrl ? 'Navigate to capture screenshot' : 'Enter a URL to begin'}
            </div>
          </div>
        )}

        {currentPage?.status === 'loading' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${THEME.accent2}, transparent)`,
              animation: 'browser-loading 1.5s infinite',
            }}
          />
        )}
      </div>

      <div
        style={{
          padding: '6px 12px',
          borderTop: `1px solid ${THEME.accent}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#666',
          fontFamily: 'monospace',
        }}
      >
        <span>
          {currentPage?.status === 'loaded' ? 'Ready' : currentPage?.status === 'loading' ? 'Loading...' : 'Idle'}
        </span>
        <span>{screenshot ? new Date(screenshot.timestamp).toLocaleTimeString() : ''}</span>
      </div>
    </div>
  );
}
