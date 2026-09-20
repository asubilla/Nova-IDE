interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

export interface LRUCacheOptions {
  maxSize: number;
  ttl: number;
}

const DEFAULT_OPTIONS: LRUCacheOptions = {
  maxSize: 1000,
  ttl: 300_000,
};

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private options: LRUCacheOptions;

  constructor(options?: Partial<LRUCacheOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get size(): number {
    return this.cache.size;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    const effectiveTtl = ttl ?? this.options.ttl;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + effectiveTtl,
      lastAccessed: Date.now(),
    });

    this.evict();
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  entries(): Array<[K, V]> {
    const result: Array<[K, V]> = [];
    for (const [key, entry] of this.cache) {
      if (Date.now() <= entry.expiresAt) {
        result.push([key, entry.value]);
      }
    }
    return result;
  }

  keys(): K[] {
    return this.entries().map(([key]) => key);
  }

  values(): V[] {
    return this.entries().map(([, value]) => value);
  }

  resize(newMaxSize: number): void {
    this.options.maxSize = newMaxSize;
    this.evict();
  }

  private evict(): void {
    while (this.cache.size > this.options.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      } else {
        break;
      }
    }
  }
}
