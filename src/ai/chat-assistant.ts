import { readFileSync } from 'fs';
import { join } from 'path';
import { LLMProvider, Message, StreamChunk } from './llm-provider';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks?: CodeBlock[];
  metadata?: Record<string, unknown>;
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface ChatContext {
  files?: string[];
  projectPath?: string;
  selection?: string;
  diagnostics?: string[];
}

export interface ChatResponse {
  message: ChatMessage;
  stream?: AsyncGenerator<StreamChunk, void, unknown>;
}

export class ChatAssistant {
  private llm: LLMProvider;
  private systemPrompt: string;
  private history: ChatMessage[] = [];
  private maxHistoryLength = 50;

  constructor(llm: LLMProvider) {
    this.llm = llm;
    this.systemPrompt = this.getDefaultSystemPrompt();
  }

  async chat(message: string, context?: ChatContext): Promise<ChatResponse> {
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    this.history.push(userMessage);
    this.trimHistory();

    const messages = this.buildMessages(message, context);
    const response = await this.llm.complete(messages, { temperature: 0.7 });

    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
      codeBlocks: this.extractCodeBlocks(response.content),
    };

    this.history.push(assistantMessage);

    return { message: assistantMessage };
  }

  async chatWithCode(message: string, code: string, language?: string): Promise<ChatResponse> {
    const context: ChatContext = {
      selection: code,
    };

    const augmentedMessage = `${message}\n\n\`\`\`${language || 'code'}\n${code}\n\`\`\``;
    return this.chat(augmentedMessage, context);
  }

  async chatWithFile(message: string, filePath: string): Promise<ChatResponse> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const language = this.detectLanguage(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || filePath;

      const context: ChatContext = {
        files: [filePath],
      };

      const augmentedMessage = `${message}\n\nFile: ${fileName}\n\`\`\`${language}\n${content}\n\`\`\``;
      return this.chat(augmentedMessage, context);
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  async chatWithProject(message: string, projectPath: string): Promise<ChatResponse> {
    const context: ChatContext = {
      projectPath,
    };

    try {
      const projectContext = this.buildProjectContext(projectPath);
      const augmentedMessage = `${message}\n\nProject context:\n${projectContext}`;
      return this.chat(augmentedMessage, context);
    } catch (error) {
      return this.chat(message, context);
    }
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getConversationHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  exportHistory(): string {
    return JSON.stringify(this.history, null, 2);
  }

  async *chatStream(message: string, context?: ChatContext): AsyncGenerator<StreamChunk, void, unknown> {
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    this.history.push(userMessage);
    this.trimHistory();

    const messages = this.buildMessages(message, context);
    let fullContent = '';

    const stream = this.llm.stream(messages, { temperature: 0.7 });

    for await (const chunk of stream) {
      fullContent += chunk.delta;
      yield chunk;
    }

    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: fullContent,
      timestamp: new Date(),
      codeBlocks: this.extractCodeBlocks(fullContent),
    };

    this.history.push(assistantMessage);
  }

  private buildMessages(message: string, context?: ChatContext): Message[] {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    if (context?.selection) {
      messages.push({
        role: 'system',
        content: `Current code selection:\n\`\`\`\n${context.selection}\n\`\`\``,
      });
    }

    if (context?.files && context.files.length > 0) {
      const fileContext = context.files.map(f => `- ${f}`).join('\n');
      messages.push({
        role: 'system',
        content: `Open files:\n${fileContext}`,
      });
    }

    if (context?.diagnostics && context.diagnostics.length > 0) {
      const diagnostics = context.diagnostics.map(d => `- ${d}`).join('\n');
      messages.push({
        role: 'system',
        content: `Current diagnostics:\n${diagnostics}`,
      });
    }

    for (const msg of this.history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    return messages;
  }

  private getDefaultSystemPrompt(): string {
    return `You are Nova AI, an intelligent coding assistant integrated into the Nova IDE. You help developers with:

- Writing, explaining, and debugging code
- Refactoring and optimizing code
- Answering programming questions
- Suggesting best practices
- Generating tests and documentation
- Analyzing code for issues

Guidelines:
- Be concise and direct
- Provide code examples when relevant
- Use proper markdown formatting for code blocks
- Specify the programming language in code blocks
- If you're unsure, say so rather than guessing
- Focus on practical, actionable advice
- Consider the context of the user's project when making suggestions`;
  }

  private buildProjectContext(projectPath: string): string {
    try {
      const packageJsonPath = join(projectPath, 'package.json');
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as { name?: string; description?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

      const parts: string[] = [];
      if (pkg.name) parts.push(`Project: ${pkg.name}`);
      if (pkg.description) parts.push(`Description: ${pkg.description}`);
      if (pkg.dependencies) {
        parts.push(`Dependencies: ${Object.keys(pkg.dependencies).join(', ')}`);
      }

      return parts.join('\n');
    } catch {
      return `Project path: ${projectPath}`;
    }
  }

  private extractCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    return blocks;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      sh: 'bash',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sql: 'sql',
    };
    return langMap[ext || ''] || 'text';
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private trimHistory(): void {
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }
  }
}
