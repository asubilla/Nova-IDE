import { LLMProvider, Message } from './llm-provider';

export interface CompletionItem {
  label: string;
  detail: string;
  documentation?: string;
  insertText: string;
  kind: CompletionKind;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export type CompletionKind =
  | 'text' | 'method' | 'function' | 'constructor' | 'field' | 'variable'
  | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value'
  | 'enum' | 'keyword' | 'snippet' | 'color' | 'file' | 'reference';

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: { label: string; documentation?: string }[];
  activeParameter: number;
}

export interface HoverInfo {
  contents: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface ReferenceInfo {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface DefinitionInfo {
  file: string;
  line: number;
  column: number;
}

export interface CodePosition {
  line: number;
  character: number;
}

export interface CodeSelection {
  start: CodePosition;
  end: CodePosition;
  text: string;
}

export type RefactorAction =
  | 'extract_method'
  | 'extract_variable'
  | 'inline_variable'
  | 'rename'
  | 'add_type_annotation'
  | 'remove_type_annotation'
  | 'convert_to_arrow_function'
  | 'convert_to_async'
  | 'add_error_handling'
  | 'optimize_imports';

export interface CompletionRequest {
  code: string;
  position: CodePosition;
  language: string;
  context?: string;
  indentSize?: number;
}

export class CodeCompletion {
  private llm: LLMProvider;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private completionCache: Map<string, CompletionItem[]> = new Map();
  private debounceMs = 300;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async getCompletions(request: CompletionRequest): Promise<CompletionItem[]> {
    const cacheKey = this.getCacheKey('completions', request);

    const cached = this.completionCache.get(cacheKey);
    if (cached) return cached;

    return new Promise((resolve) => {
      const existing = this.debounceTimers.get(cacheKey);
      if (existing) clearTimeout(existing);

      const timerId = setTimeout(() => {
        this.debounceTimers.delete(cacheKey);

        void (async () => {
          const items = await this.fetchCompletions(request);
          this.completionCache.set(cacheKey, items);

          setTimeout(() => this.completionCache.delete(cacheKey), 60000);

          resolve(items);
        })();
      }, this.debounceMs);

      this.debounceTimers.set(cacheKey, timerId);
    });
  }

  async getSignatureHelp(request: CompletionRequest): Promise<SignatureInfo | null> {
    const context = this.extractFunctionContext(request.code, request.position);
    if (!context) return null;

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code intelligence assistant. Given the code context and cursor position, provide the function signature information. Return a JSON response with the following structure:
{
  "label": "function signature",
  "documentation": "brief description",
  "parameters": [{"label": "param: type", "documentation": "description"}],
  "activeParameter": 0
}`,
      },
      {
        role: 'user',
        content: `Language: ${request.language}\n\nCode context:\n${context}\n\nCursor at line ${request.position.line}, character ${request.position.character}`,
      },
    ];

    try {
      const response = await this.llm.complete(messages, { temperature: 0, maxTokens: 500 });
      return JSON.parse(response.content) as SignatureInfo;
    } catch {
      return null;
    }
  }

  async getHoverInfo(request: CompletionRequest): Promise<HoverInfo | null> {
    const token = this.getTokenAtPosition(request.code, request.position);
    if (!token) return null;

    const surroundingCode = this.extractContext(request.code, request.position, 20);

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code intelligence assistant. Given code and a token at the cursor position, provide hover information. Return a JSON response:
{
  "contents": "description of the token, its type, and usage"
}`,
      },
      {
        role: 'user',
        content: `Language: ${request.language}\nToken: "${token}"\n\nSurrounding code:\n${surroundingCode}`,
      },
    ];

    try {
      const response = await this.llm.complete(messages, { temperature: 0, maxTokens: 300 });
      const result = JSON.parse(response.content) as { contents: string };
      return { contents: result.contents };
    } catch {
      return null;
    }
  }

