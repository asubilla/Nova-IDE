import React, { useState } from 'react';
import { AISettings } from './AISettings';

interface SettingsPanelProps {
  onClose: () => void;
}

type SettingsTab = 'ai' | 'editor' | 'agent' | 'theme' | 'extensions';

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'ai', label: 'AI' },
  { id: 'editor', label: 'Editor' },
  { id: 'agent', label: 'Agent' },
  { id: 'theme', label: 'Theme' },
  { id: 'extensions', label: 'Extensions' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6L18 18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content">
            {activeTab === 'ai' && <AISettings />}
            {activeTab === 'editor' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Editor Settings</h3>
                <div className="settings-field">
                  <label className="settings-label">Font Size</label>
                  <input type="number" className="settings-input" defaultValue={14} />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Tab Size</label>
                  <select className="settings-select">
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Word Wrap</label>
                  <input type="checkbox" className="settings-checkbox" defaultChecked />
                </div>
              </div>
            )}
            {activeTab === 'agent' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Agent Settings</h3>
                <div className="settings-field">
                  <label className="settings-label">Auto-approve tool calls</label>
                  <input type="checkbox" className="settings-checkbox" />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Max concurrent agents</label>
                  <input type="number" className="settings-input" defaultValue={5} />
                </div>
              </div>
            )}
            {activeTab === 'theme' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Theme</h3>
                <div className="settings-theme-grid">
                  {['Nova Dark', 'Nova Light', 'Monokai', 'Dracula'].map((theme) => (
                    <div key={theme} className="settings-theme-card">
                      <div className="settings-theme-preview" />
                      <span className="settings-theme-name">{theme}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'extensions' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Extensions</h3>
                <div className="settings-empty">No extensions installed</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
