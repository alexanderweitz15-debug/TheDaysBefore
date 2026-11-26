// Step 5: key sites (hospital, police, ..., stadium, schools, churches) and evacuation points.
import type { Rng } from '../../core/rng';
import {
  CELL_SIZE_M,
  DISTRICTS,
  type District,
  EVAC_KINDS,
  KEY_SITES,
  type KeySite,
  NONE_U8,
  TERRAIN,
} from '../../core/types/map';
import { LAYOUT } from '../../data/city/generator';
import { type Block, type BuildingList, fillBlocks, placeLarge } from './blocks';
import type { DistrictSeeds } from './districts';
import { RING_MIDDLE, RING_OUTER, ringAt } from './districts';
import { type CityGrid, isWalkable, nearestCell } from './grid';
import { KIND_MAIN, KIND_RAIL, type Segment } from './segments';
import type { TerrainInfo } from './terrain';

const D = (d: District): number => DISTRICTS.indexOf(d);
const K = (k: KeySite): number => KEY_SITES.indexOf(k);
const STADIUM_DISTRICTS = [D('residential'), D('suburb'), D('commercial'), D('university'), D('industrial')];

/** Reserves the largest suitable middle/outer block for the stadium, fills the rest, places the stadium. */
export function buildBlocksAndStadium(
  g: CityGrid,
  rng: Rng,
  t: TerrainInfo,
  blocks: Block[],
  b: BuildingList,
): void {
  const order = blocks
    .map((blk, i) => ({ i, area: (blk.x1 - blk.x0) * (blk.y1 - blk.y0), blk }))
    .filter(({ blk }) => {
      const ring = ringAt(
        t,
        g.sizeM,
        ((blk.x0 + blk.x1) / 2) * CELL_SIZE_M,
        ((blk.y0 + blk.y1) / 2) * CELL_SIZE_M,
      );
      return ring !== 0 && STADIUM_DISTRICTS.includes(blk.district);
    })
    .sort((p, q) => q.area - p.area || p.i - q.i);
  let reserved = -1;
  for (const c of order) {
    if (placeLarge(g, b, c.blk, 2, 3, K('stadium')) >= 0) {
      reserved = c.i;
      break;
    }
  }
  fillBlocks(g, rng, blocks, b, reserved);
}

interface Info {
  cx: number;
  cy: number;
  area: number;
  ring: number;
}

export function assignKeySites(
  g: CityGrid,
  rng: Rng,
  t: TerrainInfo,
  b: BuildingList,
  seeds: DistrictSeeds,
): void {
  const count = b.x.length;
  const info: Info[] = [];
  for (let i = 0; i < count; i++) {
    const cx = ((b.x[i] as number) + (b.w[i] as number) / 2) * CELL_SIZE_M;
    const cy = ((b.y[i] as number) + (b.h[i] as number) / 2) * CELL_SIZE_M;
    info.push({ cx, cy, area: (b.w[i] as number) * (b.h[i] as number), ring: ringAt(t, g.sizeM, cx, cy) });
  }
  const free = (i: number): boolean => (b.keySite[i] as number) === NONE_U8;
  /** Assigns `site` to the free building with the lowest score (ties: lower index). */
  const pick = (site: KeySite, score: (i: number) => number): number => {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      if (!free(i)) continue;
      const s = score(i);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best >= 0) b.keySite[best] = K(site);
    return best;
  };
  const inDistrict = (i: number, d: District): boolean => (b.district[i] as number) === D(d);
  const dist = (i: number, x: number, y: number): number => {
    const o = info[i] as Info;
    const dx = o.cx - x;
    const dy = o.cy - y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const big = (i: number): number => -(info[i] as Info).area;
  const prefer = (i: number, d: District, fallback: number): number =>
    inDistrict(i, d) ? big(i) : fallback + big(i);
  const PENALTY = 1e9;

  pick('hospital', (i) =>
    prefer(i, 'hospital', (info[i] as Info).ring === RING_MIDDLE ? PENALTY : 2 * PENALTY),
  );
  pick('police', (i) => dist(i, t.centerX, t.centerY) + ((info[i] as Info).area < 16 ? PENALTY : 0));
  pick('fire', (i) => ((info[i] as Info).ring === RING_MIDDLE ? 0 : PENALTY) + rng.nextFloat());
  pick('barracks', (i) =>
    prefer(i, 'military', (info[i] as Info).ring === RING_OUTER ? PENALTY : 2 * PENALTY),
  );
  pick('powerplant', (i) =>
    prefer(i, 'industrial', (info[i] as Info).ring === RING_OUTER ? PENALTY : 2 * PENALTY),
  );
  const toWater = waterDistance(g);
  pick('waterworks', (i) => {
    const o = info[i] as Info;
    const d = toWater[g.cellAt(o.cx, o.cy)] as number;
    return (
      (d < 0 ? PENALTY : d) + (inDistrict(i, 'industrial') ? 0 : LAYOUT.waterworksOutsideIndustryPenalty)
    );
  });
  pick('radiotower', (i) => {
    const o = info[i] as Info;
    return -(g.elevation[g.cellAt(o.cx, o.cy)] as number) * 1000 + big(i);
  });
  pick('station', (i) => prefer(i, 'station', PENALTY));
  if (seeds.type.includes(D('harbor'))) pick('harbor', (i) => prefer(i, 'harbor', PENALTY));
  if (seeds.type.includes(D('airport'))) pick('airport', (i) => prefer(i, 'airport', PENALTY));

  // One school per residential-type district, one church per old town / residential district.
  const schools = [D('residential'), D('suburb'), D('highrise')];
  const churches = [D('oldtown'), D('residential'), D('suburb')];
  for (let s = 0; s < seeds.count; s++) {
    const type = seeds.type[s] as number;
    const sx = seeds.x[s] as number;
    const sy = seeds.y[s] as number;
    if (schools.includes(type))
      pick('school', (i) => ((b.district[i] as number) === type ? 0 : PENALTY) + dist(i, sx, sy));
    if (churches.includes(type))
      pick('church', (i) => ((b.district[i] as number) === type ? 0 : PENALTY) + dist(i, sx, sy));
  }
  // Every city has at least one school and one church.
  const has = (k: KeySite): boolean => b.keySite.includes(K(k));
  if (!has('school'))
    pick('school', (i) => Math.abs(dist(i, t.centerX, t.centerY) - g.sizeM * LAYOUT.schoolDistanceFrac));
  if (!has('church')) pick('church', (i) => dist(i, t.centerX, t.centerY));
}

