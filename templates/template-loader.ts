import { readFileSync, readdirSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join, extname, resolve } from 'path';
import { UserTemplateSchema, UserTemplateDefinition, TemplateValidationResult, TemplateValidationError, TemplateValidationWarning } from './template-schema';
import { TemplateMatcher } from './template-matcher';
import { EventEmitter } from 'events';

export class DynamicTemplateLoader extends EventEmitter {
  private matcher: TemplateMatcher;
  private loadedSources: Map<string, { path: string; loadedAt: Date; templateCount: number }> = new Map();
  private validationResults: Map<string, TemplateValidationResult> = new Map();
  private allTemplates: Map<string, UserTemplateDefinition> = new Map();
  private watchedDirs: Set<string> = new Set();
  private watchTimers: NodeJS.Timeout[] = [];

  constructor(private config?: { autoReload?: boolean; watchIntervalMs?: number }) {
    super();
    this.matcher = new TemplateMatcher();
  }

  getTemplateMatcher(): TemplateMatcher { return this.matcher; }
  getAllTemplates(): UserTemplateDefinition[] { return [...this.allTemplates.values()]; }
  getValidationResults(): Map<string, TemplateValidationResult> { return this.validationResults; }

  loadFromDirectory(dirPath: string): { loaded: number; errors: number; warnings: number } {
    let loaded = 0, errors = 0, warnings = 0;
    if (!existsSync(dirPath)) return { loaded: 0, errors: 1, warnings: 0 };
    const files = readdirSync(dirPath).filter(f => ['.json', '.json5', '.jsonc'].includes(extname(f).toLowerCase()));
    for (const file of files) {
      const result = this.loadFromFile(join(dirPath, file));
      loaded += result.loaded; errors += result.errors; warnings += result.warnings;
    }
    if (this.config?.autoReload) this.watchDirectory(dirPath);
    return { loaded, errors, warnings };
  }

