// Procedural city generator (GDD 7): seven steps, validation, retries with derived seeds.
import type { HashState } from '../../core/hash';
import { hashU32, hashView } from '../../core/hash';
import { createRng, deriveSeed } from '../../core/rng';
import { CELL_SIZE_M, type CityMapData, type CitySize } from '../../core/types/map';
import { CITY_SIZES, VALIDATION } from '../../data/city/generator';
import { emptyBuildings, subdivide } from './blocks';
import { placeDistricts, railLine } from './districts';
import { buildRoadGraph } from './graph';
import { CityGrid } from './grid';
import { generateMainRoads } from './main-roads';
import { clipAndBridge, paintRoads } from './roads';
import { buildSectors, buildSewer } from './sewer-sectors';
import { assignKeySites, buildBlocksAndStadium, evacuationPoints } from './sites';
import { generateTerrain } from './terrain';
import { repairShorePockets, type ValidationResult, validateCity } from './validate';

/** One generation attempt with exactly this seed, without retries. */
export function generateCityAttempt(seed: number, size: CitySize): CityMapData {
  const spec = CITY_SIZES[size];
  const n = Math.round(spec.sizeM / CELL_SIZE_M);
  const g = new CityGrid(n);
  const rng = createRng(seed);

  const terrain = generateTerrain(g, rng); // 1
  const main = generateMainRoads(rng, g.sizeM, terrain); // 2
  const seeds = placeDistricts(g, rng, terrain); // 3
  const rail = railLine(g, terrain, seeds);
  const { streets, blocks } = subdivide(g, rng, main); // 4
  const pieces = clipAndBridge(g, rng, [...main.segments, ...rail, ...streets], terrain.riverCount);
  paintRoads(g, pieces);
  const roads = buildRoadGraph(pieces, g.sizeM);
  const b = emptyBuildings();
  buildBlocksAndStadium(g, rng, terrain, blocks, b);
  assignKeySites(g, rng, terrain, b, seeds); // 5
  const sewer = buildSewer(g, roads); // 6
  const sectors = buildSectors(g, rng, terrain, spec); // 7
  repairShorePockets(g);
  const evac = evacuationPoints(g, pieces, b);

  return {
    seed,
    size,
    widthCells: n,
    heightCells: n,
    cellSizeM: CELL_SIZE_M,
    terrain: g.terrain,
    elevation: g.elevation,
    district: g.district,
    sector: g.sector,
    buildingId: g.buildingId,
    buildings: {
      count: b.x.length,
      x: Uint16Array.from(b.x),
      y: Uint16Array.from(b.y),
      w: Uint16Array.from(b.w),
      h: Uint16Array.from(b.h),
      floors: Uint8Array.from(b.floors),
      district: Uint8Array.from(b.district),
      keySite: Uint8Array.from(b.keySite),
    },
    roads,
    sectors,
    sewer,
    evacuation: {
      count: evac.kind.length,
      kind: Uint8Array.from(evac.kind),
      x: Float32Array.from(evac.x),
      y: Float32Array.from(evac.y),
    },
  };
}

export interface GeneratedCity {
  map: CityMapData;
  attempts: number;
  validation: ValidationResult;
}

/** Generates and validates; failed attempts retry with deriveSeed(seed, attempt). */
export function generateCityWithReport(seed: number, size: CitySize): GeneratedCity {
  const failures: string[] = [];
  for (let attempt = 0; attempt < VALIDATION.maxAttempts; attempt++) {
    const s = attempt === 0 ? seed : deriveSeed(seed, attempt);
    const map = generateCityAttempt(s, size);
    const validation = validateCity(map);
    if (validation.ok) {
      map.seed = seed;
      return { map, attempts: attempt + 1, validation };
    }
    failures.push(validation.reasons.join(', '));
  }
  throw new Error(`city generation failed for seed ${seed} (${size}): ${failures.join(' | ')}`);
}

export const generateCity = (seed: number, size: CitySize): CityMapData =>
  generateCityWithReport(seed, size).map;

/** Folds every field of the map into `h`. */
export function hashCityMap(h: HashState, m: CityMapData): void {
  hashU32(h, m.seed);
  hashU32(h, m.widthCells);
  hashU32(h, m.heightCells);
  for (const v of [m.terrain, m.elevation, m.district, m.sector, m.buildingId]) hashView(h, v);
  const b = m.buildings;
  hashU32(h, b.count);
  for (const v of [b.x, b.y, b.w, b.h, b.floors, b.district, b.keySite]) hashView(h, v);
  const r = m.roads;
  hashU32(h, r.nodeCount);
  hashU32(h, r.edgeCount);
  for (const v of [r.nodeX, r.nodeY, r.edgeA, r.edgeB, r.edgeWidth, r.edgeKind]) hashView(h, v);
  const s = m.sectors;
  hashU32(h, s.count);
  for (const v of [s.ring, s.centerX, s.centerY]) hashView(h, v);
  const w = m.sewer;
  hashU32(h, w.manholeCount);
  hashU32(h, w.edgeCount);
  for (const v of [w.x, w.y, w.edgeA, w.edgeB]) hashView(h, v);
  const e = m.evacuation;
  hashU32(h, e.count);
  for (const v of [e.kind, e.x, e.y]) hashView(h, v);
}
