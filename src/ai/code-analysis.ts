import { LLMProvider, Message } from './llm-provider';

export interface CodeExplanation {
  summary: string;
  details: string;
  complexity: 'low' | 'medium' | 'high';
  sideEffects: string[];
  dependencies: string[];
}

export interface Bug {
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
  suggestion: string;
  code: string;
}

export interface Improvement {
  category: 'performance' | 'readability' | 'maintainability' | 'security' | 'best_practice';
  severity: 'low' | 'medium' | 'high';
  line?: number;
  message: string;
  suggestion: string;
  originalCode?: string;
  improvedCode?: string;
}

export interface TestCase {
  name: string;
  description: string;
  input: string;
  expectedOutput: string;
  type: 'unit' | 'integration' | 'edge_case' | 'error_case';
}

export interface Documentation {
  summary: string;
  description: string;
  params: { name: string; type: string; description: string }[];
  returns: { type: string; description: string };
  throws: { type: string; condition: string }[];
  examples: { input: string; output: string }[];
  complexity: string;
}

export interface Optimization {
  original: string;
  optimized: string;
  explanation: string;
  performanceGain: string;
  line?: number;
}

export interface CodeReview {
  overallScore: number;
  summary: string;
  issues: Bug[];
  improvements: Improvement[];
  strengths: string[];
  suggestions: string[];
}

export class CodeAnalysis {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async explainCode(code: string, language: string): Promise<CodeExplanation> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code analysis expert. Analyze the given code and provide a comprehensive explanation. Return a JSON response:
{
  "summary": "one-line summary of what the code does",
  "detailed": "detailed explanation of the code logic and flow",
  "complexity": "low|medium|high",
  "sideEffects": ["list of side effects"],
  "dependencies": ["list of external dependencies used"]
}`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 1500 });
    const result = JSON.parse(response.content) as Omit<CodeExplanation, 'details'> & { detailed: string };
    return { ...result, details: result.detailed };
  }

  async findBugs(code: string, language: string): Promise<Bug[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code bug detection expert. Analyze the code for potential bugs, errors, and issues. Return a JSON array:
[{
  "severity": "error|warning|info",
  "line": 10,
  "column": 5,
  "message": "description of the bug",
  "suggestion": "how to fix it",
  "code": "the problematic code snippet"
}]`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.2, maxTokens: 2000 });
    return JSON.parse(response.content) as Bug[];
  }

  async suggestImprovements(code: string, language: string): Promise<Improvement[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code quality expert. Analyze the code and suggest improvements. Return a JSON array:
[{
  "category": "performance|readability|maintainability|security|best_practice",
  "severity": "low|medium|high",
  "line": 10,
  "message": "description of the improvement",
  "suggestion": "detailed suggestion",
  "originalCode": "original code snippet",
  "improvedCode": "improved code snippet"
}]`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 2000 });
    return JSON.parse(response.content) as Improvement[];
  }

  async generateTests(code: string, language: string): Promise<TestCase[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a test generation expert. Generate comprehensive test cases for the given code. Return a JSON array:
[{
  "name": "test case name",
  "description": "what this test verifies",
  "input": "test input or setup code",
  "expectedOutput": "expected result or assertion",
  "type": "unit|integration|edge_case|error_case"
}]`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode to test:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.4, maxTokens: 2500 });
    return JSON.parse(response.content) as TestCase[];
  }

  async generateDocs(code: string, language: string): Promise<Documentation> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a documentation expert. Generate comprehensive documentation for the given code. Return a JSON response:
{
  "summary": "one-line summary",
  "description": "detailed description",
  "params": [{"name": "paramName", "type": "paramType", "description": "description"}],
  "returns": {"type": "returnType", "description": "description"},
  "throws": [{"type": "ErrorType", "condition": "when this is thrown"}],
  "examples": [{"input": "example usage", "output": "expected output"}],
  "complexity": "time/space complexity description"
}`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 2000 });
    return JSON.parse(response.content) as Documentation;
  }

  async translateCode(code: string, fromLang: string, toLang: string): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code translation expert. Translate the given code from ${fromLang} to ${toLang}. Maintain the same logic and functionality. Use idiomatic code patterns for the target language. Return ONLY the translated code, no explanations.`,
      },
      {
        role: 'user',
        content: `Source language: ${fromLang}\nTarget language: ${toLang}\n\nSource code:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.2, maxTokens: 4096 });
    return this.extractCodeBlock(response.content, toLang);
  }

  async optimizeCode(code: string, language: string): Promise<Optimization[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a code optimization expert. Analyze the code and suggest optimizations. Return a JSON array:
[{
  "original": "original code snippet",
  "optimized": "optimized code snippet",
  "explanation": "why this is better",
  "performanceGain": "expected performance improvement",
  "line": 10
}]`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 2500 });
    return JSON.parse(response.content) as Optimization[];
  }

  async reviewCode(code: string, language: string): Promise<CodeReview> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a senior code reviewer. Perform a comprehensive code review. Return a JSON response:
{
  "overallScore": 85,
  "summary": "overall assessment",
  "issues": [{"severity": "error|warning|info", "line": 10, "column": 5, "message": "issue description", "suggestion": "fix suggestion", "code": "problematic code"}],
  "improvements": [{"category": "performance|readability|maintainability|security|best_practice", "severity": "low|medium|high", "line": 10, "message": "improvement description", "suggestion": "detailed suggestion", "originalCode": "original", "improvedCode": "improved"}],
  "strengths": ["what's done well"],
  "suggestions": ["general suggestions"]
}`,
      },
      {
        role: 'user',
        content: `Language: ${language}\n\nCode:\n${code}`,
      },
    ];

    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 3000 });
    return JSON.parse(response.content) as CodeReview;
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
