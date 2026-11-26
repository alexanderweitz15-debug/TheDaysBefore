import { describe, expect, it } from 'vitest';
import {
  type AgentSection,
  readSnapshot,
  SNAPSHOT_HEADER_U32,
  SNAPSHOT_MAGIC,
  snapshotByteLength,
  writeSnapshotHeader,
} from '../../src/core/types/snapshot';

interface Spec {
  tick: number;
  widthM: number;
  heightM: number;
  zombies: { pos: number[]; kind: number[] };
  civilians: { pos: number[]; kind: number[] };
}

function fillSection(sec: AgentSection, idBase: number, d: { pos: number[]; kind: number[] }): void {
  for (let i = 0; i < sec.count; i++) {
    sec.ids[i] = idBase + i * 3;
    sec.kind[i] = d.kind[i] as number;
  }
  sec.pos.set(d.pos);
}

function build(spec: Spec, buffer?: ArrayBuffer): ArrayBuffer {
  const zc = spec.zombies.kind.length;
  const cc = spec.civilians.kind.length;
  const buf = buffer ?? new ArrayBuffer(snapshotByteLength(zc, cc));
  const view = writeSnapshotHeader(buf, spec.tick, spec.widthM, spec.heightM, zc, cc);
  fillSection(view.zombies, 10, spec.zombies);
  fillSection(view.civilians, 5000, spec.civilians);
  return buf;
}

const SPEC: Spec = {
  tick: 1234,
  widthM: 2000,
  heightM: 1000,
  zombies: { pos: [1.5, 2.25, 100, 0.125, 1999.5, 3], kind: [0, 1, 2] },
  civilians: { pos: [7, 8, 9, 10], kind: [3, 4] },
};

