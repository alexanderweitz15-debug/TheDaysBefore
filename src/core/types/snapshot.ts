// Snapshot sent from worker to main thread as a transferable ArrayBuffer.
// Layout: Uint32 header[HEADER_U32], then Float32 positions [x0, y0, x1, y1, ...].

export const SNAPSHOT_MAGIC = 0x535a4e31; // "SZN1"
export const SNAPSHOT_HEADER_U32 = 6;

export interface SnapshotView {
  tick: number;
  agentCount: number;
  widthM: number;
  heightM: number;
  positions: Float32Array;
}

export function allocSnapshot(agentCount: number): {
  buffer: ArrayBuffer;
  header: Uint32Array;
  positions: Float32Array;
} {
  const buffer = new ArrayBuffer(SNAPSHOT_HEADER_U32 * 4 + agentCount * 8);
  return {
    buffer,
    header: new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32),
    positions: new Float32Array(buffer, SNAPSHOT_HEADER_U32 * 4, agentCount * 2),
  };
}

export function readSnapshot(buffer: ArrayBuffer): SnapshotView {
  const header = new Uint32Array(buffer, 0, SNAPSHOT_HEADER_U32);
  if (header[0] !== SNAPSHOT_MAGIC) throw new Error('snapshot: bad magic');
  const agentCount = header[2] as number;
  return {
    tick: header[1] as number,
    agentCount,
    widthM: header[3] as number,
    heightM: header[4] as number,
    positions: new Float32Array(buffer, SNAPSHOT_HEADER_U32 * 4, agentCount * 2),
  };
}
