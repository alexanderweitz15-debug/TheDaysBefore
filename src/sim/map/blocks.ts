// Step 4: streets by recursive subdivision, blocks, lots and buildings.
// Every split street ends on its parent's street, so the street network is connected by construction.
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M, DISTRICTS, NONE_U8, TERRAIN } from '../../core/types/map';
import { DISTRICT_SPECS, LAYOUT, ROAD_GEN } from '../../data/city/generator';
import { districtAt } from './districts';
import type { CityGrid } from './grid';
import type { MainRoads } from './main-roads';
import { KIND_STREET, type Segment, seg } from './segments';

/** Block interior in cells, [x0, x1) x [y0, y1). */
export interface Block {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  district: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Half widths of the bounding streets (0 at the map border): left, right, top, bottom. */
  hl: number;
  hr: number;
  ht: number;
  hb: number;
  depth: number;
}

const OLDTOWN = DISTRICTS.indexOf('oldtown');
const INDUSTRIAL = DISTRICTS.indexOf('industrial');

export function subdivide(g: CityGrid, rng: Rng, main: MainRoads): { streets: Segment[]; blocks: Block[] } {
  const sizeM = g.sizeM;
  const streets: Segment[] = [];
  const blocks: Block[] = [];
  const h = ROAD_GEN.mainRoadWidthM / 2;
  const stack: Rect[] = [];
  const xs = [0, ...main.avenuesX, sizeM];
  const ys = [0, ...main.avenuesY, sizeM];
  for (let j = ys.length - 2; j >= 0; j--) {
    for (let i = xs.length - 2; i >= 0; i--) {
      stack.push({
        x0: xs[i] as number,
        x1: xs[i + 1] as number,
        y0: ys[j] as number,
        y1: ys[j + 1] as number,
        hl: i === 0 ? 0 : h,
        hr: i === xs.length - 2 ? 0 : h,
        ht: j === 0 ? 0 : h,
        hb: j === ys.length - 2 ? 0 : h,
        depth: 0,
      });
    }
  }

  while (stack.length > 0) {
    const r = stack.pop() as Rect;
    const d = districtAt(g, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    const spec = DISTRICT_SPECS[DISTRICTS[d] ?? 'residential'];
    const w = r.x1 - r.x0;
    const hgt = r.y1 - r.y0;
    if (Math.max(w, hgt) <= spec.blockM * LAYOUT.leafFactor) {
      blocks.push({
        x0: Math.ceil((r.x0 + r.hl) / CELL_SIZE_M),
        x1: Math.floor((r.x1 - r.hr) / CELL_SIZE_M),
        y0: Math.ceil((r.y0 + r.ht) / CELL_SIZE_M),
        y1: Math.floor((r.y1 - r.hb) / CELL_SIZE_M),
        district: d,
      });
      continue;
    }
    const organic = d === OLDTOWN;
    const alley = organic && r.depth >= 2;
    const width = alley
      ? ROAD_GEN.alleyWidthM
      : d === INDUSTRIAL
        ? ROAD_GEN.mainRoadWidthM
        : ROAD_GEN.streetWidthM;
    const jitter = organic ? LAYOUT.organicSplitJitter : LAYOUT.splitJitter;
    const ratio = 0.5 + (rng.nextFloat() * 2 - 1) * jitter;
    const vertical = w >= hgt;
    const lo = vertical ? r.x0 : r.y0;
    const len = vertical ? w : hgt;
    // Even widths sit on cell boundaries, the one-cell alley on a cell center.
    let at = Math.round((lo + len * ratio) / CELL_SIZE_M) * CELL_SIZE_M;
    if (alley) at += CELL_SIZE_M / 2;
    const half = width / 2;
    if (vertical) {
      streets.push(seg(at, r.y0, at, r.y1, width, KIND_STREET));
      stack.push({ ...r, x1: at, hr: half, depth: r.depth + 1 });
      stack.push({ ...r, x0: at, hl: half, depth: r.depth + 1 });
    } else {
      streets.push(seg(r.x0, at, r.x1, at, width, KIND_STREET));
      stack.push({ ...r, y1: at, hb: half, depth: r.depth + 1 });
      stack.push({ ...r, y0: at, ht: half, depth: r.depth + 1 });
    }
  }
  return { streets, blocks };
}

export interface BuildingList {
  x: number[];
  y: number[];
  w: number[];
  h: number[];
  floors: number[];
  district: number[];
  keySite: number[];
}

export const emptyBuildings = (): BuildingList => ({
  x: [],
  y: [],
  w: [],
  h: [],
  floors: [],
  district: [],
  keySite: [],
});

/** True if every cell of the rectangle is plain ground. */
function freeGround(g: CityGrid, x: number, y: number, w: number, h: number): boolean {
  if (x < 0 || y < 0 || x + w > g.n || y + h > g.n) return false;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if (g.terrain[yy * g.n + xx] !== TERRAIN.ground) return false;
  }
  return true;
}

