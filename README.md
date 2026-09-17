# Nova IDE

A modern, AI-powered code editor with intelligent agent orchestration.

## Features

- **AI-Powered Coding**: Integrated LLM support with multiple providers
- **Agent Orchestration**: Sequential, concurrent, handoff, group, and magentic patterns
- **Smart Search**: Ctrl+K quick search across files and commands
- **Terminal Integration**: Built-in terminal with agent interaction
- **MCP Support**: Model Context Protocol integration
- **Dark Theme**: Carefully crafted dark UI with purple accent colors

## Quick Start

### Prerequisites
- Node.js 18+ (recommended: 20 LTS)
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nova-ide.git

# Navigate to project
cd nova-ide

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Project Structure

```
nova-ide/
├── src/
│   ├── components/       # React components
│   │   ├── layout/       # App shell (TitleBar, Sidebar, etc.)
│   │   ├── orchestration/ # Agent orchestration UI
│   │   └── settings/     # Settings panels
│   ├── config/           # Configuration files
│   ├── store/            # Zustand stores
│   ├── styles/           # CSS stylesheets
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── AGENTS.md             # AI agent rules
├── NOVA.md               # Architecture decisions
└── package.json
```

## Configuration

### AI Providers

Configure AI providers in Settings (Ctrl+,):

- **OpenAI**: GPT-4o, GPT-4 Turbo, GPT-3.5-turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Google AI**: Gemini 2.0 Flash, Gemini 1.5 Pro
- **Local**: Ollama (Llama 3, Code Llama, Mistral)

### Keybindings

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Quick Search |
| Ctrl+Shift+P | Command Palette |
| Ctrl+B | Toggle Sidebar |
| Ctrl+J | Toggle Terminal |
| Ctrl+P | Quick Open File |
| Ctrl+S | Save File |
| F12 | Go to Definition |

## Development

### Scripts

```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript checker
```

### Adding a New Component

1. Create component in `src/components/{category}/`
2. Create corresponding CSS in `src/styles/`
3. Export component and add types to `src/types/`
4. Import and use in parent component

### Adding a New Orchestration Pattern

1. Add pattern type to `OrchestrationPattern` in `src/types/orchestration.ts`
2. Add pattern config to default patterns in `src/store/orchestrationStore.ts`
3. Add pattern icon and card in `src/components/orchestration/PatternCard.tsx`
4. Add workflow visualization logic if needed

## License

MIT
