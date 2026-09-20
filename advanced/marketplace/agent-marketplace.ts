export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  downloads: number;
  rating: number;
  reviews: { userId: string; rating: number; comment: string; date: Date }[];
  definition: any;
  license: string;
  repository?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentMarketplace {
  private templates: Map<string, MarketplaceTemplate> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private userDownloads: Map<string, Set<string>> = new Map();

  publishTemplate(template: Omit<MarketplaceTemplate, 'id' | 'downloads' | 'rating' | 'reviews' | 'createdAt' | 'updatedAt'>): MarketplaceTemplate {
    const id = `mp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const full: MarketplaceTemplate = { ...template, id, downloads: 0, rating: 0, reviews: [], createdAt: new Date(), updatedAt: new Date() };
    this.templates.set(id, full);
    if (!this.categoryIndex.has(template.category)) this.categoryIndex.set(template.category, new Set());
    this.categoryIndex.get(template.category)!.add(id);
    for (const tag of template.tags) { if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set()); this.tagIndex.get(tag)!.add(id); }
    return full;
  }

  searchTemplates(query: string, options?: { category?: string; tags?: string[]; minRating?: number; sortBy?: 'rating' | 'downloads' | 'newest'; limit?: number }): MarketplaceTemplate[] {
    let results = [...this.templates.values()];
    if (options?.category) results = results.filter(t => t.category === options.category);
    if (options?.tags) results = results.filter(t => options!.tags!.some(tag => t.tags.includes(tag)));
    if (options?.minRating) results = results.filter(t => t.rating >= options.minRating!);
    if (query) { const lower = query.toLowerCase(); results = results.filter(t => t.name.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower) || t.tags.some(tag => tag.toLowerCase().includes(lower))); }
    const sortBy = options?.sortBy || 'rating';
    if (sortBy === 'rating') results.sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'downloads') results.sort((a, b) => b.downloads - a.downloads);
    else if (sortBy === 'newest') results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results.slice(0, options?.limit || 20);
  }

  downloadTemplate(templateId: string, userId: string): MarketplaceTemplate | null {
    const template = this.templates.get(templateId);
    if (!template) return null;
    template.downloads++;
    if (!this.userDownloads.has(userId)) this.userDownloads.set(userId, new Set());
    this.userDownloads.get(userId)!.add(templateId);
    return template;
  }

  addReview(templateId: string, userId: string, rating: number, comment: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) return false;
    const existingIdx = template.reviews.findIndex(r => r.userId === userId);
    if (existingIdx >= 0) template.reviews[existingIdx] = { userId, rating, comment, date: new Date() };
    else template.reviews.push({ userId, rating, comment, date: new Date() });
    template.rating = template.reviews.reduce((s, r) => s + r.rating, 0) / template.reviews.length;
    return true;
  }

  getTemplate(id: string): MarketplaceTemplate | undefined { return this.templates.get(id); }
  getUserDownloads(userId: string): MarketplaceTemplate[] { const ids = this.userDownloads.get(userId); if (!ids) return []; return [...ids].map(id => this.templates.get(id)!).filter(Boolean); }
  getTopRated(limit?: number): MarketplaceTemplate[] { return [...this.templates.values()].sort((a, b) => b.rating - a.rating).slice(0, limit || 10); }
  getMostDownloaded(limit?: number): MarketplaceTemplate[] { return [...this.templates.values()].sort((a, b) => b.downloads - a.downloads).slice(0, limit || 10); }

  getStats(): { totalTemplates: number; totalDownloads: number; avgRating: number; categories: Record<string, number> } {
    const categories: Record<string, number> = {}; let totalDownloads = 0, totalRating = 0;
    for (const t of this.templates.values()) { categories[t.category] = (categories[t.category] || 0) + 1; totalDownloads += t.downloads; totalRating += t.rating; }
    return { totalTemplates: this.templates.size, totalDownloads, avgRating: this.templates.size ? totalRating / this.templates.size : 0, categories };
  }
}
