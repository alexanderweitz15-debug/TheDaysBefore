// Helpers for the M2 acceptance tests: reading agent positions from a world and measuring outbreak spread.
import { KEY_SITES, type KeySite, TERRAIN } from '../src/core/types/map';
import type { SimWorld } from '../src/core/types/sim';
import type { AgentSection } from '../src/core/types/snapshot';

export interface Point {
  x: number;
  y: number;
}

const section = (count: number): AgentSection => ({
  count,
  ids: new Uint32Array(count),
  pos: new Float32Array(2 * count),
  kind: new Uint8Array(count),
});

/** Zombie and corpse positions: everything the outbreak has produced so far. Allocates (tests only). */
export function infectedPositions(world: SimWorld): Float32Array {
  const z = section(world.zombieCount);
  const d = section(world.corpseCount);
  world.writeZombies(z);
  world.writeCorpses(d);
  const out = new Float32Array(z.pos.length + d.pos.length);
  out.set(z.pos, 0);
  out.set(d.pos, z.pos.length);
  return out;
}

/** Centre in meters of the first building with the key site, or null. */
export function keySiteCenter(world: SimWorld, site: KeySite): Point | null {
  const b = world.map.buildings;
  const k = KEY_SITES.indexOf(site);
  for (let i = 0; i < b.count; i++) {
    if (b.keySite[i] !== k) continue;
    const cs = world.map.cellSizeM;
    return {
      x: ((b.x[i] as number) + (b.w[i] as number) / 2) * cs,
      y: ((b.y[i] as number) + (b.h[i] as number) / 2) * cs,
    };
  }
  return null;
}

/** Building (centre and bounds in meters) whose centre distance to `from` is closest to `distM`. */
export function buildingAtDistance(
  world: SimWorld,
  from: Point,
  distM: number,
  /** Buildings closer than `minM` to `away.from` are skipped. */
  away?: { from: Point; minM: number },
): { center: Point; x0: number; y0: number; x1: number; y1: number } {
  const b = world.map.buildings;
  const cs = world.map.cellSizeM;
  let best = -1;
  let bestErr = Number.POSITIVE_INFINITY;
  for (let i = 0; i < b.count; i++) {
    const cx = ((b.x[i] as number) + (b.w[i] as number) / 2) * cs;
    const cy = ((b.y[i] as number) + (b.h[i] as number) / 2) * cs;
    if (away && Math.hypot(cx - away.from.x, cy - away.from.y) < away.minM) continue;
    const err = Math.abs(Math.hypot(cx - from.x, cy - from.y) - distM);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  if (best < 0) throw new Error('map has no buildings');
  const x0 = (b.x[best] as number) * cs;
  const y0 = (b.y[best] as number) * cs;
  const x1 = x0 + (b.w[best] as number) * cs;
  const y1 = y0 + (b.h[best] as number) * cs;
  return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, x0, y0, x1, y1 };
}

/** Straight polyline from `a` towards `b` (flat x, y list), starting `startFrac` of the way, `steps` points. */
export function straightPolyline(a: Point, b: Point, startFrac: number, steps: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < steps; k++) {
    const f = startFrac + ((1 - startFrac) * k) / (steps - 1);
    pts.push(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  }
  return pts;
}

/** Centers (meters, flat x, y) of the map cells whose infection density is above zero (debug field). */
export function infectionCells(world: SimWorld): Float32Array {
  const f = world.debugField('infection');
  if (!f) throw new Error('world has no infection field');
  const pts: number[] = [];
  for (let c = 0; c < f.data.length; c++) {
    if (!f.data[c]) continue;
    pts.push(((c % f.widthCells) + 0.5) * f.cellSizeM, (Math.floor(c / f.widthCells) + 0.5) * f.cellSizeM);
  }
  return new Float32Array(pts);
}

export interface SpreadStats {
  /** Occupied grid cells. */
  cells: number;
  /** Share of occupied cells in the largest connected component (1 = one connected area). */
  largestShare: number;
  /** 90th percentile of the distance of the positions to `origin`, meters. */
  radiusP90: number;
  /** Largest distance of any position to `origin`, meters. */
  radiusMax: number;
}

/**
 * Spread of positions on a grid of `cellM` meters. Cells count as connected when they are within `gap`
 * cells of each other (8-neighbourhood, so `gap` 1 is plain 8-connectivity).
 */
