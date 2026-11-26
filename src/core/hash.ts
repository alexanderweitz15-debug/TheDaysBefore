// FNV-1a 32 bit over raw bytes. Used for determinism checks, replays and desync detection.

export type HashState = { value: number };

export const createHash = (): HashState => ({ value: 0x811c9dc5 });

export function hashBytes(h: HashState, bytes: Uint8Array): HashState {
  let v = h.value;
  for (let i = 0; i < bytes.length; i++) {
    v ^= bytes[i] as number;
    v = Math.imul(v, 0x01000193) >>> 0;
  }
  h.value = v;
  return h;
}

export function hashView(h: HashState, view: ArrayBufferView): HashState {
  return hashBytes(h, new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

export function hashU32(h: HashState, n: number): HashState {
  const tmp = new Uint32Array([n >>> 0]);
  return hashView(h, tmp);
}

export const hashHex = (h: HashState): string => h.value.toString(16).padStart(8, '0');
