import { EventEmitter } from 'events';

export interface KnowledgeEntry {
  id: string;
  type: 'pattern' | 'solution' | 'error' | 'best-practice' | 'anti-pattern' | 'lesson' | 'context' | 'decision';
  title: string;
  content: string;
  tags: string[];
  category: string;
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  relevance: number;
  metadata: Record<string, any>;
}

export interface KnowledgeQuery {
  text?: string;
  tags?: string[];
  category?: string;
  type?: string;
  minConfidence?: number;
  limit?: number;
}

export interface KnowledgeStats {
  totalEntries: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  topTags: { tag: string; count: number }[];
  avgConfidence: number;
}

export class KnowledgeBase extends EventEmitter {
  private entries: Map<string, KnowledgeEntry> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();

  constructor(private config?: { maxEntries?: number; decayRate?: number }) { super(); }

  addEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'relevance'>): KnowledgeEntry {
    const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEntry: KnowledgeEntry = { ...entry, id, createdAt: new Date(), updatedAt: new Date(), accessCount: 0, relevance: 1 };
    if (this.config?.maxEntries && this.entries.size >= this.config.maxEntries) this.evictOldEntries();
    this.entries.set(id, fullEntry);
    this.indexEntry(fullEntry);
    this.emit('entry-added', { id, type: entry.type, category: entry.category });
    return fullEntry;
  }

  updateEntry(id: string, updates: Partial<KnowledgeEntry>): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.deindexEntry(entry);
    Object.assign(entry, updates, { updatedAt: new Date() });
    this.indexEntry(entry);
    return true;
  }

  deleteEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.deindexEntry(entry);
    this.entries.delete(id);
    this.emit('entry-deleted', { id });
    return true;
  }

  query(query: KnowledgeQuery): KnowledgeEntry[] {
    let candidates = [...this.entries.values()];

    if (query.type) candidates = candidates.filter(e => e.type === query.type);
    if (query.category) candidates = candidates.filter(e => e.category === query.category);
    if (query.minConfidence) candidates = candidates.filter(e => e.confidence >= query.minConfidence!);
    if (query.tags && query.tags.length > 0) candidates = candidates.filter(e => query.tags!.some(t => e.tags.includes(t)));

    if (query.text) {
      const queryWords = this.tokenize(query.text);
      for (const entry of candidates) {
        const entryWords = this.tokenize(`${entry.title} ${entry.content} ${entry.tags.join(' ')}`);
        const overlap = queryWords.filter(w => entryWords.includes(w));
        entry.relevance = overlap.length / queryWords.length;
        entry.accessCount++;
      }
      candidates.sort((a, b) => b.relevance - a.relevance);
    }

    return candidates.slice(0, query.limit || 10);
  }

  findSimilar(entryId: string, limit?: number): KnowledgeEntry[] {
    const entry = this.entries.get(entryId);
    if (!entry) return [];
    return this.query({ text: `${entry.title} ${entry.content}`, tags: entry.tags, category: entry.category, limit: (limit || 5) + 1 }).filter(e => e.id !== entryId);
  }

  findByName(name: string): KnowledgeEntry[] {
    const lower = name.toLowerCase();
    return [...this.entries.values()].filter(e => e.title.toLowerCase().includes(lower));
  }

  findByTag(tag: string): KnowledgeEntry[] {
    const ids = this.tagIndex.get(tag.toLowerCase());
    if (!ids) return [];
    return [...ids].map(id => this.entries.get(id)!).filter(Boolean);
  }

  private indexEntry(entry: KnowledgeEntry): void {
    const words = this.tokenize(`${entry.title} ${entry.content}`);
    for (const word of words) {
      if (!this.invertedIndex.has(word)) this.invertedIndex.set(word, new Set());
      this.invertedIndex.get(word)!.add(entry.id);
    }
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(entry.id);
    }
    if (!this.categoryIndex.has(entry.category)) this.categoryIndex.set(entry.category, new Set());
    this.categoryIndex.get(entry.category)!.add(entry.id);
    if (!this.typeIndex.has(entry.type)) this.typeIndex.set(entry.type, new Set());
    this.typeIndex.get(entry.type)!.add(entry.id);
  }

  private deindexEntry(entry: KnowledgeEntry): void {
    const words = this.tokenize(`${entry.title} ${entry.content}`);
    for (const word of words) this.invertedIndex.get(word)?.delete(entry.id);
    for (const tag of entry.tags) this.tagIndex.get(tag)?.delete(entry.id);
    this.categoryIndex.get(entry.category)?.delete(entry.id);
    this.typeIndex.get(entry.type)?.delete(entry.id);
  }

  private tokenize(text: string): string[] { return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2); }

  private evictOldEntries(): void {
    const sorted = [...this.entries.values()].sort((a, b) => (a.accessCount - b.accessCount) || (a.relevance - b.relevance));
    const toRemove = Math.floor(this.entries.size * 0.1);
    for (let i = 0; i < toRemove; i++) this.deleteEntry(sorted[i].id);
  }

  mergeKnowledge(other: KnowledgeBase): number {
    let merged = 0;
    for (const entry of other.getAllEntries()) {
      const existing = this.findByName(entry.title);
      if (existing.length > 0) {
        const best = existing[0];
        if (entry.confidence > best.confidence) { this.updateEntry(best.id, { content: entry.content, confidence: entry.confidence }); merged++; }
      } else { this.addEntry(entry); merged++; }
    }
    return merged;
  }

  exportEntries(): KnowledgeEntry[] { return [...this.entries.values()]; }
  importEntries(entries: KnowledgeEntry[]): void { for (const entry of entries) this.addEntry(entry); }
  getAllEntries(): KnowledgeEntry[] { return [...this.entries.values()]; }
  getEntry(id: string): KnowledgeEntry | undefined { return this.entries.get(id); }

  getStats(): KnowledgeStats {
    const byType: Record<string, number> = {}; const byCategory: Record<string, number> = {};
    const tagCounts = new Map<string, number>(); let totalConfidence = 0;
    for (const entry of this.entries.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      totalConfidence += entry.confidence;
      for (const tag of entry.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));
    return { totalEntries: this.entries.size, byType, byCategory, topTags, avgConfidence: this.entries.size ? totalConfidence / this.entries.size : 0 };
  }

  destroy(): void { this.entries.clear(); this.invertedIndex.clear(); this.tagIndex.clear(); this.categoryIndex.clear(); this.typeIndex.clear(); this.removeAllListeners(); }
}
