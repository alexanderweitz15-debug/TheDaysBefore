import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type KeyValueStore,
  loadVersioned,
  saveVersioned,
  type VersionedSpec,
} from '../../src/core/save/versioned-storage';

interface Settings {
  volume: number;
  lang: string;
}

const schema = z.object({ volume: z.number().min(0).max(1), lang: z.string() });
const defaults: Settings = { volume: 0.5, lang: 'de' };

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const specV1: VersionedSpec<Settings> = {
  key: 'settings',
  version: 1,
  schema,
  defaults,
  migrations: {
    // v0 stored volume as percent and had no lang.
    0: (old) => ({ volume: (old as { volume: number }).volume / 100 }),
  },
};

describe('versioned-storage', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadVersioned(specV1, memStore())).toEqual(defaults);
  });

  it('roundtrips a saved value', () => {
    const store = memStore();
    saveVersioned(specV1, { volume: 0.9, lang: 'en' }, store);
    expect(JSON.parse(store.data.settings as string)).toEqual({ v: 1, data: { volume: 0.9, lang: 'en' } });
    expect(loadVersioned(specV1, store)).toEqual({ volume: 0.9, lang: 'en' });
  });

  it('migrates v0 (no version field) to v1', () => {
    const store = memStore({ settings: JSON.stringify({ data: { volume: 80 } }) });
    expect(loadVersioned(specV1, store)).toEqual({ volume: 0.8, lang: 'de' });
  });

  it('migrates explicit v0 and chains several migrations', () => {
    const spec: VersionedSpec<Settings> = {
      ...specV1,
      version: 2,
      migrations: {
        ...specV1.migrations,
        1: (old) => ({ ...(old as object), lang: 'fr' }),
      },
    };
    const store = memStore({ settings: JSON.stringify({ v: 0, data: { volume: 50 } }) });
    expect(loadVersioned(spec, store)).toEqual({ volume: 0.5, lang: 'fr' });
  });

  it('missing fields are filled from defaults', () => {
    const store = memStore({ settings: JSON.stringify({ v: 1, data: { volume: 0.2 } }) });
    expect(loadVersioned(specV1, store)).toEqual({ volume: 0.2, lang: 'de' });
  });

  it('broken JSON falls back to defaults', () => {
    expect(loadVersioned(specV1, memStore({ settings: '{not json' }))).toEqual(defaults);
  });

  it('JSON null or primitive falls back to defaults', () => {
    expect(loadVersioned(specV1, memStore({ settings: 'null' }))).toEqual(defaults);
    expect(loadVersioned(specV1, memStore({ settings: '42' }))).toEqual(defaults);
  });

  it('invalid field values fall back to defaults', () => {
    const store = memStore({ settings: JSON.stringify({ v: 1, data: { volume: 7, lang: 'en' } }) });
    expect(loadVersioned(specV1, store)).toEqual(defaults);
    const wrongType = memStore({ settings: JSON.stringify({ v: 1, data: { volume: 'loud' } }) });
    expect(loadVersioned(specV1, wrongType)).toEqual(defaults);
  });

  it('missing migration falls back to defaults', () => {
    const spec: VersionedSpec<Settings> = { ...specV1, migrations: {} };
    const store = memStore({ settings: JSON.stringify({ v: 0, data: { volume: 50 } }) });
    expect(loadVersioned(spec, store)).toEqual(defaults);
    const noMap: VersionedSpec<Settings> = { key: 'settings', version: 1, schema, defaults };
    expect(loadVersioned(noMap, store)).toEqual(defaults);
  });

  it('a throwing migration falls back to defaults', () => {
    const spec: VersionedSpec<Settings> = {
      ...specV1,
      migrations: {
        0: () => {
          throw new Error('boom');
        },
      },
    };
    const store = memStore({ settings: JSON.stringify({ v: 0, data: {} }) });
    expect(loadVersioned(spec, store)).toEqual(defaults);
  });

  it('a throwing store does not crash load or save', () => {
    const bad: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadVersioned(specV1, bad)).toEqual(defaults);
    expect(() => saveVersioned(specV1, defaults, bad)).not.toThrow();
  });

  it('keys are isolated', () => {
    const store = memStore();
    saveVersioned(specV1, { volume: 1, lang: 'en' }, store);
    expect(loadVersioned({ ...specV1, key: 'other' }, store)).toEqual(defaults);
  });
});
