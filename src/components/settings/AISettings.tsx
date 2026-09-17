import React, { useState } from 'react';

interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  connected: boolean;
  models: string[];
}

const defaultProviders: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    connected: false,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    connected: false,
    models: ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'],
  },
  {
    id: 'google',
    name: 'Google AI',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    connected: false,
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'local',
    name: 'Local (Ollama)',
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    connected: false,
    models: ['llama3', 'codellama', 'mistral'],
  },
];

export const AISettings: React.FC = () => {
  const [providers, setProviders] = useState(defaultProviders);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [testingId, setTestingId] = useState<string | null>(null);

  const currentProvider = providers.find((p) => p.id === selectedProvider)!;

  const handleKeyChange = (value: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === selectedProvider ? { ...p, apiKey: value } : p
      )
    );
  };

  const handleBaseUrlChange = (value: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === selectedProvider ? { ...p, baseUrl: value } : p
      )
    );
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTimeout(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, connected: !!p.apiKey || p.id === 'local' }
            : p
        )
      );
      setTestingId(null);
    }, 1500);
  };

  return (
    <div className="ai-settings">
      <div className="settings-section">
        <h3 className="settings-section-title">AI Providers</h3>

        <div className="provider-grid">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`provider-card ${selectedProvider === provider.id ? 'selected' : ''}`}
              onClick={() => setSelectedProvider(provider.id)}
            >
              <div className="provider-card-header">
                <span className="provider-card-name">{provider.name}</span>
                <span className={`provider-status ${provider.connected ? 'connected' : 'disconnected'}`}>
                  <span className="provider-status-dot" />
                  {provider.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <span className="provider-model-count">{provider.models.length} models</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">{currentProvider.name} Configuration</h3>

        <div className="settings-field">
          <label className="settings-label">API Key</label>
          <div className="settings-input-group">
            <input
              type="password"
              className="settings-input"
              placeholder={`Enter ${currentProvider.name} API key`}
              value={currentProvider.apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
            />
            <button
              className={`settings-btn ${currentProvider.connected ? 'connected' : ''}`}
              onClick={() => handleTestConnection(currentProvider.id)}
              disabled={testingId === currentProvider.id}
            >
              {testingId === currentProvider.id ? (
                <span className="settings-btn-spinner" />
              ) : currentProvider.connected ? (
                'Connected'
              ) : (
                'Test Connection'
              )}
            </button>
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Base URL</label>
          <input
            type="text"
            className="settings-input"
            value={currentProvider.baseUrl}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label className="settings-label">Default Model</label>
          <select className="settings-select">
            {currentProvider.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label className="settings-label">Temperature</label>
          <div className="settings-slider-group">
            <input
              type="range"
              className="settings-slider"
              min="0"
              max="2"
              step="0.1"
              defaultValue="0.7"
            />
            <span className="settings-slider-value">0.7</span>
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Max Tokens</label>
          <input
            type="number"
            className="settings-input"
            defaultValue={4096}
          />
        </div>
      </div>
    </div>
  );
};