  loadFromFile(filePath: string): { loaded: number; errors: number; warnings: number } {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const schema: UserTemplateSchema = JSON.parse(content);
      return this.loadFromSchema(schema, filePath);
    } catch (error) {
      this.validationResults.set(filePath, {
        valid: false,
        errors: [{ field: 'file', message: `Parse failed: ${error instanceof Error ? error.message : String(error)}`, severity: 'error' }],
        warnings: [],
      });
      return { loaded: 0, errors: 1, warnings: 0 };
    }
  }

  loadFromSchema(schema: UserTemplateSchema, sourcePath: string = 'inline'): { loaded: number; errors: number; warnings: number } {
    let loaded = 0, errors = 0, warnings = 0;
    const allErrors: TemplateValidationError[] = [];
    const allWarnings: TemplateValidationWarning[] = [];

    if (!schema.templates || !Array.isArray(schema.templates)) {
      allErrors.push({ field: 'templates', message: 'templates must be an array', severity: 'error' });
      this.validationResults.set(sourcePath, { valid: false, errors: allErrors, warnings: allWarnings });
      return { loaded: 0, errors: 1, warnings: 0 };
    }

    for (let i = 0; i < schema.templates.length; i++) {
      const template = schema.templates[i];
      const prefix = `templates[${i}]`;
      const result = this.validateTemplate(template, prefix);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);

      if (result.valid) {
        const existing = this.allTemplates.get(template.id);
        if (existing) {
          allWarnings.push({ field: `${prefix}.id`, message: `Duplicate template id "${template.id}" - overwriting`, severity: 'warning' });
        }
        this.allTemplates.set(template.id, template);
        this.matcher.addTemplate(template);
        loaded++;
        this.emit('template-loaded', { templateId: template.id, source: sourcePath });
      } else {
        errors += result.errors.length;
      }
      warnings += result.warnings.length;
    }

    this.loadedSources.set(sourcePath, { path: sourcePath, loadedAt: new Date(), templateCount: loaded });
    this.validationResults.set(sourcePath, { valid: errors === 0, errors: allErrors, warnings: allWarnings });
    return { loaded, errors, warnings };
  }

  private validateTemplate(template: UserTemplateDefinition, prefix: string): TemplateValidationResult {
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];

    if (!template.id || typeof template.id !== 'string') errors.push({ field: `${prefix}.id`, message: 'id is required and must be a string', severity: 'error' });
    else if (!/^[a-z0-9][a-z0-9_-]*$/.test(template.id)) errors.push({ field: `${prefix}.id`, message: 'id must be kebab-case (lowercase, numbers, hyphens)', severity: 'error' });

    if (!template.name || typeof template.name !== 'string') errors.push({ field: `${prefix}.name`, message: 'name is required', severity: 'error' });
    if (!template.category || typeof template.category !== 'string') errors.push({ field: `${prefix}.category`, message: 'category is required', severity: 'error' });
    if (!template.tags || !Array.isArray(template.tags) || template.tags.length === 0) warnings.push({ field: `${prefix}.tags`, message: 'At least one tag recommended for searchability', severity: 'warning' });
    if (!template.description || typeof template.description !== 'string') errors.push({ field: `${prefix}.description`, message: 'description is required', severity: 'error' });
    if (!template.systemPrompt || typeof template.systemPrompt !== 'string') errors.push({ field: `${prefix}.systemPrompt`, message: 'systemPrompt is required', severity: 'error' });
    else if (template.systemPrompt.length < 50) warnings.push({ field: `${prefix}.systemPrompt`, message: 'systemPrompt should be at least 50 characters for quality', severity: 'warning' });

    if (!template.userPromptTemplate || typeof template.userPromptTemplate !== 'string') errors.push({ field: `${prefix}.userPromptTemplate`, message: 'userPromptTemplate is required', severity: 'error' });
    if (!['low', 'medium', 'high', 'expert'].includes(template.complexity || '')) warnings.push({ field: `${prefix}.complexity`, message: 'complexity should be low/medium/high/expert', severity: 'warning' });
    if (!template.allowedTools || !Array.isArray(template.allowedTools)) errors.push({ field: `${prefix}.allowedTools`, message: 'allowedTools array is required', severity: 'error' });
    if (!template.retryPolicy) warnings.push({ field: `${prefix}.retryPolicy`, message: 'retryPolicy recommended', severity: 'warning' });

    return { valid: errors.length === 0, errors, warnings };
  }

  loadFromString(jsonString: string, sourceName: string = 'inline'): { loaded: number; errors: number; warnings: number } {
    try {
      const schema: UserTemplateSchema = JSON.parse(jsonString);
      return this.loadFromSchema(schema, sourceName);
    } catch (error) {
      this.validationResults.set(sourceName, {
        valid: false,
        errors: [{ field: 'json', message: `Parse error: ${error instanceof Error ? error.message : String(error)}`, severity: 'error' }],
        warnings: [],
      });
      return { loaded: 0, errors: 1, warnings: 0 };
    }
  }

  loadFromObject(schema: UserTemplateSchema, sourceName: string = 'object'): { loaded: number; errors: number; warnings: number } {
    return this.loadFromSchema(schema, sourceName);
  }

  removeTemplate(templateId: string): boolean {
    const template = this.allTemplates.get(templateId);
    if (template) {
      this.allTemplates.delete(templateId);
      this.matcher.removeTemplate(templateId);
      this.emit('template-removed', { templateId });
      return true;
    }
    return false;
  }

  reloadSource(sourcePath: string): { loaded: number; errors: number; warnings: number } {
    const oldTemplates = this.getTemplatesFromSource(sourcePath);
    for (const t of oldTemplates) {
      this.allTemplates.delete(t.id);
      this.matcher.removeTemplate(t.id);
    }
    return this.loadFromFile(sourcePath);
  }

  private getTemplatesFromSource(sourcePath: string): UserTemplateDefinition[] {
    const source = this.loadedSources.get(sourcePath);
    if (!source) return [];
    return [...this.allTemplates.values()].filter(t => {
      const validation = this.validationResults.get(sourcePath);
      return validation?.valid;
    });
  }

  watchDirectory(dirPath: string): void {
    const resolved = resolve(dirPath);
    if (this.watchedDirs.has(resolved)) return;
    this.watchedDirs.add(resolved);
    const interval = this.config?.watchIntervalMs || 5000;
    const timer = setInterval(() => {
      if (existsSync(resolved)) {
        this.loadFromDirectory(resolved);
      }
    }, interval);
    this.watchTimers.push(timer);
  }

  stopWatching(): void {
    for (const timer of this.watchTimers) clearInterval(timer);
    this.watchTimers = [];
    this.watchedDirs.clear();
  }

  getStats(): { totalTemplates: number; totalSources: number; validSources: number; invalidSources: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    for (const t of this.allTemplates.values()) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    let validSources = 0, invalidSources = 0;
    for (const v of this.validationResults.values()) {
      if (v.valid) validSources++; else invalidSources++;
    }
    return { totalTemplates: this.allTemplates.size, totalSources: this.loadedSources.size, validSources, invalidSources, byCategory };
  }

  exportAllAsJSON(): string {
    const schema: UserTemplateSchema = {
      version: '1.0',
      templates: [...this.allTemplates.values()],
    };
    return JSON.stringify(schema, null, 2);
  }

  generateSchemaDocumentation(): string {
    return `# User Template JSON Schema

## File Format
Each JSON file can contain one or more templates:

{
  "version": "1.0",
  "templates": [
    {
      "id": "my-custom-handler",
      "name": "My Custom Handler",
      "category": "api",
      "tags": ["api", "express", "custom"],
      "description": "Handles custom API logic",
      "complexity": "medium",
      "systemPrompt": "You are a custom API handler...",
      "userPromptTemplate": "TASK: {{taskDescription}}...",
      "validationCommands": [
        { "type": "typecheck", "command": "npx tsc --noEmit", "timeoutMs": 60000, "required": true }
      ],
      "allowedTools": ["read", "write", "edit", "bash"],
      "bashAllowedCommands": ["npm", "npx"],
      "retryPolicy": { "maxRetries": 3, "backoffMs": 5000, "escalateOnFailure": true },
      "expectedOutput": "code"
    }
  ]
}

## Required Fields
- id: kebab-case unique identifier
- name: human-readable name
- category: api|database|security|testing|frontend|backend|devops|mobile|ai|monitoring|performance|architecture|data|documentation|payment|search|notification
- tags: searchable keywords array
- description: 2-3 sentence description
- systemPrompt: detailed agent instructions (50+ chars recommended)
- userPromptTemplate: template with {{variable}} placeholders
- allowedTools: array of tool names

## Auto-Detection
The system auto-detects which template matches a task by:
1. Keyword matching against inverted index
2. Category scoring (multiple keyword hits = higher score)
3. Tag matching
4. Description similarity
5. Combined weighted scoring

## Categories
api, database, security, testing, frontend, backend, devops, mobile, ai, monitoring, performance, architecture, data, documentation, payment, search, notification
`;
  }
}
