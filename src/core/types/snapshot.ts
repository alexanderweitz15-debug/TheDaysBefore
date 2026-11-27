// Snapshot v4, sent worker -> main as a transferable ArrayBuffer and returned for reuse.
// Layout: Uint32 header (magic, tick, widthM, heightM, fxCount, counts per section),
// then per section: ids (Uint32), pos (Float32 x,y); then fx (Float32 quadruples);
// then per section: kind (Uint8). Ids are stable slot indices: render interpolates per id.

export const SNAPSHOT_MAGIC = 0x535a4e34; // "SZN4"
export const SECTION_NAMES = ['zombies', 'civilians', 'corpses', 'units', 'projectiles'] as const;
export type SectionName = (typeof SECTION_NAMES)[number];
const BASE_HEADER = 5;
export const SNAPSHOT_HEADER_U32 = BASE_HEADER + SECTION_NAMES.length;

export interface AgentSection {
  count: number;
  ids: Uint32Array;
  /** Interleaved x,y in meters. */
  pos: Float32Array;
  /**
   * zombies: ZOMBIE_TYPES index; civilians: CIVILIAN_STATES index; corpses: pathogen family index;
   * units: index into the unit type list; projectiles: projectile type index.
   */
  kind: Uint8Array;
}

export type SnapshotCounts = Record<SectionName, number>;

export type SnapshotView = {
  tick: number;
  widthM: number;
  heightM: number;
  /** FX events of the last tick: [FX_TYPES index, x, y, param] * fxCount. */
  fx: Float32Array;
  fxCount: number;
} & Record<SectionName, AgentSection>;

export function snapshotByteLength(counts: SnapshotCounts, fxCount: number): number {
  let n = 0;
  for (const name of SECTION_NAMES) n += counts[name];
  return SNAPSHOT_HEADER_U32 * 4 + n * 12 + fxCount * 16 + Math.ceil(n / 4) * 4;
}

function layout(
  buffer: ArrayBuffer,
  counts: SnapshotCounts,
  fxCount: number,
): Omit<SnapshotView, 'tick' | 'widthM' | 'heightM'> {
  let off = SNAPSHOT_HEADER_U32 * 4;
  const ids: Uint32Array[] = [];
  const pos: Float32Array[] = [];
  for (const name of SECTION_NAMES) {
    const c = counts[name];
    ids.push(new Uint32Array(buffer, off, c));
    off += c * 4;
    pos.push(new Float32Array(buffer, off, c * 2));
    off += c * 8;
  }
  const fx = new Float32Array(buffer, off, fxCount * 4);
  off += fxCount * 16;
  const out = { fx, fxCount } as Omit<SnapshotView, 'tick' | 'widthM' | 'heightM'>;
  SECTION_NAMES.forEach((name, i) => {
    const c = counts[name];
    out[name] = {
      count: c,
      ids: ids[i] as Uint32Array,
      pos: pos[i] as Float32Array,
      kind: new Uint8Array(buffer, off, c),
    };
    off += c;
  });
  return out;
}

/** Lays out a snapshot in `buffer` (reused when large enough). Caller fills the sections and fx. */
export function writeSnapshotHeader(
  buffer: ArrayBuffer,
  tick: number,
  widthM: number,
  heightM: number,
  counts: SnapshotCounts,
  fxCount: number,
): SnapshotView {
  const h = new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32);
  h.set([SNAPSHOT_MAGIC, tick, widthM, heightM, fxCount]);
  SECTION_NAMES.forEach((name, i) => {
    h[BASE_HEADER + i] = counts[name];
  });
  return { tick, widthM, heightM, ...layout(buffer, counts, fxCount) };
}

export function readSnapshot(buffer: ArrayBuffer): SnapshotView {
  const h = new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32);
  if (h[0] !== SNAPSHOT_MAGIC) throw new Error('snapshot: bad magic');
  const counts = {} as SnapshotCounts;
  SECTION_NAMES.forEach((name, i) => {
    counts[name] = h[BASE_HEADER + i] as number;
  });
  const fxCount = h[4] as number;
  return {
    tick: h[1] as number,
    widthM: h[2] as number,
    heightM: h[3] as number,
    ...layout(buffer, counts, fxCount),
  };
}
