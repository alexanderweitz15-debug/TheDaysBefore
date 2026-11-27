// Shared fixtures for the civilian tests (imported only by *.test.ts).
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { CIVILIAN_ALERT, SAFETY_FIELD } from '../../data/agents/civilians';
import type { SimState } from '../state';
import { CityWorld } from '../world';
import { placeCivilians } from '../world-setup';
import { CS_ROUTINE } from './civilian-traits';
import { perceive } from './perception';

export const SEED = 31337;
export const SMALL = { size: 'small' } as const;
export const SCAN = CIVILIAN_ALERT.scanIntervalTicks;
/** Cell steps per direction code (E, NE, N, NW, W, SW, S, SE; y grows southwards). */
export const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
export const STEP_Y = [0, -1, -1, -1, 0, 1, 1, 1];
export const stepCell = (c: number, d: number, n: number): number =>
  c + (STEP_Y[d] as number) * n + (STEP_X[d] as number);

/** World without residents, so single agents can be studied. */
export function emptyWorld(seed = SEED): CityWorld {
  const w = new CityWorld(seed, SMALL);
  const s = w.s;
  for (let i = 0; i < s.civilians.highWater; i++) {
    s.civilianCells[s.civilians.cell[i] as number] =
      (s.civilianCells[s.civilians.cell[i] as number] as number) - 1;
    s.civilians.release(i);
  }
  s.civiliansDirty = true;
  return w;
}

/** Nearest road cell to (x, y), as cell center meters. */
export function roadNear(s: SimState, x: number, y: number): { x: number; y: number; cell: number } {
  const n = s.n;
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let c = 0; c < s.cells; c++) {
    if (s.map.terrain[c] !== TERRAIN.road) continue;
    const dx = ((c % n) + 0.5) * CELL_SIZE_M - x;
    const dy = (Math.floor(c / n) + 0.5) * CELL_SIZE_M - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: ((best % n) + 0.5) * CELL_SIZE_M, y: (Math.floor(best / n) + 0.5) * CELL_SIZE_M, cell: best };
}

export function place(w: CityWorld, x: number, y: number, count: number, kind = CS_ROUTINE): number[] {
  const s = w.s;
  const k = placeCivilians(s, x, y, count, 0xffff);
  const slots = Array.from(s.placed.subarray(0, k));
  for (const i of slots) {
    s.civilians.kind[i] = kind;
    s.routine.timer[i] = 0xffff;
  }
  return slots;
}

/** Runs the safety field until a job completes. */
export function settleSafety(w: CityWorld, tick: number): number {
  let t = tick;
  w.s.safety.update(w.s, t, SAFETY_FIELD.cellsPerTick);
  while (w.s.safety.busy) w.s.safety.update(w.s, ++t, SAFETY_FIELD.cellsPerTick);
  return t;
}

export function countKind(s: SimState, kind: number): number {
  let k = 0;
  for (let i = 0; i < s.civilians.highWater; i++)
    if (s.civilians.alive[i] && s.civilians.kind[i] === kind) k++;
  return k;
}

/** Perception only (no movement): density from the current zombies, then `scans` full scan rounds. */
export function scanRounds(s: SimState, from: number, scans: number): number {
  s.density.build(s.zombies);
  let t = from;
  for (let k = 0; k < scans * SCAN; k++) perceive(s, t++);
  return t;
}