export interface EvacList {
  kind: number[];
  x: number[];
  y: number[];
}

/** Walkable cell next to building `id`, or -1. */
function besideBuilding(g: CityGrid, b: BuildingList, id: number): number {
  const cx = (b.x[id] as number) + ((b.w[id] as number) >> 1);
  const cy = (b.y[id] as number) + ((b.h[id] as number) >> 1);
  return nearestCell(g.n, cx, cy, (c) => isWalkable(g.terrain[c] as number));
}

export function evacuationPoints(g: CityGrid, pieces: Segment[], b: BuildingList): EvacList {
  const out: EvacList = { kind: [], x: [], y: [] };
  const push = (kind: (typeof EVAC_KINDS)[number], cell: number): void => {
    if (cell < 0) return;
    out.kind.push(EVAC_KINDS.indexOf(kind));
    out.x.push(((cell % g.n) + 0.5) * CELL_SIZE_M);
    out.y.push((Math.floor(cell / g.n) + 0.5) * CELL_SIZE_M);
  };
  const s = g.sizeM;
  const onBorder = (x: number, y: number): boolean => x <= 0.5 || y <= 0.5 || x >= s - 0.5 || y >= s - 0.5;
  for (const p of pieces) {
    if (p.bridge || (p.kind !== KIND_MAIN && p.kind !== KIND_RAIL)) continue;
    const kind = p.kind === KIND_RAIL ? 'rail' : 'road';
    const code = p.kind === KIND_RAIL ? TERRAIN.rail : TERRAIN.road;
    for (const [x, y] of [
      [p.ax, p.ay],
      [p.bx, p.by],
    ] as const) {
      if (!onBorder(x, y)) continue;
      const c = g.cellAt(x, y);
      push(
        kind,
        nearestCell(g.n, c % g.n, Math.floor(c / g.n), (i) => g.terrain[i] === code),
      );
    }
  }
  for (let i = 0; i < b.keySite.length; i++) {
    const k = b.keySite[i] as number;
    if (k === K('hospital')) push('helipad', besideBuilding(g, b, i));
    if (k === K('harbor')) {
      const cx = (b.x[i] as number) + ((b.w[i] as number) >> 1);
      const cy = (b.y[i] as number) + ((b.h[i] as number) >> 1);
      push(
        'harbor',
        nearestCell(g.n, cx, cy, (c) => isWalkable(g.terrain[c] as number) && touchesWater(g, c)),
      );
    }
  }
  return out;
}

function touchesWater(g: CityGrid, c: number): boolean {
  const n = g.n;
  const x = c % n;
  return (
    (x > 0 && g.isWater(c - 1)) ||
    (x < n - 1 && g.isWater(c + 1)) ||
    (c >= n && g.isWater(c - n)) ||
    (c < g.cells - n && g.isWater(c + n))
  );
}

/** Cells (4-connected steps) to the nearest water cell, -1 without water. */
function waterDistance(g: CityGrid): Int32Array {
  const n = g.n;
  const dist = new Int32Array(g.cells).fill(-1);
  const queue = new Int32Array(g.cells);
  let tail = 0;
  for (let i = 0; i < g.cells; i++) {
    if (g.isWater(i)) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  for (let head = 0; head < tail; head++) {
    const c = queue[head] as number;
    const x = c % n;
    const d = (dist[c] as number) + 1;
    const visit = (j: number): void => {
      if (dist[j] !== -1) return;
      dist[j] = d;
      queue[tail++] = j;
    };
    if (x > 0) visit(c - 1);
    if (x < n - 1) visit(c + 1);
    if (c >= n) visit(c - n);
    if (c < g.cells - n) visit(c + n);
  }
  return dist;
}
