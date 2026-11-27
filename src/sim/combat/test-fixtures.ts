// Shared fixtures for combat and structure tests (imported only by *.test.ts).
import type { Command, CommandInput, UnitTypeId } from '../../core/commands';
import { spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import { CityWorld } from '../world';
import { placeUnit } from './units';

export const SEED = 31337;
/** On the SEED small map [0, 100] x [0, 100] m is open ground (no buildings, no water). */
export const OPEN = { x0: 0, y0: 0, x1: 100, y1: 100 } as const;

/** Small world without residents and with a large budget. */
export function emptyWorld(budget = 1_000_000): CityWorld {
  const w = new CityWorld(SEED, { size: 'small', startBudget: budget });
  const s = w.s;
  for (let i = 0; i < s.civilians.highWater; i++) {
    if (!s.civilians.alive[i]) continue;
    const c = s.civilians.cell[i] as number;
    s.civilianCells[c] = (s.civilianCells[c] as number) - 1;
    s.civilians.release(i);
  }
  s.civiliansDirty = true;
  return w;
}

export function send(w: CityWorld, input: CommandInput): void {
  w.applyCommand({ ...input, tick: w.s.tick } as Command);
}

export function run(w: CityWorld, ticks: number, each?: (w: CityWorld) => void): void {
  for (let k = 0; k < ticks; k++) {
    w.step(w.s.tick + 1);
    each?.(w);
  }
}

/** Spawns a zombie near (x, y); tests that need it static re-place it every tick with `pin`. */
export function zombieAt(w: CityWorld, x: number, y: number, type = ZT_WALKER): number {
  return spawnZombie(w.s, x, y, type);
}

/** Puts zombie i back at (x, y) (cell bookkeeping included). */
export function pin(w: CityWorld, i: number, x: number, y: number): void {
  const s = w.s;
  const z = s.zombies;
  if (!z.alive[i]) return;
  const c = s.cellOf(x, y);
  const old = z.cell[i] as number;
  s.zombieCells[old] = (s.zombieCells[old] as number) - 1;
  s.zombieCells[c] = (s.zombieCells[c] as number) + 1;
  z.cell[i] = c;
  z.posX[i] = Math.fround(x);
  z.posY[i] = Math.fround(y);
}

export function unitAt(w: CityWorld, type: UnitTypeId, x: number, y: number): number {
  return placeUnit(w.s, type, x, y);
}

/** FX events of `type` written since the last writeFx: [x, y, angle] each. */
export const fxOf = (w: CityWorld, type: number): number[][] => {
  const out = new Float32Array(w.fxCount * 4);
  w.writeFx(out);
  const list: number[][] = [];
  for (let k = 0; k < out.length; k += 4)
    if (out[k] === type) list.push([out[k + 1] as number, out[k + 2] as number, out[k + 3] as number]);
  return list;
};