  async getReferences(request: CompletionRequest): Promise<ReferenceInfo[]> {
    const token = this.getTokenAtPosition(request.code, request.position);
    if (!token) return [];

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code analysis assistant. Given code and a token, find all references to that token. Return a JSON array:
[{"file": "relative/path.ts", "line": 10, "column": 5, "text": "the line content"}]
Since this is single-file analysis, reference line numbers within the provided code.`,
      },
      {
        role: 'user',
        content: `Language: ${request.language}\nToken: "${token}"\n\nCode:\n${request.code}`,
      },
    ];

    try {
      const response = await this.llm.complete(messages, { temperature: 0, maxTokens: 1000 });
      return JSON.parse(response.content) as ReferenceInfo[];
    } catch {
      return [];
    }
  }

  async getDefinitions(request: CompletionRequest): Promise<DefinitionInfo | null> {
    const token = this.getTokenAtPosition(request.code, request.position);
    if (!token) return null;

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code analysis assistant. Given code and a token, find where that token is defined. Return a JSON response:
{"file": "relative/path.ts", "line": 5, "column": 0}
Since this is single-file analysis, provide the line number within the provided code where the token is defined.`,
      },
      {
        role: 'user',
        content: `Language: ${request.language}\nToken: "${token}"\n\nCode:\n${request.code}`,
      },
    ];

    try {
      const response = await this.llm.complete(messages, { temperature: 0, maxTokens: 300 });
      return JSON.parse(response.content) as DefinitionInfo;
    } catch {
      return null;
    }
  }

  async refactor(
    code: string,
    selection: CodeSelection,
    action: RefactorAction,
    language: string,
  ): Promise<string> {
    const prompts: Record<RefactorAction, string> = {
      extract_method: 'Extract the selected code into a new method/function. Generate a meaningful name based on what the code does. Return the refactored code.',
      extract_variable: 'Extract the selected code into a new variable/const. Generate a meaningful name. Return the refactored code.',
      inline_variable: 'Inline the variable at the selection. Replace all usages with its value. Return the refactored code.',
      rename: 'Rename the selected identifier to a more descriptive name. Update all references. Return the refactored code.',
      add_type_annotation: 'Add appropriate type annotations to the selected code. Return the refactored code.',
      remove_type_annotation: 'Remove type annotations from the selected code. Return the refactored code.',
      convert_to_arrow_function: 'Convert the selected function to an arrow function. Return the refactored code.',
      convert_to_async: 'Convert the selected code to use async/await. Return the refactored code.',
      add_error_handling: 'Add appropriate error handling (try/catch, null checks) to the selected code. Return the refactored code.',
      optimize_imports: 'Optimize and organize the imports in the code. Remove unused imports. Return the refactored code.',
    };

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code refactoring assistant. Perform the requested refactoring action on the code. Return ONLY the refactored code, no explanations.`,
      },
      {
        role: 'user',
        content: `Language: ${language}\nAction: ${prompts[action]}\n\nFull code:\n${code}\n\nSelected code (lines ${selection.start.line + 1}-${selection.end.line + 1}):\n${selection.text}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.2, maxTokens: 4096 });
    return this.extractCodeBlock(response.content, language);
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  clearCache(): void {
    this.completionCache.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private async fetchCompletions(request: CompletionRequest): Promise<CompletionItem[]> {
    const prefix = this.getPrefixAtPosition(request.code, request.position);
    const surroundingCode = this.extractContext(request.code, request.position, 30);

    const indent = this.getIndentAtLine(request.code, request.position.line);
    const indentSize = request.indentSize || 2;

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code completion assistant. Given code context and cursor position, provide code completions. Return a JSON array of completions:
[{"label": "completion label", "detail": "type info", "documentation": "description", "insertText": "code to insert", "kind": "method|function|variable|class|keyword|snippet"}]

Rules:
- Provide 3-8 relevant completions
- insertText should use proper indentation (${indentSize} spaces)
- Use tab stops with $1, $2 for snippets
- Consider the current prefix: "${prefix}"
- Match the coding style of the existing code`,
      },
      {
        role: 'user',
        content: `Language: ${request.language}\nPrefix: "${prefix}"\nCursor at line ${request.position.line + 1}, character ${request.position.character}\nIndent: "${indent}"\n\nCode:\n${surroundingCode}`,
      },
    ];

    try {
      const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 1500 });
      const items = JSON.parse(response.content) as CompletionItem[];
      return items.map(item => ({
        ...item,
        kind: item.kind || 'text',
        insertText: this.adjustIndentation(item.insertText, indent),
      }));
    } catch {
      return [];
    }
  }

  private getCacheKey(prefix: string, request: CompletionRequest): string {
    return `${prefix}:${request.language}:${request.position.line}:${request.position.character}:${request.code.length}`;
  }

  private extractContext(code: string, position: CodePosition, lineRange: number): string {
    const lines = code.split('\n');
    const start = Math.max(0, position.line - lineRange);
    const end = Math.min(lines.length, position.line + lineRange);
    return lines.slice(start, end).join('\n');
  }

  private extractFunctionContext(code: string, position: CodePosition): string | null {
    const lines = code.split('\n');
    let braceCount = 0;
    let startLine = position.line;

    for (let i = position.line; i >= 0; i--) {
      const line = lines[i];
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === '}') braceCount++;
        if (line[j] === '{') braceCount--;
      }
      if (braceCount < 0) {
        startLine = i;
        break;
      }
    }

    braceCount = 0;
    let endLine = position.line;

    for (let i = position.line; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      if (braceCount === 0 && i > startLine) {
        endLine = i;
        break;
      }
    }

    return lines.slice(startLine, endLine + 1).join('\n');
  }

  private getTokenAtPosition(code: string, position: CodePosition): string | null {
    const lines = code.split('\n');
    if (position.line >= lines.length) return null;

    const currentLine = lines[position.line];
    if (position.character >= currentLine.length) return null;

    let start = position.character;
    while (start > 0 && /[a-zA-Z0-9_$]/.test(currentLine[start - 1])) {
      start--;
    }

    let end = position.character;
    while (end < currentLine.length && /[a-zA-Z0-9_$]/.test(currentLine[end])) {
      end++;
    }

    const token = currentLine.slice(start, end);
    return token.length > 0 ? token : null;
  }

  private getPrefixAtPosition(code: string, position: CodePosition): string {
    const lines = code.split('\n');
    if (position.line >= lines.length) return '';

    const line = lines[position.line];
    let start = position.character;
    while (start > 0 && /[a-zA-Z0-9_$]/.test(line[start - 1])) {
      start--;
    }

    return line.slice(start, position.character);
  }

  private getIndentAtLine(code: string, line: number): string {
    const lines = code.split('\n');
    if (line >= lines.length) return '';

    const match = lines[line].match(/^(\s*)/);
    return match ? match[1] : '';
  }

  private adjustIndentation(text: string, baseIndent: string): string {
    const lines = text.split('\n');
    if (lines.length === 0) return text;

    const firstNonEmpty = lines.find(l => l.trim().length > 0);
    if (!firstNonEmpty) return text;

    const currentIndent = firstNonEmpty.match(/^(\s*)/)?.[1] || '';
    const diff = baseIndent.length - currentIndent.length;

    if (diff === 0) return text;

    return lines.map((line, i) => {
      if (line.trim().length === 0) return '';
      if (i === 0) return line;

      if (diff > 0) {
        return ' '.repeat(diff) + line;
      } else {
        const trimmed = line.slice(Math.min(-diff, line.length - line.trimStart().length));
        return trimmed;
      }
    }).join('\n');
  }

  private extractCodeBlock(content: string, language: string): string {
    const backticks = '```';
    const langPattern = new RegExp(`${backticks}${language}\\s*\\n([\\s\\S]*?)${backticks}`, 'i');
    const genericPattern = new RegExp(`${backticks}\\s*\\n([\\s\\S]*?)${backticks}`, 'i');

    const langMatch = content.match(langPattern);
    if (langMatch) return langMatch[1].trim();

    const genericMatch = content.match(genericPattern);
    if (genericMatch) return genericMatch[1].trim();

    return content.trim();
  }
}
