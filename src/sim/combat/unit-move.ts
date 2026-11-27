// Unit AI and movement (GDD 4 step 10, GDD 9 Haltungen): orders and waypoints, stances (hold, hold until 50 %
// losses, aggressive pursuit, retreat to the nearest rally point), morale break, path following with sliding.
import type { Command } from '../../core/commands';
import { TICK_RATE } from '../../core/loop';
import { UNIT_BEHAVIOUR, UNIT_ENGINE } from '../../data/units/present';
import { leaveBuilding } from '../orders/garrison';
import { ZK_RALLY, ZONE_STRIDE } from '../population/zones';
import type { SimState } from '../state';
import {
  coverAt,
  FIRE_MODES,
  PATH_NONE,
  PATH_READY,
  ST_AGGRESSIVE,
  ST_HOLD_UNTIL_LOSSES,
  ST_RETREAT,
  STANCES,
  UT_RANGE,
  UT_SPEED,
} from './units';

/** Unit.moving codes. */
export const MV_NONE = 0;
export const MV_ORDER = 1;
export const MV_PURSUIT = 2;
export const MV_RETREAT = 3;

const DT = 1 / TICK_RATE;
/** Aggressive squads look for zombies this often (ticks, staggered by slot). */
const SEEK_INTERVAL = TICK_RATE;

function validIds(s: SimState, ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const out: number[] = [];
  const p = s.units.pool;
  for (const v of ids) if (Number.isInteger(v) && v >= 0 && v < p.highWater && p.alive[v]) out.push(v);
  return out;
}

export function setGoal(s: SimState, u: number, x: number, y: number, mode: number): void {
  const U = s.units;
  U.goalX[u] = Math.fround(Math.min(Math.max(x, 0), s.sizeM - 1e-3));
  U.goalY[u] = Math.fround(Math.min(Math.max(y, 0), s.sizeM - 1e-3));
  U.moving[u] = mode;
  s.planner.request(s, u);
}

export function stop(s: SimState, u: number): void {
  const U = s.units;
  U.moving[u] = MV_NONE;
  U.pathState[u] = PATH_NONE;
  U.pool.velX[u] = 0;
  U.pool.velY[u] = 0;
}

/** Nearest open rally point, else the placement point. */
function retreatTo(s: SimState, u: number): void {
  const U = s.units;
  const x = U.pool.posX[u] as number;
  const y = U.pool.posY[u] as number;
  const z = s.zones;
  let bx = U.homeX[u] as number;
  let by = U.homeY[u] as number;
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < z.kind.length; k++) {
    if (z.kind[k] !== ZK_RALLY) continue;
    const rx = z.shape[k * ZONE_STRIDE] as number;
    const ry = z.shape[k * ZONE_STRIDE + 1] as number;
    const d = (rx - x) * (rx - x) + (ry - y) * (ry - y);
    if (d < best) {
      best = d;
      bx = rx;
      by = ry;
    }
  }
  setGoal(s, u, bx, by, MV_RETREAT);
  U.wpCount[u] = 0;
}

