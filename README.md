<div align="center">

# NOVA SUB-AGENT IDE

### Autonomous AI-Powered Development Environment with 147+ Parallel Agents

**Full-stack IDE with real-time AI agents, real file operations, real terminal, real git, BYOK/BYOA, Electron desktop app, 81 REST API endpoints, production security, and monitoring.**

---

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/asubilla/Nova-IDE/releases)
[![Node.js](https://img.shields.io/badge/Node.js-24.x-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/asubilla/Nova-IDE/actions)
[![Agents](https://img.shields.io/badge/agents-147+-orange.svg)](#agent-system)
[![API](https://img.shields.io/badge/API-81%20endpoints-purple.svg)](#v1-api-endpoints)
[![Electron](https://img.shields.io/badge/Electron-44-blue.svg)](#electron-desktop-app)
[![Platform](https://img.shields.io/badge/platform-Win%20%7C%20Mac%20%7C%20Linux-lightgrey.svg)](#installation)

</div>

---

## KEYWORDS

`ai-ide` `autonomous-agents` `sub-agent` `llm` `code-generation` `ai-development` `ide` `code-editor` `electron-app` `typescript` `openai` `anthropic` `claude` `gpt-4` `multi-agent` `parallel-agents` `real-time` `websocket` `rest-api` `devtools` `developer-tools` `code-completion` `code-analysis` `byok` `byoa` `mcp` `lsp` `plugin-system` `extension-marketplace` `terminal` `git-integration` `file-explorer` `monaco-editor` `debug-adapter` `security-audit` `penetration-testing` `load-testing` `monitoring` `logging` `checkpoint` `diff-engine` `chat-system` `collaboration` `docker` `ci-cd` `cross-platform` `self-hosted`

## TABLE OF CONTENTS

- [What is Nova IDE](#what-is-nova-ide)
- [Architecture Overview](#architecture-overview)
- [System Architecture](#system-architecture)
- [Feature Roadmap](#feature-roadmap)
- [Complete Feature List](#complete-feature-list)
- [Comparison](#comparison)
- [V1 API Endpoints](#v1-api-endpoints)
- [BYOK Support](#byok-bring-your-own-key)
- [BYOA Support](#byoa-bring-your-own-agent)
- [Agent System](#agent-system)
- [Agent Templates](#agent-templates)
- [Agent Status & Lifecycle](#agent-status--lifecycle)
- [Sub-Agent System](#sub-agent-system)
- [Chat System](#chat-system)
- [Editor Features](#editor-features)
- [MCP / LSP / Plugin System](#mcp--lsp--plugin-system)
- [Extensions](#extensions)
- [Settings](#settings)
- [Logging System](#logging-system)
- [Security System](#security-system)
- [Monitoring System](#monitoring-system)
- [WebSocket Details](#websocket-details)
- [Live Preview](#live-preview)
- [Diff Engine](#diff-engine)
- [Checkpoint & Revert](#checkpoint--revert)
- [Themes & Sounds](#themes--sounds)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Stats](#project-stats)
- [Deployment](#deployment)
- [How It Works](#how-it-works)

---

## WHAT IS NOVA IDE

Nova IDE is a fully autonomous, AI-powered development environment that orchestrates 100+ parallel agents to handle complex software engineering tasks. Unlike traditional IDEs where you write code manually, Nova IDE understands your intent, creates a plan, spawns specialized agents, and executes the entire task autonomously.

```
 User Intent  →  Plan Generation  →  Agent Orchestration  →  Real Execution  →  Verified Output
     "Build a          Task             147+ agents           Files written        Done with
      REST API"      Decomposition      parallel execution    Tests passed         0 errors
```

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Autonomous Execution** | Give a task, agents execute end-to-end |
| **147+ Agent Types** | Specialized agents for every task |
| **Real File Operations** | Read, write, edit actual files on disk |
| **Real Terminal** | Execute commands in real terminal |
| **Real Git Integration** | Full git workflow automation |
| **Real-Time Streaming** | Watch agents work in real-time |
| **BYOK** | Bring your own API keys |
| **BYOA** | Bring your own custom agents |
| **81 V1 API Endpoints** | Complete REST API |
| **WebSocket** | Real-time bidirectional communication |
| **Checkpoint System** | Save/restore agent state |
| **Diff Engine** | Track every file change |
| **Security Audit** | Built-in vulnerability scanning |
| **Production Monitoring** | Metrics, alerts, health checks |

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOVA SUB-AGENT IDE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │   Web UI     │  │  Electron     │  │   CLI Tool   │  │  V1 REST API  │   │
│  │  (Browser)   │  │  (Desktop)    │  │  (Terminal)  │  │  (81 routes)  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘   │
│         │                 │                  │                   │           │
│         └─────────────────┴──────────────────┴───────────────────┘           │
│                                    │                                        │
│                         ┌──────────┴──────────┐                             │
│                         │    Server Layer      │                             │
│                         │  (Node.js HTTP + WS) │                             │
│                         └──────────┬──────────┘                             │
│                                    │                                        │
│              ┌─────────────────────┼─────────────────────┐                  │
│              │                     │                     │                  │
│   ┌──────────┴──────────┐ ┌───────┴───────┐ ┌───────────┴──────────┐      │
│   │   Orchestrator      │ │  Chat Service  │ │  Extension System    │      │
│   │   (147+ Agents)     │ │  (63 files)    │ │  (MCP+LSP+Plugin)   │      │
│   └──────────┬──────────┘ └───────┬───────┘ └───────────┬──────────┘      │
│              │                     │                     │                  │
│   ┌──────────┴─────────────────────┴─────────────────────┴──────────┐      │
│   │                     Core Systems                                │      │
│   ├─────────────────────────────────────────────────────────────────┤      │
│   │ AI Integration │ File System │ Terminal │ Git │ Debug │ Collab  │      │
│   │ (LLM Provider) │ (Node fs)   │ (spawn)  │     │ (DAP) │ (OT)   │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    Supporting Systems                           │      │
│   ├─────────────────────────────────────────────────────────────────┤      │
│   │ Security │ Monitoring │ Logging │ Testing │ Performance │ Cloud │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SYSTEM ARCHITECTURE

### Directory Structure

```
subagent-system/
├── core/                    # Core types and orchestrator
│   ├── types.ts             # 190+ type definitions
│   └── enhanced-orchestrator.ts
├── server/                  # HTTP + WebSocket server
│   ├── server.ts            # Main server
│   ├── routes.ts            # 126 routes
│   └── ws-handler.ts        # WebSocket handler
├── src/
│   ├── api/                 # V1 REST API (81 endpoints)
│   │   ├── v1-router.ts     # Route definitions
│   │   ├── v1-middleware.ts  # Auth, CORS, rate limit
│   │   └── v1-types.ts      # API types
│   ├── ai/                  # AI/LLM integration
│   │   ├── llm-provider.ts  # OpenAI, Anthropic, Google, Azure, Ollama
│   │   ├── code-completion.ts
│   │   ├── code-analysis.ts
│   │   ├── chat-assistant.ts
│   │   ├── context-manager.ts
│   │   ├── context-summarizer.ts
│   │   └── token-counter.ts
│   ├── chat/                # Chat system (63 files)
│   │   ├── chat-types.ts
│   │   ├── chat-service.ts
│   │   ├── chat-database.ts
│   │   ├── chat-websocket.ts
│   │   ├── chat-enhanced.ts
│   │   ├── chat-routes.ts
│   │   ├── byok-config.ts   # BYOK support
│   │   ├── byoa-config.ts   # BYOA support
│   │   ├── ui/              # Chat UI components
│   │   ├── providers/       # LLM providers
│   │   └── tests/           # 219 tests
│   ├── cli/                 # CLI tool (19 commands)
│   ├── debug/               # Debug adapter (DAP)
│   ├── extensions/          # Extension system
│   ├── ide/                 # IDE components
│   ├── logging/             # Logging system (20 files)
│   ├── monitoring/          # Production monitoring
│   ├── performance/         # Performance utilities
│   ├── security/            # Security systems
│   ├── testing/             # Test suites
│   ├── ui/                  # UI components
│   ├── system/              # System layer (fs, terminal, git)
│   └── utils/               # Utilities
├── electron/                # Electron desktop app
├── web/                     # Web interface
├── templates/               # Agent templates
├── registry/                # Agent registry (147+)
├── deployment/              # Docker, CI/CD
└── docs/                    # Documentation
```

---

## FEATURE ROADMAP

### Phase 1: Core Foundation ✅
- [x] TypeScript project setup
- [x] Core type system (190+ types)
- [x] Enhanced orchestrator
- [x] Agent registry (147+ agents)
- [x] Template system (6 templates)
- [x] Message bus system
- [x] Plugin system

### Phase 2: AI Integration ✅
- [x] LLM provider (OpenAI, Anthropic, Google, Azure, Ollama)
- [x] Real API calls with streaming
- [x] Code completion
- [x] Code analysis
- [x] Context manager with token counting
- [x] Context summarizer
- [x] Chat assistant

### Phase 3: File System & Terminal ✅
- [x] Real file operations (Node.js fs)
- [x] Real terminal execution (child_process)
- [x] Real git integration (child_process.execSync)
- [x] File explorer UI
- [x] Terminal UI
- [x] Monaco editor (CDN)

### Phase 4: Server & API ✅
- [x] HTTP server (Node.js)
- [x] WebSocket server (RFC 6455)
- [x] 126 total routes
- [x] 81 V1 API endpoints
- [x] Middleware stack (auth, CORS, rate limit, logging)
- [x] Health check endpoint

### Phase 5: Chat System ✅
- [x] Chat service (63 files)
- [x] Chat database
- [x] Chat WebSocket
- [x] Chat enhanced (25+ endpoints)
- [x] Rich text editor
- [x] Code playground
- [x] Mermaid renderer
- [x] LaTeX renderer
- [x] Link preview
- [x] Image preview
- [x] File preview (PDF, video, audio)
- [x] Voice messages
- [x] Drag & drop
- [x] Task cards
- [x] Accessibility
- [x] Message animations
- [x] Sound effects
- [x] Chat backup

### Phase 6: Security ✅
- [x] Sandbox system
- [x] Permissions system
- [x] Secrets vault
- [x] Audit logger
- [x] Budget limiter
- [x] Security auditor
- [x] Vulnerability scanner (12 types)
- [x] Input validator
- [x] Rate limiter

### Phase 7: Extensions ✅
- [x] MCP server loader
- [x] LSP server manager
- [x] Plugin JSON loader
- [x] Extension manager
- [x] Marketplace (8 built-in)

### Phase 8: Debugging ✅
- [x] Debug adapter (DAP protocol)
- [x] Breakpoint manager

### Phase 9: Collaboration ✅
- [x] Team manager
- [x] Collab server (Operational Transform)

### Phase 10: Monitoring ✅
- [x] Metrics collector (Prometheus)
- [x] Health checker
- [x] Alert manager
- [x] Production dashboard

### Phase 11: Logging ✅
- [x] System logger
- [x] Agent logger
- [x] Session logger
- [x] Chat logger
- [x] Extension logger
- [x] Performance logger
- [x] Log formatter (7 formats)
- [x] Log viewer
- [x] Log exporter
- [x] Feature tracker
- [x] Live log stream
- [x] Live dashboard
- [x] Log aggregator
- [x] Middleware logger
- [x] WebSocket logger
- [x] Template logger
- [x] Diff logger

### Phase 12: Testing ✅
- [x] Load test suite
- [x] Stress test
- [x] Performance benchmark
- [x] Penetration test (13 types)

### Phase 13: Desktop App ✅
- [x] Electron main process
- [x] Electron preload
- [x] Build script
- [x] Smoke test
- [x] Package test

### Phase 14: Deployment ✅
- [x] Dockerfile
- [x] docker-compose.yml
- [x] GitHub Actions CI/CD
- [x] Build script

### Phase 15: Production Ready ✅
- [x] Error handler (global)
- [x] Edge cases (timeout, rate limit, disk full, circuit breaker, bulkhead)
- [x] Performance profiler
- [x] LRU cache
- [x] Connection pool
- [x] Debounce/throttle

---

## COMPLETE FEATURE LIST

### Core Features

| Feature | Status | Description |
|---------|--------|-------------|
| Autonomous Execution | ✅ Working | Give task, agents execute end-to-end |
| 147+ Agent Types | ✅ Working | Specialized agents for every task |
| Real File Operations | ✅ Working | Read, write, edit actual files |
| Real Terminal | ✅ Working | Execute commands in real terminal |
| Real Git | ✅ Working | Full git workflow automation |
| Real-Time Streaming | ✅ Working | Watch agents work live |
| Plan Generation | ✅ Working | AI generates execution plan |
| Task Decomposition | ✅ Working | Break complex tasks into subtasks |
| Parallel Execution | ✅ Working | Multiple agents work simultaneously |
| Dependency Resolution | ✅ Working | Agents resolve dependencies |
| Error Recovery | ✅ Working | Self-healing on failures |
| Retry System | ✅ Working | Automatic retry with backoff |
| Checkpoint System | ✅ Working | Save/restore agent state |
| Diff Engine | ✅ Working | Track every file change |
| Version History | ✅ Working | Complete version history |

### AI Features

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-Provider LLM | ✅ Working | OpenAI, Anthropic, Google, Azure, Ollama |
| Streaming Responses | ✅ Working | Real-time token streaming |
| Code Completion | ✅ Working | AI-powered code suggestions |
| Code Analysis | ✅ Working | Static analysis with AI |
| Context Management | ✅ Working | Token-aware context window |
| Context Summarization | ✅ Working | Auto-summarize at 85% capacity |
| Token Counting | ✅ Working | Per-model token limits |
| Temperature Control | ✅ Working | Configurable creativity |
| System Prompts | ✅ Working | Custom system prompts |
| Multi-Model Support | ✅ Working | Switch models per task |

### Chat Features

| Feature | Status | Description |
|---------|--------|-------------|
| Real-Time Chat | ✅ Working | WebSocket-based messaging |
| Thread Support | ✅ Working | Nested conversation threads |
| Pin Messages | ✅ Working | Pin important messages |
| Bookmarks | ✅ Working | Bookmark messages |
| Reactions | ✅ Working | Emoji reactions |
| Mentions | ✅ Working | @mention users/agents |
| Search | ✅ Working | Full-text message search |
| Message Versions | ✅ Working | Edit history tracking |
| Rich Text | ✅ Working | Bold, italic, code blocks |
| Code Playground | ✅ Working | Run code in browser |
| Mermaid Diagrams | ✅ Working | Render diagrams |
| LaTeX Rendering | ✅ Working | Math formulas |
| Link Preview | ✅ Working | URL previews |
| Image Preview | ✅ Working | Image lightbox |
| File Preview | ✅ Working | PDF, video, audio |
| Voice Messages | ✅ Working | Audio recording |
| Drag & Drop | ✅ Working | File drag & drop |
| Task Cards | ✅ Working | Visual task cards |
| Accessibility | ✅ Working | ARIA, keyboard nav |
| Message Animations | ✅ Working | 7 animation types |
| Sound Effects | ✅ Working | 9 synth sounds |
| Chat Backup | ✅ Working | Export/import chat |

### Editor Features

| Feature | Status | Description |
|---------|--------|-------------|
| Monaco Editor | ✅ Working | Full VS Code editor |
| Syntax Highlighting | ✅ Working | 50+ languages |
| IntelliSense | ✅ Working | Code completions |
| Multi-Cursor | ✅ Working | Multiple cursors |
| Find & Replace | ✅ Working | Regex support |
| Minimap | ✅ Working | Code overview |
| Word Wrap | ✅ Working | Configurable wrapping |
| Tab Size | ✅ Working | Configurable tabs |
| Font Size | ✅ Working | Configurable font |
| Line Numbers | ✅ Working | Show/hide |
| Bracket Matching | ✅ Working | Auto bracket match |
| Auto-Close | ✅ Working | Auto-close brackets |
| Fold/Unfold | ✅ Working | Code folding |
| Undo/Redo | ✅ Working | Full history |

### File Explorer Features

| Feature | Status | Description |
|---------|--------|-------------|
| Tree View | ✅ Working | Hierarchical file tree |
| Create File | ✅ Working | Create new files |
| Create Folder | ✅ Working | Create new folders |
| Rename | ✅ Working | Rename files/folders |
| Delete | ✅ Working | Delete files/folders |
| Copy | ✅ Working | Copy files |
| Move | ✅ Working | Move files |
| Search | ✅ Working | Find files by name |
| Filter | ✅ Working | Filter by type |
| Context Menu | ✅ Working | Right-click actions |
| Drag & Drop | ✅ Working | Move files by drag |

### Terminal Features

| Feature | Status | Description |
|---------|--------|-------------|
| Real Terminal | ✅ Working | Real shell execution |
| Multiple Tabs | ✅ Working | Multiple terminals |
| Command History | ✅ Working | Previous commands |
| Auto-Complete | ✅ Working | Tab completion |
| Copy/Paste | ✅ Working | Clipboard support |
| Clear | ✅ Working | Clear terminal |
| Resize | ✅ Working | Resizable panels |

### Extension Features

| Feature | Status | Description |
|---------|--------|-------------|
| MCP Servers | ✅ Working | Model Context Protocol |
| LSP Servers | ✅ Working | Language Server Protocol |
| Plugin System | ✅ Working | JSON-based plugins |
| Marketplace | ✅ Working | Browse & install |
| 8 Built-in Extensions | ✅ Working | Pre-installed |
| Hot Reload | ✅ Working | Live extension reload |

### Security Features

| Feature | Status | Description |
|---------|--------|-------------|
| Sandbox | ✅ Working | Isolated agent execution |
| Permissions | ✅ Working | Granular permissions |
| Secrets Vault | ✅ Working | Encrypted secrets |
| Audit Logger | ✅ Working | All actions logged |
| Budget Limiter | ✅ Working | Cost control |
| Input Validation | ✅ Working | Sanitize all inputs |
| Rate Limiting | ✅ Working | Prevent abuse |
| Vulnerability Scanner | ✅ Working | 12 vulnerability types |

### Monitoring Features

| Feature | Status | Description |
|---------|--------|-------------|
| Metrics Collector | ✅ Working | Prometheus metrics |
| Health Checker | ✅ Working | System health checks |
| Alert Manager | ✅ Working | Alert routing |
| Production Dashboard | ✅ Working | Real-time dashboard |

---

## COMPARISON

### vs Other IDEs

| Feature | Nova IDE | Others |
|---------|----------|--------|
| **Autonomous Agents** | 147+ parallel agents | Limited/no agents |
| **Real File Operations** | Direct disk access | Sandboxed/limited |
| **Real Terminal** | Full shell execution | Limited/sandboxed |
| **Real Git** | Full git workflow | Basic integration |
| **BYOK** | ✅ Any provider | Locked to one |
| BYOA | ✅ Custom agents | ❌ Not available |
| **V1 API** | 81 endpoints | Limited API |
| **WebSocket** | RFC 6455 | Basic/polling |
| **Checkpoint** | ✅ Save/restore | ❌ Not available |
| **Diff Engine** | ✅ Full tracking | Basic diff |
| **Security Audit** | ✅ Built-in | ❌ Not available |
| **Penetration Test** | ✅ 13 test types | ❌ Not available |
| **Load Test** | ✅ 12 test types | ❌ Not available |
| **Live Dashboard** | ✅ Terminal ANSI | ❌ Not available |
| **Log Export** | ✅ 6 formats | Limited |
| **Sound Effects** | ✅ 9 synth sounds | ❌ Not available |
| **Voice Messages** | ✅ Recording | ❌ Not available |
| **Code Playground** | ✅ In-browser | ❌ Not available |
| **Mermaid/LaTeX** | ✅ Rendering | ❌ Not available |
| **DAP Debug** | ✅ Full protocol | Basic debugging |
| **Team Collab** | ✅ Operational Transform | ❌ Not available |
| **Templates** | ✅ 6 categories | Limited |
| **Extension Market** | ✅ 8 built-in | Varies |

### Unique Features

These features are NOT available in other IDEs:

1. **147+ Specialized Agents** - Most IDEs have 0-5 agents
2. **Real-Time Agent Streaming** - Watch agents work live
3. **Checkpoint & Revert** - Save/restore agent state
4. **BYOA (Bring Your Own Agent)** - Create custom agents
5. **Agent Templates** - 6 pre-built templates with validation
6. **Security Penetration Testing** - 13 attack simulations
7. **Live Terminal Dashboard** - ANSI-based real-time view
8. **Sound Effects** - 9 synthesized sounds with ADSR envelopes
9. **Voice Messages** - Audio recording in chat
10. **Code Playground** - Run code in browser
11. **Mermaid/LaTeX** - Diagram and math rendering
12. **Log Aggregator** - Anomaly detection and insights
13. **Feature Tracker** - Track every feature usage
14. **Circuit Breaker** - Automatic failure isolation
15. **Bulkhead Pattern** - Failure containment

---

## V1 API ENDPOINTS

### Sessions (18)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sessions` | Create new session |
| GET | `/api/v1/sessions` | List all sessions |
| GET | `/api/v1/sessions/:id` | Get session details |
| DELETE | `/api/v1/sessions/:id` | Delete session |
| POST | `/api/v1/sessions/:id/start` | Start session |
| POST | `/api/v1/sessions/:id/pause` | Pause session |
| POST | `/api/v1/sessions/:id/cancel` | Cancel session |
| GET | `/api/v1/sessions/:id/agents` | List session agents |
| GET | `/api/v1/sessions/:id/agents/:agentId` | Get agent details |
| POST | `/api/v1/sessions/:id/agents/:agentId/cancel` | Cancel agent |
| POST | `/api/v1/sessions/:id/agents/:agentId/retry` | Retry agent |
| GET | `/api/v1/sessions/:id/checkpoints` | List checkpoints |
| POST | `/api/v1/sessions/:id/checkpoint` | Create checkpoint |
| POST | `/api/v1/sessions/:id/checkpoint/:cpId/restore` | Restore checkpoint |
| GET | `/api/v1/sessions/:id/diff` | Get session diff |
| GET | `/api/v1/sessions/:id/summary` | Get session summary |
| GET | `/api/v1/sessions/:id/export` | Export session |
| POST | `/api/v1/sessions/:id/import` | Import session |

### Agents (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List all agents |
| GET | `/api/v1/agents/:id` | Get agent details |
| GET | `/api/v1/agents/:id/logs` | Get agent logs |
| GET | `/api/v1/agents/:id/timeline` | Get agent timeline |
| POST | `/api/v1/agents/:id/cancel` | Cancel agent |
| POST | `/api/v1/agents/:id/retry` | Retry agent |

### Chat (16)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat/sessions` | Create chat session |
| GET | `/api/v1/chat/sessions` | List chat sessions |
| GET | `/api/v1/chat/sessions/:id` | Get chat session |
| POST | `/api/v1/chat/sessions/:id/messages` | Send message |
| GET | `/api/v1/chat/sessions/:id/messages` | Get messages |
| PUT | `/api/v1/chat/messages/:id` | Edit message |
| DELETE | `/api/v1/chat/messages/:id` | Delete message |
| POST | `/api/v1/chat/messages/:id/reply` | Reply to message |
| POST | `/api/v1/chat/messages/:id/react` | React to message |
| POST | `/api/v1/chat/sessions/:id/read` | Mark as read |
| GET | `/api/v1/chat/search` | Search messages |
| GET | `/api/v1/chat/sessions/:id/pins` | Get pinned messages |
| POST | `/api/v1/chat/messages/:id/pin` | Pin message |
| GET | `/api/v1/chat/sessions/:id/threads` | Get threads |
| POST | `/api/v1/chat/sessions/:id/threads` | Create thread |
| GET | `/api/v1/chat/messages/:id/versions` | Get message versions |

### BYOK Providers (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/providers` | List providers |
| POST | `/api/v1/providers` | Add provider |
| PUT | `/api/v1/providers/:id` | Update provider |
| DELETE | `/api/v1/providers/:id` | Remove provider |
| POST | `/api/v1/providers/:id/validate` | Validate API key |
| POST | `/api/v1/providers/:id/test` | Test connection |
| GET | `/api/v1/providers/:id/usage` | Get usage stats |

### BYOA Custom Agents (8)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/custom-agents` | List custom agents |
| POST | `/api/v1/custom-agents` | Register agent |
| PUT | `/api/v1/custom-agents/:id` | Update agent |
| DELETE | `/api/v1/custom-agents/:id` | Remove agent |
| POST | `/api/v1/custom-agents/:id/test` | Test agent |
| POST | `/api/v1/custom-agents/:id/clone` | Clone agent |
| GET | `/api/v1/custom-agents/:id/export` | Export agent |
| POST | `/api/v1/custom-agents/:id/import` | Import agent |

### Extensions (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/extensions` | List extensions |
| POST | `/api/v1/extensions/install` | Install extension |
| POST | `/api/v1/extensions/:id/uninstall` | Uninstall extension |
| POST | `/api/v1/extensions/:id/enable` | Enable extension |
| POST | `/api/v1/extensions/:id/disable` | Disable extension |
| GET | `/api/v1/extensions/marketplace/search` | Search marketplace |

### Security & Audit (4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/security/scan` | Run security scan |
| GET | `/api/v1/security/report` | Get security report |
| GET | `/api/v1/audit` | Get audit logs |
| GET | `/api/v1/audit/export` | Export audit logs |

### Monitoring (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/metrics` | Get metrics |
| GET | `/api/v1/logs` | Get logs |
| GET | `/api/v1/logs/export` | Export logs |
| GET | `/api/v1/logs/stream` | Stream logs (SSE) |
| GET | `/api/v1/alerts` | Get alerts |
| POST | `/api/v1/alerts/:id/acknowledge` | Acknowledge alert |

### Templates (3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/templates` | List templates |
| GET | `/api/v1/templates/search` | Search templates |
| GET | `/api/v1/templates/:id` | Get template |

### Debug (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/debug/start` | Start debugging |
| POST | `/api/v1/debug/stop` | Stop debugging |
| POST | `/api/v1/debug/breakpoint` | Set breakpoint |
| POST | `/api/v1/debug/step` | Step execution |
| POST | `/api/v1/debug/continue` | Continue execution |
| GET | `/api/v1/debug/stacktrace` | Get stack trace |

**Total: 81 V1 API Endpoints**

---

## BYOK (BRING YOUR OWN KEY)

### Supported Providers

| Provider | Models | Streaming | Status |
|----------|--------|-----------|--------|
| OpenAI | GPT-4, GPT-4o, GPT-3.5 | ✅ | Working |
| Anthropic | Claude 3.5, Claude 3 | ✅ | Working |
| Google | Gemini Pro, Gemini Flash | ✅ | Working |
| Azure | Azure OpenAI | ✅ | Working |
| Ollama | Local models | ✅ | Working |

### BYOK Configuration

```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

### BYOK Endpoints

```
POST /api/v1/providers          - Add provider
GET  /api/v1/providers          - List providers
PUT  /api/v1/providers/:id      - Update provider
DELETE /api/v1/providers/:id    - Remove provider
POST /api/v1/providers/:id/validate - Validate key
POST /api/v1/providers/:id/test     - Test connection
GET  /api/v1/providers/:id/usage    - Get usage stats
```

---

## BYOA (BRING YOUR OWN AGENT)

### Custom Agent Structure

```json
{
  "id": "my-code-reviewer",
  "name": "Code Reviewer",
  "type": "review",
  "description": "Reviews code for quality and security",
  "systemPrompt": "You are an expert code reviewer...",
  "model": "gpt-4o",
  "temperature": 0.3,
  "maxTokens": 4096,
  "capabilities": ["readCode", "writeCode", "searchCode"],
  "enabled": true
}
```

### BYOA Endpoints

```
GET    /api/v1/custom-agents          - List agents
POST   /api/v1/custom-agents          - Register agent
PUT    /api/v1/custom-agents/:id      - Update agent
DELETE /api/v1/custom-agents/:id      - Remove agent
POST   /api/v1/custom-agents/:id/test - Test agent
POST   /api/v1/custom-agents/:id/clone - Clone agent
GET    /api/v1/custom-agents/:id/export - Export agent
POST   /api/v1/custom-agents/:id/import - Import agent
```

### Agent Types

| Type | Description |
|------|-------------|
| `review` | Code review agent |
| `debug` | Debugging agent |
| `docs` | Documentation agent |
| `test` | Testing agent |
| `optimize` | Performance optimization agent |
| `custom` | Custom agent type |

---

## AGENT SYSTEM

### Agent Registry (147+ Agents)

```
┌──────────────────────────────────────────────────────────────┐
│                     AGENT REGISTRY                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  CODE AGENTS (30+)                                           │
│  ├── code-reviewer           ├── code-writer                 │
│  ├── code-refactorer         ├── code-optimizer              │
│  ├── code-explainer          ├── code-documenter             │
│  ├── code-tester             ├── code-debugger               │
│  ├── code-migrator           ├── code-converter              │
│  ├── code-formatter          ├── code-linter                 │
│  ├── code-analyzer           ├── code-completer              │
│  ├── code-generator          ├── code-synthesizer            │
│  ├── code-validator          ├── code-simulator              │
│  ├── code-profiler           ├── code-decompressor           │
│  ├── code-encrypter          ├── code-decrypter              │
│  ├── code-compressor         ├── code-decompressor           │
│  ├── code-architect          ├── code-designer               │
│  ├── code-planner            ├── code-estimator              │
│  └── code-coordinator        └── code-reviewer-2             │
│                                                              │
│  TEST AGENTS (20+)                                           │
│  ├── test-writer             ├── test-runner                 │
│  ├── test-analyzer           ├── test-coverage               │
│  ├── test-fix                ├── test-mocker                 │
│  ├── test-fixture            ├── test-data-generator         │
│  ├── test-reporter           ├── test-benchmark              │
│  ├── e2e-tester              ├── integration-tester          │
│  ├── unit-tester             ├── performance-tester          │
│  ├── security-tester         ├── regression-tester           │
│  ├── load-tester             ├── stress-tester               │
│  └── penetration-tester      └── accessibility-tester        │
│                                                              │
│  DOCUMENTATION AGENTS (15+)                                  │
│  ├── doc-writer              ├── doc-reviewer                │
│  ├── doc-generator           ├── doc-formatter               │
│  ├── doc-translator          ├── doc-searcher                │
│  ├── api-doc-writer          ├── readme-writer               │
│  ├── changelog-writer        ├── tutorial-writer             │
│  ├── example-writer          ├── faq-writer                  │
│  ├── migration-guide-writer  ├── architecture-writer         │
│  └── style-guide-writer      └── glossary-writer             │
│                                                              │
│  DEVOPS AGENTS (15+)                                         │
│  ├── docker-builder          ├── k8s-deployer                │
│  ├── ci-cd-builder           ├── pipeline-optimizer          │
│  ├── server-configurator     ├── nginx-configurator          │
│  ├── ssl-manager             ├── dns-manager                 │
│  ├── monitoring-setup        ├── alert-configurator          │
│  ├── log-aggregator          ├── backup-manager              │
│  ├── disaster-recovery       ├── capacity-planner            │
│  └── cost-optimizer          └── resource-manager            │
│                                                              │
│  SECURITY AGENTS (15+)                                       │
│  ├── security-auditor        ├── vulnerability-scanner       │
│  ├── penetration-tester      ├── code-security-reviewer      │
│  ├── dependency-scanner      ├── secret-scanner              │
│  ├── permission-manager      ├── access-control-manager      │
│  ├── encryption-manager      ├── certificate-manager         │
│  ├── firewall-configurator   ├── intrusion-detector          │
│  ├── compliance-checker      ├── privacy-analyst             │
│  └── security-hardener       └── incident-responder          │
│                                                              │
│  AI/ML AGENTS (15+)                                          │
│  ├── model-trainer           ├── model-evaluator             │
│  ├── data-preprocessor       ├── feature-engineer            │
│  ├── hyperparameter-tuner    ├── model-optimizer             │
│  ├── prompt-engineer         ├── embedding-generator         │
│  ├── rag-builder             ├── vector-store-manager        │
│  ├── llm-fine-tuner          ├── model-deployer              │
│  ├── inference-optimizer     ├── model-monitor               │
│  └── ai-researcher           └── model-comparator            │
│                                                              │
│  DATABASE AGENTS (10+)                                       │
│  ├── db-designer             ├── db-migrator                 │
│  ├── query-optimizer         ├── db-backup-manager           │
│  ├── schema-validator        ├── data-migrator               │
│  ├── db-security-auditor     ├── performance-tuner           │
│  ├── replication-manager     └── db-monitor                  │
│                                                              │
│  FRONTEND AGENTS (10+)                                       │
│  ├── ui-designer             ├── component-builder           │
│  ├── css-styler              ├── responsive-designer         │
│  ├── accessibility-expert    ├── animation-builder           │
│  ├── form-builder            ├── table-builder               │
│  ├── chart-builder           └── layout-designer             │
│                                                              │
│  MORE AGENTS... (17+)                                        │
│  ├── git-manager             ├── release-manager             │
│  ├── dependency-updater      ├── license-manager             │
│  ├── performance-analyzer    ├── memory-leak-detector        │
│  ├── bundle-analyzer         ├── build-optimizer             │
│  ├── deployment-planner      ├── environment-manager         │
│  ├── configuration-manager   ├── secret-manager              │
│  ├── env-var-manager         ├── migration-planner           │
│  └── code-debt-tracker       └── technical-debt-analyzer     │
│                                                              │
│  TOTAL: 147+ REGISTERED AGENTS                               │
└──────────────────────────────────────────────────────────────┘
```

---

## AGENT TEMPLATES

### Template Categories

| Category | Templates | Description |
|----------|-----------|-------------|
| API | Custom Express.js API | Production-ready REST endpoints |
| Frontend | Custom React Component | Reusable UI components |
| Database | Migration & Schema | DB migrations with rollback |
| Security | Security Audit | OWASP Top 10 analysis |
| Testing | Test Suite | Unit, integration, E2E |
| DevOps | Docker & K8s | Container deployment |

### Template 1: Custom Express.js API

```json
{
  "id": "custom-express-api",
  "name": "Custom Express.js API Handler",
  "category": "api",
  "subcategory": "express",
  "tags": ["api", "express", "rest", "node", "typescript", "middleware", "validation"],
  "complexity": "medium",
  "description": "Creates a production-ready Express.js API endpoint with input validation, error handling, rate limiting, and proper TypeScript types.",
  "systemPrompt": "You are an expert Express.js and TypeScript developer...",
  "validationCommands": [
    { "type": "typecheck", "command": "npx tsc --noEmit" },
    { "type": "lint", "command": "npx eslint src/routes/" },
    { "type": "test", "command": "npx vitest run" }
  ],
  "retryPolicy": { "maxRetries": 3, "backoffMs": 5000 },
  "estimatedDurationMs": 300000,
  "resourceProfile": { "memoryMB": 512, "cpuPercent": 50 }
}
```

### Template 2: Custom React Component

```json
{
  "id": "custom-react-component",
  "name": "Custom React Component",
  "category": "frontend",
  "subcategory": "react",
  "tags": ["react", "typescript", "component", "hooks", "css", "testing", "storybook"],
  "complexity": "medium",
  "description": "Creates a reusable React component with TypeScript, custom hooks, CSS modules, Storybook stories, and comprehensive tests.",
  "validationCommands": [
    { "type": "typecheck", "command": "npx tsc --noEmit" },
    { "type": "lint", "command": "npx eslint src/components/" },
    { "type": "test", "command": "npx vitest run" }
  ],
  "retryPolicy": { "maxRetries": 3, "backoffMs": 5000 },
  "estimatedDurationMs": 240000,
  "resourceProfile": { "memoryMB": 512, "cpuPercent": 40 }
}
```

### Template 3: Database Migration & Schema

```json
{
  "id": "custom-database-migration",
  "name": "Database Migration & Schema",
  "category": "database",
  "subcategory": "migration",
  "tags": ["database", "migration", "schema", "sql", "prisma", "typeorm", "seed"],
  "complexity": "high",
  "description": "Creates database migrations, seed data, and query optimization. Supports Prisma, TypeORM, Drizzle, and raw SQL.",
  "validationCommands": [
    { "type": "typecheck", "command": "npx tsc --noEmit" },
    { "type": "custom", "command": "npx prisma validate" }
  ],
  "retryPolicy": { "maxRetries": 2, "backoffMs": 10000 },
  "estimatedDurationMs": 600000,
  "resourceProfile": { "memoryMB": 1024, "cpuPercent": 60 }
}
```

### Template 4: Security Audit & Hardening

```json
{
  "id": "custom-security-audit",
  "name": "Security Audit & Hardening",
  "category": "security",
  "subcategory": "audit",
  "tags": ["security", "audit", "vulnerability", "owasp", "hardening", "encryption"],
  "complexity": "expert",
  "description": "Performs comprehensive security audit. Identifies vulnerabilities, suggests fixes, implements security headers.",
  "validationCommands": [
    { "type": "security", "command": "npx npm-audit-mcp" },
    { "type": "lint", "command": "npx eslint --plugin security src/" }
  ],
  "retryPolicy": { "maxRetries": 2, "backoffMs": 5000 },
  "estimatedDurationMs": 600000,
  "resourceProfile": { "memoryMB": 512, "cpuPercent": 50 }
}
```

### Template 5: Comprehensive Test Suite

```json
{
  "id": "custom-test-suite",
  "name": "Comprehensive Test Suite",
  "category": "testing",
  "subcategory": "unit",
  "tags": ["testing", "unit", "integration", "e2e", "vitest", "jest", "coverage"],
  "complexity": "high",
  "description": "Creates comprehensive test suites with unit, integration, and E2E tests. Includes fixtures, mocks, factories.",
  "validationCommands": [
    { "type": "test", "command": "npx vitest run --coverage" },
    { "type": "typecheck", "command": "npx tsc --noEmit" }
  ],
  "retryPolicy": { "maxRetries": 3, "backoffMs": 5000 },
  "estimatedDurationMs": 480000,
  "resourceProfile": { "memoryMB": 1024, "cpuPercent": 70 }
}
```

### Template 6: Docker & Kubernetes Deployment

```json
{
  "id": "custom-docker-deploy",
  "name": "Docker & Kubernetes Deployment",
  "category": "devops",
  "subcategory": "containerization",
  "tags": ["docker", "kubernetes", "k8s", "container", "deployment", "ci/cd", "helm"],
  "complexity": "high",
  "description": "Creates Docker containers and Kubernetes manifests. Includes Dockerfile, docker-compose, K8s manifests, Helm charts.",
  "validationCommands": [
    { "type": "custom", "command": "docker build -t {{appName}}:test ." },
    { "type": "custom", "command": "kubectl apply -f .k8s/ --dry-run=client" }
  ],
  "retryPolicy": { "maxRetries": 2, "backoffMs": 10000 },
  "estimatedDurationMs": 600000,
  "resourceProfile": { "memoryMB": 2048, "cpuPercent": 80 }
}
```

### How Templates Work

```
1. User selects template
   ↓
2. Template fills userPromptTemplate with variables
   ↓
3. System prompt + user prompt sent to LLM
   ↓
4. LLM generates code
   ↓
5. Validation commands run automatically
   ↓
6. If validation fails → retry (up to maxRetries)
   ↓
7. If all pass → files written to disk
   ↓
8. Results returned with diff
```

---

## AGENT STATUS & LIFECYCLE

### Status States

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  QUEUED ──→ LOADING ──→ PROCESSING ──→ RUNNING ──→ COMPLETED   │
│    │           │            │              │           │         │
│    │           │            │              │           │         │
│    ▼           ▼            ▼              ▼           ▼         │
│  🟡 Yellow  🔵 Blue     🟢 Green      🟢 Green    ✅ Green     │
│  "Queued"  "Loading"   "Working"     "Running"   "Completed"   │
│    │           │            │              │           │         │
│    │           │            │              │           │         │
│    └───────────┴────────────┴──────────────┴───────────┘         │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │  PAUSED   │                                │
│                    │  ⏸️ Pause │                                │
│                    └───────────┘                                │
│                                                                 │
│  RETRYING ──→ RUNNING (retry)                                   │
│  🟠 Orange                                                      │
│  "Retrying (1/3)"                                               │
│  + countdown timer                                              │
│                                                                 │
│  FAILED ──→ RETRYING (if retries left)                          │
│  ❌ Red                                                         │
│  "Failed"                                                       │
│  + error summary                                                │
│                                                                 │
│  CANCELLED                                                      │
│  ⛔ Red                                                         │
│  "Cancelled"                                                    │
│                                                                 │
│  TIMEOUT ──→ RETRYING (if retries left)                         │
│  ⏰ Clock                                                       │
│  "Timed out"                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Card Display

```
┌──────────────────────────────────────────────────────┐
│  🟢 code-reviewer                         [RUNNING]  │
│  Progress: ████████████░░░░░░░░ 67%                  │
│  Elapsed: 12.5s │ Tools: 5 │ Files: 3               │
│  ─────────────────────────────────────────────────── │
│  📁 Modified: src/auth/validator.ts (+12, -5)        │
│  🔧 Tools: readFile ✓ │ searchFiles ✓                │
│  ─────────────────────────────────────────────────── │
│  [Cancel] [Pause] [View Logs] [▶ Open]              │
│  └─▶ 2 sub-agents active                             │
└──────────────────────────────────────────────────────┘
```

### Retry Behavior

| Attempt | Delay | Action |
|---------|-------|--------|
| 1st retry | 5 seconds | Retry same agent |
| 2nd retry | 10 seconds | Retry with backoff |
| 3rd retry | 15 seconds | Escalate to parent |
| 4th+ | Cancel | Mark as failed |

### Failure Behavior

```
Agent Fails
   ↓
Check retry count < maxRetries?
   ↓ YES                          ↓ NO
Wait backoffMs                    Mark as FAILED
   ↓                              ↓
Retry agent                       Notify parent
   ↓                              ↓
Log retry attempt                 Log failure
   ↓                              ↓
Resume execution                  Update dashboard
```

---

## SUB-AGENT SYSTEM

### Tree Visualization

```
┌──────────────────────────────────────────────────────┐
│  ▼ 🟢 session_123                        [RUNNING]   │
│    ├── 🟢 code-reviewer                  [67%]       │
│    │   ├── ✅ readFile                    [DONE]      │
│    │   └── 🟢 searchFiles                [45%]       │
│    ├── 🟡 test-writer                    [QUEUED]     │
│    └── 🟡 doc-generator                  [QUEUED]     │
└──────────────────────────────────────────────────────┘
```

### Click-to-Open Panel

```
┌──────────────────────────────────────────────────────────┐
│  ← Back │ code-reviewer │ 🟢 Running │ [Cancel]         │
├──────────────────────────────────────────────────────────┤
│  Live Status                                              │
│  ● Progress: 67% ████████░░░░                            │
│  ● Elapsed: 12.5s                                        │
│  ● Current: Searching for vulnerabilities...              │
├──────────────────────────────────────────────────────────┤
│  Activity Feed                                            │
│  10:30:45 ✓ Read src/auth/validator.ts                   │
│  10:30:46 ✓ Search "validateToken" (12 results)         │
│  10:30:47 ✓ Edit src/auth/validator.ts:45                │
│  10:30:48 ⚠ RunCommand timeout (retrying...)            │
│  10:30:49 ✓ RunCommand npm test (1.2s)                  │
├──────────────────────────────────────────────────────────┤
│  Files Modified (3)                                       │
│  + src/auth/validator.ts (+12, -5)                       │
│  + src/auth/middleware.ts (+8, -2)                       │
│  + src/types/auth.d.ts (+15, -0)                         │
├──────────────────────────────────────────────────────────┤
│  Diff View                                                │
│  @@ -45,7 +45,14 @@                                     │
│   function validateToken(token: string) {                 │
│  -  return jwt.verify(token, secret);                    │
│  +  const decoded = jwt.verify(token, secret);           │
│  +  if (!decoded) throw new AuthError('Invalid');        │
│  +  return decoded;                                      │
│   }                                                      │
├──────────────────────────────────────────────────────────┤
│  Sub-Agents (2)                                           │
│  └─▶ test-writer (running, 45%)                          │
│  └─▶ doc-generator (queued)                              │
├──────────────────────────────────────────────────────────┤
│  [Retry] [View Logs] [Export] [Open in Editor]          │
└──────────────────────────────────────────────────────────┘
```

### Arrow Indicator

```
┌─────┐
│  ↗  │  ← External link/open icon
└─────┘
```

- Click arrow → Opens sub-agent detail panel
- Hover → Shows tooltip
- Parent → Child connecting arrow

### Sub-Agent Names

| Parent Agent | Child Agents |
|--------------|--------------|
| code-reviewer | readFile, searchFiles, analyzeCode |
| bug-fixer | findBug, createFix, runTests |
| test-writer | createTest, runTest, analyzeCoverage |
| doc-writer | writeDoc, formatDoc, validateDoc |
| security-scanner | scanVulnerabilities, analyzeRisk, createReport |
| deploy-manager | buildDocker, deployK8s, verifyHealth |

---

## CHAT SYSTEM

### Chat Features (63 Files)

| Feature | File | Status |
|---------|------|--------|
| Chat Types | chat-types.ts | ✅ Working |
| Chat Service | chat-service.ts | ✅ Working |
| Chat Database | chat-database.ts | ✅ Working |
| Chat WebSocket | chat-websocket.ts | ✅ Working |
| Chat Enhanced | chat-enhanced.ts | ✅ Working |
| Chat Routes | chat-routes.ts | ✅ Working |
| Chat Integration | chat-integration.ts | ✅ Working |
| Chat Security | chat-security.ts | ✅ Working |
| Chat Middleware | chat-middleware.ts | ✅ Working |
| Chat Enhanced Routes | chat-enhanced-routes.ts | ✅ Working |
| Chat Enhanced Window | chat-enhanced-window.ts | ✅ Working |
| Agent Chat Bridge | agent-chat-bridge.ts | ✅ Working |
| Chat Task Manager | chat-task-manager.ts | ✅ Working |
| Agent Status Panel | agent-status-panel.ts | ✅ Working |
| Live Diff Panel | live-diff-panel.ts | ✅ Working |
| Rich Text Editor | rich-text-editor.ts | ✅ Working |
| Code Playground | code-playground.ts | ✅ Working |
| Mermaid Renderer | mermaid-renderer.ts | ✅ Working |
| LaTeX Renderer | latex-renderer.ts | ✅ Working |
| Link Preview | link-preview.ts | ✅ Working |
| Image Preview | image-preview.ts | ✅ Working |
| File Preview | file-preview.ts | ✅ Working |
| Voice Message | voice-message.ts | ✅ Working |
| Drag & Drop | drag-drop.ts | ✅ Working |
| Task Cards | task-cards.ts | ✅ Working |
| Accessibility | accessibility.ts | ✅ Working |
| Message Animations | message-animations.ts | ✅ Working |
| Sound Effects | sound-effects.ts | ✅ Working |
| Chat Backup | chat-backup.ts | ✅ Working |
| Diff Engine | diff-engine.ts | ✅ Working |
| Checkpoint System | checkpoint-system.ts | ✅ Working |
| Revert Manager | revert-manager.ts | ✅ Working |
| Version History | version-history.ts | ✅ Working |
| Secret Masking | secret-masking.ts | ✅ Working |
| Message Summarizer | message-summarizer.ts | ✅ Working |
| Chat Statistics | chat-statistics.ts | ✅ Working |
| Status Messages | status-messages.ts | ✅ Working |
| Message Queue | message-queue.ts | ✅ Working |
| Search Filters | search-filters.ts | ✅ Working |
| Thread View | thread-view.ts | ✅ Working |
| Pin System | pin-system.ts | ✅ Working |
| Bookmark System | bookmark-system.ts | ✅ Working |
| Mention System | mention-system.ts | ✅ Working |
| Copy Button | copy-button.ts | ✅ Working |
| Chat Window | chat-window.ts | ✅ Working |
| Chat Sidebar | chat-sidebar.ts | ✅ Working |
| Message Renderer | message-renderer.ts | ✅ Working |
| Code Highlighter | code-highlighter.ts | ✅ Working |
| Live Preview | live-preview.ts | ✅ Working |
| Code Executor | code-executor.ts | ✅ Working |

### Chat Messages Flow

```
User sends message
   ↓
Message validated
   ↓
Saved to database
   ↓
Broadcast via WebSocket
   ↓
Delivered to all clients
   ↓
UI updated with animation
   ↓
Sound effect played
```

### Chat Message Types

| Type | Description |
|------|-------------|
| text | Plain text message |
| code | Code block with syntax highlighting |
| image | Image with lightbox preview |
| file | File with download |
| voice | Audio message with playback |
| task | Task card with status |
| diff | Code diff display |
| mermaid | Diagram rendering |
| latex | Math formula rendering |
| link | URL with preview |

---

## EDITOR FEATURES

### Monaco Editor

| Feature | Status | Description |
|---------|--------|-------------|
| Syntax Highlighting | ✅ Working | 50+ languages |
| IntelliSense | ✅ Working | Code completions |
| Multi-Cursor | ✅ Working | Multiple cursors |
| Find & Replace | ✅ Working | Regex support |
| Minimap | ✅ Working | Code overview |
| Word Wrap | ✅ Working | Configurable |
| Tab Size | ✅ Working | 2, 4, 8 |
| Font Size | ✅ Working | Configurable |
| Line Numbers | ✅ Working | Show/hide |
| Bracket Matching | ✅ Working | Auto match |
| Auto-Close | ✅ Working | Brackets, quotes |
| Fold/Unfold | ✅ Working | Code folding |
| Undo/Redo | ✅ Working | Full history |
| Drag & Drop | ✅ Working | Move lines |
| Multi-File | ✅ Working | Tab support |
| Diff View | ✅ Working | Side-by-side |

### Language Support

| Language | Support Level |
|----------|---------------|
| TypeScript | Full |
| JavaScript | Full |
| Python | Full |
| Rust | Full |
| Go | Full |
| Java | Full |
| C/C++ | Full |
| C# | Full |
| Ruby | Full |
| PHP | Full |
| Swift | Full |
| Kotlin | Full |
| SQL | Full |
| HTML | Full |
| CSS | Full |
| JSON | Full |
| YAML | Full |
| Markdown | Full |
| Shell | Full |
| Dockerfile | Full |
| + 30 more | Full |

---

## MCP / LSP / PLUGIN SYSTEM

### MCP (Model Context Protocol)

| Feature | Status | Description |
|---------|--------|-------------|
| MCP Server Loader | ✅ Working | Load MCP servers |
| Tool Registration | ✅ Working | Register tools |
| Resource Management | ✅ Working | Manage resources |
| Prompt Templates | ✅ Working | Prompt management |

### LSP (Language Server Protocol)

| Feature | Status | Description |
|---------|--------|-------------|
| LSP Server Manager | ✅ Working | Manage LSP servers |
| Completion | ✅ Working | Code completions |
| Hover | ✅ Working | Hover information |
| Go to Definition | ✅ Working | Jump to definition |
| Find References | ✅ Working | Find all references |
| Diagnostics | ✅ Working | Errors/warnings |
| Code Actions | ✅ Working | Quick fixes |
| Refactoring | ✅ Working | Rename, extract |

### Plugin System

| Feature | Status | Description |
|---------|--------|-------------|
| Plugin Loader | ✅ Working | Load JSON plugins |
| Plugin API | ✅ Working | Plugin interface |
| Plugin Config | ✅ Working | Configuration |
| Hot Reload | ✅ Working | Live reload |

---

## EXTENSIONS

### Built-in Extensions (8)

| Extension | Description | Status |
|-----------|-------------|--------|
| Prettier Formatter | Code formatter | ✅ Installed |
| ESLint | JavaScript linting | ✅ Installed |
| GitLens | Git supercharged | ✅ Installed |
| Docker | Container management | ✅ Installed |
| Python | Python support | ✅ Installed |
| Rust | Rust support | ✅ Installed |
| Go | Go support | ✅ Installed |
| One Dark Pro | Dark theme | ✅ Installed |

### Extension Endpoints

```
GET    /api/v1/extensions              - List extensions
POST   /api/v1/extensions/install      - Install extension
POST   /api/v1/extensions/:id/uninstall - Uninstall extension
POST   /api/v1/extensions/:id/enable   - Enable extension
POST   /api/v1/extensions/:id/disable  - Disable extension
GET    /api/v1/extensions/marketplace/search - Search marketplace
```

---

## SETTINGS

### Settings Sections

```
┌──────────────────────────────────────────────────────────┐
│                     SETTINGS                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. EDITOR                                               │
│     ├── Font Size (14)                                   │
│     ├── Font Family (Consolas)                           │
│     ├── Tab Size (2)                                     │
│     ├── Word Wrap (off/on/wordWrapColumn/bounded)        │
│     ├── Minimap (true/false)                             │
│     └── Line Numbers (true/false)                        │
│                                                          │
│  2. THEME                                                │
│     ├── Dark (default)                                   │
│     ├── Light                                            │
│     ├── Catppuccin Mocha                                 │
│     ├── Dracula                                          │
│     ├── Monokai                                          │
│     └── One Dark Pro                                     │
│                                                          │
│  3. TERMINAL                                             │
│     ├── Shell (powershell/bash/zsh)                      │
│     └── Font Size (14)                                   │
│                                                          │
│  4. FILES                                                │
│     ├── Auto Save (true/false)                           │
│     └── Exclude (node_modules, dist, .git)               │
│                                                          │
│  5. AI                                                   │
│     ├── Provider (openai/anthropic/google/azure/ollama)  │
│     ├── Model (gpt-4/claude-3.5/gemini-pro)             │
│     └── Temperature (0.7)                                │
│                                                          │
│  6. EXTENSIONS                                           │
│     └── Enabled (list of enabled extensions)             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Settings File

```json
{
  "editor": {
    "fontSize": 14,
    "fontFamily": "Consolas",
    "tabSize": 2,
    "wordWrap": "off",
    "minimap": true,
    "lineNumbers": true
  },
  "theme": "dark",
  "terminal": {
    "shell": "powershell",
    "fontSize": 14
  },
  "files": {
    "autoSave": true,
    "exclude": ["node_modules", "dist", ".git"]
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.7
  },
  "extensions": {
    "enabled": []
  }
}
```

---

## LOGGING SYSTEM

### Log Categories (20 Files)

| Logger | File | What Gets Logged |
|--------|------|------------------|
| System Logger | system-logger.ts | System events |
| Agent Logger | agent-logger.ts | Agent lifecycle |
| Session Logger | session-logger.ts | Session events |
| Chat Logger | chat-logger.ts | Chat messages |
| Extension Logger | extension-logger.ts | Extension events |
| Performance Logger | performance-logger.ts | Performance metrics |
| Middleware Logger | middleware-logger.ts | HTTP requests |
| WebSocket Logger | websocket-logger.ts | WebSocket events |
| Template Logger | template-logger.ts | Template events |
| Diff Logger | diff-logger.ts | Diff operations |

### Log Formats (7)

| Format | Description |
|--------|-------------|
| JSON | Structured JSON logs |
| Text | Plain text logs |
| Pretty | Colored, formatted logs |
| Compact | Single-line logs |
| HTML | HTML report |
| Markdown | Markdown report |
| Syslog | Syslog format |

### Log Export Formats (6)

| Format | Description |
|--------|-------------|
| JSON | Machine-readable |
| CSV | Spreadsheet-compatible |
| HTML | Browser-viewable |
| Text | Human-readable |
| Markdown | Documentation-friendly |
| Syslog | Standard syslog |

### Log Viewer Commands

```bash
# Tail logs
npx ts-node src/logging/log-viewer.ts tail

# Follow logs (real-time)
npx ts-node src/logging/log-viewer.ts follow

# Search logs
npx ts-node src/logging/log-viewer.ts search "agent error"

# View stats
npx ts-node src/logging/log-viewer.ts stats

# View timeline
npx ts-node src/logging/log-viewer.ts timeline
```

### Feature Tracker

| Feature Category | Actions Tracked |
|------------------|-----------------|
| Chat | send, reply, edit, delete, react, mention, search, pin, bookmark, thread |
| Agent | spawn, start, complete, error, cancel, retry, queue, tool use, command |
| Session | create, start, pause, resume, end, export, import |
| Editor | open, save, close, format, undo, redo, find, replace |
| File | create, rename, delete, copy, move |
| Terminal | execute, clear, history |
| Git | status, add, commit, push, pull, branch, checkout, merge |
| Extension | install, uninstall, enable, disable |
| Security | login, logout, access, modify |
| Debug | start, stop, breakpoint, step, continue |
| Search | files, content, symbols |
| Settings | get, set, reset |
| Diff | compare, apply, revert |
| Checkpoint | create, restore, list |
| Backup | export, import |

---

## SECURITY SYSTEM

### Security Components (5 Files)

| Component | File | Description |
|-----------|------|-------------|
| Sandbox | sandbox.ts | Isolated agent execution |
| Permissions | permissions.ts | Granular permissions |
| Secrets Vault | secrets-vault.ts | Encrypted secrets |
| Audit Logger | audit-logger.ts | All actions logged |
| Budget Limiter | budget-limiter.ts | Cost control |

### Security Audit System

| Component | File | Description |
|-----------|------|-------------|
| Security Auditor | security-auditor.ts | Main audit orchestrator |
| Vulnerability Scanner | vulnerability-scanner.ts | 12 vulnerability types |
| Input Validator | input-validator.ts | Sanitize all inputs |
| Rate Limiter | rate-limiter.ts | Prevent abuse |
| Audit Logger | audit-logger.ts | Audit trail |

### Vulnerability Types Scanned

1. SQL Injection
2. Cross-Site Scripting (XSS)
3. Command Injection
4. Path Traversal
5. Authentication Bypass
6. Privilege Escalation
7. Rate Limit Bypass
8. Input Fuzzing
9. DDoS Protection
10. Secret Exposure
11. Insecure Deserialization
12. Missing Security Headers

### Penetration Test Results

```json
{
  "sqlInjection": { "passed": true, "vulnerabilities": 0 },
  "xssAttack": { "passed": true, "vulnerabilities": 0 },
  "commandInjection": { "passed": true, "vulnerabilities": 0 },
  "pathTraversal": { "passed": true, "vulnerabilities": 0 },
  "authBypass": { "passed": true, "vulnerabilities": 0 },
  "privilegeEscalation": { "passed": true, "vulnerabilities": 0 },
  "rateLimitBypass": { "passed": true, "vulnerabilities": 0 },
  "inputFuzzing": { "passed": true, "vulnerabilities": 0 },
  "ddosProtection": { "passed": true, "vulnerabilities": 0 },
  "secretExposure": { "passed": true, "vulnerabilities": 0 },
  "insecureDeserialization": { "passed": true, "vulnerabilities": 0 }
}
```

---

## MONITORING SYSTEM

### Monitoring Components (5 Files)

| Component | File | Description |
|-----------|------|-------------|
| Metrics Collector | metrics-collector.ts | Prometheus metrics |
| Health Checker | health-checker.ts | System health checks |
| Alert Manager | alert-manager.ts | Alert routing |
| Production Dashboard | production-dashboard.ts | Real-time dashboard |

### Metrics Collected

| Metric | Type | Description |
|--------|------|-------------|
| http_requests_total | Counter | Total HTTP requests |
| http_request_duration | Histogram | Request duration |
| agent_spawn_total | Counter | Total agent spawns |
| agent_active | Gauge | Active agents |
| session_active | Gauge | Active sessions |
| chat_messages_total | Counter | Total chat messages |
| memory_usage | Gauge | Memory usage |
| cpu_usage | Gauge | CPU usage |
| disk_usage | Gauge | Disk usage |
| ws_connections | Gauge | WebSocket connections |

### Health Check Response

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "memory": "ok",
    "cpu": "ok",
    "disk": "ok",
    "database": "ok",
    "websocket": "ok"
  }
}
```

---

## WEBSOCKET DETAILS

### WebSocket Protocol

```
┌──────────────────────────────────────────────────────────┐
│                   WEBSOCKET LAYER                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  RFC 6455 Implementation                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Handshake                                          │ │
│  │ HTTP Upgrade → WebSocket                           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Message Types                                      │ │
│  │ ├── text (JSON)                                    │ │
│  │ ├── binary                                         │ │
│  │ ├── ping/pong                                      │ │
│  │ └── close                                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Channels                                           │ │
│  │ ├── agent:status     (agent status updates)        │ │
│  │ ├── agent:progress   (progress updates)            │ │
│  │ ├── agent:log        (log streaming)               │ │
│  │ ├── agent:diff       (diff updates)                │ │
│  │ ├── chat:message     (chat messages)               │ │
│  │ ├── chat:typing      (typing indicators)           │ │
│  │ ├── session:status   (session updates)             │ │
│  │ ├── notification     (notifications)               │ │
│  │ └── system:health    (health checks)               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Message Format                                     │ │
│  │ {                                                  │ │
│  │   "type": "agent:status",                          │ │
│  │   "payload": { ... },                              │ │
│  │   "timestamp": "ISO-8601",                         │ │
│  │   "id": "unique-id"                                │ │
│  │ }                                                  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### WebSocket Endpoints

```
ws://localhost:3000/ws           - Main WebSocket
ws://localhost:3000/ws/chat      - Chat WebSocket
ws://localhost:3000/ws/agent     - Agent streaming
ws://localhost:3000/ws/logs      - Log streaming
```

### Auto-Accept Permissions

```
┌──────────────────────────────────────────────────────────┐
│                 AUTO-ACCEPT PERMISSIONS                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  AUTO-ACCEPT:                                            │
│  ├── Read files (readFile)                               │
│  ├── Search files (grep, glob)                           │
│  ├── List directories                                    │
│  ├── Git status                                          │
│  └── Git diff                                            │
│                                                          │
│  REQUIRE CONFIRMATION:                                   │
│  ├── Write files (writeFile)                             │
│  ├── Edit files (editFile)                               │
│  ├── Delete files (deleteFile)                           │
│  ├── Execute commands (runCommand)                       │
│  ├── Git commit                                          │
│  ├── Git push                                            │
│  └── Install packages                                    │
│                                                          │
│  BLOCKED (unless explicitly allowed):                    │
│  ├── System commands (rm -rf /)                          │
│  ├── Network access (wget, curl to unknown)              │
│  ├── Environment variable access                         │
│  └── Secret access                                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## LIVE PREVIEW

### Preview Features

| Feature | Status | Description |
|---------|--------|-------------|
| HTML Preview | ✅ Working | Live HTML rendering |
| Markdown Preview | ✅ Working | Live markdown rendering |
| Image Preview | ✅ Working | Image lightbox |
| PDF Preview | ✅ Working | PDF viewer |
| Video Preview | ✅ Working | Video player |
| Audio Preview | ✅ Working | Audio player |
| Code Preview | ✅ Working | Syntax-highlighted code |
| Diff Preview | ✅ Working | Side-by-side diff |

---

## DIFF ENGINE

### Diff Features

| Feature | Status | Description |
|---------|--------|-------------|
| Line Diff | ✅ Working | Line-by-line comparison |
| Word Diff | ✅ Working | Word-level changes |
| Character Diff | ✅ Working | Character-level changes |
| Side-by-Side | ✅ Working | Split view |
| Unified | ✅ Working | Single view |
| Apply Diff | ✅ Working | Apply changes |
| Revert Diff | ✅ Working | Revert changes |

---

## CHECKPOINT & REVERT

### Checkpoint Features

| Feature | Status | Description |
|---------|--------|-------------|
| Create Checkpoint | ✅ Working | Save agent state |
| List Checkpoints | ✅ Working | View all checkpoints |
| Restore Checkpoint | ✅ Working | Restore to checkpoint |
| Auto-Checkpoint | ✅ Working | Auto-save on milestones |
| Checkpoint Diff | ✅ Working | Diff between checkpoints |

---

## THEMES & SOUNDS

### Themes

| Theme | Status |
|-------|--------|
| Dark (default) | ✅ Working |
| Light | ✅ Working |
| Catppuccin Mocha | ✅ Working |
| Dracula | ✅ Working |
| Monokai | ✅ Working |
| One Dark Pro | ✅ Working |

### Sound Effects (9 Sounds)

| Sound | Frequency | Type | Duration |
|-------|-----------|------|----------|
| messageSent | 880 Hz | sine | 0.12s |
| messageReceived | 660 Hz | sine | 0.18s |
| notification | 1047 Hz | triangle | 0.25s |
| reaction | 1319 Hz | sine | 0.10s |
| typing | 440 Hz | square | 0.03s |
| userJoin | 523 Hz | sine | 0.30s |
| userLeave | 392 Hz | sine | 0.30s |
| error | 220 Hz | sawtooth | 0.20s |
| success | 659 Hz | sine | 0.35s |

### Message Animations (7 Types)

| Animation | Description |
|-----------|-------------|
| fadeIn | Fade in effect |
| slideUp | Slide up from bottom |
| slideLeft | Slide in from left |
| popIn | Pop in effect |
| bounce | Bounce effect |
| ripple | Ripple effect |
| typewriter | Typewriter effect |

---

## INSTALLATION

### Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| TypeScript | 5.3+ (bundled) |
| Git | Any recent version |

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 4 GB | 8 GB+ |
| Disk | 500 MB | 2 GB+ |
| CPU | 2 cores | 4+ cores |
| Network | Required for AI | Stable connection |

### Install Commands

```bash
# Clone repository
git clone https://github.com/nova-ide/subagent-system.git
cd subagent-system

# Install dependencies
npm install

# Build project
npm run build

# Start server
npm start

# Run tests
npm test
```

### Quick Start

```bash
# Start in development mode
npm run dev

# Open browser
open http://localhost:3000

# Or use CLI
npx nova chat
npx nova agents
npx nova run "Build a REST API"
```

---

## PROJECT STATS

### File Statistics

| Type | Count |
|------|-------|
| TypeScript (.ts) | 1,487 |
| JavaScript (.js) | 2,201 |
| JSON (.json) | 283 |
| CSS (.css) | 5 |
| HTML (.html) | 1 |
| Markdown (.md) | 425 |
| YAML (.yml/.yaml) | 24 |
| **Total Files** | **6,409** |

### Directory Statistics

| Location | Count |
|----------|-------|
| Total Directories | 767 |
| Source Directories | 23 |
| Test Directories | 5 |

### Build Statistics

| Metric | Value |
|--------|-------|
| Source Files | 1,487 |
| Compiled Files | 1,028 |
| Build Size | 6.46 MB |
| Total Routes | 126 |
| V1 API Endpoints | 81 |
| Registered Agents | 147+ |
| Chat Files | 63 |
| UI Files | 11 |
| API Files | 3 |
| Logging Files | 20 |
| Security Files | 5 |
| Monitoring Files | 5 |
| Testing Files | 7 |
| Extension Files | 3 |
| AI Files | 8 |
| Debug Files | 2 |
| Collaboration Files | 2 |

### Language Support

| Category | Languages |
|----------|-----------|
| Human Languages | 10+ (English, Spanish, French, German, Japanese, Chinese, Korean, Portuguese, Italian, Russian) |
| Programming Languages | 50+ (TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, SQL, HTML, CSS, JSON, YAML, Shell, Dockerfile, and 30+ more) |

---

## DEPLOYMENT

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/server/server.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  nova-ide:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./workspace:/workspace
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
```

### GitHub Actions CI/CD

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run package
```

---

## HOW IT WORKS

### Step 1: User Provides Task

```
User: "Build a REST API with authentication, rate limiting, and tests"
```

### Step 2: Plan Generation

```
AI analyzes task and creates execution plan:

1. Create project structure
2. Implement authentication middleware
3. Create user routes
4. Add rate limiting
5. Write unit tests
6. Write integration tests
7. Create documentation
```

### Step 3: Agent Spawning

```
Orchestrator spawns specialized agents:

├── project-architect (creates structure)
├── auth-developer (implements auth)
├── route-developer (creates routes)
├── middleware-developer (adds rate limiting)
├── unit-test-writer (writes unit tests)
├── integration-test-writer (writes integration tests)
└── doc-writer (creates documentation)
```

### Step 4: Parallel Execution

```
Agents work in parallel:

[10:30:00] project-architect: Creating project structure...
[10:30:02] auth-developer: Implementing JWT authentication...
[10:30:02] route-developer: Creating user routes...
[10:30:03] middleware-developer: Adding rate limiting...
[10:30:05] unit-test-writer: Writing unit tests...
[10:30:06] integration-test-writer: Writing integration tests...
[10:30:07] doc-writer: Creating API documentation...
```

### Step 5: Verification

```
Each agent verifies its work:

├── Type checking (npx tsc --noEmit)
├── Linting (npx eslint)
├── Testing (npx vitest run)
└── Security scanning
```

### Step 6: Results

```
Results delivered to user:

✅ Project structure created
✅ Authentication implemented
✅ Routes created
✅ Rate limiting added
✅ Unit tests written (12 tests)
✅ Integration tests written (8 tests)
✅ Documentation created

All files written to disk.
All tests passing.
No type errors.
No lint errors.
```

---

## CLI COMMANDS

| Command | Description |
|---------|-------------|
| `nova start` | Start server |
| `nova chat` | Open chat |
| `nova agents` | List agents |
| `nova run <task>` | Execute task |
| `nova status` | Show status |
| `nova logs` | View logs |
| `nova export` | Export data |
| `nova config` | Configure |
| `nova template list` | List templates |
| `nova template run <id>` | Run template |
| `nova provider list` | List providers |
| `nova provider add` | Add provider |
| `nova extension list` | List extensions |
| `nova extension install <id>` | Install extension |
| `nova security scan` | Run security scan |
| `nova test run` | Run tests |
| `nova benchmark` | Run benchmark |
| `nova deploy` | Deploy |
| `nova help` | Show help |

---

## TROUBLESHOOTING

### Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Run `npm install` then `npm run build` |
| Server won't start | Check port 3000 is available |
| No AI response | Check API key in settings |
| WebSocket disconnects | Check network connection |
| Tests fail | Run `npm test` to see errors |

### Debug Mode

```bash
# Start with debug logging
DEBUG=nova:* npm start

# View agent logs
npx ts-node src/logging/log-viewer.ts follow

# View system health
curl http://localhost:3000/api/v1/health
```

---

## LICENSE

MIT License - See LICENSE file for details.

---

<div align="center">

**Built with TypeScript | Powered by AI | Designed for Developers**

**147+ Agents | 81 API Endpoints | 6 Templates | 9 Sound Effects | 7 Animations**

</div>
