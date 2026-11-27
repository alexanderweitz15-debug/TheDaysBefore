// Weighted flow field solver (civilian destination fields, safety field). Dial's algorithm with per-cell entry
// costs (straight c, diagonal 1.5c), spread over ticks by a work budget. Buckets are doubly linked lists, so a
// cell is queued at most once (decrease-key by unlinking) and memory does not depend on the bucket count.
// Directions are set when a cell is relaxed (pointing back to the cell that relaxed it).
import { DIR_NONE } from '../horde/flow-field';

const INF = 0x7fffffff;
const NOT_QUEUED = -2;
/** Neighbor steps in direction-code order (E, NE, N, NW, W, SW, S, SE; y grows southwards). */
const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
const STEP_Y = [0, -1, -1, -1, 0, 1, 1, 1];

export class CostFieldSolver {
  readonly cells: number;
  readonly dist: Int32Array;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly prev: Int32Array;
  private readonly mask: number;
  private out: Uint8Array | null = null;
  private outOffset = 0;
  private current = 0;
  private queued = 0;

  /**
   * @param walkable 1 = passable.
   * @param cost straight entry cost per cell, 1..maxCost; read while a job runs, so change it only between jobs.
   */
  constructor(
    readonly n: number,
    private readonly walkable: Uint8Array,
    readonly cost: Uint8Array,
    maxCost = 255,
  ) {
    this.cells = n * n;
    this.dist = new Int32Array(this.cells);
    this.next = new Int32Array(this.cells);
    this.prev = new Int32Array(this.cells);
    let b = 1;
    while (b <= (maxCost * 3) >> 1) b *= 2;
    this.mask = b - 1;
    this.head = new Int32Array(b);
  }

  get busy(): boolean {
    return this.out !== null;
  }

  /** Starts a field towards `seeds[from..to)`, written into `out[offset .. offset + cells)`. */
  start(seeds: Int32Array, from: number, to: number, out: Uint8Array, offset: number): void {
    out.fill(DIR_NONE, offset, offset + this.cells);
    this.dist.fill(INF);
    this.prev.fill(NOT_QUEUED);
    this.head.fill(-1);
    this.queued = 0;
    for (let k = from; k < to; k++) {
      const c = seeds[k] as number;
      if (!this.walkable[c] || this.dist[c] === 0) continue;
      this.dist[c] = 0;
      this.link(c, 0);
    }
    this.out = this.queued > 0 ? out : null;
    this.outOffset = offset;
    this.current = 0;
  }

  private link(c: number, d: number): void {
    const b = d & this.mask;
    const h = this.head[b] as number;
    this.next[c] = h;
    this.prev[c] = -1;
    if (h >= 0) this.prev[h] = c;
    this.head[b] = c;
    this.queued++;
  }

  private unlink(c: number, d: number): void {
    const p = this.prev[c] as number;
    const nx = this.next[c] as number;
    if (p >= 0) this.next[p] = nx;
    else this.head[d & this.mask] = nx;
    if (nx >= 0) this.prev[nx] = p;
    this.prev[c] = NOT_QUEUED;
    this.queued--;
  }

  /** Advances by at most `budget` popped cells. Returns the unused budget; the field is complete when !busy. */
  advance(budget: number): number {
    const out = this.out;
    if (!out) return budget;
    const { n, dist, walkable, cost, head, prev } = this;
    const off = this.outOffset;
    let left = budget;
    while (left > 0) {
      if (this.queued === 0) {
        this.out = null;
        return left;
      }
      const cur = this.current;
      const c = head[cur & this.mask] as number;
      if (c < 0) {
        this.current = cur + 1;
        continue;
      }
      this.unlink(c, cur);
      left--;
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
        const cj = cost[j] as number;
        const d = cur + (straight ? cj : (cj * 3) >> 1);
        const old = dist[j] as number;
        if (d >= old) continue;
        if (prev[j] !== NOT_QUEUED) this.unlink(j, old);
        dist[j] = d;
        // Moving from j towards the goal goes back along the opposite step.
        out[off + j] = (k + 4) & 7;
        this.link(j, d);
      }
    }
    return 0;
  }

  /** Buffers that no later read depends on while idle (left out of save games). */
  scratch(): ArrayBufferView[] {
    return this.busy ? [] : [this.dist, this.head, this.next, this.prev];
  }

  /** Job progress, for the world hash. */
  progress(): number {
    return ((this.busy ? 0x80000000 : 0) | ((this.current & 0xffff) << 15) | (this.queued & 0x7fff)) >>> 0;
  }
}
