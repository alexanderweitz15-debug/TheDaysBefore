// Step 6: schematic sewer. Step 7: sectors in inner, middle and outer ring.
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M, type CityMapData, TERRAIN } from '../../core/types/map';
import { type CITY_SIZES, LAYOUT } from '../../data/city/generator';
import { ANGLE_MASK, ANGLE_UNITS, atan2Angle } from '../math/trig';
import { RING_INNER, RING_MIDDLE, ringAt } from './districts';
import type { CityGrid } from './grid';
import type { TerrainInfo } from './terrain';

/** One manhole per sewer square at the road node nearest its center; tunnels join neighboring squares. */
export function buildSewer(g: CityGrid, roads: CityMapData['roads']): CityMapData['sewer'] {
  const spacingM = LAYOUT.sewerSpacingCells * CELL_SIZE_M;
  const m = Math.ceil(g.sizeM / spacingM);
  const best = new Int32Array(m * m).fill(-1);
  const bestD = new Float64Array(m * m).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < roads.nodeCount; i++) {
    const x = roads.nodeX[i] as number;
    const y = roads.nodeY[i] as number;
    const t = g.terrain[g.cellAt(x, y)];
    if (t !== TERRAIN.road) continue;
    const bx = Math.min(m - 1, Math.floor(x / spacingM));
    const by = Math.min(m - 1, Math.floor(y / spacingM));
    const dx = x - (bx + 0.5) * spacingM;
    const dy = y - (by + 0.5) * spacingM;
    const d = dx * dx + dy * dy;
    const k = by * m + bx;
    if (d < (bestD[k] as number)) {
      bestD[k] = d;
      best[k] = i;
    }
  }
  const manhole = new Int32Array(m * m).fill(-1);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < m * m; k++) {
    const node = best[k] as number;
    if (node < 0) continue;
    manhole[k] = xs.length;
    xs.push(roads.nodeX[node] as number);
    ys.push(roads.nodeY[node] as number);
  }
  const ea: number[] = [];
  const eb: number[] = [];
  for (let by = 0; by < m; by++) {
    for (let bx = 0; bx < m; bx++) {
      const a = manhole[by * m + bx] as number;
      if (a < 0) continue;
      const right = bx + 1 < m ? (manhole[by * m + bx + 1] as number) : -1;
      const down = by + 1 < m ? (manhole[(by + 1) * m + bx] as number) : -1;
      if (right >= 0) {
        ea.push(a);
        eb.push(right);
      }
      if (down >= 0) {
        ea.push(a);
        eb.push(down);
      }
    }
  }
  return {
    manholeCount: xs.length,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    edgeCount: ea.length,
    edgeA: Uint32Array.from(ea),
    edgeB: Uint32Array.from(eb),
  };
}

/** Sector count per ring for `total` sectors. */
export function ringSplit(total: number): [number, number, number] {
  const inner = total >= LAYOUT.twoInnerSectorsFrom ? 2 : 1;
  const middle = Math.round((total - inner) * LAYOUT.middleSectorShare);
  return [inner, middle, total - inner - middle];
}

/** Assigns every non-water cell to a sector: ring by distance, wedge by angle. */
export function buildSectors(
  g: CityGrid,
  rng: Rng,
  t: TerrainInfo,
  spec: (typeof CITY_SIZES)['small'],
): CityMapData['sectors'] {
  const total = rng.nextInt(spec.sectorsMin, spec.sectorsMax + 1);
  const perRing = ringSplit(total);
  const base = [0, perRing[0], perRing[0] + perRing[1]];
  const offset = [rng.nextInt(0, ANGLE_UNITS), rng.nextInt(0, ANGLE_UNITS), rng.nextInt(0, ANGLE_UNITS)];
  const sumX = new Float64Array(total);
  const sumY = new Float64Array(total);
  const cnt = new Float64Array(total);
  const n = g.n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (g.terrain[i] === TERRAIN.water) continue;
      const px = (x + 0.5) * CELL_SIZE_M;
      const py = (y + 0.5) * CELL_SIZE_M;
      const ring = ringAt(t, g.sizeM, px, py);
      const k = perRing[ring] as number;
      const a = (atan2Angle(py - t.centerY, px - t.centerX) - (offset[ring] as number)) & ANGLE_MASK;
      const s = (base[ring] as number) + Math.min(k - 1, Math.floor((a * k) / ANGLE_UNITS));
      g.sector[i] = s;
      sumX[s] = (sumX[s] as number) + px;
      sumY[s] = (sumY[s] as number) + py;
      cnt[s] = (cnt[s] as number) + 1;
    }
  }
  const ring = new Uint8Array(total);
  const centerX = new Float32Array(total);
  const centerY = new Float32Array(total);
  for (let s = 0; s < total; s++) {
    ring[s] = s < (base[1] as number) ? RING_INNER : s < (base[2] as number) ? RING_MIDDLE : 2;
    const c = cnt[s] as number;
    centerX[s] = c > 0 ? (sumX[s] as number) / c : 0;
    centerY[s] = c > 0 ? (sumY[s] as number) / c : 0;
  }
  return { count: total, ring, centerX, centerY };
}
