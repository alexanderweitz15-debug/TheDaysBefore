// Zombie movement (GDD 8 rules 1-4): direct target in sight, else flow field, separation, density cap,
// no movement into buildings or water. Allocation-free.
import type { Rng } from '../../core/rng';
import { cosU, sinU } from '../math/trig';
import { DIR_NONE, DIR_X, DIR_Y, type FlowField } from './flow-field';
import type { AgentPool } from './pool';
import type { CellBuckets, SpatialHash } from './spatial-hash';

export interface ZombieMoveParams {
  readonly speedMps: number;
  readonly dt: number;
  readonly sightM: number;
  /** Separation distance (two radii). */
  readonly diameterM: number;
  readonly separationWeight: number;
  readonly maxPerCell: number;
  readonly noiseUnits: number;
  /** Angle units per noise unit when picking a heading from standstill. */
  readonly idleHeadingScale: number;
  readonly targetScanInterval: number;
  readonly maxSeparationNeighbors: number;
}

export interface HordeState {
  readonly n: number;
  readonly cellM: number;
  readonly sizeM: number;
  readonly walkable: Uint8Array;
  /** Zombies per map cell (density cap). */
  readonly zombieCells: Uint16Array;
  readonly zombies: AgentPool;
  readonly civilians: AgentPool;
  /** Zombies per map cell, for separation. */
  readonly zombieBuckets: CellBuckets;
  readonly civilianHash: SpatialHash;
  readonly flow: FlowField;
  readonly rng: Rng;
}

function findTarget(s: HordeState, x: number, y: number, sight: number): number {
  const h = s.civilianHash;
  const x0 = h.coord(x - sight);
  const x1 = h.coord(x + sight);
  const y0 = h.coord(y - sight);
  const y1 = h.coord(y + sight);
  if (h.windowCount(x0, y0, x1, y1) === 0) return -1;
  const { posX, posY } = s.civilians;
  let best = -1;
  let bestD = sight * sight;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * h.side + gx;
      const end = h.start[c + 1] as number;
      for (let k = h.start[c] as number; k < end; k++) {
        const j = h.items[k] as number;
        const dx = (posX[j] as number) - x;
        const dy = (posY[j] as number) - y;
        const d = dx * dx + dy * dy;
        if (d <= bestD && (d < bestD || best < 0 || j < best)) {
          bestD = d;
          best = j;
        }
      }
    }
  }
  return best;
}

