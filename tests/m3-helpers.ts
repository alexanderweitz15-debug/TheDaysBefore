// Helpers for the M3 acceptance tests: finding a street, laying out a defence along it, measuring where zombies are.
import type { Command } from '../src/core/commands';
import { ROAD_KINDS, TERRAIN } from '../src/core/types/map';
import type { SimWorld } from '../src/core/types/sim';
import type { AgentSection } from '../src/core/types/snapshot';
import { CityWorld } from '../src/sim/world';
import type { Point } from './m2-helpers';

/** A straight street with its frame: `s` runs along the street towards the defended side, `l` across it. */
export interface Street {
  centre: Point;
  /** Unit vector along the street, pointing to the defended side. */
  u: Point;
  /** Unit vector across the street. */
  n: Point;
  lengthM: number;
  widthM: number;
}

/** Point at street coordinates (s along, l across) in meters. */
export const at = (st: Street, s: number, l: number): Point => ({
  x: st.centre.x + st.u.x * s + st.n.x * l,
  y: st.centre.y + st.u.y * s + st.n.y * l,
});

/** Street coordinates of a point. */
export const toStreet = (st: Street, p: Point): { s: number; l: number } => {
  const dx = p.x - st.centre.x;
  const dy = p.y - st.centre.y;
  return { s: dx * st.u.x + dy * st.u.y, l: dx * st.n.x + dy * st.n.y };
};

/**
 * A plain street (ROAD_KINDS 'street') of at least `minLengthM` whose centre line is road all the way and that
 * lies at least `edgeMarginM` from the map border. Longest first, so the choice is stable for a seed.
 */
export function findStreet(world: SimWorld, minLengthM: number, edgeMarginM: number): Street {
  const { roads, terrain, widthCells, cellSizeM } = world.map;
  const street = ROAD_KINDS.indexOf('street');
  let best: Street | null = null;
  for (let e = 0; e < roads.edgeCount; e++) {
    if (roads.edgeKind[e] !== street) continue;
    const a = roads.edgeA[e] as number;
    const b = roads.edgeB[e] as number;
    const ax = roads.nodeX[a] as number;
    const ay = roads.nodeY[a] as number;
    const bx = roads.nodeX[b] as number;
    const by = roads.nodeY[b] as number;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < minLengthM || (best && len <= best.lengthM)) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    if (Math.min(cx, cy, world.widthM - cx, world.heightM - cy) < edgeMarginM + len / 2) continue;
    let road = true;
    for (let s = -len / 2; s <= len / 2 && road; s += cellSizeM) {
      const cell = Math.floor((cy + uy * s) / cellSizeM) * widthCells + Math.floor((cx + ux * s) / cellSizeM);
      road = terrain[cell] === TERRAIN.road;
    }
    if (road)
      best = {
        centre: { x: cx, y: cy },
        u: { x: ux, y: uy },
        n: { x: -uy, y: ux },
        lengthM: len,
        widthM: roads.edgeWidth[e] as number,
      };
  }
  if (!best) throw new Error('no suitable street');
  return best;
}

/** Removes every resident so only the scripted agents act (same bookkeeping as the sim's own removal). */
export function clearResidents(world: SimWorld): void {
  if (!(world instanceof CityWorld)) throw new Error('clearResidents needs the CityWorld');
  const s = world.s;
  for (let i = 0; i < s.civilians.highWater; i++) {
    if (!s.civilians.alive[i]) continue;
    const c = s.civilians.cell[i] as number;
    s.civilianCells[c] = (s.civilianCells[c] as number) - 1;
    s.civilians.release(i);
  }
  s.civiliansDirty = true;
}

/** Zombie positions as a flat x, y array (allocates, tests only). */
export function zombiePositions(world: SimWorld): Float32Array {
  const sec: AgentSection = {
    count: world.zombieCount,
    ids: new Uint32Array(world.zombieCount),
    pos: new Float32Array(2 * world.zombieCount),
    kind: new Uint8Array(world.zombieCount),
  };
  world.writeZombies(sec);
  return sec.pos;
}

/** Number of zombies inside the street-aligned box s in [s0, s1], |l| <= halfL. */
export function zombiesInBox(world: SimWorld, st: Street, s0: number, s1: number, halfL: number): number {
  const pos = zombiePositions(world);
  let n = 0;
  for (let i = 0; i < pos.length; i += 2) {
    const q = toStreet(st, { x: pos[i] as number, y: pos[i + 1] as number });
    if (q.s >= s0 && q.s <= s1 && Math.abs(q.l) <= halfL) n++;
  }
  return n;
}

export const spawn = (p: Point, count: number, kind: 'zombie' | 'civilian'): Command => ({
  tick: 0,
  playerId: 0,
  type: 'DebugSpawn',
  payload: { x: p.x, y: p.y, count, kind },
});

export const placeUnit = (unitType: 'infantry' | 'mgTeam' | 'engineers' | 'mortar', p: Point): Command => ({
  tick: 0,
  playerId: 0,
  type: 'PlaceUnit',
  payload: { unitType, x: p.x, y: p.y },
});

export const placeWall = (kind: 'wall' | 'barricade', a: Point, b: Point): Command => ({
  tick: 0,
  playerId: 0,
  type: 'PlaceStructure',
  payload: { kind, points: [a.x, a.y, b.x, b.y], rotation: 0 },
});