describe('snapshot v2', () => {
  it('magic spells SZN2 and header is 8 words', () => {
    expect(SNAPSHOT_MAGIC).toBe(0x535a4e32);
    expect(String.fromCharCode(0x53, 0x5a, 0x4e, 0x32)).toBe('SZN2');
    expect(SNAPSHOT_HEADER_U32).toBe(8);
  });

  it('snapshotByteLength = header + 12 bytes per agent + kind bytes padded to 4', () => {
    expect(snapshotByteLength(0, 0)).toBe(SNAPSHOT_HEADER_U32 * 4);
    expect(snapshotByteLength(1, 0)).toBe(32 + 12 + 4);
    expect(snapshotByteLength(3, 2)).toBe(32 + 5 * 12 + 8);
    expect(snapshotByteLength(4, 0)).toBe(32 + 4 * 12 + 4);
    expect(snapshotByteLength(1000, 500)).toBe(32 + 1500 * 12 + 1500);
  });

  it('length is monotonic in the total and independent of the zombie/civilian split', () => {
    expect(snapshotByteLength(7, 3)).toBe(snapshotByteLength(3, 7));
    let prev = snapshotByteLength(0, 0);
    for (let n = 1; n < 40; n++) {
      const len = snapshotByteLength(n, 0);
      expect(len).toBeGreaterThan(prev);
      prev = len;
    }
  });

  it('header words match the documented layout', () => {
    const buf = build(SPEC);
    const h = new Uint32Array(buf, 0, SNAPSHOT_HEADER_U32);
    expect(Array.from(h.subarray(0, 6))).toEqual([SNAPSHOT_MAGIC, 1234, 3, 2, 2000, 1000]);
    expect(h[6]).toBe(2);
  });

  it('roundtrips both sections', () => {
    const view = readSnapshot(build(SPEC));
    expect(view.tick).toBe(1234);
    expect(view.widthM).toBe(2000);
    expect(view.heightM).toBe(1000);
    expect(view.zombies.count).toBe(3);
    expect(Array.from(view.zombies.ids)).toEqual([10, 13, 16]);
    expect(Array.from(view.zombies.pos)).toEqual(SPEC.zombies.pos);
    expect(Array.from(view.zombies.kind)).toEqual([0, 1, 2]);
    expect(view.civilians.count).toBe(2);
    expect(Array.from(view.civilians.ids)).toEqual([5000, 5003]);
    expect(Array.from(view.civilians.pos)).toEqual(SPEC.civilians.pos);
    expect(Array.from(view.civilians.kind)).toEqual([3, 4]);
  });

  it('writeSnapshotHeader returns views that agree with readSnapshot', () => {
    const zc = 3;
    const cc = 2;
    const buf = new ArrayBuffer(snapshotByteLength(zc, cc));
    const w = writeSnapshotHeader(buf, 9, 64, 32, zc, cc);
    const r = readSnapshot(buf);
    expect(r.tick).toBe(w.tick);
    expect(r.zombies.ids.byteOffset).toBe(w.zombies.ids.byteOffset);
    expect(r.zombies.pos.byteOffset).toBe(w.zombies.pos.byteOffset);
    expect(r.zombies.kind.byteOffset).toBe(w.zombies.kind.byteOffset);
    expect(r.civilians.ids.byteOffset).toBe(w.civilians.ids.byteOffset);
    expect(r.civilians.pos.byteOffset).toBe(w.civilians.pos.byteOffset);
    expect(r.civilians.kind.byteOffset).toBe(w.civilians.kind.byteOffset);
  });

  it('typed array views are aligned and sections do not overlap', () => {
    for (const [zc, cc] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [3, 2],
      [5, 7],
      [101, 33],
    ] as const) {
      const buf = new ArrayBuffer(snapshotByteLength(zc, cc));
      const v = writeSnapshotHeader(buf, 1, 10, 10, zc, cc);
      for (const sec of [v.zombies, v.civilians]) {
        expect(sec.ids.byteOffset % 4).toBe(0);
        expect(sec.pos.byteOffset % 4).toBe(0);
      }
      const ranges = [
        v.zombies.ids,
        v.zombies.pos,
        v.civilians.ids,
        v.civilians.pos,
        v.zombies.kind,
        v.civilians.kind,
      ]
        .filter((a) => a.byteLength > 0)
        .map((a) => [a.byteOffset, a.byteOffset + a.byteLength] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i++) {
        expect((ranges[i] as readonly [number, number])[0]).toBeGreaterThanOrEqual(
          (ranges[i - 1] as readonly [number, number])[1],
        );
      }
      if (ranges.length > 0) {
        expect((ranges[ranges.length - 1] as readonly [number, number])[1]).toBeLessThanOrEqual(
          buf.byteLength,
        );
      }
    }
  });

  it('sections are independent: writing zombies leaves civilians untouched', () => {
    const buf = build(SPEC);
    const before = readSnapshot(buf);
    const civPos = Array.from(before.civilians.pos);
    const civKind = Array.from(before.civilians.kind);
    before.zombies.pos.fill(-1);
    before.zombies.kind.fill(255);
    before.zombies.ids.fill(0xffffffff);
    const after = readSnapshot(buf);
    expect(Array.from(after.civilians.pos)).toEqual(civPos);
    expect(Array.from(after.civilians.kind)).toEqual(civKind);
    expect(Array.from(after.civilians.ids)).toEqual([5000, 5003]);
  });

  it('readSnapshot views the same buffer (no copy)', () => {
    const buf = build(SPEC);
    const v = readSnapshot(buf);
    expect(v.zombies.pos.buffer).toBe(buf);
    expect(v.civilians.kind.buffer).toBe(buf);
  });

  it('a larger reused buffer works: views cover only the counts, header is rewritten', () => {
    const big = new ArrayBuffer(snapshotByteLength(500, 500));
    new Uint8Array(big).fill(0xab); // stale content from an earlier, larger snapshot
    build(SPEC, big);
    const v = readSnapshot(big);
    expect(v.tick).toBe(1234);
    expect(v.zombies.count).toBe(3);
    expect(v.civilians.count).toBe(2);
    expect(v.zombies.pos.length).toBe(6);
    expect(v.civilians.ids.length).toBe(2);
    expect(Array.from(v.zombies.pos)).toEqual(SPEC.zombies.pos);
    expect(Array.from(v.civilians.kind)).toEqual([3, 4]);
    // Reuse again with different counts in the same buffer.
    build({ ...SPEC, tick: 1, zombies: { pos: [1, 2], kind: [9] }, civilians: { pos: [], kind: [] } }, big);
    const v2 = readSnapshot(big);
    expect(v2.tick).toBe(1);
    expect(v2.zombies.count).toBe(1);
    expect(v2.civilians.count).toBe(0);
    expect(Array.from(v2.zombies.kind)).toEqual([9]);
  });

  it('a buffer that is too small throws', () => {
    const small = new ArrayBuffer(snapshotByteLength(1, 1));
    expect(() => writeSnapshotHeader(small, 1, 10, 10, 50, 50)).toThrow();
  });

  it('wrong magic throws, including a v1 magic', () => {
    const buf = build(SPEC);
    new Uint32Array(buf, 0, 1)[0] = 0xdeadbeef;
    expect(() => readSnapshot(buf)).toThrow(/bad magic/);
    new Uint32Array(buf, 0, 1)[0] = 0x535a4e31;
    expect(() => readSnapshot(buf)).toThrow(/bad magic/);
  });

  it('zeroed buffer throws', () => {
    expect(() => readSnapshot(new ArrayBuffer(SNAPSHOT_HEADER_U32 * 4))).toThrow();
  });

  it('count 0 in both sections yields empty views', () => {
    const buf = build({ ...SPEC, zombies: { pos: [], kind: [] }, civilians: { pos: [], kind: [] } });
    expect(buf.byteLength).toBe(SNAPSHOT_HEADER_U32 * 4);
    const v = readSnapshot(buf);
    expect(v.zombies.count).toBe(0);
    expect(v.civilians.count).toBe(0);
    expect(v.zombies.pos.length).toBe(0);
    expect(v.civilians.kind.length).toBe(0);
    expect(v.widthM).toBe(2000);
  });

  it('one section empty, the other filled', () => {
    const onlyCiv = readSnapshot(build({ ...SPEC, zombies: { pos: [], kind: [] } }));
    expect(onlyCiv.zombies.count).toBe(0);
    expect(Array.from(onlyCiv.civilians.pos)).toEqual(SPEC.civilians.pos);
    const onlyZ = readSnapshot(build({ ...SPEC, civilians: { pos: [], kind: [] } }));
    expect(onlyZ.civilians.count).toBe(0);
    expect(Array.from(onlyZ.zombies.kind)).toEqual([0, 1, 2]);
  });

  it('survives a copy of the buffer (transfer-like)', () => {
    const v = readSnapshot(build(SPEC).slice(0));
    expect(Array.from(v.zombies.pos)).toEqual(SPEC.zombies.pos);
    expect(Array.from(v.civilians.ids)).toEqual([5000, 5003]);
  });

  it('keeps ids as full uint32 and kinds as full bytes', () => {
    const buf = new ArrayBuffer(snapshotByteLength(1, 1));
    const v = writeSnapshotHeader(buf, 0, 1, 1, 1, 1);
    v.zombies.ids[0] = 0xffffffff;
    v.zombies.kind[0] = 255;
    v.civilians.kind[0] = 128;
    const r = readSnapshot(buf);
    expect(r.zombies.ids[0]).toBe(0xffffffff);
    expect(r.zombies.kind[0]).toBe(255);
    expect(r.civilians.kind[0]).toBe(128);
  });
});