export function spreadStats(
  pos: Float32Array,
  origin: Point,
  widthM: number,
  cellM: number,
  gap: number,
): SpreadStats {
  const side = Math.ceil(widthM / cellM);
  const occupied = new Uint8Array(side * side);
  const dist: number[] = [];
  for (let i = 0; i < pos.length; i += 2) {
    const x = pos[i] as number;
    const y = pos[i + 1] as number;
    const cx = Math.min(side - 1, Math.floor(x / cellM));
    const cy = Math.min(side - 1, Math.floor(y / cellM));
    occupied[cy * side + cx] = 1;
    dist.push(Math.hypot(x - origin.x, y - origin.y));
  }
  let cells = 0;
  for (let i = 0; i < occupied.length; i++) cells += occupied[i] as number;
  if (cells === 0) return { cells: 0, largestShare: 0, radiusP90: 0, radiusMax: 0 };

  const seen = new Uint8Array(side * side);
  const stack: number[] = [];
  let largest = 0;
  for (let start = 0; start < occupied.length; start++) {
    if (!occupied[start] || seen[start]) continue;
    let size = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const c = stack.pop() as number;
      size++;
      const cx = c % side;
      const cy = (c - cx) / side;
      for (let dy = -gap; dy <= gap; dy++) {
        for (let dx = -gap; dx <= gap; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= side || y >= side) continue;
          const j = y * side + x;
          if (occupied[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    largest = Math.max(largest, size);
  }
  dist.sort((a, b) => a - b);
  return {
    cells,
    largestShare: largest / cells,
    radiusP90: dist[Math.min(dist.length - 1, Math.floor(dist.length * 0.9))] as number,
    radiusMax: dist[dist.length - 1] as number,
  };
}

const blockOf = (world: SimWorld, blockM: number): { side: number; cellsPerBlock: number } => ({
  side: Math.ceil(world.widthM / blockM),
  cellsPerBlock: Math.round(blockM / world.map.cellSizeM),
});

/**
 * Centre (meters) of the square block of `blockM` with the most building cells that still has enough open
 * ground for civilians to walk in. The outer ring of blocks is skipped.
 */
export function mostBuiltUpBlock(world: SimWorld, blockM: number): Point {
  const { map } = world;
  const { side, cellsPerBlock: n } = blockOf(world, blockM);
  let best: Point | null = null;
  let bestBuilt = -1;
  for (let by = 1; by < side - 1; by++) {
    for (let bx = 1; bx < side - 1; bx++) {
      let built = 0;
      let open = 0;
      for (let y = by * n; y < (by + 1) * n; y++) {
        for (let x = bx * n; x < (bx + 1) * n; x++) {
          const t = map.terrain[y * map.widthCells + x];
          if (t === TERRAIN.building) built++;
          else if (t !== TERRAIN.water) open++;
        }
      }
      if (open >= (n * n) / 4 && built > bestBuilt) {
        bestBuilt = built;
        best = { x: (bx + 0.5) * blockM, y: (by + 0.5) * blockM };
      }
    }
  }
  if (!best) throw new Error('map has no built-up block');
  return best;
}

/** Centre of the `blockM` block with the most civilians whose distance to `from` is within [minM, maxM]. */
export function densestCivilianBlock(
  world: SimWorld,
  blockM: number,
  from: Point,
  minM: number,
  maxM: number,
): Point {
  const sec = section(world.civilianCount);
  world.writeCivilians(sec);
  const side = Math.ceil(world.widthM / blockM);
  const per = new Int32Array(side * side);
  for (let i = 0; i < sec.count; i++) {
    const bx = Math.floor((sec.pos[2 * i] as number) / blockM);
    const by = Math.floor((sec.pos[2 * i + 1] as number) / blockM);
    per[by * side + bx] = (per[by * side + bx] as number) + 1;
  }
  let best = -1;
  for (let b = 0; b < per.length; b++) {
    const cx = ((b % side) + 0.5) * blockM;
    const cy = (Math.floor(b / side) + 0.5) * blockM;
    const d = Math.hypot(cx - from.x, cy - from.y);
    if (d >= minM && d <= maxM && (best < 0 || (per[b] as number) > (per[best] as number))) best = b;
  }
  if (best < 0) throw new Error('no civilians in range');
  return { x: ((best % side) + 0.5) * blockM, y: (Math.floor(best / side) + 0.5) * blockM };
}