export function moveZombies(s: HordeState, p: ZombieMoveParams, tick: number): void {
  const z = s.zombies;
  const { posX, posY, velX, velY, alive, cell, target } = z;
  const civ = s.civilians;
  const { n, cellM, walkable, zombieCells, flow, rng } = s;
  const zb = s.zombieBuckets;
  const bStart = zb.start;
  const bItems = zb.items;
  const bx = zb.x;
  const by = zb.y;
  const dirs = flow.dirs;
  const maxXY = s.sizeM - 1e-3;
  const sight2 = p.sightM * p.sightM;
  const diam = p.diameterM;
  const diam2 = diam * diam;
  const invDiam = 1 / diam;
  const hw = z.highWater;

  for (let i = 0; i < hw; i++) {
    if (!alive[i]) continue;
    const x = posX[i] as number;
    const y = posY[i] as number;
    const c0 = cell[i] as number;

    // Rule 1: nearest human in sight (scan staggered over slots, keep the target in between).
    let t = target[i] as number;
    if ((i + tick) % p.targetScanInterval === 0) t = findTarget(s, x, y, p.sightM);
    else if (t >= 0) {
      const dx = (civ.posX[t] as number) - x;
      const dy = (civ.posY[t] as number) - y;
      if (!civ.alive[t] || dx * dx + dy * dy > sight2) t = -1;
    }
    target[i] = t;

    // Desired direction: target, else flow field (rules 2/3), else keep heading.
    let dx = 0;
    let dy = 0;
    if (t >= 0) {
      dx = (civ.posX[t] as number) - x;
      dy = (civ.posY[t] as number) - y;
    } else {
      const d = dirs[c0] as number;
      if (d !== DIR_NONE) {
        dx = DIR_X[d] as number;
        dy = DIR_Y[d] as number;
      } else {
        dx = velX[i] as number;
        dy = velY[i] as number;
      }
    }
    let len = Math.sqrt(dx * dx + dy * dy);
    const turn = rng.nextInt(-p.noiseUnits, p.noiseUnits + 1);
    if (len < 1e-6) {
      // Standing still without a goal: pick a heading from the noise draw.
      dx = cosU(turn * p.idleHeadingScale);
      dy = sinU(turn * p.idleHeadingScale);
    } else {
      const ux = dx / len;
      const uy = dy / len;
      const c = cosU(turn);
      const sn = sinU(turn);
      dx = ux * c - uy * sn;
      dy = ux * sn + uy * c;
    }

    // Rule 4: separation from overlapping neighbors (own map cell, plus neighbor cells when close to an edge).
    let sx = 0;
    let sy = 0;
    let found = 0;
    const cxc = c0 % n;
    const cyc = (c0 - cxc) / n;
    const fx = x - cxc * cellM;
    const fy = y - cyc * cellM;
    const gx0 = fx < diam && cxc > 0 ? -1 : 0;
    const gx1 = fx > cellM - diam && cxc < n - 1 ? 1 : 0;
    const gy0 = fy < diam && cyc > 0 ? -n : 0;
    const gy1 = fy > cellM - diam && cyc < n - 1 ? n : 0;
    search: for (let oyc = gy0; oyc <= gy1; oyc += n) {
      for (let oxc = gx0; oxc <= gx1; oxc++) {
        const hc = c0 + oyc + oxc;
        const end = bStart[hc + 1] as number;
        for (let k = bStart[hc] as number; k < end; k++) {
          const ox = x - (bx[k] as number);
          const oy = y - (by[k] as number);
          const d2 = ox * ox + oy * oy;
          if (d2 >= diam2) continue;
          const j = bItems[k] as number;
          if (j === i) continue;
          if (d2 > 0) {
            // Push grows linearly with overlap: (diam - d) / diam along the unit offset.
            const f = 1 / Math.sqrt(d2) - invDiam;
            sx += ox * f;
            sy += oy * f;
          } else sx += i < j ? 1 : -1;
          if (++found >= p.maxSeparationNeighbors) break search;
        }
      }
    }

    let vx = (dx + sx * p.separationWeight) * p.speedMps;
    let vy = (dy + sy * p.separationWeight) * p.speedMps;
    len = Math.sqrt(vx * vx + vy * vy);
    if (len > p.speedMps) {
      vx *= p.speedMps / len;
      vy *= p.speedMps / len;
    }

    // Move; never into buildings, water or full cells. Slide along one axis if the diagonal is blocked.
    // Round to float32 first so the cell matches the stored position exactly.
    let nx = Math.fround(Math.min(Math.max(x + vx * p.dt, 0), maxXY));
    let ny = Math.fround(Math.min(Math.max(y + vy * p.dt, 0), maxXY));
    let nc = Math.floor(ny / cellM) * n + Math.floor(nx / cellM);
    if (nc !== c0 && !(walkable[nc] && (zombieCells[nc] as number) < p.maxPerCell)) {
      const cx = Math.floor(y / cellM) * n + Math.floor(nx / cellM);
      const cy = Math.floor(ny / cellM) * n + Math.floor(x / cellM);
      if (cx === c0 || (walkable[cx] && (zombieCells[cx] as number) < p.maxPerCell)) {
        ny = y;
        vy = 0;
        nc = cx;
      } else if (cy === c0 || (walkable[cy] && (zombieCells[cy] as number) < p.maxPerCell)) {
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
      zombieCells[c0] = (zombieCells[c0] as number) - 1;
      zombieCells[nc] = (zombieCells[nc] as number) + 1;
      cell[i] = nc;
    }
    posX[i] = nx;
    posY[i] = ny;
    velX[i] = vx;
    velY[i] = vy;
  }
}
