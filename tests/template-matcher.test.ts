import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateMatcher } from '../templates/template-matcher';
import { UserTemplateDefinition } from '../templates/template-schema';

describe('TemplateMatcher', () => {
  let matcher: TemplateMatcher;

  beforeEach(() => {
    matcher = new TemplateMatcher();
  });

  const mockTemplate: UserTemplateDefinition = {
    id: 'test-api-handler',
    name: 'Test API Handler',
    category: 'api',
    tags: ['api', 'rest', 'express'],
    description: 'Handles API endpoints',
    complexity: 'medium',
    systemPrompt: 'You are an API expert',
    userPromptTemplate: 'Create API: {{path}}',
    validationCommands: [],
    allowedTools: ['read', 'write'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, escalateOnFailure: true },
    expectedOutput: 'code',
  };

  it('should add and retrieve templates', () => {
    matcher.addTemplate(mockTemplate);
    const result = matcher.getTemplate('test-api-handler');
    expect(result).toBeDefined();
    expect(result?.name).toBe('Test API Handler');
  });

  it('should match task to template by keyword', () => {
    matcher.addTemplate(mockTemplate);
    const results = matcher.matchTask('Create a REST API endpoint');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].templateId).toBe('test-api-handler');
  });

  it('should detect category from text', () => {
    const category = matcher.detectCategory('Create a REST API with Express');
    expect(category).toBe('api');
  });

  it('should search templates by query', () => {
    matcher.addTemplate(mockTemplate);
    const results = matcher.searchTemplates('api rest');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should filter by category', () => {
    matcher.addTemplate(mockTemplate);
    const results = matcher.searchTemplates('', { category: 'api' });
    expect(results.length).toBe(1);
  });

  it('should return stats', () => {
    matcher.addTemplate(mockTemplate);
    const stats = matcher.getStats();
    expect(stats.total).toBe(1);
    expect(stats.byCategory['api']).toBe(1);
  });
});
