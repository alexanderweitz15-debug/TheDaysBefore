// Save games for CityWorld (GDD 4 Speichern): header (completed ticks u32 LE, format version u32 LE), then the
// generic codec over the whole world object. The map is regenerated from the seed; buffers that are dead or
// derivable (idle solver scratch, idle A* buffers, finished civilian fields) are left out and rebuilt on load.
import type { CitySize } from '../../core/types/map';
import { SAVE_FORMAT_VERSION } from '../../core/types/save';
import type { SimState } from '../state';
import { decodeState, encodeState, readMeta } from './codec';

const HEADER = 8;

interface SaveMetaSim {
  seed: number;
  size: CitySize;
  mapHash: number;
  /** Civilian fields were left out and must be rebuilt. */
  routineDerived: boolean;
}

export interface SavableWorld {
  readonly s: SimState;
  readonly completedTicks: number;
  readonly seed: number;
  readonly size: CitySize;
  readonly mapHash: number;
}

function collect(v: unknown, out: Set<object>): void {
  if (v === null || typeof v !== 'object' || out.has(v)) return;
  out.add(v);
  if (ArrayBuffer.isView(v)) {
    out.add(v.buffer);
    return;
  }
  for (const k of Object.keys(v)) collect((v as Record<string, unknown>)[k], out);
}

export function serializeWorld(w: SavableWorld): Uint8Array {
  const s = w.s;
  const skip = new Set<object>();
  collect(s.map, skip);
  const pathPending = s.structures.pathHandled !== s.structures.pathVersion;
  const derived = s.routine.derivable(pathPending);
  const routineDerived = derived.includes(s.routine.dirs);
  for (const b of [...derived, ...s.flow.scratch(), ...s.safety.scratch(), ...s.planner.scratch()])
    skip.add(b.buffer);
  const header = new Uint8Array(HEADER);
  const dv = new DataView(header.buffer);
  dv.setUint32(0, w.completedTicks >>> 0, true);
  dv.setUint32(4, SAVE_FORMAT_VERSION, true);
  const meta: SaveMetaSim = { seed: w.seed, size: w.size, mapHash: w.mapHash, routineDerived };
  return encodeState(w, skip, meta, header);
}

/** Checks header and version before the (expensive) world construction. */
export function checkSave(state: Uint8Array): void {
  if (state.byteLength < HEADER + 4) throw new Error('save: state too short');
  const version = new DataView(state.buffer, state.byteOffset, HEADER).getUint32(4, true);
  if (version !== SAVE_FORMAT_VERSION)
    throw new Error(`save: format version ${version}, expected ${SAVE_FORMAT_VERSION}`);
}

/** Restores `state` into a world freshly built from the same seed and options. */
export function loadInto(w: SavableWorld, state: Uint8Array): void {
  checkSave(state);
  const meta = readMeta(state, HEADER) as SaveMetaSim;
  if (meta.seed !== w.seed || meta.size !== w.size || meta.mapHash !== w.mapHash)
    throw new Error('save: state belongs to another city (seed, size or map differ)');
  decodeState(w, state, HEADER);
  if (meta.routineDerived) w.s.routine.rebuildFields();
}
