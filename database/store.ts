import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface StoreOptions {
  dataDir: string;
  autoSave?: boolean;
  autoSaveDelayMs?: number;
}

export class Store<T extends { id: string }> {
  private data: Map<string, T> = new Map();
  private filePath: string;
  private autoSave: boolean;
  private autoSaveDelayMs: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    private collectionName: string,
    private options: StoreOptions,
  ) {
    this.filePath = path.join(options.dataDir, `${collectionName}.json`);
    this.autoSave = options.autoSave ?? true;
    this.autoSaveDelayMs = options.autoSaveDelayMs ?? 500;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: T[] = JSON.parse(raw);
        for (const item of items) {
          this.data.set(item.id, item);
        }
      }
    } catch {
      this.data = new Map();
    }
  }

  private scheduleSave(): void {
    if (!this.autoSave) return;
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.flush();
    }, this.autoSaveDelayMs);
  }

  flush(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const items = Array.from(this.data.values());
      fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      console.error(`Failed to flush store "${this.collectionName}":`, err);
    }
  }

  get(id: string): T | undefined {
    return this.data.get(id);
  }

  getAll(): T[] {
    return Array.from(this.data.values());
  }

  query(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  insert(record: T): T {
    this.data.set(record.id, record);
    this.scheduleSave();
    return record;
  }

  update(id: string, updates: Partial<T>): T | undefined {
    const existing = this.data.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id };
    this.data.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  upsert(record: T): T {
    this.data.set(record.id, record);
    this.scheduleSave();
    return record;
  }

  delete(id: string): boolean {
    const existed = this.data.delete(id);
    if (existed) this.scheduleSave();
    return existed;
  }

  count(): number {
    return this.data.size;
  }

  exists(id: string): boolean {
    return this.data.has(id);
  }

  clear(): void {
    this.data.clear();
    this.scheduleSave();
  }

  static generateId(): string {
    return randomUUID();
  }

  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) this.flush();
  }
}

export function createStore<T extends { id: string }>(
  collectionName: string,
  options: StoreOptions,
): Store<T> {
  return new Store<T>(collectionName, options);
}