export function addBuilding(
  g: CityGrid,
  b: BuildingList,
  x: number,
  y: number,
  w: number,
  h: number,
  floors: number,
  district: number,
  keySite: number,
): number {
  const id = b.x.length;
  b.x.push(x);
  b.y.push(y);
  b.w.push(w);
  b.h.push(h);
  b.floors.push(floors);
  b.district.push(district);
  b.keySite.push(keySite);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      g.terrain[yy * g.n + xx] = TERRAIN.building;
      g.buildingId[yy * g.n + xx] = id;
    }
  }
  return id;
}

/** Places one building per lot, inset by one cell so neighbors never touch. */
function fillLot(
  g: CityGrid,
  rng: Rng,
  b: BuildingList,
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
): void {
  if (w < LAYOUT.minBuildingCells || h < LAYOUT.minBuildingCells) return;
  const spec = DISTRICT_SPECS[DISTRICTS[d] ?? 'residential'];
  const iw = w - 2;
  const ih = h - 2;
  const scale = Math.min(1, Math.sqrt((spec.coverage * w * h) / (iw * ih)));
  const fw = Math.max(1, Math.round(iw * scale));
  const fh = Math.max(1, Math.round(ih * scale));
  const fx = x + 1 + rng.nextInt(0, iw - fw + 1);
  const fy = y + 1 + rng.nextInt(0, ih - fh + 1);
  if (!freeGround(g, fx, fy, fw, fh)) return;
  addBuilding(g, b, fx, fy, fw, fh, rng.nextInt(spec.floorsMin, spec.floorsMax + 1), d, NONE_U8);
}

function splitLots(g: CityGrid, rng: Rng, b: BuildingList, blk: Block): void {
  const spec = DISTRICT_SPECS[DISTRICTS[blk.district] ?? 'residential'];
  const lotMin = Math.max(3, Math.round(spec.lotMinM / CELL_SIZE_M));
  const lotMax = Math.max(lotMin, Math.round(spec.lotMaxM / CELL_SIZE_M));
  const stack: number[] = [blk.x0, blk.y0, blk.x1 - blk.x0, blk.y1 - blk.y0];
  while (stack.length > 0) {
    const h = stack.pop() as number;
    const w = stack.pop() as number;
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    const splitX = w > lotMax && w >= 2 * lotMin;
    const splitY = h > lotMax && h >= 2 * lotMin;
    if (!splitX && !splitY) {
      fillLot(g, rng, b, x, y, w, h, blk.district);
      continue;
    }
    if (splitX && (w >= h || !splitY)) {
      const s = rng.nextInt(lotMin, w - lotMin + 1);
      stack.push(x, y, s, h, x + s, y, w - s, h);
    } else {
      const s = rng.nextInt(lotMin, h - lotMin + 1);
      stack.push(x, y, w, s, x, y + s, w, h - s);
    }
  }
}

/** Parks or lots with buildings for every block except `reserved`. */
export function fillBlocks(g: CityGrid, rng: Rng, blocks: Block[], b: BuildingList, reserved: number): void {
  for (let i = 0; i < blocks.length; i++) {
    if (i === reserved) continue;
    const blk = blocks[i] as Block;
    if (blk.x1 - blk.x0 < LAYOUT.minBuildingCells || blk.y1 - blk.y0 < LAYOUT.minBuildingCells) continue;
    if (rng.nextFloat() < LAYOUT.parkChance) {
      for (let y = blk.y0; y < blk.y1; y++) {
        for (let x = blk.x0; x < blk.x1; x++) {
          if (g.terrain[y * g.n + x] === TERRAIN.ground) g.terrain[y * g.n + x] = TERRAIN.park;
        }
      }
      continue;
    }
    splitLots(g, rng, b, blk);
  }
}

/** Largest free footprint inside a block, inset by `inset` cells; used for the stadium. */
export function placeLarge(
  g: CityGrid,
  b: BuildingList,
  blk: Block,
  inset: number,
  floors: number,
  keySite: number,
): number {
  const x = blk.x0 + inset;
  const y = blk.y0 + inset;
  const w = blk.x1 - blk.x0 - 2 * inset;
  const h = blk.y1 - blk.y0 - 2 * inset;
  if (w < LAYOUT.minBuildingCells || h < LAYOUT.minBuildingCells || !freeGround(g, x, y, w, h)) return -1;
  return addBuilding(g, b, x, y, w, h, floors, blk.district, keySite);
}
