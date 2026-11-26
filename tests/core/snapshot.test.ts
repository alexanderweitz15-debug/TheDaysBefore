import { describe, expect, it } from 'vitest';
import {
  allocSnapshot,
  readSnapshot,
  SNAPSHOT_HEADER_U32,
  SNAPSHOT_MAGIC,
} from '../../src/core/types/snapshot';

function build(tick: number, positions: number[], widthM: number, heightM: number): ArrayBuffer {
  const n = positions.length / 2;
  const snap = allocSnapshot(n);
  snap.header.set([SNAPSHOT_MAGIC, tick, n, widthM, heightM, 0]);
  snap.positions.set(positions);
  return snap.buffer;
}

describe('snapshot', () => {
  it('magic spells SZN1', () => {
    expect(SNAPSHOT_MAGIC).toBe(0x535a4e31);
    expect(String.fromCharCode(0x53, 0x5a, 0x4e, 0x31)).toBe('SZN1');
  });

  it('allocSnapshot size is header + 8 bytes per agent', () => {
    for (const n of [0, 1, 7, 1000]) {
      const s = allocSnapshot(n);
      expect(s.buffer.byteLength).toBe(SNAPSHOT_HEADER_U32 * 4 + n * 8);
      expect(s.header.length).toBe(SNAPSHOT_HEADER_U32);
      expect(s.positions.length).toBe(n * 2);
      expect(s.positions.byteOffset).toBe(SNAPSHOT_HEADER_U32 * 4);
    }
  });

  it('positions view is 4-byte aligned', () => {
    expect(allocSnapshot(3).positions.byteOffset % 4).toBe(0);
  });

  it('roundtrips header and positions', () => {
    const pos = [1.5, 2.25, 100, 0.125, 1999.5, 3];
    const view = readSnapshot(build(1234, pos, 2000, 2000));
    expect(view.tick).toBe(1234);
    expect(view.agentCount).toBe(3);
    expect(view.widthM).toBe(2000);
    expect(view.heightM).toBe(2000);
    expect(Array.from(view.positions)).toEqual(pos);
  });

  it('readSnapshot views the same buffer (no copy)', () => {
    const buf = build(1, [1, 2], 10, 10);
    const view = readSnapshot(buf);
    expect(view.positions.buffer).toBe(buf);
  });

  it('wrong magic throws', () => {
    const buf = build(1, [1, 2], 10, 10);
    new Uint32Array(buf, 0, 1)[0] = 0xdeadbeef;
    expect(() => readSnapshot(buf)).toThrow(/bad magic/);
  });

  it('zeroed buffer throws', () => {
    expect(() => readSnapshot(new ArrayBuffer(SNAPSHOT_HEADER_U32 * 4))).toThrow();
  });

  it('count 0 yields an empty positions view', () => {
    const buf = build(5, [], 64, 32);
    expect(buf.byteLength).toBe(SNAPSHOT_HEADER_U32 * 4);
    const view = readSnapshot(buf);
    expect(view.agentCount).toBe(0);
    expect(view.positions.length).toBe(0);
    expect(view.tick).toBe(5);
    expect(view.widthM).toBe(64);
    expect(view.heightM).toBe(32);
  });

  it('survives a structured clone / transfer-like copy', () => {
    const buf = build(9, [3, 4, 5, 6], 50, 60);
    const view = readSnapshot(buf.slice(0));
    expect(Array.from(view.positions)).toEqual([3, 4, 5, 6]);
  });
});
