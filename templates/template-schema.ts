export interface UserTemplateSchema {
  $schema?: string;
  version: string;
  templates: UserTemplateDefinition[];
}

export interface UserTemplateDefinition {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  tags: string[];
  description: string;
  complexity: 'low' | 'medium' | 'high' | 'expert';
  systemPrompt: string;
  userPromptTemplate: string;
  validationCommands: ValidationCommand[];
  allowedTools: string[];
  blockedTools?: string[];
  bashAllowedCommands?: string[];
  retryPolicy: { maxRetries: number; backoffMs: number; escalateOnFailure: boolean };
  expectedOutput: 'code' | 'json' | 'markdown' | 'mixed';
  contextPatterns?: string[];
  conflictsWith?: string[];
  compatibleWith?: string[];
  estimatedDurationMs?: number;
  resourceProfile?: { memoryMB: number; cpuPercent: number };
}

export interface ValidationCommand {
  type: string;
  command: string;
  timeoutMs: number;
  required: boolean;
}

export interface TemplateMatchResult {
  templateId: string;
  templateName: string;
  score: number;
  matchedKeywords: string[];
  matchedTags: string[];
  category: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
}

export interface TemplateValidationError {
  field: string;
  message: string;
  severity: 'error';
}

export interface TemplateValidationWarning {
  field: string;
  message: string;
  severity: 'warning';
}
