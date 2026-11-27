// Target selection (GDD 9): nearest visible zombie over the coarse density and the 4 m buckets (snipers prefer
// special types), spotting by own squads and watchtowers, mortar aim at the densest spotted cell. Allocation-free.
import { TERRAIN } from '../../core/types/map';
import { STRUCTURES } from '../../data/buildings/defense';
import { MORTAR, UNIT_BEHAVIOUR } from '../../data/units/present';
import { ZT_WALKER } from '../horde/zombie-traits';
import type { SimState } from '../state';
import { SK, SS_DONE } from '../structures/kinds';
import { lineClear } from './line';
import { FM_FREE, UT_MIN_RANGE, UT_RANGE } from './units';

/** Squared-distance penalty that ranks every walker behind every special type (sniper preference). */
const SPECIAL_PENALTY = 1e9;

/** Per-world scratch for combat: transparency per cell and the spotted mask over coarse cells. */
export class CombatScratch {
  /** 1 where a line of fire passes (not a building). */
  readonly sightClear: Uint8Array;
  /** Per density cell: tick of the last spotting pass that saw it. */
  readonly spotted: Int32Array;
  spottedTick = -1;

  constructor(s: SimState) {
    this.sightClear = new Uint8Array(s.cells);
    const t = s.map.terrain;
    for (let c = 0; c < s.cells; c++) this.sightClear[c] = t[c] === TERRAIN.building ? 0 : 1;
    this.spotted = new Int32Array(s.density.side * s.density.side).fill(-1);
  }
}

/**
 * Nearest visible zombie to (qx, qy) within qr, also within [minR, maxR] of the shooter (sx, sy).
 * With `specials`, any non-walker beats every walker. `own`: the shooter's building (garrison), else -1.
 */
export function findTarget(
  s: SimState,
  sx: number,
  sy: number,
  minR: number,
  maxR: number,
  qx: number,
  qy: number,
  qr: number,
  specials: boolean,
  own = -1,
): number {
  const dens = s.density;
  const ids = own >= 0 ? s.map.buildingId : null;
  const side = dens.side;
  const count = dens.count;
  const zb = s.zombieBuckets;
  const z = s.zombies;
  const n = s.n;
  const cm = s.cellM;
  const per = Math.round(dens.cellM / cm);
  const clear = s.combat.sightClear;
  const gx0 = dens.coord(qx);
  const gy0 = dens.coord(qy);
  const R = Math.ceil(qr / dens.cellM);
  const min2 = minR * minR;
  const max2 = maxR * maxR;
  const q2 = qr * qr;
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let r = 0; r <= R; r++) {
    // Every cell in ring r is at least (r - 1) coarse cells away from the query point.
    if (best >= 0 && bestScore < SPECIAL_PENALTY) {
      const inner = (r - 1) * dens.cellM;
      if (inner > 0 && inner * inner > bestScore) break;
    }
    for (let dy = -r; dy <= r; dy++) {
      const gy = gy0 + dy;
      if (gy < 0 || gy >= side) continue;
      const edge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx += edge || r === 0 ? 1 : 2 * r) {
        const gx = gx0 + dx;
        if (gx < 0 || gx >= side || count[gy * side + gx] === 0) continue;
        const mx1 = Math.min(n, (gx + 1) * per);
        const my1 = Math.min(n, (gy + 1) * per);
        for (let my = gy * per; my < my1; my++) {
          for (let mx = gx * per; mx < mx1; mx++) {
            const c = my * n + mx;
            const end = zb.start[c + 1] as number;
            for (let k = zb.start[c] as number; k < end; k++) {
              const j = zb.items[k] as number;
              if (!z.alive[j]) continue;
              const zx = z.posX[j] as number;
              const zy = z.posY[j] as number;
              const ax = zx - qx;
              const ay = zy - qy;
              const dq = ax * ax + ay * ay;
              if (dq > q2) continue;
              const bx = zx - sx;
              const by = zy - sy;
              const ds = bx * bx + by * by;
              if (ds > max2 || ds < min2) continue;
              const score = specials && z.kind[j] === ZT_WALKER ? dq + SPECIAL_PENALTY : dq;
              if (score >= bestScore || (score === bestScore && j > best)) continue;
              if (!lineClear(n, clear, sx / cm, sy / cm, zx / cm, zy / cm, ids, own)) continue;
              best = j;
              bestScore = score;
            }
          }
        }
      }
    }
  }
  return best;
}

