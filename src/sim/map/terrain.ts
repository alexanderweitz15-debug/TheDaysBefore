// Step 1: terrain. Rivers, coast, forest edge, hills.
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { LAYOUT, TERRAIN_GEN } from '../../data/city/generator';
import { type CityGrid, nearestCell, range } from './grid';

/** Map edges: 0 north (y = 0), 1 east, 2 south, 3 west. -1 = none. */
export type Edge = -1 | 0 | 1 | 2 | 3;

export interface TerrainInfo {
  coastEdge: Edge;
  riverCount: number;
  /** City center in meters, on land. */
  centerX: number;
  centerY: number;
}

/** Smooth random walk of length `len`, kept inside [lo, hi]. */
function wobble(rng: Rng, len: number, start: number, lo: number, hi: number, drift: number): Float64Array {
  const out = new Float64Array(len);
  let c = start;
  let v = 0;
  for (let i = 0; i < len; i++) {
    v = v * LAYOUT.wobbleDamping + (rng.nextFloat() - 0.5) * drift;
    c += v;
    if (c < lo || c > hi) {
      c = Math.min(Math.max(c, lo), hi);
      v = 0;
    }
    out[i] = c;
  }
  return out;
}

/** Distance in cells of (x, y) from an edge. */
function edgeDistance(n: number, edge: Edge, x: number, y: number): number {
  if (edge === 0) return y;
  if (edge === 1) return n - 1 - x;
  if (edge === 2) return n - 1 - y;
  return x;
}

function paintCoast(g: CityGrid, rng: Rng, edge: Edge): void {
  const n = g.n;
  const depth = range(rng.nextFloat(), LAYOUT.coastDepthMinFrac, LAYOUT.coastDepthMaxFrac) * n;
  const shore = wobble(
    rng,
    n,
    depth,
    depth * LAYOUT.coastWobbleMinFrac,
    depth * LAYOUT.coastWobbleMaxFrac,
    LAYOUT.coastDrift,
  );
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const along = edge === 0 || edge === 2 ? x : y;
      if (edgeDistance(n, edge, x, y) < (shore[along] as number)) g.terrain[y * n + x] = TERRAIN.water;
    }
  }
}

function paintRiver(g: CityGrid, rng: Rng, vertical: boolean, lo: number, hi: number): void {
  const n = g.n;
  const halfW =
    range(rng.nextFloat(), TERRAIN_GEN.riverWidthMinM, TERRAIN_GEN.riverWidthMaxM) / CELL_SIZE_M / 2;
  const start = range(rng.nextFloat(), lo, hi) * n;
  const path = wobble(rng, n, start, lo * n, hi * n, LAYOUT.riverDrift);
  for (let a = 0; a < n; a++) {
    const c = path[a] as number;
    const from = Math.max(0, Math.ceil(c - halfW));
    const to = Math.min(n - 1, Math.floor(c + halfW));
    for (let b = from; b <= to; b++) g.terrain[vertical ? a * n + b : b * n + a] = TERRAIN.water;
  }
}

function paintForest(g: CityGrid, rng: Rng, coastEdge: Edge): void {
  const n = g.n;
  const band = TERRAIN_GEN.forestEdgeM / CELL_SIZE_M;
  for (let e = 0; e < 4; e++) {
    if (e === coastEdge) continue;
    const depth = wobble(rng, n, band, 0, band * 2, 0.5);
    for (let a = 0; a < n; a++) {
      const d = depth[a] as number;
      for (let k = 0; k < d; k++) {
        const x = e === 0 || e === 2 ? a : e === 1 ? n - 1 - k : k;
        const y = e === 1 || e === 3 ? a : e === 2 ? n - 1 - k : k;
        const i = y * n + x;
        if (g.terrain[i] === TERRAIN.ground) g.terrain[i] = TERRAIN.forest;
      }
    }
  }
}

function paintHills(g: CityGrid, rng: Rng): void {
  const n = g.n;
  const height = new Float64Array(g.cells).fill(LAYOUT.baseElevation);
  const hills = rng.nextInt(0, TERRAIN_GEN.hillCountMax + 1);
  for (let k = 0; k < hills; k++) {
    const cx = rng.nextFloat() * n;
    const cy = rng.nextFloat() * n;
    const r = range(rng.nextFloat(), LAYOUT.hillRadiusMinM, LAYOUT.hillRadiusMaxM) / CELL_SIZE_M;
    const h = range(rng.nextFloat(), LAYOUT.hillHeightMin, LAYOUT.hillHeightMax);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(n - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 < r2) height[y * n + x] = (height[y * n + x] as number) + h * (1 - d2 / r2);
      }
    }
  }
  for (let i = 0; i < g.cells; i++) {
    g.elevation[i] = g.terrain[i] === TERRAIN.water ? 0 : Math.min(255, Math.round(height[i] as number));
  }
}

export function generateTerrain(g: CityGrid, rng: Rng): TerrainInfo {
  const coastEdge = (rng.nextFloat() < TERRAIN_GEN.coastChance ? rng.nextInt(0, 4) : -1) as Edge;
  if (coastEdge >= 0) paintCoast(g, rng, coastEdge);

  const riverCount = rng.nextInt(TERRAIN_GEN.riversMin, TERRAIN_GEN.riversMax + 1);
  // Rivers flow into the sea: perpendicular to the coast. Without a coast the orientation is free.
  const coastVertical = coastEdge === 0 || coastEdge === 2;
  const firstVertical = coastEdge >= 0 ? coastVertical : rng.nextFloat() < 0.5;
  const parallel = coastEdge >= 0 || rng.nextFloat() < 0.5;
  const m = LAYOUT.riverMarginFrac;
  for (let r = 0; r < riverCount; r++) {
    const vertical = r === 0 ? firstVertical : parallel ? firstVertical : !firstVertical;
    if (riverCount === 2 && parallel)
      paintRiver(
        g,
        rng,
        vertical,
        r === 0 ? m : LAYOUT.parallelRiverSplitHiFrac,
        r === 0 ? LAYOUT.parallelRiverSplitLoFrac : 1 - m,
      );
    else paintRiver(g, rng, vertical, m + LAYOUT.singleRiverInsetFrac, 1 - m - LAYOUT.singleRiverInsetFrac);
  }

  paintForest(g, rng, coastEdge);
  paintHills(g, rng);

  const n = g.n;
  const c = nearestCell(n, n >> 1, n >> 1, (i) => g.terrain[i] === TERRAIN.ground);
  const cx = c % n;
  const cy = (c - cx) / n;
  return {
    coastEdge,
    riverCount,
    centerX: (cx + 0.5) * CELL_SIZE_M,
    centerY: (cy + 0.5) * CELL_SIZE_M,
  };
}
