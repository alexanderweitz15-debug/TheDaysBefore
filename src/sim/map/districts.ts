// Step 3: districts as nearest-seed regions, assigned by ring. Also places the station and its rail line.
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M, DISTRICTS, type District, NONE_U8, TERRAIN } from '../../core/types/map';
import { DISTRICT_SPECS, LAYOUT, ROAD_GEN } from '../../data/city/generator';
import type { CityGrid } from './grid';
import { KIND_RAIL, type Segment, seg } from './segments';
import type { Edge, TerrainInfo } from './terrain';

export const RING_INNER = 0;
export const RING_MIDDLE = 1;
export const RING_OUTER = 2;

/** Ring of a point by its distance from the center relative to the half map size. */
export function ringAt(t: TerrainInfo, sizeM: number, x: number, y: number): number {
  const dx = x - t.centerX;
  const dy = y - t.centerY;
  const f = Math.sqrt(dx * dx + dy * dy) / (sizeM / 2);
  return f < LAYOUT.innerRingFrac ? RING_INNER : f < LAYOUT.middleRingFrac ? RING_MIDDLE : RING_OUTER;
}

const RING_POOLS: readonly (readonly District[])[] = [
  ['oldtown', 'commercial'],
  ['residential', 'highrise', 'commercial', 'university', 'industrial'],
  ['suburb', 'residential', 'industrial'],
];

export interface DistrictSeeds {
  count: number;
  x: number[];
  y: number[];
  type: number[];
  /** Station seed index or -1. */
  station: number;
}

const D = (d: District): number => DISTRICTS.indexOf(d);

function weightedPick(rng: Rng, pool: readonly District[]): number {
  let total = 0;
  for (const d of pool) total += DISTRICT_SPECS[d].weight;
  let r = rng.nextFloat() * total;
  for (const d of pool) {
    r -= DISTRICT_SPECS[d].weight;
    if (r < 0) return D(d);
  }
  return D(pool[pool.length - 1] as District);
}

function edgeDist(sizeM: number, e: Edge, x: number, y: number): number {
  return e === 0 ? y : e === 1 ? sizeM - x : e === 2 ? sizeM - y : x;
}

/** Picks the unassigned seed minimizing `score`, or -1. */
function pickSeed(s: DistrictSeeds, score: (i: number) => number): number {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < s.count; i++) {
    if ((s.type[i] as number) !== -1) continue;
    const v = score(i);
    if (v < bestScore) {
      bestScore = v;
      best = i;
    }
  }
  return best;
}

export function placeDistricts(g: CityGrid, rng: Rng, t: TerrainInfo): DistrictSeeds {
  const sizeM = g.sizeM;
  const km2 = (sizeM / 1000) * (sizeM / 1000);
  const want = Math.max(LAYOUT.minDistrictSeeds, Math.round(LAYOUT.districtSeedsPerKm2 * km2));
  const s: DistrictSeeds = { count: 0, x: [t.centerX], y: [t.centerY], type: [D('oldtown')], station: -1 };
  for (let tries = 0; s.x.length < want && tries < want * 50; tries++) {
    const x = rng.nextFloat() * sizeM;
    const y = rng.nextFloat() * sizeM;
    if (g.terrain[g.cellAt(x, y)] !== TERRAIN.ground) continue;
    s.x.push(x);
    s.y.push(y);
    s.type.push(-1);
  }
  s.count = s.x.length;
  const ring = (i: number): number => ringAt(t, sizeM, s.x[i] as number, s.y[i] as number);
  const distC = (i: number): number => {
    const dx = (s.x[i] as number) - t.centerX;
    const dy = (s.y[i] as number) - t.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const assign = (i: number, d: District): void => {
    if (i >= 0) s.type[i] = D(d);
  };

  // Explicit districts first: one of each where it fits.
  assign(
    pickSeed(s, (i) => Math.abs(distC(i) - sizeM * LAYOUT.hospitalDistanceFrac)),
    'hospital',
  );
  const station = pickSeed(s, (i) => Math.abs(distC(i) - sizeM * LAYOUT.stationDistanceFrac));
  assign(station, 'station');
  s.station = station;
  if (t.coastEdge >= 0) {
    const e = t.coastEdge;
    assign(
      pickSeed(
        s,
        (i) => edgeDist(sizeM, e, s.x[i] as number, s.y[i] as number) + distC(i) * LAYOUT.harborCenterWeight,
      ),
      'harbor',
    );
  }
  assign(
    pickSeed(s, (i) => (ring(i) === RING_OUTER ? rng.nextFloat() : 2)),
    'military',
  );
  if (s.count >= LAYOUT.airportMinDistrictSeeds)
    assign(
      pickSeed(s, (i) => -distC(i)),
      'airport',
    );

  for (let i = 1; i < s.count; i++) {
    if ((s.type[i] as number) === -1)
      s.type[i] = weightedPick(rng, RING_POOLS[ring(i)] as readonly District[]);
  }

  // Nearest seed per cell (city = ground cells; water and forest stay outside).
  const n = g.n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (g.terrain[i] !== TERRAIN.ground) continue;
      const px = (x + 0.5) * CELL_SIZE_M;
      const py = (y + 0.5) * CELL_SIZE_M;
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let k = 0; k < s.count; k++) {
        const dx = (s.x[k] as number) - px;
        const dy = (s.y[k] as number) - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      g.district[i] = s.type[best] as number;
    }
  }
  return s;
}

/** Straight rail line from the station to the nearest map edge that is not coast. */
export function railLine(g: CityGrid, t: TerrainInfo, s: DistrictSeeds): Segment[] {
  if (s.station < 0) return [];
  const sizeM = g.sizeM;
  const snap = (m: number): number => Math.round(m / CELL_SIZE_M) * CELL_SIZE_M;
  const x = snap(s.x[s.station] as number);
  const y = snap(s.y[s.station] as number);
  let best: Edge = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let e = 0 as Edge; e < 4; e = (e + 1) as Edge) {
    if (e === t.coastEdge) continue;
    const d = edgeDist(sizeM, e, x, y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  const w = ROAD_GEN.railWidthM;
  if (best === 0) return [seg(x, y, x, 0, w, KIND_RAIL)];
  if (best === 1) return [seg(x, y, sizeM, y, w, KIND_RAIL)];
  if (best === 2) return [seg(x, y, x, sizeM, w, KIND_RAIL)];
  return [seg(x, y, 0, y, w, KIND_RAIL)];
}

export const districtAt = (g: CityGrid, x: number, y: number): number => {
  const d = g.district[g.cellAt(x, y)] as number;
  return d === NONE_U8 ? D('residential') : d;
};
