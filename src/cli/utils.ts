import * as readline from 'readline';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

type Color = keyof typeof COLORS;

export function print(message: string, color?: Color): void {
  const prefix = color ? COLORS[color] : '';
  const suffix = color ? COLORS.reset : '';
  process.stdout.write(`${prefix}${message}${suffix}\n`);
}

export function printError(message: string): void {
  print(`✗ ${message}`, 'red');
}

export function printSuccess(message: string): void {
  print(`✓ ${message}`, 'green');
}

export function printWarning(message: string): void {
  print(`⚠ ${message}`, 'yellow');
}

export function printInfo(message: string): void {
  print(`ℹ ${message}`, 'blue');
}

export function printTable(data: Record<string, string>[]): void {
  if (data.length === 0) {
    print('  (empty)', 'gray');
    return;
  }

  const keys = Object.keys(data[0]);
  const widths: Record<string, number> = {};

  for (const key of keys) {
    widths[key] = key.length;
    for (const row of data) {
      const val = String(row[key] ?? '');
      if (val.length > widths[key]) {
        widths[key] = val.length;
      }
    }
  }

  const header = keys.map(k => k.padEnd(widths[k])).join('  ');
  const separator = keys.map(k => '─'.repeat(widths[k])).join('──');

  print(`  ${header}`, 'bold');
  print(`  ${separator}`, 'gray');

  for (const row of data) {
    const line = keys.map(k => String(row[k] ?? '').padEnd(widths[k])).join('  ');
    print(`  ${line}`);
  }
}

export function printJSON(data: unknown): void {
  print(JSON.stringify(data, null, 2));
}

export function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function spinner(message: string): { stop: (finalMessage?: string) => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let running = true;

  process.stdout.write(`${COLORS.cyan}${frames[0]}${COLORS.reset} ${message}`);

  const interval = setInterval(() => {
    if (!running) return;
    process.stdout.write(`\r${COLORS.cyan}${frames[i % frames.length]}${COLORS.reset} ${message}`);
    i++;
  }, 80);

  return {
    stop(finalMessage?: string) {
      running = false;
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 10) + '\r');
      if (finalMessage) {
        printSuccess(finalMessage);
      }
    },
  };
}

export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[0f');
}

export function getChar(): Promise<string> {
  return new Promise(resolve => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once('data', (data: Buffer) => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve(data.toString());
    });
  });
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
