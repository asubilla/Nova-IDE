export interface NovaConfig {
  theme: {
    mode: 'dark' | 'light';
    colors: {
      bgDarkest: string;
      bgDark: string;
      bgPanel: string;
      bgSidebar: string;
      bgEditor: string;
      accent: string;
      accent2: string;
      green: string;
      textPrimary: string;
      textSecondary: string;
      textDim: string;
    };
  };
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
    lineNumbers: boolean;
    minimap: boolean;
    bracketPairColorization: boolean;
  };
  ai: {
    defaultProvider: string;
    defaultModel: string;
    temperature: number;
    maxTokens: number;
    streamingEnabled: boolean;
  };
  agent: {
    autoApprove: boolean;
    maxConcurrent: number;
    defaultTimeout: number;
  };
  terminal: {
    fontSize: number;
    fontFamily: string;
    scrollback: number;
  };
  keybindings: Record<string, string>;
}

export const defaultConfig: NovaConfig = {
  theme: {
    mode: 'dark',
    colors: {
      bgDarkest: '#0a0a0f',
      bgDark: '#0f1019',
      bgPanel: '#13141f',
      bgSidebar: '#0d0e17',
      bgEditor: '#111220',
      accent: '#6c5ce7',
      accent2: '#00d2ff',
      green: '#00e676',
      textPrimary: '#e4e4f0',
      textSecondary: '#7a7c94',
      textDim: '#4a4c64',
    },
  },
  editor: {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    minimap: true,
    bracketPairColorization: true,
  },
  ai: {
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
    streamingEnabled: true,
  },
  agent: {
    autoApprove: false,
    maxConcurrent: 5,
    defaultTimeout: 60000,
  },
  terminal: {
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
    scrollback: 10000,
  },
  keybindings: {
    'Ctrl+K': 'search',
    'Ctrl+Shift+P': 'commandPalette',
    'Ctrl+B': 'toggleSidebar',
    'Ctrl+J': 'toggleTerminal',
    'Ctrl+P': 'quickOpen',
    'Ctrl+Shift+F': 'globalSearch',
    'Ctrl+S': 'save',
    'Ctrl+Z': 'undo',
    'Ctrl+Shift+Z': 'redo',
  },
};
