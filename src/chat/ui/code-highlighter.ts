export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'sql'
  | 'bash'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'php'
  | 'ruby'
  | 'text';

export interface HighlightToken {
  type: string;
  value: string;
}

export interface CodeBlockConfig {
  code: string;
  language?: SupportedLanguage;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  maxLines?: number;
}

interface LanguagePatterns {
  keywords: RegExp;
  strings: RegExp;
  comments: RegExp;
  numbers: RegExp;
  functions: RegExp;
  types: RegExp;
  operators: RegExp;
  decorators?: RegExp;
  tags?: RegExp;
  attributes?: RegExp;
  properties?: RegExp;
}

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  kt: 'java',
  'csharp': 'java',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c': 'cpp',
  h: 'cpp',
  jsx: 'javascript',
  tsx: 'typescript',
  vue: 'html',
  svelte: 'html',
  scss: 'css',
  less: 'css',
};

const LANGUAGE_PATTERNS: Record<string, LanguagePatterns> = {
  javascript: {
    keywords:
      /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|super|new|this|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|void|delete|null|undefined|true|false)\b/g,
    strings: /(["'`])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
    functions: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%]=?)/g,
  },
  typescript: {
    keywords:
      /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|super|new|this|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|void|delete|null|undefined|true|false|type|interface|enum|implements|abstract|declare|namespace|module|as|is|keyof|readonly|private|protected|public|static|override|satisfies|infer|never|unknown|any|bigint)\b/g,
    strings: /(["'`])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
    functions: /\b([a-zA-Z_$][\w$]*)\s*(?=[<(])/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators:
      /(=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%]=?|\?\.|\?\?)/g,
  },
  python: {
    keywords:
      /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|with|try|except|finally|raise|yield|lambda|and|or|not|in|is|None|True|False|global|nonlocal|assert|del|print|async|await)\b/g,
    strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|f"(?:[^"\\]|\\.)*"|f'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    comments: /(#.*$)/gm,
    numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?j?)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(==|!=|<=|>=|\*\*|\/\/|[+\-*/%]=?)/g,
    decorators: /(@\w+(?:\.\w+)*(?:\(.*?\))?)/g,
  },
  html: {
    keywords: /\b(html|head|body|div|span|p|a|img|ul|ol|li|table|tr|td|th|form|input|button|select|option|textarea|script|style|link|meta|title|section|article|nav|header|footer|main|aside|h[1-6]|pre|code)\b/gi,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(<!--[\s\S]*?-->)/gm,
    numbers: /\b(\d+\.?\d*(?:px|em|rem|%|vh|vw)?)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /[=<>!]+/g,
    tags: /(<\/?)([\w-]+)/g,
    attributes: /\s([\w-]+)(?==)/g,
  },
  css: {
    keywords: /\b(important|inherit|initial|unset|none|auto|block|inline|flex|grid|absolute|relative|fixed|sticky)\b/g,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|deg|s|ms)?)\b/gi,
    functions: /\b([a-zA-Z-]+)\s*(?=\()/g,
    types: /([\w-]+)\s*(?={)/g,
    operators: /[>:~+]/g,
    properties: /([\w-]+)\s*(?=:)/g,
  },
  json: {
    keywords: /\b(true|false|null)\b/g,
    strings: /"(?:[^"\\]|\\.)*"/g,
    comments: /(\/\/.*$)/gm,
    numbers: /\b(-?\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
    functions: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /:/g,
    properties: /"([\w$]+)"\s*(?=:)/g,
  },
  yaml: {
    keywords: /\b(true|false|null|yes|no|on|off)\b/gi,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(#.*$)/gm,
    numbers: /\b(\d+\.?\d*)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /:/g,
    properties: /^([\w-]+)\s*:/gm,
  },
  markdown: {
    keywords: /\b(true|false|null)\b/g,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(<!--[\s\S]*?-->)/gm,
    numbers: /\b(\d+\.?\d*)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /[=<>!]+/g,
    properties: /^#+\s+.+$/gm,
  },
  sql: {
    keywords:
      /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|HAVING|UNION|ALL|DISTINCT|AS|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|UNIQUE|INT|INTEGER|VARCHAR|TEXT|BOOLEAN|DATE|TIMESTAMP|FLOAT|DOUBLE|DECIMAL)\b/gi,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(--.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(<>|!=|<=|>=|[+\-*/%]=?)/g,
  },
  bash: {
    keywords:
      /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|local|export|source|alias|unalias|echo|printf|read|shift|set|unset|trap|eval|exec|cd|pwd|ls|cat|grep|sed|awk|find|sort|uniq|wc|head|tail|cp|mv|rm|mkdir|rmdir|chmod|chown|touch|chmod|ln|tar|zip|unzip|curl|wget|git|npm|node|python|pip|docker|sudo|apt|yum|brew)\b/g,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(#.*$)/gm,
    numbers: /\b(\d+\.?\d*)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /[|&;><]+/g,
    properties: /\$\{?[\w]+\}?/g,
  },
  rust: {
    keywords:
      /\b(fn|let|mut|const|static|struct|enum|impl|trait|type|where|use|mod|pub|crate|self|super|if|else|for|while|loop|break|continue|return|match|as|in|ref|move|async|await|unsafe|extern|dyn|box|yield|true|false|self|Some|None|Ok|Err)\b/g,
    strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:_\d+)*(?:f32|f64|i8|i16|i32|i64|u8|u16|u32|u64|isize|usize)?)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(=>|->|==|!=|<=|>=|&&|\|\||[+\-*/%]=?)/g,
  },
  go: {
    keywords:
      /\b(func|var|const|type|struct|interface|map|chan|package|import|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|nil|true|false|iota|make|new|len|cap|append|copy|delete|close|panic|recover|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|any|comparable)\b/g,
    strings: /("(?:[^"\\]|\\.)*"|`[\s\S]*?`|'(?:[^'\\]|\\.)*')/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(==|!=|<=|>=|&&|\|\||:=|[+\-*/%]=?)/g,
  },
  java: {
    keywords:
      /\b(public|private|protected|static|final|abstract|class|interface|enum|extends|implements|new|this|super|import|package|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|void|int|long|short|byte|float|double|char|boolean|String|Object|true|false|null|instanceof|synchronized|volatile|transient|native|strictfp|assert|enum|record|sealed|permits|var|yield|module|opens|requires|exports|provides|with|to|open|true|false|null)\b/g,
    strings: /("(?:[^"\\]|\\.)*")/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*[fFdDlL]?)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(==|!=|<=|>=|&&|\|\||[+\-*/%]=?)/g,
  },
  cpp: {
    keywords:
      /\b(auto|const|static|extern|register|volatile|mutable|class|struct|union|enum|typedef|typename|namespace|using|template|virtual|override|explicit|friend|public|private|protected|return|if|else|for|while|do|switch|case|break|continue|try|catch|throw|new|delete|this|sizeof|typeid|alignof|alignas|constexpr|consteval|constinit|noexcept|decltype|nullptr|true|false|void|int|long|short|unsigned|float|double|char|bool|string|vector|map|set|array|list|deque|pair|tuple|unique_ptr|shared_ptr|make_unique|make_shared|std)\b/g,
    strings: /("(?:[^"\\]|\\.)*"|R"[\s\S]*?\(.*?\)[\s\S]*?")/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?[fFuUlL]*)\b/gi,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(==|!=|<=|>=|&&|\|\||[+\-*/%]=?|<<|>>)/g,
  },
  php: {
    keywords:
      /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield|yield from|true|false|null|int|float|string|bool|array|object|callable|iterable|self|parent)\b/g,
    strings: /(["'])(?:(?!\1|\\).|\\.)*\1/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm,
    numbers: /\b(\d+\.?\d*)\b/gi,
    functions: /\$([a-zA-Z_]\w*)|\\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][\w]*)\b/g,
    operators: /(===|!==|==|!=|<=|>=|<=>|&&|\|\||[+\-*/%]=?|\.\.)/g,
    properties: /\$[\w]+/g,
  },
};

