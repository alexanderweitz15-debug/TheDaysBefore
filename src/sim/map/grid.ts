// Mutable raster used while generating a city. Converted to CityMapData at the end.
import { CELL_SIZE_M, NONE_U8, TERRAIN } from '../../core/types/map';

export class CityGrid {
  readonly cells: number;
  readonly sizeM: number;
  readonly terrain: Uint8Array;
  readonly elevation: Uint8Array;
  readonly district: Uint8Array;
  readonly sector: Uint8Array;
  readonly buildingId: Int32Array;

  constructor(readonly n: number) {
    this.cells = n * n;
    this.sizeM = n * CELL_SIZE_M;
    this.terrain = new Uint8Array(this.cells);
    this.elevation = new Uint8Array(this.cells);
    this.district = new Uint8Array(this.cells).fill(NONE_U8);
    this.sector = new Uint8Array(this.cells).fill(NONE_U8);
    this.buildingId = new Int32Array(this.cells).fill(-1);
  }

  /** Cell index of a point in meters, clamped to the map. */
  cellAt(xm: number, ym: number): number {
    const x = Math.min(Math.max(Math.floor(xm / CELL_SIZE_M), 0), this.n - 1);
    const y = Math.min(Math.max(Math.floor(ym / CELL_SIZE_M), 0), this.n - 1);
    return y * this.n + x;
  }

  isWater(i: number): boolean {
    return this.terrain[i] === TERRAIN.water;
  }
}

/** Walkable on foot: everything except water and buildings (bridges are walkable). */
export const isWalkable = (t: number): boolean => t !== TERRAIN.water && t !== TERRAIN.building;

/**
 * 4-connected flood fill from `start` over cells where `pass(i)` is true.
 * Writes `label` into `out` for reached cells. Returns the number of cells reached.
 */
export function floodFill(
  n: number,
  start: number,
  pass: (i: number) => boolean,
  out: Int32Array,
  label: number,
  queue: Int32Array,
): number {
  if (!pass(start) || out[start] !== -1) return 0;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  out[start] = label;
  while (head < tail) {
    const i = queue[head++] as number;
    const x = i % n;
    const y = (i - x) / n;
    if (x > 0) tail = visit(i - 1, pass, out, label, queue, tail);
    if (x < n - 1) tail = visit(i + 1, pass, out, label, queue, tail);
    if (y > 0) tail = visit(i - n, pass, out, label, queue, tail);
    if (y < n - 1) tail = visit(i + n, pass, out, label, queue, tail);
  }
  return tail;
}

function visit(
  j: number,
  pass: (i: number) => boolean,
  out: Int32Array,
  label: number,
  queue: Int32Array,
  tail: number,
): number {
  if (out[j] !== -1 || !pass(j)) return tail;
  out[j] = label;
  queue[tail] = j;
  return tail + 1;
}

/** Nearest cell to (cx, cy) in Chebyshev rings that satisfies `ok`, or -1. */
export function nearestCell(n: number, cx: number, cy: number, ok: (i: number) => boolean): number {
  for (let r = 0; r < n; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= n) continue;
      const edge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r) {
        const x = cx + dx;
        if (x >= 0 && x < n && ok(y * n + x)) return y * n + x;
        if (r === 0) break;
      }
    }
  }
  return -1;
}

/** Uniform float in [a, b). */
export const range = (rnd: number, a: number, b: number): number => a + rnd * (b - a);
