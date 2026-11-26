// Snapshot v2, sent worker -> main as a transferable ArrayBuffer and returned for reuse.
// Layout: Uint32 header, then zombie ids (Uint32), zombie pos (Float32 x,y), civilian ids, civilian pos,
// then zombie type (Uint8), civilian state (Uint8). Ids are stable slot indices: render interpolates per id.

export const SNAPSHOT_MAGIC = 0x535a4e32; // "SZN2"
export const SNAPSHOT_HEADER_U32 = 8;

export interface AgentSection {
  count: number;
  ids: Uint32Array;
  /** Interleaved x,y in meters. */
  pos: Float32Array;
  /** Zombies: zombie type index. Civilians: civilian state index. */
  kind: Uint8Array;
}

export interface SnapshotView {
  tick: number;
  widthM: number;
  heightM: number;
  zombies: AgentSection;
  civilians: AgentSection;
}

export function snapshotByteLength(zombies: number, civilians: number): number {
  const n = zombies + civilians;
  return SNAPSHOT_HEADER_U32 * 4 + n * 12 + Math.ceil(n / 4) * 4;
}

function sections(
  buffer: ArrayBuffer,
  zc: number,
  cc: number,
): { zombies: AgentSection; civilians: AgentSection } {
  let off = SNAPSHOT_HEADER_U32 * 4;
  const zIds = new Uint32Array(buffer, off, zc);
  off += zc * 4;
  const zPos = new Float32Array(buffer, off, zc * 2);
  off += zc * 8;
  const cIds = new Uint32Array(buffer, off, cc);
  off += cc * 4;
  const cPos = new Float32Array(buffer, off, cc * 2);
  off += cc * 8;
  const zKind = new Uint8Array(buffer, off, zc);
  off += zc;
  const cKind = new Uint8Array(buffer, off, cc);
  return {
    zombies: { count: zc, ids: zIds, pos: zPos, kind: zKind },
    civilians: { count: cc, ids: cIds, pos: cPos, kind: cKind },
  };
}

/** Lays out a snapshot in `buffer` (reused when large enough). Caller fills the sections. */
export function writeSnapshotHeader(
  buffer: ArrayBuffer,
  tick: number,
  widthM: number,
  heightM: number,
  zombies: number,
  civilians: number,
): SnapshotView {
  new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32).set([
    SNAPSHOT_MAGIC,
    tick,
    zombies,
    civilians,
    widthM,
    heightM,
    2,
    0,
  ]);
  return { tick, widthM, heightM, ...sections(buffer, zombies, civilians) };
}

export function readSnapshot(buffer: ArrayBuffer): SnapshotView {
  const h = new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32);
  if (h[0] !== SNAPSHOT_MAGIC) throw new Error('snapshot: bad magic');
  const zc = h[2] as number;
  const cc = h[3] as number;
  return {
    tick: h[1] as number,
    widthM: h[4] as number,
    heightM: h[5] as number,
    ...sections(buffer, zc, cc),
  };
}
