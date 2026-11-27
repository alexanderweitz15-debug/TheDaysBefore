// Zombie movement (GDD 8 rules 1-4): direct target in sight, else noise gradient blended with the flow field
// (weight per type), separation, density cap, no movement into buildings or water. Speed per type with patient
// zero aura and scream boost. Allocation-free.
import { cosU, sinU } from '../math/trig';
import type { SimState } from '../state';
import { DIR_NONE, DIR_X, DIR_Y } from './flow-field';
import { TYPE_DIAMETER, TYPE_NOISE_SHARE, TYPE_SPEED } from './zombie-traits';

export interface ZombieMoveParams {
  readonly dt: number;
  readonly sightM: number;
  readonly separationWeight: number;
  readonly maxPerCell: number;
  readonly noiseUnits: number;
  /** Angle units per noise unit when picking a heading from standstill. */
  readonly idleHeadingScale: number;
  readonly targetScanInterval: number;
  readonly maxSeparationNeighbors: number;
  readonly auraRadiusM: number;
  readonly auraBonus: number;
  readonly screamBonus: number;
  /** Speed loss in MG-suppressed cells. */
  readonly suppression: number;
}

/** Nearest squad within sight, or -1. */
function findUnit(s: SimState, x: number, y: number, sight: number): number {
  const h = s.unitHash;
  const x0 = h.coord(x - sight);
  const x1 = h.coord(x + sight);
  const y0 = h.coord(y - sight);
  const y1 = h.coord(y + sight);
  if (h.windowCount(x0, y0, x1, y1) === 0) return -1;
  const { posX, posY, alive } = s.units.pool;
  let best = -1;
  let bestD = sight * sight;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * h.side + gx;
      const end = h.start[c + 1] as number;
      for (let k = h.start[c] as number; k < end; k++) {
        const j = h.items[k] as number;
        if (!alive[j]) continue;
        const dx = (posX[j] as number) - x;
        const dy = (posY[j] as number) - y;
        const d = dx * dx + dy * dy;
        if (d < bestD || (d === bestD && j < best)) {
          bestD = d;
          best = j;
        }
      }
    }
  }
  return best;
}

function findTarget(s: SimState, x: number, y: number, sight: number): number {
  const h = s.civilianHash;
  const x0 = h.coord(x - sight);
  const x1 = h.coord(x + sight);
  const y0 = h.coord(y - sight);
  const y1 = h.coord(y + sight);
  if (h.windowCount(x0, y0, x1, y1) === 0) return -1;
  const { posX, posY, alive } = s.civilians;
  const turn = s.ct.turnTick;
  let best = -1;
  let bestD = sight * sight;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * h.side + gx;
      const end = h.start[c + 1] as number;
      for (let k = h.start[c] as number; k < end; k++) {
        const j = h.items[k] as number;
        // Incubating humans smell like the horde and are ignored.
        if (!alive[j] || (turn[j] as number) >= 0) continue;
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

export function moveZombies(s: SimState, p: ZombieMoveParams, tick: number): void {
  const z = s.zombies;
  const { posX, posY, velX, velY, alive, cell, target, kind } = z;
  const boostUntil = s.zt.boostUntil;
  const turnTick = s.ct.turnTick;
  const noise = s.noise;
  const pz = s.outbreak.pzSlot;
  const pzX = pz >= 0 ? (posX[pz] as number) : 0;
  const pzY = pz >= 0 ? (posY[pz] as number) : 0;
  const aura2 = pz >= 0 ? p.auraRadiusM * p.auraRadiusM : -1;
  const civ = s.civilians;
  const { n, cellM, zombieCells, flow, rng, slowAt, suppressUntil } = s;
  const walkable = s.zombieWalk;
  const unitTarget = s.zt.unitTarget;
  const up = s.units.pool;
  const hasUnits = up.count > 0;
  const zb = s.zombieBuckets;
  const bStart = zb.start;
  const bItems = zb.items;
  const bx = zb.x;
  const by = zb.y;
  const dirs = flow.dirs;
  const maxXY = s.sizeM - 1e-3;
  const sight2 = p.sightM * p.sightM;
  const hw = z.highWater;

  for (let i = 0; i < hw; i++) {
    if (!alive[i]) continue;
    const x = posX[i] as number;
    const y = posY[i] as number;
    const c0 = cell[i] as number;
    const type = kind[i] as number;

    // Rule 1: nearest human in sight (scan staggered over slots, keep the target in between).
    let t = target[i] as number;
    let ut = unitTarget[i] as number;
    if ((i + tick) % p.targetScanInterval === 0) {
      t = findTarget(s, x, y, p.sightM);
      ut = hasUnits ? findUnit(s, x, y, p.sightM) : -1;
      // Squads and civilians are both humans: chase the nearer one.
      if (ut >= 0 && t >= 0) {
        const cx = (civ.posX[t] as number) - x;
        const cy = (civ.posY[t] as number) - y;
        const ux = (up.posX[ut] as number) - x;
        const uy = (up.posY[ut] as number) - y;
        if (ux * ux + uy * uy <= cx * cx + cy * cy) t = -1;
        else ut = -1;
      }
    } else if (t >= 0) {
      const dx = (civ.posX[t] as number) - x;
      const dy = (civ.posY[t] as number) - y;
      if (!civ.alive[t] || (turnTick[t] as number) >= 0 || dx * dx + dy * dy > sight2) t = -1;
    } else if (ut >= 0) {
      const dx = (up.posX[ut] as number) - x;
      const dy = (up.posY[ut] as number) - y;
      if (!up.alive[ut] || dx * dx + dy * dy > sight2) ut = -1;
    }
    target[i] = t;
    unitTarget[i] = ut;

    // Desired direction: target, else flow field (rules 2/3), else keep heading.
    let dx = 0;
    let dy = 0;
    if (ut >= 0) {
      dx = (up.posX[ut] as number) - x;
      dy = (up.posY[ut] as number) - y;
    } else if (t >= 0) {
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
      // Rule 2: noise pulls before the flow field, weighted per type.
      if (noise.sample(x, y) > 0) {
        const g = Math.sqrt(noise.gx * noise.gx + noise.gy * noise.gy);
        if (g > 1e-6) {
          const a = TYPE_NOISE_SHARE[type] as number;
          const fl = Math.sqrt(dx * dx + dy * dy);
          const keep = fl > 1e-6 ? (1 - a) / fl : 0;
          dx = dx * keep + (noise.gx / g) * a;
          dy = dy * keep + (noise.gy / g) * a;
        }
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
    const diam = TYPE_DIAMETER[type] as number;
    const diam2 = diam * diam;
    const invDiam = 1 / diam;
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

    let speed = TYPE_SPEED[type] as number;
    if (aura2 >= 0 && i !== pz) {
      const ax = x - pzX;
      const ay = y - pzY;
      if (ax * ax + ay * ay <= aura2) speed *= 1 + p.auraBonus;
    }
    if ((boostUntil[i] as number) > tick) speed *= 1 + p.screamBonus;
    // Wire and MG suppression (GDD 9).
    speed *= 1 - (slowAt[c0] as number);
    if ((suppressUntil[c0] as number) > tick) speed *= 1 - p.suppression;
    let vx = (dx + sx * p.separationWeight) * speed;
    let vy = (dy + sy * p.separationWeight) * speed;
    len = Math.sqrt(vx * vx + vy * vy);
    if (len > speed) {
      vx *= speed / len;
      vy *= speed / len;
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