const LANG_ICON_MAP: Record<SupportedLanguage, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  html: 'HTML',
  css: 'CSS',
  json: '{ }',
  yaml: 'YML',
  markdown: 'MD',
  sql: 'SQL',
  bash: '$_',
  rust: 'RS',
  go: 'GO',
  java: 'JV',
  cpp: 'C++',
  php: 'PHP',
  ruby: 'RB',
  text: 'TXT',
};

export class CodeHighlighter {
  private languagePatterns: Record<string, LanguagePatterns> = LANGUAGE_PATTERNS;

  highlight(code: string, language: SupportedLanguage): string {
    const lang = language || 'text';
    const escaped = this.escapeHtml(code);

    if (lang === 'text') {
      return `<span class="hljs-text">${escaped}</span>`;
    }

    const patterns = this.languagePatterns[lang];
    if (!patterns) {
      return escaped;
    }

    return this.applyHighlighting(escaped, patterns, lang);
  }

  detectLanguage(code: string): SupportedLanguage {
    const trimmed = code.trim();

    if (/^\s*</.test(trimmed) && /<\/[a-z]+>/i.test(trimmed)) {
      if (/<script/i.test(trimmed)) return 'javascript';
      if (/<style/i.test(trimmed)) return 'css';
      return 'html';
    }

    if (/^\s*\{[\s\S]*"[\w]+":\s*/.test(trimmed)) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        /* not json */
      }
    }

