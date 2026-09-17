import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { SettingsPanel } from '../settings/SettingsPanel';
import AgentMonitor from '../agents/AgentMonitor';
import { terminalAPI } from '../../api/terminal';
import { useNotifications } from '../../hooks/useNotifications';

import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const bottomTabs = ['Terminal', 'Problems', 'Agents', 'Output'] as const;
type BottomTab = typeof bottomTabs[number];

export function MainLayout() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('Terminal');
  const [terminalLines, setTerminalLines] = useState<string[]>([
    'Nova IDE v0.1.0 — Ready',
    'Type commands below...',
    '',
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState('explorer');
  const [showSettings, setShowSettings] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const [settings] = useState<AppSettings>({
    theme: 'nova-dark',
    fontSize: 13,
    tabSize: 2,
    autoSave: true,
    defaultProvider: 'openai',
  });

  const [agents, setAgents] = useState<Agent[]>([]);
  const notify = useNotifications();

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const result = await invoke<Agent[]>('list_agents');
        setAgents(result);
      } catch {
        // agents not loaded yet
      }
    };
    loadAgents();
    const interval = setInterval(loadAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlisten = listen<{ agentId: string; progress: number }>('agent-progress', (event) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === event.payload.agentId
            ? { ...a, progress: event.payload.progress }
            : a
        )
      );
      if (event.payload.progress >= 100) {
        notify.success('Agent completed', `Task finished successfully`);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [notify]);

  useEffect(() => {
    const unlisten = listen<string>('ai-token', () => {});
    const unlistenComplete = listen<string>('ai-stream-complete', () => {
      notify.info('AI response complete');
    });
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, [notify]);

  useEffect(() => {
    const initTerminal = async () => {
      try {
        await terminalAPI.spawn('main', '~');
        notify.success('Terminal ready');
      } catch (e) {
        notify.error('Terminal failed', String(e));
      }
    };
    initTerminal();
  }, [notify]);

  const handleTerminalCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;
    setTerminalLines(prev => [...prev, `$ ${command}`]);
    try {
      if (command === 'clear') {
        setTerminalLines([]);
      } else if (command === 'help') {
        setTerminalLines(prev => [...prev, 'Nova IDE Commands:', '  help     — Show this help', '  clear    — Clear terminal', '  agents   — List active agents', '']);
      } else if (command === 'agents') {
        const list = agents.map(a => `  ${a.name} [${a.status}] ${a.progress}%`).join('\n');
        setTerminalLines(prev => [...prev, list || '  No active agents', '']);
      } else {
        const result = await terminalAPI.sendInput('main', command);
        if (result.output) {
          setTerminalLines(prev => [...prev, result.output]);
        }
      }
    } catch (e) {
      setTerminalLines(prev => [...prev, `Error: ${e}`]);
    }
    setTerminalLines(prev => [...prev, '']);
  }, [agents]);

  const handleSendAI = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMessage: ChatMessage = { role: 'user', content: aiInput };
    setAiMessages(prev => [...prev, userMessage]);
    setAiInput('');
    setAiLoading(true);
    const loadingId = notify.loading('AI thinking...');
    try {
      const response = await invoke<string>('send_ai_message', {
        provider_id: settings.defaultProvider,
        model: 'gpt-4',
        messages: [...aiMessages, userMessage].map(m => ({ role: m.role, content: m.content })),
      });
      setAiMessages(prev => [...prev, { role: 'assistant', content: response }]);
      notify.dismiss(loadingId);
      notify.success('AI response received');
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e}` }]);
      notify.dismiss(loadingId);
      notify.error('AI request failed', String(e));
    }
    setAiLoading(false);
  }, [aiInput, aiMessages, aiLoading, settings.defaultProvider, notify]);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const content = await invoke<string>('read_file', { path });
      const name = path.split(/[/\\]/).pop() || path;
      const newTab: EditorTab = {
        id: Date.now().toString(),
        name,
        language: getLanguage(path),
        content,
        modified: false,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
      notify.success('File opened', name);
    } catch (e) {
      notify.error('Failed to open file', String(e));
    }
  }, [notify]);

  const activeTabData = tabs.find(t => t.id === activeTab);

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
        <Sidebar
          width={260}
          activeTab={activeSidebarTab}
          onTabChange={setActiveSidebarTab}
          onFileOpen={handleOpenFile}
          agents={agents}
        />
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

          <div className="editor-and-ai">
            <div className="code-editor">
              <div className="code-editor-content">
                {tabs.length === 0 ? (
                  <div className="code-editor-empty">
                    <p>Open a file from the sidebar to start editing</p>
                  </div>
                ) : (
                  <pre className="code-editor-text">
                    {activeTabData?.content || ''}
                  </pre>
                )}
              </div>
            </div>

            {showAIPanel && (
              <div className="ai-panel">
                <div className="ai-panel-header">
                  <span>AI Chat</span>
                  <span className="ai-provider-badge">{settings.defaultProvider}</span>
                  <button className="ai-close-btn" onClick={() => setShowAIPanel(false)}>X</button>
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
            )}
          </div>

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
              {!showAIPanel && (
                <button className="bottom-tab" onClick={() => setShowAIPanel(true)}>
                  AI Chat
                </button>
              )}
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
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    rs: 'rust', py: 'python', go: 'go', json: 'json', md: 'markdown',
    html: 'html', css: 'css', yaml: 'yaml', toml: 'toml',
  };
  return langMap[ext] || 'plaintext';
}
