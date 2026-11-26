// Routine movement (GDD 7 Alltag): follow the destination field, dwell on arrival, pick the next destination.
import type { Rng } from '../../core/rng';
import { DIR_NONE, DIR_X, DIR_Y } from '../horde/flow-field';
import type { AgentPool } from '../horde/pool';
import { CIVILIAN_ROUTINE_STATE, type CivilianRoutine } from './routine';

export interface RoutineParams {
  readonly speedMps: number;
  readonly dt: number;
  readonly homeWeight: number;
  readonly workWeight: number;
  readonly dwellMinTicks: number;
  readonly dwellMaxTicks: number;
  readonly retryTicks: number;
}

/**
 * Moves all routine civilians one tick. Returns the number of civilians that moved.
 * Never enters buildings or water; civilian cell counts are kept in `cellCount`.
 */
export function moveRoutine(
  r: CivilianRoutine,
  pool: AgentPool,
  cellCount: Uint16Array,
  walkable: Uint8Array,
  rng: Rng,
  p: RoutineParams,
  cellM: number,
): number {
  const { posX, posY, velX, velY, alive, kind, cell } = pool;
  const { dest, timer, home, work, market, dirs, fieldReady, cells, n } = r;
  const step = p.speedMps * p.dt;
  const maxXY = n * cellM - 1e-3;
  const hw = pool.highWater;
  const dwellSpan = p.dwellMaxTicks - p.dwellMinTicks;
  let moved = 0;
  for (let i = 0; i < hw; i++) {
    if (!alive[i] || kind[i] !== CIVILIAN_ROUTINE_STATE) continue;
    let f = dest[i] as number;
    if (f < 0) {
      const t = timer[i] as number;
      if (t > 0) {
        timer[i] = t - 1;
        continue;
      }
      const r = rng.nextFloat();
      f =
        r < p.homeWeight
          ? (home[i] as number)
          : r < p.homeWeight + p.workWeight
            ? (work[i] as number)
            : (market[i] as number);
      if (f < 0) f = home[i] as number;
      if (f < 0 || !fieldReady[f]) {
        timer[i] = p.retryTicks;
        continue;
      }
      dest[i] = f;
    }
    const c0 = cell[i] as number;
    const d = dirs[f * cells + c0] as number;
    if (d === DIR_NONE) {
      // Arrived (door cell, or no path from here): dwell.
      dest[i] = -1;
      timer[i] = p.dwellMinTicks + Math.floor(rng.nextFloat() * dwellSpan);
      velX[i] = 0;
      velY[i] = 0;
      continue;
    }
    const x = posX[i] as number;
    const y = posY[i] as number;
    let vx = (DIR_X[d] as number) * step;
    let vy = (DIR_Y[d] as number) * step;
    let nx = Math.fround(Math.min(Math.max(x + vx, 0), maxXY));
    let ny = Math.fround(Math.min(Math.max(y + vy, 0), maxXY));
    let nc = Math.floor(ny / cellM) * n + Math.floor(nx / cellM);
    if (nc !== c0 && !walkable[nc]) {
      const cx = Math.floor(y / cellM) * n + Math.floor(nx / cellM);
      const cy = Math.floor(ny / cellM) * n + Math.floor(x / cellM);
      if (walkable[cx]) {
        ny = y;
        vy = 0;
        nc = cx;
      } else if (walkable[cy]) {
        nx = x;
        vx = 0;
        nc = cy;
      } else {
        nx = x;
        ny = y;
        vx = 0;
        vy = 0;
        nc = c0;
      }
    }
    if (nc !== c0) {
      cellCount[c0] = (cellCount[c0] as number) - 1;
      cellCount[nc] = (cellCount[nc] as number) + 1;
      cell[i] = nc;
    }
    posX[i] = nx;
    posY[i] = ny;
    velX[i] = vx / p.dt;
    velY[i] = vy / p.dt;
    moved++;
  }
  return moved;
}
