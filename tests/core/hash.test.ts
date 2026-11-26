import { describe, expect, it } from 'vitest';
import { createHash, hashBytes, hashHex, hashU32, hashView } from '../../src/core/hash';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('hash (FNV-1a 32)', () => {
  it('empty input yields the offset basis', () => {
    expect(hashHex(createHash())).toBe('811c9dc5');
  });

  it('golden: known FNV-1a vectors', () => {
    expect(hashHex(hashBytes(createHash(), bytes('a')))).toBe('e40c292c');
    expect(hashHex(hashBytes(createHash(), bytes('foobar')))).toBe('bf9cf968');
  });

  it('is stable across runs', () => {
    const a = hashBytes(createHash(), new Uint8Array([1, 2, 3, 4, 5]));
    const b = hashBytes(createHash(), new Uint8Array([1, 2, 3, 4, 5]));
    expect(a.value).toBe(b.value);
  });

  it('is order sensitive', () => {
    const a = hashBytes(createHash(), new Uint8Array([1, 2, 3]));
    const b = hashBytes(createHash(), new Uint8Array([3, 2, 1]));
    expect(a.value).not.toBe(b.value);
  });

  it('chaining equals hashing the concatenation', () => {
    const chained = hashBytes(hashBytes(createHash(), bytes('foo')), bytes('bar'));
    expect(chained.value).toBe(hashBytes(createHash(), bytes('foobar')).value);
  });

  it('hashU32 golden and little-endian byte layout', () => {
    expect(hashHex(hashU32(createHash(), 1))).toBe('fb69b604');
    expect(hashU32(createHash(), 1).value).toBe(hashBytes(createHash(), new Uint8Array([1, 0, 0, 0])).value);
  });

  it('hashU32 wraps negatives and values above 2^32 like >>> 0', () => {
    expect(hashU32(createHash(), -1).value).toBe(hashU32(createHash(), 0xffffffff).value);
    expect(hashU32(createHash(), 2 ** 32 + 5).value).toBe(hashU32(createHash(), 5).value);
  });

  it('hashView respects byteOffset and byteLength of sub-views', () => {
    const buf = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const sub = new Uint8Array(buf.buffer, 2, 3);
    expect(hashView(createHash(), sub).value).toBe(hashBytes(createHash(), new Uint8Array([1, 2, 3])).value);
  });

  it('hashView on Float32Array hashes raw bytes and detects a changed value', () => {
    const f = new Float32Array([1.5, 2.5]);
    const before = hashView(createHash(), f).value;
    f[1] = 2.75;
    expect(hashView(createHash(), f).value).not.toBe(before);
  });

  it('hashHex is always 8 chars', () => {
    expect(hashHex({ value: 1 })).toBe('00000001');
    expect(hashHex({ value: 0xffffffff })).toBe('ffffffff');
  });
});
