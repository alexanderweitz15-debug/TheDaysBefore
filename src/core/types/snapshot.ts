// Snapshot v3, sent worker -> main as a transferable ArrayBuffer and returned for reuse.
// Layout: Uint32 header, then zombie ids (Uint32), zombie pos (Float32 x,y), civilian ids, civilian pos,
// corpse ids, corpse pos, then zombie type, civilian state, corpse family (Uint8 each).
// Ids are stable slot indices: render interpolates per id. Corpses do not move.

export const SNAPSHOT_MAGIC = 0x535a4e33; // "SZN3"
export const SNAPSHOT_HEADER_U32 = 8;

export interface AgentSection {
  count: number;
  ids: Uint32Array;
  /** Interleaved x,y in meters. */
  pos: Float32Array;
  /** Zombies: ZOMBIE_TYPES index. Civilians: CIVILIAN_STATES index. Corpses: pathogen family index. */
  kind: Uint8Array;
}

export interface SnapshotView {
  tick: number;
  widthM: number;
  heightM: number;
  zombies: AgentSection;
  civilians: AgentSection;
  corpses: AgentSection;
}

type Sections = Pick<SnapshotView, 'zombies' | 'civilians' | 'corpses'>;

export function snapshotByteLength(zombies: number, civilians: number, corpses: number): number {
  const n = zombies + civilians + corpses;
  return SNAPSHOT_HEADER_U32 * 4 + n * 12 + Math.ceil(n / 4) * 4;
}

function sections(buffer: ArrayBuffer, zc: number, cc: number, dc: number): Sections {
  let off = SNAPSHOT_HEADER_U32 * 4;
  const take32 = (n: number, perAgent: number): number => {
    const at = off;
    off += n * perAgent * 4;
    return at;
  };
  const zIds = new Uint32Array(buffer, take32(zc, 1), zc);
  const zPos = new Float32Array(buffer, take32(zc, 2), zc * 2);
  const cIds = new Uint32Array(buffer, take32(cc, 1), cc);
  const cPos = new Float32Array(buffer, take32(cc, 2), cc * 2);
  const dIds = new Uint32Array(buffer, take32(dc, 1), dc);
  const dPos = new Float32Array(buffer, take32(dc, 2), dc * 2);
  const zKind = new Uint8Array(buffer, off, zc);
  const cKind = new Uint8Array(buffer, off + zc, cc);
  const dKind = new Uint8Array(buffer, off + zc + cc, dc);
  return {
    zombies: { count: zc, ids: zIds, pos: zPos, kind: zKind },
    civilians: { count: cc, ids: cIds, pos: cPos, kind: cKind },
    corpses: { count: dc, ids: dIds, pos: dPos, kind: dKind },
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
  corpses: number,
): SnapshotView {
  const header = [SNAPSHOT_MAGIC, tick, zombies, civilians, widthM, heightM, corpses, 3];
  new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32).set(header);
  return { tick, widthM, heightM, ...sections(buffer, zombies, civilians, corpses) };
}

export function readSnapshot(buffer: ArrayBuffer): SnapshotView {
  const h = new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32);
  if (h[0] !== SNAPSHOT_MAGIC) throw new Error('snapshot: bad magic');
  const zc = h[2] as number;
  const cc = h[3] as number;
  const dc = h[6] as number;
  return {
    tick: h[1] as number,
    widthM: h[4] as number,
    heightM: h[5] as number,
    ...sections(buffer, zc, cc, dc),
  };
}
