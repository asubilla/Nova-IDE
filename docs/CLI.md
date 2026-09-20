# Nova Sub-Agent IDE — CLI Reference

## Installation

```bash
npm install -g nova-subagent-system
```

Or run locally:

```bash
npm run nova:dev -- [command]
```

## Global Options

```
--help, -h       Show help
--version, -v    Show version
--verbose        Enable verbose logging
--quiet          Suppress non-error output
--config <path>  Path to configuration file
```

## Commands

### `nova init <project>`

Initialize a new Nova project.

```bash
nova init my-project
nova init my-project --template api-server
nova init my-project --agents 3
```

**Options:**
- `--template <name>` — Project template to use
- `--agents <n>` — Number of initial agents (default: 1)
- `--git` — Initialize git repository (default: true)

---

### `nova serve`

Start the development server.

```bash
nova serve
nova serve --port 8080
nova serve --host 0.0.0.0
```

**Options:**
- `--port <n>` — Server port (default: 3000)
- `--host <addr>` — Bind address (default: localhost)
- `--open` — Open browser on start

---

### `nova build`

Build the project for production.

```bash
nova build
nova build --minify
```

**Options:**
- `--minify` — Minify output
- `--sourcemap` — Generate source maps (default: true)

---

### `nova agent`

Agent management commands.

```bash
nova agent list
nova agent create code-writer
nova agent remove code-writer
nova agent status code-writer
```

**Subcommands:**
- `list` — List all registered agents
- `create <name>` — Create a new agent
- `remove <id>` — Remove an agent
- `status <id>` — Show agent status

---

### `nova session`

Session management commands.

```bash
nova session list
nova session create --project my-app
nova session checkpoint sess-001 --message "milestone"
nova session revert sess-001 cp-001
nova session delete sess-001
```

**Subcommands:**
- `list` — List active sessions
- `create` — Create a new session
- `checkpoint <id>` — Create a checkpoint
- `revert <sessionId> <checkpointId>` — Revert to checkpoint
- `delete <id>` — Delete a session

---

### `nova task`

Task execution commands.

```bash
nova task execute agent-001 "Write tests for hash module"
nova task status task-001
nova task list
```

**Subcommands:**
- `execute <agentId> <description>` — Execute a task
- `status <id>` — Check task status
- `list` — List all tasks

---

### `nova extension`

Extension management.

```bash
nova extension list
nova extension install typescript-support
nova extension remove typescript-support
nova extension enable typescript-support
nova extension disable typescript-support
```

**Subcommands:**
- `list` — List installed extensions
- `install <name>` — Install an extension
- `remove <name>` — Remove an extension
- `enable <name>` — Enable an extension
- `disable <name>` — Disable an extension

---

### `nova config`

Configuration management.

```bash
nova config show
nova config set server.port 8080
nova config get server.port
nova config reset
```

**Subcommands:**
- `show` — Display current configuration
- `set <key> <value>` — Set a config value
- `get <key>` — Get a config value
- `reset` — Reset to defaults

---

### `nova health`

Check system health.

```bash
nova health
nova health --json
```

**Options:**
- `--json` — Output as JSON

---

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Configuration error |
| 4 | Agent not found |
| 5 | Session not found |
| 6 | Task failed |
| 7 | Connection error |