function markDisc(s: SimState, x: number, y: number, r: number, tick: number): void {
  const dens = s.density;
  const side = dens.side;
  const cmD = dens.cellM;
  const x0 = dens.coord(x - r);
  const x1 = dens.coord(x + r);
  const y0 = dens.coord(y - r);
  const y1 = dens.coord(y + r);
  for (let gy = y0; gy <= y1; gy++) {
    const dy = (gy + 0.5) * cmD - y;
    for (let gx = x0; gx <= x1; gx++) {
      const dx = (gx + 0.5) * cmD - x;
      if (dx * dx + dy * dy <= r * r) s.combat.spotted[gy * side + gx] = tick;
    }
  }
}

/** Marks density cells within spotRadiusM of any own squad (+ tower bonus) or finished watchtower. */
function spot(s: SimState, tick: number): void {
  const sc = s.combat;
  if (sc.spottedTick === tick) return;
  sc.spottedTick = tick;
  const p = s.units.pool;
  for (let u = 0; u < p.highWater; u++)
    if (p.alive[u])
      markDisc(
        s,
        p.posX[u] as number,
        p.posY[u] as number,
        MORTAR.spotRadiusM + (s.units.rangeBonus[u] as number),
        tick,
      );
  const S = s.structures;
  const tower = SK.watchtower;
  for (let i = 0; i < S.highWater; i++)
    if (S.alive[i] && S.kind[i] === tower && S.state[i] === SS_DONE)
      markDisc(
        s,
        S.cx[i] as number,
        S.cy[i] as number,
        MORTAR.spotRadiusM + STRUCTURES.watchtower.sightBonusM,
        tick,
      );
}

function isSpotted(s: SimState, x: number, y: number): boolean {
  const d = s.density;
  return s.combat.spotted[d.coord(y) * d.side + d.coord(x)] === s.combat.spottedTick;
}

/** Any own squad within `r` of (x, y)? */
function ownNear(s: SimState, x: number, y: number, r: number): boolean {
  const p = s.units.pool;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const dx = (p.posX[u] as number) - x;
    const dy = (p.posY[u] as number) - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** Mortar aim: AttackArea point, else (fire mode free) the densest spotted cell in range, not danger close. */
export function aimMortar(s: SimState, u: number, tick: number): void {
  const U = s.units;
  const p = U.pool;
  const t = p.kind[u] as number;
  const x = p.posX[u] as number;
  const y = p.posY[u] as number;
  const minR = UT_MIN_RANGE[t] as number;
  const maxR = UT_RANGE[t] as number;
  spot(s, tick);
  U.aimOn[u] = 0;
  if (U.attackOn[u]) {
    const ax = U.attackX[u] as number;
    const ay = U.attackY[u] as number;
    const d2 = (ax - x) * (ax - x) + (ay - y) * (ay - y);
    if (d2 >= minR * minR && d2 <= maxR * maxR) {
      U.aimOn[u] = 1;
      U.aimX[u] = ax;
      U.aimY[u] = ay;
      U.aimSpotted[u] = isSpotted(s, ax, ay) ? 1 : 0;
    }
    return;
  }
  if (U.fireMode[u] !== FM_FREE) return;
  const dens = s.density;
  const side = dens.side;
  const cmD = dens.cellM;
  const x0 = dens.coord(x - maxR);
  const x1 = dens.coord(x + maxR);
  const y0 = dens.coord(y - maxR);
  const y1 = dens.coord(y + maxR);
  const sp = s.combat.spotted;
  let best = -1;
  let bestCount = MORTAR.minCluster - 1;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * side + gx;
      const m = dens.count[c] as number;
      if (m <= bestCount || sp[c] !== tick) continue;
      const dx = (gx + 0.5) * cmD - x;
      const dy = (gy + 0.5) * cmD - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minR * minR || d2 > maxR * maxR) continue;
      best = c;
      bestCount = m;
    }
  }
  if (best < 0) return;
  // Aim at the centroid of the cell's zombies (density keeps sums; query the cell itself).
  const bx = ((best % side) + 0.5) * cmD;
  const by = (Math.floor(best / side) + 0.5) * cmD;
  dens.query(bx, by, cmD * 0.5);
  const ax = dens.found > 0 ? dens.cx : bx;
  const ay = dens.found > 0 ? dens.cy : by;
  if (ownNear(s, ax, ay, MORTAR.dangerCloseM)) return;
  U.aimOn[u] = 1;
  U.aimX[u] = ax;
  U.aimY[u] = ay;
  U.aimSpotted[u] = 1;
}

/** Range bonus from a finished watchtower within towerRadiusM. */
export function towerBonus(s: SimState, x: number, y: number): number {
  return s.structures.nearestDone(s, 'watchtower', x, y, UNIT_BEHAVIOUR.towerRadiusM) >= 0
    ? STRUCTURES.watchtower.sightBonusM
    : 0;
}
