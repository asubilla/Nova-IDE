import React, { useState } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { SplitPane } from './SplitPane';
import { OrchestrationPanel } from '../orchestration/OrchestrationPanel';
import { SettingsPanel } from '../settings/SettingsPanel';

interface EditorTab {
  id: string;
  name: string;
  modified: boolean;
}

const defaultTabs: EditorTab[] = [
  { id: '1', name: 'App.tsx', modified: false },
  { id: '2', name: 'orchestrationStore.ts', modified: true },
  { id: '3', name: 'types.ts', modified: false },
];

const bottomTabs = ['Terminal', 'Output', 'Problems', 'Monitor', 'Agents'];

export const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState('1');
  const [activeBottomTab, setActiveBottomTab] = useState('Terminal');
  const [showSettings, setShowSettings] = useState(false);
  const [tabs] = useState(defaultTabs);
  const [terminalLines] = useState([
    '$ npm run dev',
    '> nova-ide@1.0.0 dev',
    '> vite',
    '',
    '  VITE v5.4.2  ready in 312 ms',
    '',
    '  ➜  Local:   http://localhost:5173/',
    '  ➜  Network: http://192.168.1.100:5173/',
    '  ➜  press h + enter to show help',
  ]);

  const handleItemSelect = (item: string) => {
    if (item === 'settings') {
      setShowSettings(true);
    }
  };

  return (
    <div className="main-layout">
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <div className="main-layout-body">
        <ActivityBar onItemSelect={handleItemSelect} />
        <Sidebar />
        <div className="main-content">
          <div className="editor-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`editor-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="editor-tab-name">{tab.name}</span>
                {tab.modified && <span className="editor-tab-modified" />}
              </button>
            ))}
          </div>

          <SplitPane
            direction="horizontal"
            initialSize={0.6}
            left={
              <div className="code-editor">
                <div className="code-editor-content">
                  <div className="code-editor-gutter">
                    {[...Array(25)].map((_, i) => (
                      <span key={i} className="code-line-number">{i + 1}</span>
                    ))}
                  </div>
                  <pre className="code-editor-text">
{`import { create } from 'zustand';
import { OrchestrationResult } from './types/orchestration';

interface AppState {
  theme: 'dark' | 'light';
  sidebarVisible: boolean;
  orchestrationResult: OrchestrationResult | null;
  toggleSidebar: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  sidebarVisible: true,
  orchestrationResult: null,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setTheme: (theme) => set({ theme }),
}));

function initApp() {
  const store = useAppStore.getState();
  console.log('Nova IDE initialized with theme:', store.theme);
}

initApp();`}
                  </pre>
                </div>
              </div>
            }
            right={<OrchestrationPanel />}
          />

          <div className="bottom-area">
            <div className="bottom-tabs">
              {bottomTabs.map((tab) => (
                <button
                  key={tab}
                  className={`bottom-tab ${activeBottomTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="bottom-content">
              {activeBottomTab === 'Terminal' && (
                <div className="terminal">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="terminal-line">
                      {line.startsWith('$') ? (
                        <span className="terminal-prompt">{line}</span>
                      ) : (
                        <span className="terminal-output">{line}</span>
                      )}
                    </div>
                  ))}
                  <div className="terminal-input-line">
                    <span className="terminal-prompt">$ </span>
                    <span className="terminal-cursor" />
                  </div>
                </div>
              )}
              {activeBottomTab === 'Output' && (
                <div className="terminal">
                  <div className="terminal-line terminal-output">[Info] Build completed in 1.2s</div>
                  <div className="terminal-line terminal-output">[Info] No errors found</div>
                </div>
              )}
              {activeBottomTab === 'Monitor' && (
                <div className="terminal">
                  <div className="terminal-line terminal-output">CPU: 12% | Memory: 256MB | Agents: 3 active</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
};
