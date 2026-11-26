// Post-generation rules (GDD 7): everything reachable, >= 2 evacuation routes, every sector has road access.
import { CELL_SIZE_M, type CityMapData, NONE_U8, TERRAIN } from '../../core/types/map';
import { LAYOUT, VALIDATION } from '../../data/city/generator';
import { type CityGrid, floodFill, isWalkable, nearestCell } from './grid';

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
  unreachableCells: number;
  evacKinds: number;
}

const walkableAt = (terrain: Uint8Array) => (i: number) => isWalkable(terrain[i] as number);

/** Start of the reachability check: the road cell nearest the map center. */
export function startCell(n: number, terrain: Uint8Array): number {
  return nearestCell(n, n >> 1, n >> 1, (i) => terrain[i] === TERRAIN.road);
}

/** Small unreachable pockets on the shore (between buildings and water) become water. */
export function repairShorePockets(g: CityGrid): void {
  const n = g.n;
  const start = startCell(n, g.terrain);
  if (start < 0) return;
  const pass = walkableAt(g.terrain);
  const label = new Int32Array(g.cells).fill(-1);
  const queue = new Int32Array(g.cells);
  floodFill(n, start, pass, label, 0, queue);
  let next = 1;
  for (let i = 0; i < g.cells; i++) {
    if (label[i] !== -1 || !pass(i)) continue;
    const size = floodFill(n, i, pass, label, next, queue);
    let wet = false;
    for (let k = 0; k < size && !wet; k++) {
      const c = queue[k] as number;
      const x = c % n;
      wet =
        (x > 0 && g.isWater(c - 1)) ||
        (x < n - 1 && g.isWater(c + 1)) ||
        (c >= n && g.isWater(c - n)) ||
        (c < g.cells - n && g.isWater(c + n));
    }
    if (wet && size <= LAYOUT.maxShorePocketCells) {
      for (let k = 0; k < size; k++) {
        const c = queue[k] as number;
        g.terrain[c] = TERRAIN.water;
        g.sector[c] = NONE_U8;
        g.district[c] = NONE_U8;
      }
    }
    next++;
  }
}

export function validateCity(map: CityMapData): ValidationResult {
  const n = map.widthCells;
  const cells = n * map.heightCells;
  const reasons: string[] = [];
  const start = startCell(n, map.terrain);
  const reached = new Int32Array(cells).fill(-1);
  if (start >= 0) floodFill(n, start, walkableAt(map.terrain), reached, 0, new Int32Array(cells));
  else reasons.push('no road');

  let unreachable = 0;
  const sectorRoad = new Uint8Array(map.sectors.count);
  for (let i = 0; i < cells; i++) {
    const t = map.terrain[i] as number;
    if (!isWalkable(t)) continue;
    if (reached[i] === -1) {
      unreachable++;
      continue;
    }
    const s = map.sectors.count > 0 ? (map.sector[i] as number) : NONE_U8;
    if (t === TERRAIN.road && s !== NONE_U8) sectorRoad[s] = 1;
  }
  if (unreachable > 0) reasons.push(`${unreachable} walkable cells unreachable`);
  for (let s = 0; s < map.sectors.count; s++)
    if (!sectorRoad[s]) reasons.push(`sector ${s} without road access`);

  const kinds = new Set<number>();
  for (let e = 0; e < map.evacuation.count; e++) {
    const x = Math.floor((map.evacuation.x[e] as number) / CELL_SIZE_M);
    const y = Math.floor((map.evacuation.y[e] as number) / CELL_SIZE_M);
    if (reached[y * n + x] !== -1) kinds.add(map.evacuation.kind[e] as number);
  }
  if (kinds.size < VALIDATION.minEvacuationRoutes) reasons.push(`only ${kinds.size} evacuation route kinds`);

  return { ok: reasons.length === 0, reasons, unreachableCells: unreachable, evacKinds: kinds.size };
}
