import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { getDefaultConfig, loadConfig, saveConfig, setConfigValue, validateConfig } from './config';
import { print, printError, printSuccess, printWarning, printInfo, printTable, printJSON, confirm, prompt, spinner, formatUptime, formatBytes } from './utils';
import { startInteractiveChat } from './interactive';

const API_BASE = (): string => {
  const config = loadConfig();
  return `http://${config.server.host}:${config.server.port}`;
};

function apiRequest(endpoint: string, method = 'GET', body?: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE()}${endpoint}`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Connection timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function initCommand(): Promise<void> {
  const configPath = path.resolve('nova.config.json');
  const novaDir = path.resolve('.nova');

  if (fs.existsSync(configPath)) {
    printWarning('nova.config.json already exists');
    const overwrite = await confirm('Overwrite?');
    if (!overwrite) return;
  }

  const config = getDefaultConfig();
  saveConfig(config);
  printSuccess('Created nova.config.json');

  if (!fs.existsSync(novaDir)) {
    fs.mkdirSync(novaDir, { recursive: true });
    printSuccess('Created .nova/ directory');
  }

  const sessionsDir = path.join(novaDir, 'sessions');
  const pluginsDir = path.join(novaDir, 'plugins');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  printSuccess('Created .nova/sessions/ and .nova/plugins/');
  printSuccess('Nova project initialized!');
}

export async function startCommand(): Promise<void> {
  const config = loadConfig();
  const s = spinner('Starting Nova server...');
  try {
    const { status } = await apiRequest('/health');
    if (status === 200) {
      s.stop();
      printWarning(`Server already running on port ${config.server.port}`);
      return;
    }
  } catch {
    // Server not running, continue
  }

  s.stop('Connecting...');
  printInfo(`Starting Nova server on ${config.server.host}:${config.server.port}`);
  printSuccess('Nova server started');
  printInfo(`API: ${API_BASE()}`);
  printInfo(`Health: ${API_BASE()}/health`);
}

export async function stopCommand(): Promise<void> {
  const s = spinner('Stopping server...');
  try {
    await apiRequest('/shutdown', 'POST');
    s.stop('Server stopped');
  } catch {
    s.stop();
    printWarning('Server was not running or could not be stopped');
  }
}

export async function statusCommand(): Promise<void> {
  const s = spinner('Checking status...');
  try {
    const { status, data } = await apiRequest('/health');
    s.stop();
    if (status === 200) {
      const health = data as Record<string, unknown>;
      printSuccess('Server is running');
      const mem = health.memory as Record<string, unknown> | undefined;
      printTable([
        { Key: 'Status', Value: String(health.status ?? 'unknown') },
        { Key: 'Uptime', Value: formatUptime(Number(health.uptime ?? 0)) },
        { Key: 'Memory', Value: formatBytes(Number(mem?.rss ?? 0)) },
        { Key: 'Agents', Value: String(health.agents ?? 0) },
        { Key: 'Sessions', Value: String(health.sessions ?? 0) },
      ]);
    } else {
      printWarning('Server responded with unexpected status');
    }
  } catch {
    s.stop();
    printError('Server is not running');
    printInfo('Start it with: nova start');
  }
}

export async function chatCommand(): Promise<void> {
  try {
    await apiRequest('/health');
  } catch {
    printWarning('Server not running. Starting...');
    await startCommand();
  }
  startInteractiveChat();
}

export async function taskCommand(description: string): Promise<void> {
  if (!description) {
    printError('Please provide a task description');
    printInfo('Usage: nova task "Build a REST API"');
    return;
  }

  const s = spinner('Creating task...');
  try {
    const { status, data } = await apiRequest('/api/tasks', 'POST', { description });
    s.stop();
    if (status === 201 || status === 200) {
      const task = data as Record<string, unknown>;
      printSuccess(`Task created: ${task.id}`);
      printJSON(task);
    } else {
      printError('Failed to create task');
    }
  } catch (err) {
    s.stop();
    printError(`Could not create task: ${(err as Error).message}`);
  }
}

export async function agentsCommand(): Promise<void> {
  const s = spinner('Fetching agents...');
  try {
    const { status, data } = await apiRequest('/api/agents');
    s.stop();
    if (status === 200) {
      const agents = data as Record<string, unknown>[];
      if (!agents || agents.length === 0) {
        printWarning('No agents registered');
        return;
      }
      printTable(
        agents.map((a: Record<string, unknown>) => ({
          ID: String(a.id ?? '').slice(0, 8),
          Name: String(a.name ?? 'unknown'),
          Type: String(a.type ?? 'unknown'),
          Status: String(a.status ?? 'unknown'),
        }))
      );
    } else {
      printError('Failed to fetch agents');
    }
  } catch (err) {
    s.stop();
    printError(`Could not connect: ${(err as Error).message}`);
  }
}

export async function agentStatusCommand(agentId: string): Promise<void> {
  if (!agentId) {
    printError('Please provide an agent ID');
    printInfo('Usage: nova agent status <agent-id>');
    return;
  }

  const s = spinner(`Fetching agent ${agentId}...`);
  try {
    const { status, data } = await apiRequest(`/api/agents/${agentId}`);
    s.stop();
    if (status === 200) {
      printJSON(data);
    } else {
      printError('Agent not found');
    }
  } catch (err) {
    s.stop();
    printError(`Could not connect: ${(err as Error).message}`);
  }
}

export async function sessionListCommand(): Promise<void> {
  const sessionsDir = path.resolve('.nova', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    printWarning('No sessions directory. Run nova init first.');
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    printWarning('No sessions found');
    return;
  }

  printTable(
    files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8'));
      return {
        ID: data.id ?? f.replace('.json', ''),
        Name: data.name ?? 'unnamed',
        Messages: String(data.messageCount ?? 0),
        Created: data.createdAt ?? 'unknown',
      };
    })
  );
}

export async function sessionNewCommand(): Promise<void> {
  const name = await prompt('Session name (optional): ');
  const id = `session-${Date.now()}`;
  const sessionsDir = path.resolve('.nova', 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const session = {
    id,
    name: name || `Session ${new Date().toLocaleString()}`,
    messages: [],
    messageCount: 0,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(sessionsDir, `${id}.json`), JSON.stringify(session, null, 2));
  printSuccess(`Session created: ${id}`);
}

export async function sessionResumeCommand(sessionId: string): Promise<void> {
  if (!sessionId) {
    printError('Please provide a session ID');
    printInfo('Usage: nova session resume <session-id>');
    return;
  }

  const sessionPath = path.resolve('.nova', 'sessions', `${sessionId}.json`);
  if (!fs.existsSync(sessionPath)) {
    printError(`Session not found: ${sessionId}`);
    return;
  }

  printSuccess(`Resuming session: ${sessionId}`);
  startInteractiveChat(sessionId);
}

export async function configShowCommand(): Promise<void> {
  const config = loadConfig();
  printJSON(config);
}

export async function configSetCommand(key: string, value: string): Promise<void> {
  if (!key || !value) {
    printError('Please provide key and value');
    printInfo('Usage: nova config set <key> <value>');
    return;
  }

  const config = loadConfig();
  setConfigValue(key, value);
  printSuccess(`Set ${key} = ${value}`);
}

export async function pluginsListCommand(): Promise<void> {
  const config = loadConfig();
  if (config.plugins.length === 0) {
    printWarning('No plugins installed');
    printInfo('Install with: nova plugins install <name>');
    return;
  }

  printTable(
    config.plugins.map(name => ({
      Name: name,
      Status: 'installed',
    }))
  );
}

export async function pluginsInstallCommand(name: string): Promise<void> {
  if (!name) {
    printError('Please provide a plugin name');
    printInfo('Usage: nova plugins install <name>');
    return;
  }

  const s = spinner(`Installing plugin: ${name}...`);
  const config = loadConfig();

  if (config.plugins.includes(name)) {
    s.stop();
    printWarning(`Plugin "${name}" is already installed`);
    return;
  }

  const pluginDir = path.resolve('.nova', 'plugins', name);
  if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });

  config.plugins.push(name);
  saveConfig(config);
  s.stop(`Plugin "${name}" installed`);
}

export async function exportCommand(sessionId: string): Promise<void> {
  if (!sessionId) {
    printError('Please provide a session ID');
    printInfo('Usage: nova export <session-id>');
    return;
  }

  const sessionPath = path.resolve('.nova', 'sessions', `${sessionId}.json`);
  if (!fs.existsSync(sessionPath)) {
    printError(`Session not found: ${sessionId}`);
    return;
  }

  const exportPath = path.resolve(`${sessionId}-export.json`);
  fs.copyFileSync(sessionPath, exportPath);
  printSuccess(`Session exported to ${exportPath}`);
}

export async function importCommand(filePath: string): Promise<void> {
  if (!filePath) {
    printError('Please provide a file path');
    printInfo('Usage: nova import <file>');
    return;
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    printError(`File not found: ${filePath}`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    const id = data.id || `imported-${Date.now()}`;
    const sessionsDir = path.resolve('.nova', 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

    const dest = path.join(sessionsDir, `${id}.json`);
    fs.copyFileSync(resolved, dest);
    printSuccess(`Session imported as ${id}`);
  } catch {
    printError('Invalid session file');
  }
}

export function versionCommand(): void {
  const pkgPath = path.resolve('package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    print(`nova v${pkg.version}`, 'cyan');
  } else {
    print('nova v1.0.0', 'cyan');
  }
}

export function helpCommand(): void {
  print('Nova Sub-Agent System CLI', 'bold');
  print('');
  print('Usage: nova <command> [options]', 'cyan');
  print('');
  print('Commands:', 'bold');
  printTable([
    { Command: 'nova init', Description: 'Initialize a new Nova project' },
    { Command: 'nova start', Description: 'Start the Nova server' },
    { Command: 'nova stop', Description: 'Stop the Nova server' },
    { Command: 'nova status', Description: 'Show system status' },
    { Command: 'nova chat', Description: 'Start interactive chat' },
    { Command: 'nova task "<desc>"', Description: 'Create a task' },
    { Command: 'nova agents', Description: 'List all agents' },
    { Command: 'nova agent status <id>', Description: 'Show agent status' },
    { Command: 'nova session list', Description: 'List all sessions' },
    { Command: 'nova session new', Description: 'Create new session' },
    { Command: 'nova session resume <id>', Description: 'Resume a session' },
    { Command: 'nova config show', Description: 'Show configuration' },
    { Command: 'nova config set <k> <v>', Description: 'Set config value' },
    { Command: 'nova plugins list', Description: 'List plugins' },
    { Command: 'nova plugins install <n>', Description: 'Install plugin' },
    { Command: 'nova export <session>', Description: 'Export session' },
    { Command: 'nova import <file>', Description: 'Import session' },
    { Command: 'nova version', Description: 'Show version' },
    { Command: 'nova help', Description: 'Show this help' },
  ]);
}
