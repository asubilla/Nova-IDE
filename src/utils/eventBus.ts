type EventMap = Record<string, unknown>;

type Listener<T> = (data: T) => void;

export class EventBus<Events extends EventMap = EventMap> {
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);

    return () => {
      this.off(event, listener);
    };
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Listener<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.error(`Error in event listener for "${String(event)}":`, err);
        }
      });
    }
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const wrapper: Listener<Events[K]> = (data) => {
      listener(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export interface NovaEvents {
  'file:open': { path: string };
  'file:save': { path: string };
  'agent:start': { agentId: string };
  'agent:stop': { agentId: string };
  'agent:message': { agentId: string; content: string };
  'orchestration:start': { patternId: string };
  'orchestration:complete': { patternId: string; result: unknown };
  'theme:change': { theme: string };
  'settings:change': { key: string; value: unknown };
}

export const eventBus = new EventBus<NovaEvents>();
