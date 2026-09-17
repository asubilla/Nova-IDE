# Nova IDE

> AI-powered code editor built with Tauri 2, React 19, and Rust.

![Nova IDE](https://img.shields.io/badge/Nova-IDE-v0.1.0-6c5ce7?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-orange?style=flat-square)

## Features

- **Monaco Editor** — Full VS Code editing experience
- **AI Chat** — Multi-provider support (OpenAI, Anthropic, Google, Ollama)
- **Memory System** — 98% recall accuracy with context-mem
- **Agent Orchestration** — Parallel agent execution with DAG workflows
- **Kanban Board** — Visual task management for AI agents
- **4547+ MCP Tools** — Integrated tool registry
- **Browser Automation** — Live preview with Stagehand-style automation
- **Self-Healing** — Automatic error recovery
- **Workflow Patterns** — Sequential, Concurrent, Handoff, Group, Magentic

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust, Tauri 2, Tokio |
| Frontend | React 19, TypeScript, Vite |
| Editor | Monaco Editor |
| Terminal | xterm.js + WebGL |
| State | Zustand |
| Styling | CSS Custom Properties |
| Testing | Vitest, React Testing Library |

## Getting Started

### Prerequisites
- Node.js 20+
- Rust 1.75+
- Tauri 2 CLI

### Installation
```bash
git clone https://github.com/asubilla/Nova-IDE.git
cd Nova-IDE
npm install
```

### Development
```bash
npm run dev          # Start frontend
cargo tauri dev      # Start full Tauri app
```

### Testing
```bash
npm run test         # Run tests
npm run test:coverage # With coverage
npm run lint         # Lint code
npm run typecheck    # Type check
```

### Build
```bash
cargo tauri build    # Build for current platform
```

## Project Structure

```
nova-ide/
├── src/
│   ├── components/
│   │   ├── ai/             # AI chat, memory, providers
│   │   ├── editor/         # Monaco editor, tabs, minimap
│   │   ├── kanban/         # Kanban board for agents
│   │   ├── layout/         # App shell (TitleBar, Sidebar, etc.)
│   │   ├── mcp/            # MCP tools panel, registry
│   │   ├── orchestration/  # Agent orchestration UI
│   │   ├── search/         # Quick search (Ctrl+K)
│   │   ├── settings/       # Settings panels
│   │   ├── terminal/       # Terminal emulator
│   │   └── workflow/       # Workflow visualization
│   ├── config/             # Configuration files
│   ├── hooks/              # Custom React hooks
│   ├── store/              # Zustand stores
│   ├── styles/             # CSS stylesheets
│   ├── types/              # TypeScript types
│   └── utils/              # Utility functions
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri commands
│   │   ├── ai/             # AI provider integrations
│   │   ├── memory/         # Memory system
│   │   └── mcp/            # MCP server
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .husky/                 # Git hooks
├── .github/workflows/      # CI/CD
├── AGENTS.md               # AI agent rules
├── NOVA.md                 # Architecture decisions
└── package.json
```

## CI/CD

GitHub Actions runs on every push and PR:

- **Lint** — ESLint + TypeScript type check
- **Test** — Vitest with coverage report
- **Build Frontend** — Vite production build
- **Rust Check** — `cargo fmt`, `cargo clippy`, `cargo build`

## Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feat/my-feature`
3. Follow commit convention: `feat(scope): description`
4. Run tests before PR: `npm test && npm run lint`
5. Submit PR

## License

MIT
