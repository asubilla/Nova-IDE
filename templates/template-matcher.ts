import { UserTemplateDefinition, TemplateMatchResult } from './template-schema';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  api: ['api', 'endpoint', 'route', 'rest', 'graphql', 'grpc', 'http', 'request', 'response', 'controller', 'handler', 'middleware'],
  database: ['database', 'db', 'sql', 'mysql', 'postgres', 'mongodb', 'redis', 'schema', 'migration', 'query', 'index', 'table', 'column', 'relation'],
  security: ['security', 'auth', 'authentication', 'authorization', 'encrypt', 'decrypt', 'token', 'jwt', 'oauth', 'password', 'hash', 'csrf', 'xss', 'vulnerability', 'penetration', 'audit'],
  testing: ['test', 'testing', 'unit test', 'integration test', 'e2e', 'spec', 'coverage', 'mock', 'stub', 'assert', 'expect', 'jest', 'vitest', 'mocha', 'cypress', 'playwright'],
  frontend: ['frontend', 'ui', 'component', 'react', 'vue', 'angular', 'svelte', 'css', 'style', 'layout', 'responsive', 'animation', 'dom', 'html', 'jsx', 'tsx'],
  backend: ['backend', 'server', 'api', 'express', 'fastify', 'nestjs', 'django', 'flask', 'fastapi', 'node', 'python', 'go', 'rust', 'java'],
  devops: ['docker', 'kubernetes', 'k8s', 'ci/cd', 'pipeline', 'deploy', 'terraform', 'ansible', 'helm', 'ci', 'cd', 'github actions', 'gitlab ci', 'jenkins'],
  mobile: ['mobile', 'ios', 'android', 'react native', 'flutter', 'swift', 'kotlin', 'app store', 'play store'],
  ai: ['ai', 'ml', 'machine learning', 'deep learning', 'neural', 'model', 'training', 'inference', 'llm', 'gpt', 'claude', 'prompt', 'rag', 'embedding', 'vector'],
  monitoring: ['monitor', 'logging', 'log', 'metrics', 'tracing', 'alert', 'dashboard', 'prometheus', 'grafana', 'observability'],
  performance: ['performance', 'optimize', 'cache', 'cdn', 'lazy load', 'bundle', 'minify', 'compress', 'benchmark', 'profiling', 'latency', 'throughput'],
  architecture: ['architecture', 'design pattern', 'microservice', 'monolith', 'serverless', 'event driven', 'cqrs', 'ddd', 'domain', 'aggregate', 'saga'],
  data: ['data', 'etl', 'pipeline', 'stream', 'batch', 'warehouse', 'lake', 'analytics', 'visualization', 'report'],
  documentation: ['documentation', 'docs', 'readme', 'api docs', 'jsdoc', 'typedoc', 'comment', 'changelog'],
  payment: ['payment', 'stripe', 'paypal', 'checkout', 'subscription', 'invoice', 'billing', 'refund'],
  search: ['search', 'elasticsearch', 'algolia', 'lucene', 'indexing', 'ranking', 'autocomplete', 'full text'],
  notification: ['notification', 'email', 'sms', 'push', 'alert', 'webhook', 'realtime'],
};

export class TemplateMatcher {
  private templates: Map<string, UserTemplateDefinition> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();

  addTemplate(template: UserTemplateDefinition): void {
    this.templates.set(template.id, template);
    this.indexTemplate(template);
  }

  removeTemplate(templateId: string): void {
    const template = this.templates.get(templateId);
    if (template) {
      this.deindexTemplate(template);
      this.templates.delete(templateId);
    }
  }

  private indexTemplate(template: UserTemplateDefinition): void {
    const allText = this.extractSearchableText(template);
    const words = this.tokenize(allText);
    
    for (const word of words) {
      if (!this.invertedIndex.has(word)) {
        this.invertedIndex.set(word, new Set());
      }
      this.invertedIndex.get(word)!.add(template.id);
    }

    const category = template.category.toLowerCase();
    if (!this.categoryIndex.has(category)) {
      this.categoryIndex.set(category, new Set());
    }
    this.categoryIndex.get(category)!.add(template.id);

    for (const tag of template.tags) {
      const lowerTag = tag.toLowerCase();
      if (!this.tagIndex.has(lowerTag)) {
        this.tagIndex.set(lowerTag, new Set());
      }
      this.tagIndex.get(lowerTag)!.add(template.id);
    }

    for (const keyword of CATEGORY_KEYWORDS[category] || []) {
      if (!this.invertedIndex.has(keyword)) {
        this.invertedIndex.set(keyword, new Set());
      }
      this.invertedIndex.get(keyword)!.add(template.id);
    }
  }

  private deindexTemplate(template: UserTemplateDefinition): void {
    const allText = this.extractSearchableText(template);
    const words = this.tokenize(allText);
    
    for (const word of words) {
      this.invertedIndex.get(word)?.delete(template.id);
    }
    this.categoryIndex.get(template.category.toLowerCase())?.delete(template.id);
    for (const tag of template.tags) {
      this.tagIndex.get(tag.toLowerCase())?.delete(template.id);
    }
  }

