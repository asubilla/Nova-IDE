export interface Keybinding {
  key: string;
  command: string;
  description: string;
  category: string;
  when?: string;
}

export const keybindings: Keybinding[] = [
  { key: 'Ctrl+K', command: 'search', description: 'Quick Search', category: 'General' },
  { key: 'Ctrl+Shift+P', command: 'commandPalette', description: 'Command Palette', category: 'General' },
  { key: 'Ctrl+P', command: 'quickOpen', description: 'Quick Open File', category: 'General' },
  { key: 'Ctrl+B', command: 'toggleSidebar', description: 'Toggle Sidebar', category: 'View' },
  { key: 'Ctrl+J', command: 'toggleTerminal', description: 'Toggle Terminal', category: 'View' },
  { key: 'Ctrl+Shift+F', command: 'globalSearch', description: 'Search in Files', category: 'Search' },
  { key: 'Ctrl+S', command: 'save', description: 'Save File', category: 'File' },
  { key: 'Ctrl+Shift+S', command: 'saveAll', description: 'Save All Files', category: 'File' },
  { key: 'Ctrl+Z', command: 'undo', description: 'Undo', category: 'Edit' },
  { key: 'Ctrl+Shift+Z', command: 'redo', description: 'Redo', category: 'Edit' },
  { key: 'Ctrl+/', command: 'toggleComment', description: 'Toggle Comment', category: 'Edit' },
  { key: 'Ctrl+D', command: 'selectNextOccurrence', description: 'Select Next Occurrence', category: 'Edit' },
  { key: 'Ctrl+Shift+K', command: 'deleteLine', description: 'Delete Line', category: 'Edit' },
  { key: 'Alt+Up', command: 'moveLineUp', description: 'Move Line Up', category: 'Edit' },
  { key: 'Alt+Down', command: 'moveLineDown', description: 'Move Line Down', category: 'Edit' },
  { key: 'Ctrl+]', command: 'indentLine', description: 'Indent Line', category: 'Edit' },
  { key: 'Ctrl+[', command: 'outdentLine', description: 'Outdent Line', category: 'Edit' },
  { key: 'F1', command: 'help', description: 'Help', category: 'Help' },
  { key: 'F12', command: 'goToDefinition', description: 'Go to Definition', category: 'Navigation', when: 'editorTextFocus' },
  { key: 'Ctrl+Enter', command: 'executeInTerminal', description: 'Execute in Terminal', category: 'Terminal' },
  { key: 'Ctrl+Shift+Enter', command: 'newAgentSession', description: 'New Agent Session', category: 'Agent' },
];

export const getKeybindingsByCategory = (): Record<string, Keybinding[]> => {
  return keybindings.reduce((acc, kb) => {
    if (!acc[kb.category]) {
      acc[kb.category] = [];
    }
    acc[kb.category]!.push(kb);
    return acc;
  }, {} as Record<string, Keybinding[]>);
};

export const getKeybinding = (command: string): Keybinding | undefined => {
  return keybindings.find((kb) => kb.command === command);
};
