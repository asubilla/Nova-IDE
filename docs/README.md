# Nova Sub-Agent IDE

Enterprise-grade autonomous sub-agent orchestration system for AI-powered code generation, editing, and project management.

## Features

- **Multi-Agent Orchestration** — Coordinate multiple AI agents working on complex tasks simultaneously
- **Real-Time Collaboration** — WebSocket-based live editing and communication
- **IDE Integration** — Full-featured editor with Monaco, terminal, and file explorer
- **Extension System** — LSP, MCP, and plugin support for extensibility
- **Security Sandbox** — Isolated execution environments with audit logging
- **Resilience Patterns** — Circuit breakers, retry logic, and graceful shutdown
- **Desktop & Web** — Electron desktop app and browser-based web interface
- **Session Management** — Checkpointing, revert, and diff-based editing
- **Template Engine** — Project scaffolding with prompt templates
- **CLI Tools** — Command-line interface for automation and scripting

## Installation

```bash
git clone https://github.com/your-org/nova-subagent-system.git
cd nova-subagent-system
npm install
```

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Usage

### CLI

```bash
# Run the CLI
npm run nova:dev

# Build and run production
npm run nova:build
npm run nova:start
```

### Desktop (Electron)

```bash
npm run electron:dev
```

### Web

```bash
npm run dev
# Open http://localhost:3000
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Nova IDE                          │
├──────────┬──────────┬──────────┬───────────────────┤
│   CLI    │ Desktop  │   Web    │    Extensions     │
│          │(Electron)│  (HTTP)  │  (LSP/MCP/Plugin) │
├──────────┴──────────┴──────────┴───────────────────┤
│                    Core Layer                        │
├──────────┬──────────┬──────────┬───────────────────┤
│  Agents  │  Server  │  Chat    │   Coordination    │
├──────────┴──────────┴──────────┴───────────────────┤
│                  Infrastructure                      │
├──────────┬──────────┬──────────┬───────────────────┤
│ Security │  DB      │ Sessions │  Distribution     │
└──────────┴──────────┴──────────┴───────────────────┘
```

## API Documentation

See [docs/API.md](docs/API.md) for complete API reference.

### Server Endpoints

- `GET /api/health` — Health check
- `GET /api/agents` — List registered agents
- `POST /api/agents/:id/execute` — Execute a task on an agent
- `POST /api/sessions` — Create a new session
- `POST /api/sessions/:id/checkpoint` — Create a checkpoint
- `POST /api/sessions/:id/revert/:checkpointId` — Revert to checkpoint

### WebSocket Events

- `agent:status` — Agent status updates
- `task:progress` — Task progress notifications
- `chat:message` — Chat messages between agents
- `file:change` — File system change events

## Configuration

Create a `nova.config.ts` in the project root:

```typescript
export default {
  server: {
    port: 3000,
    host: 'localhost',
  },
  agents: {
    maxConcurrent: 5,
    timeout: 30000,
  },
  security: {
    sandboxEnabled: true,
    auditLog: true,
  },
};
```

## Extension Development

See [docs/EXTENSIONS.md](docs/EXTENSIONS.md) for the extension development guide.

### Quick Start

```bash
mkdir my-extension && cd my-extension
npm init -y
npm install @nova/subagent-system
```

```typescript
import { Extension } from '@nova/subagent-system';

export default class MyExtension extends Extension {
  activate() {
    this.registerCommand('my-command', () => {
      console.log('Hello from my extension!');
    });
  }
}
```

## CLI Commands

See [docs/CLI.md](docs/CLI.md) for full CLI reference.

```bash
nova init <project>       # Initialize a new project
nova serve                # Start the development server
nova agent list           # List all agents
nova agent create <name>  # Create a new agent
nova session list         # List active sessions
nova extension install    # Install an extension
```

## Development

```bash
npm run build            # Build TypeScript
npm run dev              # Start dev server
npm run test             # Run tests
npm run test:coverage    # Run tests with coverage
npm run lint             # Lint source files
npm run typecheck        # Type-check without emitting
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding tests
- `chore:` — Maintenance tasks

## License

MIT License. See [LICENSE](LICENSE) for details.