    if (/^\s*---\s*$/.test(trimmed) || /^\s*[\w]+:\s+/m.test(trimmed)) {
      if (/^\s*-\s+/m.test(trimmed) || /^\s+[\w-]+:/gm.test(trimmed)) {
        return 'yaml';
      }
    }

    if (/^\s*#include\s+[<"]/.test(trimmed)) return 'cpp';
    if (/^\s*#define\s+/.test(trimmed)) return 'cpp';

    if (
      /^\s*import\s+[\s\S]+from\s+['"]/.test(trimmed) ||
      /^\s*export\s+(default\s+)?(function|class|const|let|var|interface|type|enum)/m.test(
        trimmed
      )
    ) {
      if (/\b(interface|type|enum|as|satisfies)\b/.test(trimmed)) return 'typescript';
      return 'javascript';
    }

    if (/^\s*(const|let|var)\s+\w+\s*=/.test(trimmed) && /=>|function/.test(trimmed)) {
      return 'javascript';
    }

    if (/^\s*def\s+\w+\s*\(/.test(trimmed) || /^\s*class\s+\w+/.test(trimmed)) {
      if (/@\w+/.test(trimmed)) return 'python';
      if (/\bdef\b/.test(trimmed)) return 'python';
    }

    if (/\bfn\s+\w+/.test(trimmed) && /\blet\s+mut\b/.test(trimmed)) return 'rust';

    if (
      /^\s*func\s+\w+/.test(trimmed) ||
      (/^\s*package\s+\w+/.test(trimmed) && /func\s+\w+/.test(trimmed))
    ) {
      return 'go';
    }

    if (/\bpublic\s+class\s+\w+/.test(trimmed) && /\bvoid\s+\w+/.test(trimmed)) return 'java';

    if (/^\s*<\?php/.test(trimmed)) return 'php';

    if (/^\s*SELECT\s+/i.test(trimmed)) return 'sql';
    if (/^\s*CREATE\s+TABLE/i.test(trimmed)) return 'sql';

    if (/^\s*#!\s*\/bin\/(ba)?sh/.test(trimmed) || /^\s*(echo|if|for|while)\s/.test(trimmed)) {
      return 'bash';
    }

    if (/^\s*\[[\s\S]*\]\s*$/.test(trimmed) && /^[\s\[\]{},\-"':\w.]+$/m.test(trimmed)) {
      return 'json';
    }

    if (/^\s*\w+\s*[:=]\s*/.test(trimmed) && /\b(true|false|null|yes|no)\b/i.test(trimmed)) {
      return 'yaml';
    }

    if (/^\s*#/.test(trimmed) && /\[.+\]\(.+\)/.test(trimmed)) return 'markdown';
    if (/^#{1,6}\s+/.test(trimmed) && /\[.+\]\(.+\)/.test(trimmed)) return 'markdown';

    if (/<div|<span|<p|<a\s|<img|<table/i.test(trimmed)) return 'html';
    if (/\{[\w-]+\s*:/.test(trimmed) && /[;{]/.test(trimmed) && /[.#][\w-]+\s*\{/.test(trimmed)) {
      return 'css';
    }

    return 'text';
  }

  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  renderCodeBlock(config: CodeBlockConfig): string {
    const {
      code,
      language: lang,
      filename,
      showLineNumbers = true,
      highlightLines = [],
      maxLines,
    } = config;

    const detectedLang = lang || this.detectLanguage(code);
    const displayLang = detectedLang.toUpperCase();
    const langIcon = LANG_ICON_MAP[detectedLang] || 'TXT';
    const lines = code.split('\n');
    const displayLines = maxLines ? lines.slice(0, maxLines) : lines;
    const truncated = maxLines && lines.length > maxLines;

    let highlighted: string;
    if (showLineNumbers) {
      highlighted = displayLines
        .map((line, i) => {
          const lineNum = i + 1;
          const isHighlighted = highlightLines.includes(lineNum);
          const highlightedLine = this.highlight(line || ' ', detectedLang);
          return `<span class="hljs-line${isHighlighted ? ' hljs-line-highlight' : ''}">` +
            `<span class="hljs-line-num">${lineNum}</span>` +
            `<span class="hljs-line-content">${highlightedLine}</span>` +
            `</span>`;
        })
        .join('\n');
    } else {
      highlighted = this.highlight(displayLines.join('\n'), detectedLang);
    }

    const truncatedNotice = truncated
      ? `<span class="hljs-truncated">... ${lines.length - maxLines!} more lines</span>`
      : '';

    const filenameSection = filename
      ? `<span class="hljs-filename">${this.escapeHtml(filename)}</span>`
      : '';

    return `
      <div class="hljs-code-block" data-language="${this.escapeHtml(detectedLang)}">
        <div class="hljs-code-header">
          <div class="hljs-code-header-left">
            <span class="hljs-lang-badge">${langIcon}</span>
            ${filenameSection}
            <span class="hljs-lang-label">${this.escapeHtml(displayLang)}</span>
          </div>
          <div class="hljs-code-header-right">
            <button class="hljs-copy-btn" data-code="${this.escapeAttr(code)}" title="Copy code">
              <span class="hljs-copy-icon">&#x2398;</span>
              <span class="hljs-copy-text">Copy</span>
            </button>
          </div>
        </div>
        <div class="hljs-code-body">
          <pre class="hljs-pre"><code class="hljs-lang-${this.escapeHtml(detectedLang)}">${highlighted}${truncatedNotice}</code></pre>
        </div>
      </div>`;
  }

  renderInlineCode(code: string, language?: SupportedLanguage): string {
    const escaped = this.escapeHtml(code);
    const langClass = language ? ` hljs-inline-${language}` : '';
    return `<code class="hljs-inline${langClass}">${escaped}</code>`;
  }

  private applyHighlighting(escaped: string, patterns: LanguagePatterns, lang: string): string {
    let result = escaped;
    const tokens: Array<{ start: number; end: number; replacement: string }> = [];

    const collectTokens = (regex: RegExp, className: string): void => {
      const r = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;
      while ((match = r.exec(result)) !== null) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          replacement: `<span class="hljs-${className}">${match[0]}</span>`,
        });
      }
    };

    if (patterns.comments) collectTokens(patterns.comments, 'comment');
    if (patterns.strings) collectTokens(patterns.strings, 'string');
    if (patterns.decorators) collectTokens(patterns.decorators, 'decorator');
    if (patterns.tags) collectTokens(patterns.tags, 'tag');
    if (patterns.attributes) collectTokens(patterns.attributes, 'attr');
    if (patterns.keywords) collectTokens(patterns.keywords, 'keyword');
    if (patterns.types) collectTokens(patterns.types, 'type');
    if (patterns.functions) collectTokens(patterns.functions, 'function');
    if (patterns.numbers) collectTokens(patterns.numbers, 'number');
    if (patterns.operators) collectTokens(patterns.operators, 'operator');
    if (patterns.properties) collectTokens(patterns.properties, 'property');

    tokens.sort((a, b) => a.start - b.start);

    const merged = this.mergeTokens(tokens);
    if (merged.length === 0) return result;

    let output = '';
    let cursor = 0;
    for (const token of merged) {
      if (token.start > cursor) {
        output += result.substring(cursor, token.start);
      }
      output += token.replacement;
      cursor = token.end;
    }
    if (cursor < result.length) {
      output += result.substring(cursor);
    }

    return output;
  }

  private mergeTokens(
    tokens: Array<{ start: number; end: number; replacement: string }>
  ): Array<{ start: number; end: number; replacement: string }> {
    if (tokens.length === 0) return [];

    const sorted = [...tokens].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number; replacement: string }> = [];

    for (const token of sorted) {
      if (merged.length === 0) {
        merged.push({ ...token });
        continue;
      }

      const last = merged[merged.length - 1];
      if (token.start >= last.end) {
        merged.push({ ...token });
      }
    }

    return merged;
  }

  private escapeAttr(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
