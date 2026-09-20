export function deepClone<T>(obj: T, seen?: WeakMap<object, unknown>): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as unknown as T;
  }

  if (obj instanceof Map) {
    const mapCopy = new Map();
    seen = seen || new WeakMap();
    seen.set(obj as object, mapCopy);
    for (const [key, value] of obj) {
      mapCopy.set(deepClone(key, seen), deepClone(value, seen));
    }
    return mapCopy as unknown as T;
  }

  if (obj instanceof Set) {
    const setCopy = new Set();
    seen = seen || new WeakMap();
    seen.set(obj as object, setCopy);
    for (const value of obj) {
      setCopy.add(deepClone(value, seen));
    }
    return setCopy as unknown as T;
  }

  seen = seen || new WeakMap();
  if (seen.has(obj as object)) {
    return seen.get(obj as object) as T;
  }

  const proto = Object.getPrototypeOf(obj);
  const clone: Record<string, unknown> = Object.create(proto);
  seen.set(obj as object, clone);

  for (const key of Object.keys(obj as object)) {
    (clone as Record<string, unknown>)[key] = deepClone(
      (obj as Record<string, unknown>)[key],
      seen
    );
  }

  return clone as T;
}