/** MoveUnits, SetStance, SetFireMode, AttackArea. Returns false for other commands. */
export function applyUnitCommand(s: SimState, cmd: Command): boolean {
  const U = s.units;
  switch (cmd.type) {
    case 'MoveUnits': {
      const { x, y, append } = cmd.payload;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
      const ids = validIds(s, cmd.payload.unitIds).filter((u) => !U.broken[u]);
      // Squad grid around the point, in the given order.
      const cols = Math.ceil(Math.sqrt(ids.length));
      const sp = UNIT_BEHAVIOUR.formationSpacingM;
      ids.forEach((u, k) => {
        // Direct moves (bots, sandbox) take the squad off its order and out of a building.
        s.orders.detach(s, u);
        if ((U.garrison[u] as number) >= 0) leaveBuilding(s, u);
        const gx = x + ((k % cols) - (cols - 1) / 2) * sp;
        const gy = y + (Math.floor(k / cols) - (Math.ceil(ids.length / cols) - 1) / 2) * sp;
        if (append && U.moving[u] === MV_ORDER) {
          const w = U.wpCount[u] as number;
          if (w >= U.maxWaypoints) return;
          U.wpX[u * U.maxWaypoints + w] = Math.fround(gx);
          U.wpY[u * U.maxWaypoints + w] = Math.fround(gy);
          U.wpCount[u] = w + 1;
          return;
        }
        U.wpCount[u] = 0;
        U.attackOn[u] = 0;
        setGoal(s, u, gx, gy, MV_ORDER);
      });
      return true;
    }
    case 'SetStance': {
      const st = STANCES.indexOf(cmd.payload.stance);
      if (st < 0) return true;
      for (const u of validIds(s, cmd.payload.unitIds)) {
        U.stance[u] = st;
        if (st === ST_RETREAT) retreatTo(s, u);
        else if (U.moving[u] === MV_RETREAT && !U.broken[u]) stop(s, u);
      }
      return true;
    }
    case 'SetFireMode': {
      const m = FIRE_MODES.indexOf(cmd.payload.mode);
      if (m < 0) return true;
      for (const u of validIds(s, cmd.payload.unitIds)) U.fireMode[u] = m;
      return true;
    }
    case 'AttackArea': {
      const { x, y } = cmd.payload;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
      for (const u of validIds(s, cmd.payload.unitIds)) {
        U.attackOn[u] = 1;
        U.attackX[u] = Math.fround(x);
        U.attackY[u] = Math.fround(y);
        U.pool.target[u] = -1;
        U.nextScan[u] = s.tick;
      }
      return true;
    }
    default:
      return false;
  }
}

