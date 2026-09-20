export interface PoolStats {
  total: number;
  available: number;
  inUse: number;
  created: number;
  destroyed: number;
}

export interface PoolOptions<T> {
  minSize: number;
  maxSize: number;
  factory: () => T;
  destroy?: (obj: T) => void;
  validate?: (obj: T) => boolean;
}

export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private options: PoolOptions<T>;
  private created = 0;
  private destroyed = 0;

  constructor(options: PoolOptions<T>) {
    this.options = { minSize: options.minSize ?? 0, maxSize: options.maxSize ?? 100, factory: options.factory, destroy: options.destroy, validate: options.validate };
    this.preallocate();
  }

  private preallocate(): void {
    for (let i = 0; i < this.options.minSize; i++) {
      const obj = this.options.factory();
      this.available.push(obj);
      this.created++;
    }
  }

  acquire(): T {
    let obj: T | undefined;

    while (this.available.length > 0) {
      obj = this.available.pop()!;
      if (this.options.validate && !this.options.validate(obj)) {
        this.destroyObject(obj);
        obj = undefined;
      } else {
        break;
      }
    }

    if (!obj) {
      const total = this.available.length + this.inUse.size;
      if (total >= this.options.maxSize) {
        throw new Error(`Pool exhausted: max size ${this.options.maxSize} reached`);
      }
      obj = this.options.factory();
      this.created++;
    }

    this.inUse.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUse.has(obj)) return;
    this.inUse.delete(obj);

    if (this.available.length + 1 <= this.options.maxSize) {
      this.available.push(obj);
    } else {
      this.destroyObject(obj);
    }
  }

  getStats(): PoolStats {
    return {
      total: this.available.length + this.inUse.size,
      available: this.available.length,
      inUse: this.inUse.size,
      created: this.created,
      destroyed: this.destroyed,
    };
  }

  resize(newMaxSize: number): void {
    this.options.maxSize = newMaxSize;
    while (this.available.length > newMaxSize) {
      const obj = this.available.pop();
      if (obj !== undefined) {
        this.destroyObject(obj);
      }
    }
  }

  drain(): void {
    for (const obj of this.available) {
      this.destroyObject(obj);
    }
    this.available = [];
  }

  private destroyObject(obj: T): void {
    if (this.options.destroy) {
      this.options.destroy(obj);
    }
    this.destroyed++;
  }
}
