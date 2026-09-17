import React, { useState } from 'react';
import { useBrowserStore } from '../../store/browserStore';

const THEME = {
  bg: '#0a0a0f',
  panel: '#13141f',
  accent: '#6c5ce7',
  accent2: '#00d2ff',
  green: '#00e676',
};

export default function BrowserControls() {
  const { currentUrl, navigate, captureScreenshot } = useBrowserStore();
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [inspectMode, setInspectMode] = useState(false);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let url = urlInput.trim();
    if (url && !url.startsWith('http')) url = 'https://' + url;
    if (url) {
      navigate(url);
      setUrlInput(url);
    }
  };

  const btnBase: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: `1px solid ${THEME.accent}33`,
    background: THEME.bg,
    color: '#aaa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontFamily: 'monospace',
  };

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${THEME.accent}22`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={btnBase} title="Back">&#x25C0;</button>
        <button style={btnBase} title="Forward">&#x25B6;</button>
        <button
          style={btnBase}
          title="Refresh"
          onClick={() => currentUrl && navigate(currentUrl)}
        >
          &#x21BB;
        </button>
      </div>

      <form onSubmit={handleNavigate} style={{ flex: 1, display: 'flex' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            background: THEME.bg,
            border: `1px solid ${THEME.accent}33`,
            borderRadius: 6,
            padding: '0 10px',
            gap: 8,
          }}
        >
          <span style={{ color: THEME.green, fontSize: 11, fontWeight: 700 }}>HTTPS</span>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter URL..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#e0e0e0',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
              padding: '7px 0',
            }}
          />
        </div>
      </form>

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          style={{
            ...btnBase,
            width: 'auto',
            padding: '0 10px',
            fontSize: 11,
          }}
          title="Capture Screenshot"
          onClick={captureScreenshot}
        >
          &#x1F4F7;
        </button>
        <button
          style={{
            ...btnBase,
            width: 'auto',
            padding: '0 10px',
            fontSize: 11,
            background: inspectMode ? `${THEME.accent}22` : THEME.bg,
            color: inspectMode ? THEME.accent : '#aaa',
            borderColor: inspectMode ? THEME.accent : `${THEME.accent}33`,
          }}
          title="Toggle Inspect"
          onClick={() => setInspectMode(!inspectMode)}
        >
          &#x1F50D;
        </button>
      </div>
    </div>
  );
}