  matchTask(taskDescription: string, topN: number = 5): TemplateMatchResult[] {
    const taskWords = this.tokenize(taskDescription);
    const scores = new Map<string, { score: number; matchedKeywords: string[]; matchedTags: string[] }>();

    for (const word of taskWords) {
      const matchingTemplateIds = this.invertedIndex.get(word);
      if (matchingTemplateIds) {
        for (const templateId of matchingTemplateIds) {
          if (!scores.has(templateId)) {
            scores.set(templateId, { score: 0, matchedKeywords: [], matchedTags: [] });
          }
          const entry = scores.get(templateId)!;
          entry.score += 1;
          entry.matchedKeywords.push(word);
        }
      }
    }

    const category = this.detectCategory(taskDescription);
    if (category) {
      const categoryTemplates = this.categoryIndex.get(category);
      if (categoryTemplates) {
        for (const templateId of categoryTemplates) {
          if (!scores.has(templateId)) {
            scores.set(templateId, { score: 0, matchedKeywords: [], matchedTags: [] });
          }
          scores.get(templateId)!.score += 3;
        }
      }
    }

    for (const [tag, templateIds] of this.tagIndex) {
      if (taskDescription.toLowerCase().includes(tag)) {
        for (const templateId of templateIds) {
          if (!scores.has(templateId)) {
            scores.set(templateId, { score: 0, matchedKeywords: [], matchedTags: [] });
          }
          const entry = scores.get(templateId)!;
          entry.score += 2;
          entry.matchedTags.push(tag);
        }
      }
    }

    for (const [templateId, entry] of scores) {
      const template = this.templates.get(templateId);
      if (template) {
        const descWords = this.tokenize(template.description);
        const overlap = taskWords.filter(w => descWords.includes(w));
        entry.score += overlap.length * 0.5;
      }
    }

    const results: TemplateMatchResult[] = [];
    for (const [templateId, entry] of scores) {
      const template = this.templates.get(templateId);
      if (template) {
        results.push({
          templateId,
          templateName: template.name,
          score: entry.score,
          matchedKeywords: [...new Set(entry.matchedKeywords)],
          matchedTags: entry.matchedTags,
          category: template.category,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  detectCategory(text: string): string | null {
    const lowerText = text.toLowerCase();
    let bestCategory: string | null = null;
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return bestScore >= 2 ? bestCategory : null;
  }

  searchTemplates(query: string, filters?: { category?: string; tags?: string[]; complexity?: string }): TemplateMatchResult[] {
    let candidates = [...this.templates.values()];

    if (filters?.category) {
      candidates = candidates.filter(t => t.category === filters.category);
    }
    if (filters?.tags && filters.tags.length > 0) {
      candidates = candidates.filter(t => filters.tags!.some(tag => t.tags.includes(tag)));
    }
    if (filters?.complexity) {
      candidates = candidates.filter(t => t.complexity === filters.complexity);
    }

    const queryWords = this.tokenize(query);
    const results: TemplateMatchResult[] = [];

    for (const template of candidates) {
      const templateWords = this.tokenize(
        `${template.name} ${template.description} ${template.tags.join(' ')} ${template.category}`
      );
      const overlap = queryWords.filter(w => templateWords.includes(w));
      const score = overlap.length;

      results.push({
        templateId: template.id,
        templateName: template.name,
        score,
        matchedKeywords: overlap,
        matchedTags: template.tags.filter(t => query.toLowerCase().includes(t.toLowerCase())),
        category: template.category,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  getTemplatesByCategory(category: string): UserTemplateDefinition[] {
    const ids = this.categoryIndex.get(category.toLowerCase());
    if (!ids) return [];
    return [...ids].map(id => this.templates.get(id)!).filter(Boolean);
  }

  getTemplatesByTag(tag: string): UserTemplateDefinition[] {
    const ids = this.tagIndex.get(tag.toLowerCase());
    if (!ids) return [];
    return [...ids].map(id => this.templates.get(id)!).filter(Boolean);
  }

  getAllTemplates(): UserTemplateDefinition[] {
    return [...this.templates.values()];
  }

  getTemplate(templateId: string): UserTemplateDefinition | undefined {
    return this.templates.get(templateId);
  }

  getStats(): { total: number; byCategory: Record<string, number>; byComplexity: Record<string, number>; uniqueTags: number } {
    const byCategory: Record<string, number> = {};
    const byComplexity: Record<string, number> = {};
    const allTags = new Set<string>();

    for (const template of this.templates.values()) {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;
      byComplexity[template.complexity] = (byComplexity[template.complexity] || 0) + 1;
      for (const tag of template.tags) {
        allTags.add(tag.toLowerCase());
      }
    }

    return {
      total: this.templates.size,
      byCategory,
      byComplexity,
      uniqueTags: allTags.size,
    };
  }

  private extractSearchableText(template: UserTemplateDefinition): string {
    return [
      template.id,
      template.name,
      template.category,
      template.subcategory || '',
      template.description,
      template.tags.join(' '),
      template.complexity,
    ].join(' ');
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }
}
