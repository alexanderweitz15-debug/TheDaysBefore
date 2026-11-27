// Movement of alarmed civilians (GDD 7 Flucht): guided civilians follow the safety field to open shelters;
// others head home, or straight away from recently seen zombies (home way if it leads away). Headless panicking
// civilians run along a jittering heading and ignore guidance. Running drains stamina, then they walk.
// Reaching an open zone cell shelters them.
import { TICK_RATE } from '../../core/loop';
import { CIVILIAN_ALERT, CIVILIAN_FLIGHT, CIVILIAN_PANIC } from '../../data/agents/civilians';
import { DIR_NONE, DIR_X, DIR_Y } from '../horde/flow-field';
import { ANGLE_UNITS, cosU, sinU, unitsFromRad } from '../math/trig';
import type { SimState } from '../state';
import { CS_ALERTED, CS_FLEEING, CS_PANIC } from './civilian-traits';

const DT = 1 / TICK_RATE;
const CALM_TICKS = CIVILIAN_ALERT.calmDownS * TICK_RATE;
const JITTER_UNITS = unitsFromRad(CIVILIAN_PANIC.headlessJitterRad);
const STEP_ALERTED = CIVILIAN_FLIGHT.alertedSpeedMps * DT;
const STEP_FLEE = CIVILIAN_FLIGHT.fleeSpeedMps * DT;
const STEP_PANIC = CIVILIAN_FLIGHT.panicSpeedMps * DT;

/** Moves alerted, fleeing and panicking civilians one tick. Returns the number that moved. */
export function moveFlight(s: SimState, tick: number): number {
  const c = s.civilians;
  const { posX, posY, velX, velY, alive, kind, cell } = c;
  const { lastThreat, fleeX, fleeY, headless, stamina, knows } = s.ct;
  const r = s.routine;
  const { home, fieldReady } = r;
  const rdirs = r.dirs;
  const cells = s.cells;
  const sdirs = s.safety.dirs;
  const sready = s.safety.ready === 1;
  const { guided, zoneOfCell } = s.zones;
  const walkable = s.civWalk;
  const counts = s.civilianCells;
  const n = s.n;
  const cellM = s.cellM;
  const noise = s.noise;
  const side = noise.side;
  const maxXY = n * cellM - 1e-3;
  const hw = c.highWater;
  let moved = 0;
  for (let i = 0; i < hw; i++) {
    if (!alive[i]) continue;
    const st = kind[i] as number;
    if (st !== CS_ALERTED && st !== CS_FLEEING && st !== CS_PANIC) continue;
    const c0 = cell[i] as number;
    if ((zoneOfCell[c0] as number) >= 0 && s.zones.tryShelter(s, i, c0)) {
      velX[i] = 0;
      velY[i] = 0;
      continue;
    }
    const x = posX[i] as number;
    const y = posY[i] as number;
    let dx = 0;
    let dy = 0;
    let free = false;
    if (st === CS_PANIC && headless[i]) {
      let fx = fleeX[i] as number;
      const fy = fleeY[i] as number;
      let a = Math.round((2 * s.rng.nextFloat() - 1) * JITTER_UNITS);
      if (fx === 0 && fy === 0) {
        a = Math.floor(s.rng.nextFloat() * ANGLE_UNITS);
        fx = 1;
      }
      const ca = cosU(a);
      const sa = sinU(a);
      dx = fx * ca - fy * sa;
      dy = fx * sa + fy * ca;
      const l = Math.sqrt(dx * dx + dy * dy);
      dx /= l;
      dy /= l;
      fleeX[i] = dx;
      fleeY[i] = dy;
      free = true;
    } else {
      let d = DIR_NONE;
      if (sready && (knows[i] === 1 || guided[noise.coord(y) * side + noise.coord(x)] === 1))
        d = sdirs[c0] as number;
      if (d === DIR_NONE) {
        const hf = home[i] as number;
        const hd = hf >= 0 && fieldReady[hf] ? (rdirs[hf * cells + c0] as number) : DIR_NONE;
        const fx = fleeX[i] as number;
        const fy = fleeY[i] as number;
        if (tick - (lastThreat[i] as number) < CALM_TICKS && (fx !== 0 || fy !== 0)) {
          if (hd !== DIR_NONE && (DIR_X[hd] as number) * fx + (DIR_Y[hd] as number) * fy > 0) d = hd;
          else {
            dx = fx;
            dy = fy;
            free = true;
          }
        } else d = hd;
      }
      if (d !== DIR_NONE) {
        dx = DIR_X[d] as number;
        dy = DIR_Y[d] as number;
      }
    }
    if (dx === 0 && dy === 0) {
      velX[i] = 0;
      velY[i] = 0;
      continue;
    }
    let step = STEP_ALERTED;
    if (st === CS_PANIC || (st === CS_FLEEING && tick - (lastThreat[i] as number) < CALM_TICKS)) {
      // Running from a threat costs stamina; exhausted civilians only walk.
      const left = stamina[i] as number;
      if (left > 0) {
        step = st === CS_FLEEING ? STEP_FLEE : STEP_PANIC;
        stamina[i] = left - DT;
      }
    }
    let vx = dx * step;
    let vy = dy * step;
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
        if (free) {
          // Stuck in a corner: turn the free heading by 90 degrees.
          fleeX[i] = -dy;
          fleeY[i] = dx;
        }
      }
    }
    if (nc !== c0) {
      counts[c0] = (counts[c0] as number) - 1;
      counts[nc] = (counts[nc] as number) + 1;
      cell[i] = nc;
    }
    posX[i] = nx;
    posY[i] = ny;
    velX[i] = vx / DT;
    velY[i] = vy / DT;
    moved++;
    if ((zoneOfCell[nc] as number) >= 0 && s.zones.tryShelter(s, i, nc)) {
      velX[i] = 0;
      velY[i] = 0;
    }
  }
  return moved;
}
