type Listener<T> = (data: T) => void;
type AnyListener = (...args: unknown[]) => void;

export class TypedEventEmitter<Events extends Record<string, unknown>> {
  private listeners: Map<keyof Events, Set<AnyListener>> = new Map();
  private onceListeners: Map<keyof Events, Set<AnyListener>> = new Map();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as AnyListener);

    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(listener as AnyListener);

    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener?: Listener<Events[K]>): void {
    if (!listener) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
      return;
    }

    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as AnyListener);
      if (listeners.size === 0) this.listeners.delete(event);
    }

    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      onceListeners.delete(listener as AnyListener);
      if (onceListeners.size === 0) this.onceListeners.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }

    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      for (const listener of onceListeners) {
        listener(data);
      }
      this.onceListeners.delete(event);
    }
  }

  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  listenerCount(event: keyof Events): number {
    const regular = this.listeners.get(event)?.size ?? 0;
    const once = this.onceListeners.get(event)?.size ?? 0;
    return regular + once;
  }

  eventNames(): Array<keyof Events> {
    const names = new Set<keyof Events>([
      ...this.listeners.keys(),
      ...this.onceListeners.keys(),
    ]);
    return Array.from(names);
  }
}
