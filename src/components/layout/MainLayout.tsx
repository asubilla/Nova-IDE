import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { SplitPane } from './SplitPane';
import { SettingsPanel } from '../settings/SettingsPanel';
import AgentMonitor from '../agents/AgentMonitor';

interface EditorTab {
  id: string;
  name: string;
  language: string;
  content: string;
  modified: boolean;
}

interface Agent {
  id: string;
  name: string;
  status: 'running' | 'done' | 'waiting' | 'error';
  task: string;
  progress: number;
}

interface AppSettings {
  theme: string;
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  defaultProvider: string;
}

const bottomTabs = ['Terminal', 'Problems', 'Agents', 'Output'] as const;

export const MainLayout: React.FC = () => {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');

  const [activeBottomTab, setActiveBottomTab] = useState<string>('Terminal');
  const [terminalLines, setTerminalLines] = useState<string[]>([
    'Nova IDE v0.1.0 — Ready',
    'Type commands below...',
    '',
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth] = useState(260);
  const [activeSidebarTab, setActiveSidebarTab] = useState('explorer');

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'nova-dark',
    fontSize: 13,
    tabSize: 2,
    autoSave: true,
    defaultProvider: 'openai',
  });

  const [agents, setAgents] = useState<Agent[]>([]);

  const [showAIPanel, setShowAIPanel] = useState(true);
  const [aiMessages, setAiMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await invoke<AppSettings>('get_settings');
        setSettings(result);
      } catch (e) {
        console.warn('Using default settings:', e);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const result = await invoke<Agent[]>('list_agents');
        setAgents(result);
      } catch (e) {
        console.warn('Failed to load agents:', e);
      }
    };
    loadAgents();
    const interval = setInterval(loadAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTerminalCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    setTerminalLines(prev => [...prev, `$ ${command}`]);

    try {
      if (command.startsWith('cd ')) {
        setTerminalLines(prev => [...prev, `Changed directory to ${command.slice(3)}`]);
      } else if (command === 'clear') {
        setTerminalLines([]);
      } else if (command === 'help') {
        setTerminalLines(prev => [...prev,
          'Nova IDE Commands:',
          '  help     — Show this help',
          '  clear    — Clear terminal',
          '  agents   — List active agents',
          '  theme    — Toggle theme',
          '',
        ]);
      } else if (command === 'agents') {
        const agentList = agents.map(a => `  ${a.name} [${a.status}] ${a.progress}%`).join('\n');
        setTerminalLines(prev => [...prev, agentList || '  No active agents', '']);
      } else {
        const result = await invoke<string>('send_input', { id: 'main', input: command });
        setTerminalLines(prev => [...prev, result]);
      }
    } catch (e) {
      setTerminalLines(prev => [...prev, `Error: ${e}`]);
    }
    setTerminalLines(prev => [...prev, '']);
  }, [agents]);

  const handleSendAI = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;

    const userMessage = { role: 'user', content: aiInput };
    setAiMessages(prev => [...prev, userMessage]);
    setAiInput('');
    setAiLoading(true);

    try {
      const response = await invoke<string>('send_ai_message', {
        providerId: settings.defaultProvider,
        model: 'gpt-4',
        messages: [...aiMessages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        })),
      });
      setAiMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e}` }]);
    }
    setAiLoading(false);
  }, [aiInput, aiMessages, aiLoading, settings.defaultProvider]);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const content = await invoke<string>('read_file', { path });
      const newTab: EditorTab = {
        id: Date.now().toString(),
        name: path.split(/[/\\]/).pop() || path,
        language: getLanguage(path),
        content,
        modified: false,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }, []);

  return (
    <div className="main-layout">
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <div className="main-layout-body">
        <ActivityBar
          onItemSelect={(item) => {
            if (item === 'settings') setShowSettings(true);
            if (item === 'agents') setActiveSidebarTab('agents');
            if (item === 'explorer') setActiveSidebarTab('explorer');
          }}
        />

        {sidebarVisible && (
          <Sidebar
            width={sidebarWidth}
            activeTab={activeSidebarTab}
            onTabChange={setActiveSidebarTab}
            onFileOpen={handleOpenFile}
            agents={agents}
          />
        )}

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
            initialSize={showAIPanel ? 0.6 : 1}
            left={
              <div className="code-editor">
                <div className="code-editor-content">
                  {tabs.length === 0 ? (
                    <div className="code-editor-empty">
                      <p>Open a file from the sidebar to start editing</p>
                    </div>
                  ) : (
                    <pre className="code-editor-text">
                      {tabs.find(t => t.id === activeTab)?.content || ''}
                    </pre>
                  )}
                </div>
              </div>
            }
            right={showAIPanel ? (
              <div className="ai-panel">
                <div className="ai-panel-header">
                  <span>AI Chat</span>
                  <span className="ai-provider-badge">{settings.defaultProvider}</span>
                </div>
                <div className="ai-messages">
                  {aiMessages.map((msg, i) => (
                    <div key={i} className={`ai-message ${msg.role}`}>
                      <div className={`ai-avatar ${msg.role}`}>
                        {msg.role === 'user' ? 'U' : 'AI'}
                      </div>
                      <div className="ai-bubble">{msg.content}</div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="ai-message assistant">
                      <div className="ai-avatar assistant">AI</div>
                      <div className="ai-bubble">Thinking...</div>
                    </div>
                  )}
                </div>
                <div className="ai-input-area">
                  <textarea
                    className="ai-input"
                    placeholder="Ask Nova anything..."
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendAI();
                      }
                    }}
                  />
                  <button className="ai-send-btn" onClick={handleSendAI} disabled={aiLoading}>
                    Send
                  </button>
                </div>
              </div>
            ) : null}
          </SplitPane>

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
                    <input
                      className="terminal-input"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTerminalCommand(terminalInput);
                          setTerminalInput('');
                        }
                      }}
                      autoFocus
                    />
                  </div>
                </div>
              )}
              {activeBottomTab === 'Problems' && (
                <div className="terminal">
                  <div className="terminal-line terminal-output">No problems found</div>
                </div>
              )}
              {activeBottomTab === 'Agents' && (
                <AgentMonitor />
              )}
              {activeBottomTab === 'Output' && (
                <div className="terminal">
                  <div className="terminal-line terminal-output">[Nova] Build completed</div>
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

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    rs: 'rust', py: 'python', go: 'go', json: 'json', md: 'markdown',
    html: 'html', css: 'css', yaml: 'yaml', toml: 'toml',
  };
  return langMap[ext] || 'plaintext';
}
