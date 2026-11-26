// Versioned JSON in localStorage with migrations and zod validation. Used for settings (GDD section 4, 13).
import type { z } from 'zod';

export interface VersionedSpec<T> {
  key: string;
  version: number;
  schema: z.ZodType<T>;
  defaults: T;
  /** migrations[n] turns data of version n into version n + 1. */
  migrations?: Record<number, (old: unknown) => unknown>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore = (): KeyValueStore => {
  const m: Record<string, string> = {};
  return {
    getItem: (k) => m[k] ?? null,
    setItem: (k, v) => {
      m[k] = v;
    },
  };
};

export function defaultStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in sandboxed or private contexts.
  }
  return memoryStore();
}

/** Loads and migrates. Invalid or unknown data falls back to defaults merged with whatever still validates. */
export function loadVersioned<T>(spec: VersionedSpec<T>, store: KeyValueStore = defaultStore()): T {
  let raw: string | null = null;
  try {
    raw = store.getItem(spec.key);
  } catch {
    return spec.defaults;
  }
  if (!raw) return spec.defaults;
  try {
    const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
    let v = typeof parsed.v === 'number' ? parsed.v : 0;
    let data = parsed.data;
    while (v < spec.version) {
      const m = spec.migrations?.[v];
      if (!m) return spec.defaults;
      data = m(data);
      v++;
    }
    const merged = { ...(spec.defaults as object), ...(data as object) };
    const result = spec.schema.safeParse(merged);
    return result.success ? result.data : spec.defaults;
  } catch {
    return spec.defaults;
  }
}

export function saveVersioned<T>(
  spec: VersionedSpec<T>,
  value: T,
  store: KeyValueStore = defaultStore(),
): void {
  try {
    store.setItem(spec.key, JSON.stringify({ v: spec.version, data: value }));
  } catch {
    // Quota or access errors must never crash the game.
  }
}