export function moveUnits(s: SimState, tick: number): void {
  const U = s.units;
  const p = U.pool;
  const { posX, posY, velX, velY, cell, alive } = p;
  const walk = s.civWalk;
  const n = s.n;
  const cm = s.cellM;
  const maxXY = s.sizeM - 1e-3;
  const arrive = UNIT_BEHAVIOUR.arriveRadiusM;
  s.planner.advance(s, UNIT_ENGINE.pathExpansionsPerTick);
  for (let u = 0; u < p.highWater; u++) {
    if (!alive[u]) continue;
    const t = p.kind[u] as number;

    // Garrisons stay inside unless the stance or broken morale forces them out.
    if ((U.garrison[u] as number) >= 0) {
      const leave =
        (U.stance[u] === ST_HOLD_UNTIL_LOSSES && U.strength(u) <= UNIT_BEHAVIOUR.lossRetreatThreshold) ||
        (U.morale[u] as number) < UNIT_BEHAVIOUR.moraleBreakThreshold;
      if (!leave) {
        velX[u] = 0;
        velY[u] = 0;
        continue;
      }
      leaveBuilding(s, u);
    }

    // Behaviour: losses, morale, pursuit.
    if (U.stance[u] === ST_HOLD_UNTIL_LOSSES && U.strength(u) <= UNIT_BEHAVIOUR.lossRetreatThreshold) {
      U.stance[u] = ST_RETREAT;
      retreatTo(s, u);
    }
    if (!U.broken[u] && (U.morale[u] as number) < UNIT_BEHAVIOUR.moraleBreakThreshold) {
      U.broken[u] = 1;
      U.attackOn[u] = 0;
      retreatTo(s, u);
    } else if (U.broken[u] && (U.morale[u] as number) >= UNIT_BEHAVIOUR.moraleRecoverThreshold)
      U.broken[u] = 0;
    const mv = U.moving[u] as number;
    if (mv === MV_PURSUIT && (p.target[u] as number) >= 0) stop(s, u);
    else if (
      U.stance[u] === ST_AGGRESSIVE &&
      mv === MV_NONE &&
      (p.target[u] as number) < 0 &&
      (u + tick) % SEEK_INTERVAL === 0 &&
      (UT_RANGE[t] as number) > 0
    ) {
      const x = posX[u] as number;
      const y = posY[u] as number;
      if (s.density.query(x, y, UNIT_BEHAVIOUR.aggressiveSeekM) > 0) {
        // Close in to 70 % of the weapon range.
        const dx = s.density.cx - x;
        const dy = s.density.cy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const keep = 0.7 * (UT_RANGE[t] as number);
        if (d > keep) setGoal(s, u, x + (dx * (d - keep)) / d, y + (dy * (d - keep)) / d, MV_PURSUIT);
      }
    }

    if (U.moving[u] === MV_NONE || U.pathState[u] !== PATH_READY) {
      velX[u] = 0;
      velY[u] = 0;
      continue;
    }
    // Follow the corners.
    const base = u * U.maxCorners;
    const x = posX[u] as number;
    const y = posY[u] as number;
    let k = U.pathIdx[u] as number;
    let tx = U.pathX[base + k] as number;
    let ty = U.pathY[base + k] as number;
    let dx = tx - x;
    let dy = ty - y;
    let d = Math.sqrt(dx * dx + dy * dy);
    while (d <= arrive && k < (U.pathLen[u] as number)) {
      k++;
      U.pathIdx[u] = k;
      if (k >= (U.pathLen[u] as number)) break;
      tx = U.pathX[base + k] as number;
      ty = U.pathY[base + k] as number;
      dx = tx - x;
      dy = ty - y;
      d = Math.sqrt(dx * dx + dy * dy);
    }
    if (k >= (U.pathLen[u] as number)) {
      velX[u] = 0;
      velY[u] = 0;
      if (U.pathPartial[u]) {
        s.planner.request(s, u);
        continue;
      }
      const w = U.wpCount[u] as number;
      if (w > 0 && U.moving[u] === MV_ORDER) {
        const mw = U.maxWaypoints;
        const nx = U.wpX[u * mw] as number;
        const ny = U.wpY[u * mw] as number;
        U.wpX.copyWithin(u * mw, u * mw + 1, u * mw + w);
        U.wpY.copyWithin(u * mw, u * mw + 1, u * mw + w);
        U.wpCount[u] = w - 1;
        setGoal(s, u, nx, ny, MV_ORDER);
      } else stop(s, u);
      continue;
    }
    const speed = UT_SPEED[t] as number;
    const step = Math.min(speed * DT, d);
    let vx = (dx / d) * speed;
    let vy = (dy / d) * speed;
    let nx = Math.fround(Math.min(Math.max(x + (dx / d) * step, 0), maxXY));
    let ny = Math.fround(Math.min(Math.max(y + (dy / d) * step, 0), maxXY));
    const c0 = cell[u] as number;
    let nc = Math.floor(ny / cm) * n + Math.floor(nx / cm);
    if (nc !== c0 && !walk[nc]) {
      const cx = Math.floor(y / cm) * n + Math.floor(nx / cm);
      const cy = Math.floor(ny / cm) * n + Math.floor(x / cm);
      if (cx === c0 || walk[cx]) {
        ny = y;
        vy = 0;
        nc = cx;
      } else if (cy === c0 || walk[cy]) {
        nx = x;
        vx = 0;
        nc = cy;
      } else {
        // Blocked (closed gate or a new structure): wait, re-plan now and then.
        nx = x;
        ny = y;
        vx = 0;
        vy = 0;
        nc = c0;
        if ((u + tick) % SEEK_INTERVAL === 0) s.planner.request(s, u);
      }
    }
    if (nc !== c0) {
      cell[u] = nc;
      U.cover[u] = coverAt(s, nc);
    }
    posX[u] = nx;
    posY[u] = ny;
    velX[u] = vx;
    velY[u] = vy;
  }
}
