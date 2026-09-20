import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { loadConfig } from './config';
import { print, printError, printSuccess, printInfo, printWarning, printJSON } from './utils';

const COMMANDS = ['/help', '/clear', '/history', '/export', '/quit', '/exit', '/quit'];

function getAPIBase(): string {
  const config = loadConfig();
  return `http://${config.server.host}:${config.server.port}`;
}

function sendChatMessage(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${getAPIBase()}/api/chat`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response ?? parsed.message ?? data);
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(JSON.stringify({ message }));
    req.end();
  });
}

function getCommandCompletions(input: string): string[] {
  const lower = input.toLowerCase();
  return COMMANDS.filter(c => c.startsWith(lower));
}

export function startInteractiveChat(sessionId?: string): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      if (line.startsWith('/')) {
        const completions = getCommandCompletions(line);
        return [completions.length ? completions : COMMANDS, line];
      }
      return [[], line];
    },
  });

  const history: { role: 'user' | 'assistant'; content: string }[] = [];

  print('');
  print('╔══════════════════════════════════════╗', 'cyan');
  print('║       Nova Interactive Chat          ║', 'cyan');
  print('╚══════════════════════════════════════╝', 'cyan');
  print('');
  if (sessionId) {
    printInfo(`Session: ${sessionId}`);
  }
  printInfo('Type /help for available commands, /quit to exit');
  print('');

  const promptUser = (): void => {
    rl.question('\x1b[36mnova>\x1b[0m ', async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }

      if (trimmed.startsWith('/')) {
        const [command, ...args] = trimmed.split(' ');

        switch (command.toLowerCase()) {
          case '/help':
            print('');
            print('Commands:', 'bold');
            print('  /help     - Show this help');
            print('  /clear    - Clear screen');
            print('  /history  - Show chat history');
            print('  /export   - Export session to file');
            print('  /quit     - Exit chat');
            print('');
            break;

          case '/clear':
            process.stdout.write('\x1b[2J\x1b[0f');
            break;

          case '/history':
            if (history.length === 0) {
              printInfo('No messages yet');
            } else {
              print('');
              for (const msg of history) {
                const prefix = msg.role === 'user' ? '\x1b[33mYou' : '\x1b[36mNova';
                print(`${prefix}\x1b[0m: ${msg.content}`);
              }
              print('');
            }
            break;

          case '/export': {
            const exportPath = args[0] || `chat-export-${Date.now()}.json`;
            const data = {
              sessionId: sessionId || 'standalone',
              exportedAt: new Date().toISOString(),
              history,
            };
            fs.writeFileSync(path.resolve(exportPath), JSON.stringify(data, null, 2));
            printSuccess(`Chat exported to ${exportPath}`);
            break;
          }

          case '/quit':
          case '/exit':
            printInfo('Goodbye!');
            rl.close();
            return;

          default:
            printWarning(`Unknown command: ${command}`);
        }

        promptUser();
        return;
      }

      history.push({ role: 'user', content: trimmed });

      try {
        const response = await sendChatMessage(trimmed);
        history.push({ role: 'assistant', content: response });
        print('');
        print(`  ${response}`, 'white');
        print('');
      } catch (err) {
        printError(`Failed to get response: ${(err as Error).message}`);
        printInfo('Make sure the server is running (nova start)');
      }

      promptUser();
    });
  };

  rl.on('close', () => {
    printInfo('Chat session ended');
  });

  promptUser();
}
