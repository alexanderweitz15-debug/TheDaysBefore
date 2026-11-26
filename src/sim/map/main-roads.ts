// Step 2: main roads, radial (spokes and ring) or grid (avenues).
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M } from '../../core/types/map';
import { LAYOUT, ROAD_GEN } from '../../data/city/generator';
import { ANGLE_UNITS, cosU, sinU } from '../math/trig';
import { KIND_MAIN, type Segment, seg } from './segments';
import type { TerrainInfo } from './terrain';

export interface MainRoads {
  radial: boolean;
  segments: Segment[];
  /** Grid layout: avenue positions in meters (cell boundaries). Empty for radial. */
  avenuesX: number[];
  avenuesY: number[];
}

const snap = (m: number): number => Math.round(m / CELL_SIZE_M) * CELL_SIZE_M;

function avenues(rng: Rng, sizeM: number): number[] {
  const k = Math.max(1, Math.round(sizeM / LAYOUT.avenueSpacingM) - 1);
  const step = sizeM / (k + 1);
  const out: number[] = [];
  for (let i = 1; i <= k; i++)
    out.push(snap(i * step + (rng.nextFloat() - 0.5) * step * LAYOUT.avenueJitterFrac));
  return out;
}

/** Distance from (x, y) along direction (dx, dy) until the map border. */
function rayToBorder(x: number, y: number, dx: number, dy: number, sizeM: number): number {
  let t = Number.POSITIVE_INFINITY;
  if (dx > 1e-9) t = Math.min(t, (sizeM - x) / dx);
  if (dx < -1e-9) t = Math.min(t, -x / dx);
  if (dy > 1e-9) t = Math.min(t, (sizeM - y) / dy);
  if (dy < -1e-9) t = Math.min(t, -y / dy);
  return t;
}

const clampM = (v: number, sizeM: number): number => Math.min(Math.max(v, 0), sizeM);

export function generateMainRoads(rng: Rng, sizeM: number, t: TerrainInfo): MainRoads {
  const w = ROAD_GEN.mainRoadWidthM;
  const segments: Segment[] = [];
  if (rng.nextFloat() >= ROAD_GEN.radialChance) {
    const avenuesX = avenues(rng, sizeM);
    const avenuesY = avenues(rng, sizeM);
    for (const x of avenuesX) segments.push(seg(x, 0, x, sizeM, w, KIND_MAIN));
    for (const y of avenuesY) segments.push(seg(0, y, sizeM, y, w, KIND_MAIN));
    return { radial: false, segments, avenuesX, avenuesY };
  }

  const spokes = rng.nextInt(LAYOUT.radialSpokesMin, LAYOUT.radialSpokesMax + 1);
  const offset = rng.nextInt(0, ANGLE_UNITS);
  const step = ANGLE_UNITS / spokes;
  for (let i = 0; i < spokes; i++) {
    const a = Math.round(offset + i * step + (rng.nextFloat() - 0.5) * step * LAYOUT.spokeJitterFrac);
    const dx = cosU(a);
    const dy = sinU(a);
    const len = rayToBorder(t.centerX, t.centerY, dx, dy, sizeM);
    const bx = clampM(t.centerX + dx * len, sizeM);
    const by = clampM(t.centerY + dy * len, sizeM);
    segments.push(seg(t.centerX, t.centerY, bx, by, w, KIND_MAIN));
  }

  const r = (LAYOUT.ringRoadFrac * sizeM) / 2;
  const v = LAYOUT.ringRoadVertices;
  const ringOffset = rng.nextInt(0, ANGLE_UNITS);
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < v; i++) {
    const a = ringOffset + Math.round((i * ANGLE_UNITS) / v);
    const rr = r * (LAYOUT.ringRoadRadiusMinFrac + rng.nextFloat() * LAYOUT.ringRoadRadiusSpanFrac);
    px.push(clampM(t.centerX + cosU(a) * rr, sizeM));
    py.push(clampM(t.centerY + sinU(a) * rr, sizeM));
  }
  for (let i = 0; i < v; i++) {
    const j = (i + 1) % v;
    segments.push(seg(px[i] as number, py[i] as number, px[j] as number, py[j] as number, w, KIND_MAIN));
  }
  return { radial: true, segments, avenuesX: [], avenuesY: [] };
}
