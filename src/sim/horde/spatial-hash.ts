// Uniform grid over agent positions, rebuilt per tick by counting sort (stable: ascending slot order).
import type { AgentPool } from './pool';

export class SpatialHash {
  readonly side: number;
  /** items[start[c] .. start[c + 1]) are the slots in cell c. */
  readonly start: Int32Array;
  readonly items: Int32Array;
  /** Summed-area table of cell counts, (side + 1)^2, for O(1) window counts. */
  private readonly sat: Int32Array;
  private readonly cursor: Int32Array;

  constructor(
    sizeM: number,
    readonly cellM: number,
    capacity: number,
  ) {
    this.side = Math.ceil(sizeM / cellM);
    const cells = this.side * this.side;
    this.start = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.items = new Int32Array(capacity);
    this.sat = new Int32Array((this.side + 1) * (this.side + 1));
  }

  coord(m: number): number {
    const c = Math.floor(m / this.cellM);
    return c < 0 ? 0 : c >= this.side ? this.side - 1 : c;
  }

  build(pool: AgentPool): void {
    const { start, cursor, side } = this;
    const cells = side * side;
    start.fill(0);
    const { posX, posY, alive } = pool;
    const hw = pool.highWater;
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const c = this.coord(posY[i] as number) * side + this.coord(posX[i] as number);
      start[c + 1] = (start[c + 1] as number) + 1;
    }
    for (let c = 0; c < cells; c++) {
      start[c + 1] = (start[c + 1] as number) + (start[c] as number);
      cursor[c] = start[c] as number;
    }
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const c = this.coord(posY[i] as number) * side + this.coord(posX[i] as number);
      this.items[cursor[c] as number] = i;
      cursor[c] = (cursor[c] as number) + 1;
    }
  }

  /** Builds the summed-area table from the current cell counts. */
  buildCounts(): void {
    const { side, sat, start } = this;
    const w = side + 1;
    for (let y = 0; y < side; y++) {
      let row = 0;
      for (let x = 0; x < side; x++) {
        const c = y * side + x;
        row += (start[c + 1] as number) - (start[c] as number);
        sat[(y + 1) * w + x + 1] = (sat[y * w + x + 1] as number) + row;
      }
    }
  }

  /** Agents in cells [x0, x1] x [y0, y1] (inclusive cell coordinates). Needs buildCounts(). */
  windowCount(x0: number, y0: number, x1: number, y1: number): number {
    const w = this.side + 1;
    const s = this.sat;
    return (
      (s[(y1 + 1) * w + x1 + 1] as number) -
      (s[y0 * w + x1 + 1] as number) -
      (s[(y1 + 1) * w + x0] as number) +
      (s[y0 * w + x0] as number)
    );
  }
}

/**
 * Agents bucketed by their 4 m map cell (pool.cell), with positions copied in bucket order so neighbor
 * loops read contiguous memory. Used for separation, where the density cap bounds every bucket.
 */
export class CellBuckets {
  readonly start: Int32Array;
  readonly items: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly cursor: Int32Array;

  constructor(
    readonly cells: number,
    capacity: number,
  ) {
    this.start = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.items = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
  }

  build(pool: AgentPool): void {
    const { start, cursor, cells } = this;
    const { alive, cell, posX, posY } = pool;
    const hw = pool.highWater;
    start.fill(0);
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const c = (cell[i] as number) + 1;
      start[c] = (start[c] as number) + 1;
    }
    for (let c = 0; c < cells; c++) {
      start[c + 1] = (start[c + 1] as number) + (start[c] as number);
      cursor[c] = start[c] as number;
    }
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const c = cell[i] as number;
      const k = cursor[c] as number;
      this.items[k] = i;
      this.x[k] = posX[i] as number;
      this.y[k] = posY[i] as number;
      cursor[c] = k + 1;
    }
  }
}
