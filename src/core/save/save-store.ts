// Save slots in IndexedDB with gzip (GDD 4 Speichern: manual slots + 3 rotating autosaves, export/import).
import type { SaveGame } from '../types/save';
import { SAVE_FORMAT_VERSION } from '../types/save';

const DB_NAME = 'sperrzone';
const STORE = 'saves';
export const AUTOSAVE_SLOTS = 3;

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Stores a save under `slot` (e.g. "manual-1", "auto-0"); state is gzip-compressed. */
export async function writeSave(slot: string, save: SaveGame): Promise<void> {
  const stored = { ...save, state: await gzip(save.state) };
  await tx('readwrite', (s) => s.put(stored, slot));
}

export async function readSave(slot: string): Promise<SaveGame | null> {
  const stored = (await tx('readonly', (s) => s.get(slot))) as SaveGame | undefined;
  if (!stored) return null;
  if (stored.meta.formatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`save "${slot}": format ${stored.meta.formatVersion}, expected ${SAVE_FORMAT_VERSION}`);
  }
  return { ...stored, state: await gunzip(stored.state) };
}

export async function listSaves(): Promise<{ slot: string; meta: SaveGame['meta'] }[]> {
  const keys = (await tx('readonly', (s) => s.getAllKeys())) as string[];
  const out: { slot: string; meta: SaveGame['meta'] }[] = [];
  for (const slot of keys) {
    const stored = (await tx('readonly', (s) => s.get(slot))) as SaveGame | undefined;
    if (stored) out.push({ slot, meta: stored.meta });
  }
  return out;
}

export async function deleteSave(slot: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

/** Rotating autosave: writes to the oldest of AUTOSAVE_SLOTS slots. */
export async function writeAutosave(save: SaveGame): Promise<string> {
  const saves = (await listSaves()).filter((s) => s.slot.startsWith('auto-'));
  let slot = `auto-${saves.length % AUTOSAVE_SLOTS}`;
  if (saves.length >= AUTOSAVE_SLOTS) {
    const oldest = saves.reduce((a, b) => (a.meta.savedAt < b.meta.savedAt ? a : b));
    slot = oldest.slot;
  }
  await writeSave(slot, save);
  return slot;
}

/** File export: JSON with base64 state (.sperrzone-save.json), shareable without a server. */
export async function exportSave(save: SaveGame): Promise<Blob> {
  const packed = await gzip(save.state);
  let bin = '';
  for (let i = 0; i < packed.length; i++) bin += String.fromCharCode(packed[i] as number);
  return new Blob([JSON.stringify({ ...save, state: btoa(bin) })], { type: 'application/json' });
}

export async function importSave(file: Blob): Promise<SaveGame> {
  const parsed = JSON.parse(await file.text()) as Omit<SaveGame, 'state'> & { state: string };
  if (parsed.meta?.formatVersion !== SAVE_FORMAT_VERSION) throw new Error('import: unsupported save format');
  const bin = atob(parsed.state);
  const packed = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) packed[i] = bin.charCodeAt(i);
  return { ...parsed, state: await gunzip(packed) };
}
