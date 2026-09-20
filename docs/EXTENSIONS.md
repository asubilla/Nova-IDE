# Nova Sub-Agent IDE — Extension Development Guide

## Overview

Nova supports three types of extensions:
- **LSP Extensions** — Language Server Protocol integrations
- **MCP Extensions** — Model Context Protocol servers
- **Plugins** — General-purpose JavaScript/TypeScript plugins

## Creating a Plugin

### 1. Initialize the Project

```bash
mkdir my-nova-plugin
cd my-nova-plugin
npm init -y
npm install @nova/subagent-system
npm install -D typescript @types/node
```

### 2. Create the Extension Entry Point

```typescript
import { Extension, ExtensionContext, Logger } from '@nova/subagent-system';

export default class MyPlugin extends Extension {
  private logger: Logger;

  constructor(context: ExtensionContext) {
    super(context);
    this.logger = context.logger;
  }

  activate(): void {
    this.logger.info('MyPlugin activated');

    this.registerCommand('my-plugin.hello', () => {
      return 'Hello from MyPlugin!';
    });

    this.registerHook('pre:file:write', (data) => {
      this.logger.debug(`File write: ${data.path}`);
      return data;
    });

    this.context.events.on('agent:status', (event) => {
      this.logger.info(`Agent ${event.agentId} is ${event.status}`);
    });
  }

  deactivate(): void {
    this.logger.info('MyPlugin deactivated');
  }
}
```

### 3. Create package.json Metadata

Add extension metadata to your `package.json`:

```json
{
  "name": "my-nova-plugin",
  "version": "1.0.0",
  "nova": {
    "type": "plugin",
    "main": "dist/index.js",
    "engines": {
      "nova": ">=2.0.0"
    },
    "contributes": {
      "commands": [
        {
          "command": "my-plugin.hello",
          "title": "Say Hello"
        }
      ],
      "hooks": [
        "pre:file:write"
      ]
    }
  }
}
```

### 4. Build and Package

```bash
npm run build
npm pack
```

## Creating an LSP Extension

```typescript
import { LSPExtension, LanguageClient } from '@nova/subagent-system';

export default class MyLSP extends LSPExtension {
  createClient(): LanguageClient {
    return {
      serverPath: 'my-language-server',
      args: ['--stdio'],
      languages: ['mylang'],
      filePatterns: ['*.mylang'],
    };
  }
}
```

## Creating an MCP Extension

```typescript
import { MCPExtension, MCPServerConfig } from '@nova/subagent-system';

export default class MyMCP extends MCPExtension {
  getServerConfig(): MCPServerConfig {
    return {
      command: 'my-mcp-server',
      args: ['--port', '3001'],
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
      },
    };
  }
}
```

## Extension Lifecycle

1. **Discovery** — Nova scans `~/.nova/extensions/` and project `.nova/extensions/`
2. **Loading** — Extensions are loaded and validated
3. **Activation** — `activate()` is called
4. **Runtime** — Extension responds to events and commands
5. **Deactivation** — `deactivate()` is called on shutdown

## API Reference

### Extension Base Class

```typescript
abstract class Extension {
  readonly context: ExtensionContext;

  abstract activate(): void;
  deactivate(): void;

  registerCommand(id: string, handler: CommandHandler): void;
  registerHook(name: string, handler: HookHandler): void;
}
```

### ExtensionContext

```typescript
interface ExtensionContext {
  logger: Logger;
  config: ConfigManager;
  events: TypedEventEmitter<Events>;
  fs: FileSystem;
  agents: AgentRegistry;
  sessions: SessionManager;
}
```

## Testing Extensions

```typescript
import { describe, it, expect, vi } from 'vitest';
import MyPlugin from './index';

describe('MyPlugin', () => {
  it('should activate', () => {
    const context = createMockContext();
    const plugin = new MyPlugin(context);
    plugin.activate();
    expect(context.events.listenerCount('agent:status')).toBeGreaterThan(0);
  });
});
```

## Publishing

Publish to npm with the `nova-extension` keyword:

```json
{
  "keywords": ["nova-extension"],
  "nova": {
    "type": "plugin"
  }
}
```

Users install with:

```bash
nova extension install my-nova-plugin
```
