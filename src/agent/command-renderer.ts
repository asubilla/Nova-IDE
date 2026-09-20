const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RED = `${ESC}[31m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const BLUE = `${ESC}[34m`;
const MAGENTA = `${ESC}[35m`;
const CYAN = `${ESC}[36m`;
const WHITE = `${ESC}[37m`;
const BG_RED = `${ESC}[41m`;
const BG_GREEN = `${ESC}[42m`;
const BG_YELLOW = `${ESC}[43m`;

const KEYWORDS = ['let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'import', 'export', 'from', 'default', 'class',
  'extends', 'new', 'this', 'super', 'async', 'await', 'try', 'catch', 'throw', 'finally',
  'typeof', 'instanceof', 'in', 'of', 'yield', 'delete', 'void', 'with', 'debugger'];
const BUILTINS = ['console', 'process', 'require', 'module', 'exports', 'JSON', 'Math', 'Date',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Promise', 'Map', 'Set'];

export class CommandRenderer {
  renderCommand(command: string): string {
    const parts = command.split(/\s+/);
    const highlighted = parts.map((part, i) => {
      if (i === 0) return `${BOLD}${CYAN}${part}${RESET}`;
      if (part.startsWith('-')) return `${YELLOW}${part}${RESET}`;
      if (part.startsWith('|') || part === '>' || part === '>>' || part === '&&' || part === '||') return `${MAGENTA}${part}${RESET}`;
      return `${WHITE}${part}${RESET}`;
    });
    return highlighted.join(' ');
  }

  renderOutput(output: string, type: 'stdout' | 'stderr'): string {
    if (!output) return '';
    const color = type === 'stderr' ? RED : WHITE;
    const prefix = type === 'stderr' ? `${RED}ERR${RESET} ` : '';
    const lines = output.split('\n');
    return lines.map((line) => `${prefix}${color}${line}${RESET}`).join('\n');
  }

  renderExitCode(code: number): string {
    if (code === 0) return `${GREEN}\u2714 Exit code: ${code}${RESET}`;
    return `${RED}\u2716 Exit code: ${code}${RESET}`;
  }

  renderCommandBlock(command: string, output: string, exitCode: number, duration: number): string {
    const top = `${DIM}\u250c\u2500\u2500\u2500 Command ${RESET}`;
    const cmd = `  ${this.renderCommand(command)}`;
    const time = `  ${DIM}Duration: ${this.renderDuration(duration)}${RESET}`;
    const renderedOutput = output ? this.renderOutput(output, exitCode === 0 ? 'stdout' : 'stderr') : `${DIM}  (no output)${RESET}`;
    const exit = `  ${this.renderExitCode(exitCode)}`;
    const bottom = `${DIM}\u2514\u2500\u2500\u2500${RESET}`;

    return [top, cmd, time, '', renderedOutput, '', exit, bottom].join('\n');
  }

  renderProgressBar(current: number, total: number): string {
    const width = 30;
    const ratio = total > 0 ? Math.min(current / total, 1) : 0;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const pct = Math.round(ratio * 100);
    const bar = `${GREEN}${'\u2588'.repeat(filled)}${DIM}${'\u2591'.repeat(empty)}${RESET}`;
    return `${bar} ${pct}% (${current}/${total})`;
  }

  renderSpinner(): string {
    const frames = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
    const i = Math.floor(Date.now() / 80) % frames.length;
    return `${CYAN}${frames[i]}${RESET} Processing...`;
  }

  renderTable(headers: string[], rows: string[][]): string {
    const colWidths = headers.map((h, i) => {
      const maxData = rows.reduce((max, r) => Math.max(max, (r[i] ?? '').length), 0);
      return Math.max(h.length, maxData);
    });

    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
    const sep = `${DIM}\u2500${colWidths.map((w) => '\u2500'.repeat(w + 2)).join('\u2500\u253c\u2500')}\u2500${RESET}`;
    const header = `${BOLD}${headers.map((h, i) => ` ${pad(h, colWidths[i])} `).join(`${DIM}\u2502${RESET}`)}${RESET}`;
    const body = rows.map((r) =>
      r.map((c, i) => ` ${pad(c, colWidths[i])} `).join(`${DIM}\u2502${RESET}`)
    );

    return [header, sep, ...body].join('\n');
  }

  renderDiff(diff: string): string {
    return diff.split('\n').map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) return `${GREEN}${line}${RESET}`;
      if (line.startsWith('-') && !line.startsWith('---')) return `${RED}${line}${RESET}`;
      if (line.startsWith('@@')) return `${CYAN}${line}${RESET}`;
      if (line.startsWith('---') || line.startsWith('+++')) return `${DIM}${line}${RESET}`;
      return line;
    }).join('\n');
  }

  renderJson(data: any): string {
    const json = JSON.stringify(data, null, 2);
    return json.replace(/"([^"]+)":/g, `${BLUE}"$1"${RESET}:`)
      .replace(/: "([^"]*)"/g, `: ${GREEN}"$1"${RESET}`)
      .replace(/: (\d+)/g, `: ${YELLOW}$1${RESET}`)
      .replace(/: (true|false)/g, `: ${MAGENTA}$1${RESET}`)
      .replace(/: (null)/g, `: ${DIM}$1${RESET}`);
  }

  renderCode(code: string, language: string): string {
    const highlighted = this.highlightSyntax(code, language);
    return `\`\`\`${language}\n${highlighted}\n\`\`\``;
  }

  renderTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${DIM}${h}:${m}:${s}${RESET}`;
  }

  renderDuration(ms: number): string {
    if (ms < 1000) return `${YELLOW}${ms}ms${RESET}`;
    const secs = ms / 1000;
    if (secs < 60) return `${YELLOW}${secs.toFixed(1)}s${RESET}`;
    const mins = Math.floor(secs / 60);
    const rem = (secs % 60).toFixed(0);
    return `${YELLOW}${mins}m ${rem}s${RESET}`;
  }

  private highlightSyntax(code: string, language: string): string {
    const keywords = new Set(KEYWORDS);
    const builtins = new Set(BUILTINS);

    return code.split('\n').map((line) => {
      let result = '';
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
          const quote = line[i];
          let j = i + 1;
          while (j < line.length && line[j] !== quote) {
            if (line[j] === '\\') j++;
            j++;
          }
          result += `${GREEN}${line.slice(i, j + 1)}${RESET}`;
          i = j + 1;
        } else if (line[i] === '/' && line[i + 1] === '/') {
          result += `${DIM}${line.slice(i)}${RESET}`;
          break;
        } else if (line[i] === '/' && line[i + 1] === '*') {
          const end = line.indexOf('*/', i + 2);
          const endIdx = end === -1 ? line.length : end + 2;
          result += `${DIM}${line.slice(i, endIdx)}${RESET}`;
          i = endIdx;
        } else if (/\d/.test(line[i])) {
          let j = i;
          while (j < line.length && /[\d.]/.test(line[j])) j++;
          result += `${YELLOW}${line.slice(i, j)}${RESET}`;
          i = j;
        } else if (/[a-zA-Z_$]/.test(line[i])) {
          let j = i;
          while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
          const word = line.slice(i, j);
          if (keywords.has(word)) {
            result += `${MAGENTA}${BOLD}${word}${RESET}`;
          } else if (builtins.has(word)) {
            result += `${CYAN}${word}${RESET}`;
          } else {
            result += word;
          }
          i = j;
        } else {
          result += line[i];
          i++;
        }
      }
      return result;
    }).join('\n');
  }
}
