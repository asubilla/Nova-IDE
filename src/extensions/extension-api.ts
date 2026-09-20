export interface CompletionItem {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface CompletionProvider {
  provideCompletionItems(document: TextDocument, position: Position): CompletionItem[];
}

export interface HoverContent {
  contents: string;
  range?: Range;
}

export interface HoverProvider {
  provideHover(document: TextDocument, position: Position): HoverContent | null;
}

export interface CodeAction {
  title: string;
  kind?: string;
  command?: string;
  arguments?: any[];
}

export interface CodeActionProvider {
  provideCodeActions(document: TextDocument, range: Range): CodeAction[];
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface DocumentFormattingProvider {
  provideDocumentFormattingEdits(document: TextDocument): TextEdit[];
}

export interface Location {
  uri: string;
  range: Range;
}

export interface DefinitionProvider {
  provideDefinition(document: TextDocument, position: Position): Location | null;
}

export interface Reference {
  uri: string;
  range: Range;
}

export interface ReferenceProvider {
  provideReferences(document: TextDocument, position: Position): Reference[];
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextDocument {
  uri: string;
  fileName: string;
  languageId: string;
  version: number;
  getText(): string;
  lineAt(line: number): string;
  lineCount: number;
}

export interface InputBoxOptions {
  prompt: string;
  value?: string;
  placeHolder?: string;
  password?: boolean;
  validateInput?: (value: string) => string | null;
}

export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

export interface TextEditor {
  document: TextDocument;
  selection: Range;
  selections: Range[];
  visibleRanges: Range[];
  edit(callback: (editBuilder: EditBuilder) => void): Promise<boolean>;
}

export interface EditBuilder {
  replace(range: Range, text: string): void;
  insert(position: Position, text: string): void;
  delete(range: Range): void;
}

export interface Configuration {
  get<T>(section: string, defaultValue?: T): T;
  has(section: string): boolean;
  inspect(section: string): any;
  update(section: string, value: any): Promise<void>;
}

export interface MessageOptions {
  modal?: boolean;
}

export class ExtensionAPI {
  private extensionId: string;
  private commands: Map<string, (...args: any[]) => any> = new Map();
  private completionProviders: Map<string, CompletionProvider> = new Map();
  private hoverProviders: Map<string, HoverProvider> = new Map();
  private codeActionProviders: Map<string, CodeActionProvider> = new Map();
  private formattingProviders: Map<string, DocumentFormattingProvider> = new Map();
  private definitionProviders: Map<string, DefinitionProvider> = new Map();
  private referenceProviders: Map<string, ReferenceProvider> = new Map();
  private configuration: Map<string, any> = new Map();
  private messages: Array<{ type: string; message: string; timestamp: number }> = [];
  private activeEditor: TextEditor | null = null;
  private fileOpener: ((path: string) => void) | null = null;
  private lineRevealer: ((line: number) => void) | null = null;

  constructor(extensionId: string) {
    this.extensionId = extensionId;
  }

  registerCommand(id: string, callback: (...args: any[]) => any): void {
    if (this.commands.has(id)) {
      throw new Error(`Command ${id} is already registered by this extension`);
    }
    this.commands.set(id, callback);
  }

  getRegisteredCommands(): Map<string, (...args: any[]) => any> {
    return new Map(this.commands);
  }

  registerCompletionProvider(language: string, provider: CompletionProvider): void {
    this.completionProviders.set(language, provider);
  }

  getCompletionProvider(language: string): CompletionProvider | undefined {
    return this.completionProviders.get(language);
  }

  registerHoverProvider(language: string, provider: HoverProvider): void {
    this.hoverProviders.set(language, provider);
  }

  getHoverProvider(language: string): HoverProvider | undefined {
    return this.hoverProviders.get(language);
  }

  registerCodeActionProvider(language: string, provider: CodeActionProvider): void {
    this.codeActionProviders.set(language, provider);
  }

  getCodeActionProvider(language: string): CodeActionProvider | undefined {
    return this.codeActionProviders.get(language);
  }

  registerDocumentFormattingEditProvider(language: string, provider: DocumentFormattingProvider): void {
    this.formattingProviders.set(language, provider);
  }

  getFormattingProvider(language: string): DocumentFormattingProvider | undefined {
    return this.formattingProviders.get(language);
  }

  registerDefinitionProvider(language: string, provider: DefinitionProvider): void {
    this.definitionProviders.set(language, provider);
  }

  getDefinitionProvider(language: string): DefinitionProvider | undefined {
    return this.definitionProviders.get(language);
  }

  registerReferenceProvider(language: string, provider: ReferenceProvider): void {
    this.referenceProviders.set(language, provider);
  }

  getReferenceProvider(language: string): ReferenceProvider | undefined {
    return this.referenceProviders.get(language);
  }

  showInformationMessage(message: string, options?: MessageOptions): void {
    this.messages.push({ type: 'info', message, timestamp: Date.now() });
  }

  showWarningMessage(message: string, options?: MessageOptions): void {
    this.messages.push({ type: 'warning', message, timestamp: Date.now() });
  }

  showErrorMessage(message: string, options?: MessageOptions): void {
    this.messages.push({ type: 'error', message, timestamp: Date.now() });
  }

  getMessages(): Array<{ type: string; message: string; timestamp: number }> {
    return [...this.messages];
  }

  showInputBox(options: InputBoxOptions): Promise<string | null> {
    return new Promise((resolve) => {
      this.messages.push({
        type: 'input',
        message: options.prompt,
        timestamp: Date.now(),
      });
      resolve(options.value ?? null);
    });
  }

  showQuickPick(items: QuickPickItem[]): Promise<QuickPickItem | null> {
    return new Promise((resolve) => {
      this.messages.push({
        type: 'quickpick',
        message: items.map((i) => i.label).join(', '),
        timestamp: Date.now(),
      });
      resolve(items.length > 0 ? items[0] : null);
    });
  }

  getConfiguration(section?: string): Configuration {
    if (!section) {
      return {
        get: <T>(key: string, defaultValue?: T): T => {
          return this.configuration.get(key) ?? defaultValue ?? (undefined as T);
        },
        has: (key: string): boolean => this.configuration.has(key),
        inspect: (key: string): any => this.configuration.get(key),
        update: async (key: string, value: any): Promise<void> => {
          this.configuration.set(key, value);
        },
      };
    }

    const prefix = section + '.';
    return {
      get: <T>(key: string, defaultValue?: T): T => {
        return this.configuration.get(prefix + key) ?? defaultValue ?? (undefined as T);
      },
      has: (key: string): boolean => this.configuration.has(prefix + key),
      inspect: (key: string): any => this.configuration.get(prefix + key),
      update: async (key: string, value: any): Promise<void> => {
        this.configuration.set(prefix + key, value);
      },
    };
  }

  setConfiguration(section: string, value: any): void {
    this.configuration.set(section, value);
  }

  getActiveTextEditor(): TextEditor | null {
    return this.activeEditor;
  }

  setActiveTextEditor(editor: TextEditor | null): void {
    this.activeEditor = editor;
  }

  openFile(filePath: string): void {
    if (this.fileOpener) {
      this.fileOpener(filePath);
    }
  }

  setFileOpener(opener: (path: string) => void): void {
    this.fileOpener = opener;
  }

  revealLine(line: number): void {
    if (this.lineRevealer) {
      this.lineRevealer(line);
    }
  }

  setLineRevealer(revealer: (line: number) => void): void {
    this.lineRevealer = revealer;
  }

  getExtensionId(): string {
    return this.extensionId;
  }

  dispose(): void {
    this.commands.clear();
    this.completionProviders.clear();
    this.hoverProviders.clear();
    this.codeActionProviders.clear();
    this.formattingProviders.clear();
    this.definitionProviders.clear();
    this.referenceProviders.clear();
    this.configuration.clear();
    this.messages = [];
    this.activeEditor = null;
  }
}
