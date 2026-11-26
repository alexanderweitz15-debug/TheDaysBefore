// Weighted flow field solver for shared destination fields (civilian routine). Dial's algorithm with per-cell
// entry costs (straight c, diagonal 1.5c), spread over ticks by a work budget. Directions are set when a cell is
// relaxed (pointing back to the cell that relaxed it), so no separate direction pass is needed.
import { DIR_NONE } from '../horde/flow-field';

const INF = 0x7fffffff;
/** Neighbor steps in direction-code order (E, NE, N, NW, W, SW, S, SE; y grows southwards). */
const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
const STEP_Y = [0, -1, -1, -1, 0, 1, 1, 1];

export class CostFieldSolver {
  readonly cells: number;
  private readonly dist: Int32Array;
  /** Diagonal entry cost per cell, precomputed. */
  private readonly diag: Uint8Array;
  /** `mask + 1` bucket queues by distance; each bucket holds one distance value at a time. */
  private readonly buckets: Int32Array[];
  private readonly bucketLen: Int32Array;
  private readonly mask: number;
  private out: Uint8Array | null = null;
  private outOffset = 0;
  private current = 0;
  private cursor = 0;
  private queued = 0;

  /**
   * @param walkable 1 = passable.
   * @param cost straight entry cost per walkable cell, >= 1.
   */
  constructor(
    readonly n: number,
    private readonly walkable: Uint8Array,
    private readonly cost: Uint8Array,
  ) {
    this.cells = n * n;
    this.dist = new Int32Array(this.cells);
    this.diag = new Uint8Array(this.cells);
    let maxStep = 1;
    for (let c = 0; c < this.cells; c++) {
      const d = ((cost[c] as number) * 3) >> 1;
      this.diag[c] = d;
      if (walkable[c] && d > maxStep) maxStep = d;
    }
    let b = 1;
    while (b <= maxStep) b *= 2;
    this.mask = b - 1;
    this.buckets = [];
    for (let i = 0; i < b; i++) this.buckets.push(new Int32Array(this.cells));
    this.bucketLen = new Int32Array(b);
  }

  get busy(): boolean {
    return this.out !== null;
  }

  /** Starts a field towards `seeds[from..to)`, written into `out[offset .. offset + cells)`. */
  start(seeds: Int32Array, from: number, to: number, out: Uint8Array, offset: number): void {
    out.fill(DIR_NONE, offset, offset + this.cells);
    this.dist.fill(INF);
    this.bucketLen.fill(0);
    const b0 = this.buckets[0] as Int32Array;
    let len = 0;
    for (let k = from; k < to; k++) {
      const c = seeds[k] as number;
      if (!this.walkable[c] || this.dist[c] === 0) continue;
      this.dist[c] = 0;
      b0[len++] = c;
    }
    this.bucketLen[0] = len;
    this.queued = len;
    this.out = out;
    this.outOffset = offset;
    this.current = 0;
    this.cursor = 0;
    if (len === 0) this.out = null;
  }

  /** Advances by at most `budget` popped cells. Returns the unused budget; the field is complete when !busy. */
  advance(budget: number): number {
    const out = this.out;
    if (!out) return budget;
    const { n, dist, walkable, cost, diag, buckets, bucketLen, mask } = this;
    const off = this.outOffset;
    let left = budget;
    let cur = this.current;
    let cursor = this.cursor;
    let queued = this.queued;
    while (left > 0) {
      const bi = cur & mask;
      const queue = buckets[bi] as Int32Array;
      if (cursor >= (bucketLen[bi] as number)) {
        bucketLen[bi] = 0;
        cursor = 0;
        if (queued === 0) {
          this.out = null;
          return left;
        }
        cur++;
        continue;
      }
      const c = queue[cursor++] as number;
      queued--;
      left--;
      if (dist[c] !== cur) continue;
      const x = c % n;
      const y = (c - x) / n;
      const e = x < n - 1 && walkable[c + 1] === 1;
      const w = x > 0 && walkable[c - 1] === 1;
      const s = y < n - 1 && walkable[c + n] === 1;
      const no = y > 0 && walkable[c - n] === 1;
      for (let k = 0; k < 8; k++) {
        const sx = STEP_X[k] as number;
        const sy = STEP_Y[k] as number;
        if (sx > 0 ? !e : sx < 0 ? !w : false) continue;
        if (sy > 0 ? !s : sy < 0 ? !no : false) continue;
        const j = c + sy * n + sx;
        const straight = sx === 0 || sy === 0;
        if (!straight && walkable[j] !== 1) continue;
        const d = cur + (straight ? (cost[j] as number) : (diag[j] as number));
        if (d >= (dist[j] as number)) continue;
        dist[j] = d;
        // Moving from j towards the goal goes back along the opposite step.
        out[off + j] = (k + 4) & 7;
        const bj = d & mask;
        const l = bucketLen[bj] as number;
        (buckets[bj] as Int32Array)[l] = j;
        bucketLen[bj] = l + 1;
        queued++;
      }
    }
    this.current = cur;
    this.cursor = cursor;
    this.queued = queued;
    return 0;
  }

  /** Job progress, for the world hash. */
  progress(): number {
    return ((this.busy ? 0x80000000 : 0) | ((this.current & 0xffff) << 15) | (this.cursor & 0x7fff)) >>> 0;
  }
}
