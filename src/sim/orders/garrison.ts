// Garrisons in city buildings (GDD 9: infantry occupies buildings, cover +50 %; GDD 7: higher posts see further).
// A garrisoned squad stands on an interior point of the footprint, cannot be attacked from the street and fires
// from inside. Zombies next to the building wear down its integrity like a wall (GDD 8 rule 5); at 0 the
// garrison is forced out and takes damage.
import { TICK_RATE } from '../../core/loop';
import { STRUCTURE_RULES } from '../../data/buildings/defense';
import { GARRISON, garrisonCapacity } from '../../data/orders';
import { towerBonus } from '../combat/targeting';
import { damageUnit } from '../combat/unit-damage';
import { coverAt, PATH_NONE, US_GARRISONED, UT_HP, UT_SIZE } from '../combat/units';
import { nearestCell } from '../map/grid';
import type { SimState } from '../state';

const PRESSURE_DT = STRUCTURE_RULES.pressureIntervalTicks / TICK_RATE;

/** Footprint cells of city building b. */
export function buildingCells(s: SimState, b: number): number {
  const B = s.map.buildings;
  return (B.w[b] as number) * (B.h[b] as number);
}

/** Squads that fit into building b (floors x footprint, data). */
export function buildingCapacity(s: SimState, b: number): number {
  return garrisonCapacity(s.map.buildings.floors[b] as number, buildingCells(s, b));
}

export function buildingHp(s: SimState, b: number): number {
  return GARRISON.hpBase + GARRISON.hpPerCell * buildingCells(s, b);
}

/** Sight and range bonus of a squad: floors of its building, else a watchtower nearby. */
export function sightBonus(s: SimState, u: number, x: number, y: number): number {
  const b = s.units.garrison[u] as number;
  if (b < 0) return towerBonus(s, x, y);
  const floors = s.map.buildings.floors[b] as number;
  return Math.min(GARRISON.maxSightBonusM, Math.max(0, floors - 1) * GARRISON.sightPerFloorM);
}

/** Squad u enters building b and takes the interior point (x, y). */
export function enterBuilding(s: SimState, u: number, b: number, x: number, y: number): void {
  const U = s.units;
  const p = U.pool;
  U.garrison[u] = b;
  U.ostate[u] = US_GARRISONED;
  p.posX[u] = Math.fround(x);
  p.posY[u] = Math.fround(y);
  p.cell[u] = s.cellOf(x, y);
  p.velX[u] = 0;
  p.velY[u] = 0;
  p.target[u] = -1;
  U.moving[u] = 0;
  U.pathState[u] = PATH_NONE;
  U.wpCount[u] = 0;
  U.nextScan[u] = s.tick;
  U.cover[u] = 1;
  s.orders.garrisonCount[b] = (s.orders.garrisonCount[b] as number) + 1;
  s.orders.version++;
  s.unitsDirty = true;
}

/** Squad u steps out of its building onto the nearest walkable cell. */
export function leaveBuilding(s: SimState, u: number): void {
  const U = s.units;
  const p = U.pool;
  const b = U.garrison[u] as number;
  if (b < 0) return;
  U.garrison[u] = -1;
  s.orders.garrisonCount[b] = Math.max(0, (s.orders.garrisonCount[b] as number) - 1);
  s.orders.version++;
  const n = s.n;
  const c0 = p.cell[u] as number;
  const c = nearestCell(n, c0 % n, Math.floor(c0 / n), (i) => s.civWalk[i] === 1);
  if (c >= 0) {
    p.cell[u] = c;
    p.posX[u] = Math.fround(((c % n) + 0.5) * s.cellM);
    p.posY[u] = Math.fround((Math.floor(c / n) + 0.5) * s.cellM);
  }
  U.cover[u] = coverAt(s, p.cell[u] as number);
  s.unitsDirty = true;
}

/** Zombies in the ring of cells around building b. */
function zombiesAround(s: SimState, b: number): number {
  const B = s.map.buildings;
  const n = s.n;
  const x0 = (B.x[b] as number) - 1;
  const y0 = (B.y[b] as number) - 1;
  const x1 = (B.x[b] as number) + (B.w[b] as number);
  const y1 = (B.y[b] as number) + (B.h[b] as number);
  const zc = s.zombieCells;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= n) continue;
    const edge = y === y0 || y === y1;
    for (let x = x0; x <= x1; x += edge ? 1 : x1 - x0) {
      if (x >= 0 && x < n) count += zc[y * n + x] as number;
      if (x1 === x0) break;
    }
  }
  return count;
}

/** Pressure on occupied buildings; forces garrisons out at integrity 0. */
export function garrisonPressure(s: SimState, tick: number): void {
  if (tick % STRUCTURE_RULES.pressureIntervalTicks !== 0) return;
  const U = s.units;
  const p = U.pool;
  const O = s.orders;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const b = U.garrison[u] as number;
    if (b < 0 || O.pressedAt[b] === tick) continue;
    O.pressedAt[b] = tick;
    const count = zombiesAround(s, b);
    if (count === 0) continue;
    const loss = (count * STRUCTURE_RULES.pressureDpsPerZombie * PRESSURE_DT) / buildingHp(s, b);
    const left = Math.max(0, (O.integrity[b] as number) - loss);
    O.integrity[b] = Math.fround(left);
    if (left <= 0) evict(s, b);
  }
}

/** Integrity 0: every squad in building b is thrown out and hurt; orders holding b are told. */
function evict(s: SimState, b: number): void {
  const U = s.units;
  const p = U.pool;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u] || U.garrison[u] !== b) continue;
    leaveBuilding(s, u);
    const t = p.kind[u] as number;
    damageUnit(s, u, GARRISON.ejectDamageShare * (UT_SIZE[t] as number) * (UT_HP[t] as number), true);
  }
  s.orders.garrisonLost(s, b);
}
