// Compressed binary blocks for the save codec. Byte run-length coding (varint tokens: even = literal of n/2
// bytes, odd = run of n>>1 copies of the next byte). Multi-byte arrays may instead store element deltas split
// into byte planes, which turns smooth distance fields and prefix sums into long runs. The smaller wins.
// Block: byteLength u32, mode u8, width u8, 2 pad bytes, encoded length u32, data.

const HEADER = 12;
const MIN_RUN = 4;
const MODE_RLE = 0;
const MODE_DELTA = 1;

function writeVarint(out: Uint8Array, pos: number, v: number): number {
  let x = v;
  while (x >= 0x80) {
    out[pos++] = (x & 0x7f) | 0x80;
    x = Math.floor(x / 128);
  }
  out[pos++] = x;
  return pos;
}

/** Run-length codes src into out from pos; returns the end position. out needs src.length * 1.25 + 16 bytes. */
function rle(src: Uint8Array, out: Uint8Array, pos0: number): number {
  const n = src.length;
  let pos = pos0;
  let lit = 0;
  let i = 0;
  const flush = (end: number): void => {
    if (end <= lit) return;
    pos = writeVarint(out, pos, (end - lit) * 2);
    out.set(src.subarray(lit, end), pos);
    pos += end - lit;
  };
  while (i < n) {
    const b = src[i] as number;
    let j = i + 1;
    while (j < n && src[j] === b) j++;
    if (j - i >= MIN_RUN) {
      flush(i);
      pos = writeVarint(out, pos, (j - i) * 2 + 1);
      out[pos++] = b;
      lit = j;
    }
    i = j;
  }
  flush(n);
  return pos;
}

function unrle(src: Uint8Array, from: number, to: number, out: Uint8Array): void {
  let pos = from;
  let o = 0;
  while (pos < to) {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = src[pos++] as number;
      v += (b & 0x7f) * mul;
      if (b < 0x80) break;
      mul *= 128;
    }
    const len = Math.floor(v / 2);
    if (v % 2 === 1) {
      out.fill(src[pos++] as number, o, o + len);
    } else {
      out.set(src.subarray(pos, pos + len), o);
      pos += len;
    }
    o += len;
  }
  if (o !== out.length) throw new Error('save: corrupt block');
}

/** Element deltas (modulo 2^(8 width)) as byte planes. */
function toPlanes(src: Uint8Array, width: number): Uint8Array {
  const n = src.length / width;
  const out = new Uint8Array(src.length);
  if (width === 2) {
    const v = new Uint16Array(src.buffer, src.byteOffset, n);
    let prev = 0;
    for (let k = 0; k < n; k++) {
      const d = ((v[k] as number) - prev) & 0xffff;
      prev = v[k] as number;
      out[k] = d & 0xff;
      out[n + k] = d >>> 8;
    }
  } else {
    const v = new Uint32Array(src.buffer, src.byteOffset, n);
    let prev = 0;
    for (let k = 0; k < n; k++) {
      const d = ((v[k] as number) - prev) >>> 0;
      prev = v[k] as number;
      out[k] = d & 0xff;
      out[n + k] = (d >>> 8) & 0xff;
      out[2 * n + k] = (d >>> 16) & 0xff;
      out[3 * n + k] = d >>> 24;
    }
  }
  return out;
}

function fromPlanes(planes: Uint8Array, width: number, out: Uint8Array): void {
  const n = out.length / width;
  if (width === 2) {
    const v = new Uint16Array(out.buffer, out.byteOffset, n);
    let prev = 0;
    for (let k = 0; k < n; k++) {
      prev = (prev + ((planes[k] as number) | ((planes[n + k] as number) << 8))) & 0xffff;
      v[k] = prev;
    }
  } else {
    const v = new Uint32Array(out.buffer, out.byteOffset, n);
    let prev = 0;
    for (let k = 0; k < n; k++) {
      const d =
        ((planes[k] as number) |
          ((planes[n + k] as number) << 8) |
          ((planes[2 * n + k] as number) << 16) |
          ((planes[3 * n + k] as number) << 24)) >>>
        0;
      prev = (prev + d) >>> 0;
      v[k] = prev;
    }
  }
}

/** Encodes a whole buffer; `width` is the element size of the array that owns it. */
export function encodeBlock(src: Uint8Array, width: number): Uint8Array {
  const cap = src.length + (src.length >> 2) + 16;
  const out = new Uint8Array(HEADER + cap);
  let end = rle(src, out, HEADER);
  let mode = MODE_RLE;
  // Float64 buffers are treated as 32-bit words.
  const w = Math.min(width, 4);
  if (w > 1 && src.length % w === 0 && src.byteOffset % w === 0 && src.length > 64) {
    const alt = new Uint8Array(HEADER + cap);
    const altEnd = rle(toPlanes(src, w), alt, HEADER);
    if (altEnd < end) {
      out.set(alt.subarray(HEADER, altEnd), HEADER);
      end = altEnd;
      mode = MODE_DELTA;
    }
  }
  const dv = new DataView(out.buffer);
  dv.setUint32(0, src.length, true);
  out[4] = mode;
  out[5] = w;
  dv.setUint32(8, end - HEADER, true);
  return out.slice(0, end);
}

/** Decodes the block at `at` into `out` (out.length = stored byteLength). */
export function decodeBlock(bytes: Uint8Array, at: number, out: Uint8Array): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + at, HEADER);
  const len = dv.getUint32(0, true);
  if (len !== out.length) throw new Error('save: block size mismatch');
  const mode = bytes[at + 4] as number;
  const w = bytes[at + 5] as number;
  const from = at + HEADER;
  const to = from + dv.getUint32(8, true);
  if (mode === MODE_RLE) unrle(bytes, from, to, out);
  else {
    const planes = new Uint8Array(len);
    unrle(bytes, from, to, planes);
    fromPlanes(planes, w, out);
  }
}
