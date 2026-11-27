import { describe, expect, it } from 'vitest';
import {
  type AgentSection,
  readSnapshot,
  SECTION_NAMES,
  SNAPSHOT_HEADER_U32,
  SNAPSHOT_MAGIC,
  type SnapshotCounts,
  snapshotByteLength,
  writeSnapshotHeader,
} from '../../src/core/types/snapshot';

type SectionData = { pos: number[]; kind: number[] };
type Spec = {
  tick: number;
  widthM: number;
  heightM: number;
  fx: number[];
} & Record<(typeof SECTION_NAMES)[number], SectionData>;

const NONE: SectionData = { pos: [], kind: [] };
const ID_BASE = { zombies: 10, civilians: 5000, corpses: 90000, units: 200000, projectiles: 300000 };

const countsOf = (spec: Spec): SnapshotCounts => ({
  zombies: spec.zombies.kind.length,
  civilians: spec.civilians.kind.length,
  corpses: spec.corpses.kind.length,
  units: spec.units.kind.length,
  projectiles: spec.projectiles.kind.length,
});

function fillSection(sec: AgentSection, idBase: number, d: SectionData): void {
  for (let i = 0; i < sec.count; i++) {
    sec.ids[i] = idBase + i * 3;
    sec.kind[i] = d.kind[i] as number;
  }
  sec.pos.set(d.pos);
}

function build(spec: Spec, buffer?: ArrayBuffer): ArrayBuffer {
  const counts = countsOf(spec);
  const fxCount = spec.fx.length / 4;
  const buf = buffer ?? new ArrayBuffer(snapshotByteLength(counts, fxCount));
  const view = writeSnapshotHeader(buf, spec.tick, spec.widthM, spec.heightM, counts, fxCount);
  for (const name of SECTION_NAMES) fillSection(view[name], ID_BASE[name], spec[name]);
  view.fx.set(spec.fx);
  return buf;
}

const SPEC: Spec = {
  tick: 1234,
  widthM: 2000,
  heightM: 1000,
  zombies: { pos: [1.5, 2.25, 100, 0.125, 1999.5, 3], kind: [0, 1, 2] },
  civilians: { pos: [7, 8, 9, 10], kind: [3, 4] },
  corpses: { pos: [50, 60, 70, 80, 90, 100, 110, 120], kind: [0, 1, 2, 5] },
  units: { pos: [300, 400, 310.5, 410.5], kind: [0, 6] },
  projectiles: { pos: [1, 2, 3, 4, 5, 6], kind: [1, 0, 2] },
  fx: [0, 11, 12, 0.5, 2, 21, 22, 3, 5, 31, 32, 0],
};
const EMPTY: Spec = {
  tick: 0,
  widthM: 10,
  heightM: 10,
  fx: [],
  zombies: NONE,
  civilians: NONE,
  corpses: NONE,
  units: NONE,
  projectiles: NONE,
};
const zero = (): SnapshotCounts => countsOf(EMPTY);

describe('snapshot v4', () => {
  it('magic spells SZN4 and the header holds five fixed words plus one count per section', () => {
    expect(SNAPSHOT_MAGIC).toBe(0x535a4e34);
    expect(String.fromCharCode(0x53, 0x5a, 0x4e, 0x34)).toBe('SZN4');
    expect(SECTION_NAMES).toEqual(['zombies', 'civilians', 'corpses', 'units', 'projectiles']);
    expect(SNAPSHOT_HEADER_U32).toBe(5 + SECTION_NAMES.length);
  });

  it('snapshotByteLength = header + 12 bytes per agent + 16 per fx + kind bytes padded to 4', () => {
    const H = SNAPSHOT_HEADER_U32 * 4;
    expect(snapshotByteLength(zero(), 0)).toBe(H);
    expect(snapshotByteLength({ ...zero(), zombies: 1 }, 0)).toBe(H + 12 + 4);
    expect(snapshotByteLength({ ...zero(), zombies: 3, civilians: 2 }, 0)).toBe(H + 5 * 12 + 8);
    expect(snapshotByteLength({ ...zero(), units: 4 }, 0)).toBe(H + 4 * 12 + 4);
    expect(snapshotByteLength({ ...zero(), projectiles: 5 }, 0)).toBe(H + 5 * 12 + 8);
    expect(snapshotByteLength(zero(), 7)).toBe(H + 7 * 16);
    expect(snapshotByteLength(countsOf(SPEC), 3)).toBe(H + 14 * 12 + 3 * 16 + 16);
  });

  it('length depends only on the total, not on the split between sections', () => {
    expect(snapshotByteLength({ ...zero(), zombies: 7, civilians: 3 }, 0)).toBe(
      snapshotByteLength({ ...zero(), units: 3, projectiles: 7 }, 0),
    );
    let prev = snapshotByteLength(zero(), 0);
    for (let n = 1; n < 40; n++) {
      const len = snapshotByteLength({ ...zero(), units: n }, 0);
      expect(len).toBeGreaterThan(prev);
      prev = len;
    }
  });

  it('header words match the documented layout', () => {
    const h = new Uint32Array(build(SPEC), 0, SNAPSHOT_HEADER_U32);
    expect(Array.from(h)).toEqual([SNAPSHOT_MAGIC, 1234, 2000, 1000, 3, 3, 2, 4, 2, 3]);
  });

  it('roundtrips all five sections and the fx list', () => {
    const view = readSnapshot(build(SPEC));
    expect(view.tick).toBe(1234);
    expect(view.widthM).toBe(2000);
    expect(view.heightM).toBe(1000);
    for (const name of SECTION_NAMES) {
      const sec = view[name];
      expect(sec.count).toBe(SPEC[name].kind.length);
      expect(Array.from(sec.pos)).toEqual(SPEC[name].pos);
      expect(Array.from(sec.kind)).toEqual(SPEC[name].kind);
      expect(Array.from(sec.ids)).toEqual(SPEC[name].kind.map((_, i) => ID_BASE[name] + i * 3));
    }
    expect(view.fxCount).toBe(3);
    expect(Array.from(view.fx)).toEqual(SPEC.fx);
  });

  it('writeSnapshotHeader returns views that agree with readSnapshot', () => {
    const counts = countsOf(SPEC);
    const buf = new ArrayBuffer(snapshotByteLength(counts, 3));
    const w = writeSnapshotHeader(buf, 9, 64, 32, counts, 3);
    const r = readSnapshot(buf);
    expect(r.tick).toBe(9);
    for (const name of SECTION_NAMES) {
      expect(r[name].count).toBe(counts[name]);
      expect(r[name].ids.byteOffset).toBe(w[name].ids.byteOffset);
      expect(r[name].pos.byteOffset).toBe(w[name].pos.byteOffset);
      expect(r[name].kind.byteOffset).toBe(w[name].kind.byteOffset);
    }
    expect(r.fx.byteOffset).toBe(w.fx.byteOffset);
    expect(r.fxCount).toBe(3);
  });

  it('typed array views are aligned and no ranges overlap', () => {
    const cases: [SnapshotCounts, number][] = [
      [zero(), 0],
      [{ ...zero(), units: 1 }, 0],
      [{ ...zero(), projectiles: 1 }, 1],
      [{ zombies: 3, civilians: 2, corpses: 1, units: 5, projectiles: 7 }, 3],
      [{ zombies: 101, civilians: 33, corpses: 17, units: 9, projectiles: 13 }, 11],
    ];
    for (const [counts, fxCount] of cases) {
      const buf = new ArrayBuffer(snapshotByteLength(counts, fxCount));
      const v = writeSnapshotHeader(buf, 1, 10, 10, counts, fxCount);
      const arrays: ArrayBufferView[] = [v.fx];
      for (const name of SECTION_NAMES) arrays.push(v[name].ids, v[name].pos, v[name].kind);
      for (const a of arrays.slice(0, 1)) expect(a.byteOffset % 4).toBe(0);
      for (const name of SECTION_NAMES) {
        expect(v[name].ids.byteOffset % 4).toBe(0);
        expect(v[name].pos.byteOffset % 4).toBe(0);
      }
      const ranges = arrays
        .filter((a) => a.byteLength > 0)
        .map((a) => [a.byteOffset, a.byteOffset + a.byteLength] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i++)
        expect((ranges[i] as readonly [number, number])[0]).toBeGreaterThanOrEqual(
          (ranges[i - 1] as readonly [number, number])[1],
        );
      if (ranges.length > 0)
        expect((ranges[ranges.length - 1] as readonly [number, number])[1]).toBeLessThanOrEqual(
          buf.byteLength,
        );
    }
  });

  it('sections are independent: overwriting zombies leaves the other sections untouched', () => {
    const buf = build(SPEC);
    const before = readSnapshot(buf);
    before.zombies.pos.fill(-1);
    before.zombies.kind.fill(255);
    before.zombies.ids.fill(0xffffffff);
    const after = readSnapshot(buf);
    for (const name of ['civilians', 'corpses', 'units', 'projectiles'] as const) {
      expect(Array.from(after[name].pos)).toEqual(SPEC[name].pos);
      expect(Array.from(after[name].kind)).toEqual(SPEC[name].kind);
    }
    expect(Array.from(after.fx)).toEqual(SPEC.fx);
  });

  it('readSnapshot views the same buffer (no copy)', () => {
    const buf = build(SPEC);
    const v = readSnapshot(buf);
    expect(v.zombies.pos.buffer).toBe(buf);
    expect(v.units.kind.buffer).toBe(buf);
    expect(v.fx.buffer).toBe(buf);
  });

  it('a larger reused buffer works: views cover only the counts, header is rewritten', () => {
    const big = new ArrayBuffer(
      snapshotByteLength({ zombies: 500, civilians: 500, corpses: 500, units: 500, projectiles: 500 }, 500),
    );
    new Uint8Array(big).fill(0xab); // stale content from an earlier, larger snapshot
    build(SPEC, big);
    const v = readSnapshot(big);
    expect(v.tick).toBe(1234);
    expect(v.units.count).toBe(2);
    expect(v.projectiles.count).toBe(3);
    expect(v.fxCount).toBe(3);
    expect(Array.from(v.units.pos)).toEqual(SPEC.units.pos);
    expect(Array.from(v.fx)).toEqual(SPEC.fx);
    build({ ...EMPTY, tick: 1, zombies: { pos: [1, 2], kind: [9] } }, big);
    const v2 = readSnapshot(big);
    expect(v2.tick).toBe(1);
    expect(v2.zombies.count).toBe(1);
    expect(v2.units.count + v2.projectiles.count + v2.corpses.count + v2.fxCount).toBe(0);
    expect(Array.from(v2.zombies.kind)).toEqual([9]);
  });

  it('a buffer that is too small throws', () => {
    const small = new ArrayBuffer(snapshotByteLength({ ...zero(), zombies: 1 }, 0));
    expect(() => writeSnapshotHeader(small, 1, 10, 10, { ...zero(), units: 50 }, 0)).toThrow();
    expect(() => writeSnapshotHeader(small, 1, 10, 10, zero(), 50)).toThrow();
  });

  it('wrong magic throws, including all older versions', () => {
    const buf = build(SPEC);
    for (const magic of [0xdeadbeef, 0x535a4e31, 0x535a4e32, 0x535a4e33]) {
      new Uint32Array(buf, 0, 1)[0] = magic;
      expect(() => readSnapshot(buf)).toThrow(/bad magic/);
    }
  });

  it('zeroed buffer throws', () => {
    expect(() => readSnapshot(new ArrayBuffer(SNAPSHOT_HEADER_U32 * 4))).toThrow();
  });

  it('all counts 0 yield empty views and a header-only buffer', () => {
    const buf = build({ ...EMPTY, widthM: 2000 });
    expect(buf.byteLength).toBe(SNAPSHOT_HEADER_U32 * 4);
    const v = readSnapshot(buf);
    for (const name of SECTION_NAMES) {
      expect(v[name].count).toBe(0);
      expect(v[name].pos.length).toBe(0);
    }
    expect(v.fx.length).toBe(0);
    expect(v.widthM).toBe(2000);
  });

  it('one section filled, the others empty', () => {
    for (const name of SECTION_NAMES) {
      const v = readSnapshot(build({ ...EMPTY, [name]: SPEC[name] }));
      for (const other of SECTION_NAMES)
        expect(v[other].count).toBe(other === name ? SPEC[name].kind.length : 0);
      expect(Array.from(v[name].pos)).toEqual(SPEC[name].pos);
    }
    const onlyFx = readSnapshot(build({ ...EMPTY, fx: SPEC.fx }));
    expect(onlyFx.fxCount).toBe(3);
    expect(Array.from(onlyFx.fx)).toEqual(SPEC.fx);
  });

  it('survives a copy of the buffer (transfer-like)', () => {
    const v = readSnapshot(build(SPEC).slice(0));
    expect(Array.from(v.units.pos)).toEqual(SPEC.units.pos);
    expect(Array.from(v.projectiles.ids)).toEqual([300000, 300003, 300006]);
    expect(Array.from(v.fx)).toEqual(SPEC.fx);
  });

  it('keeps ids as full uint32 and kinds as full bytes in every section', () => {
    const counts = { zombies: 1, civilians: 1, corpses: 1, units: 1, projectiles: 1 };
    const buf = new ArrayBuffer(snapshotByteLength(counts, 0));
    const v = writeSnapshotHeader(buf, 0, 1, 1, counts, 0);
    SECTION_NAMES.forEach((name, i) => {
      v[name].ids[0] = 0xffffffff - i;
      v[name].kind[0] = 255 - i;
    });
    const r = readSnapshot(buf);
    SECTION_NAMES.forEach((name, i) => {
      expect(r[name].ids[0]).toBe(0xffffffff - i);
      expect(r[name].kind[0]).toBe(255 - i);
    });
  });
});
