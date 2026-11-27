// Flow field on the 4 m map grid. Goals are aggregated per coarse block (32 x 32 cells); a new field is only
// computed when the set of goals changes, and that computation is spread over ticks by a work budget
// (Dial's algorithm, step costs 2 straight / 3 diagonal). The finished field replaces the active one at once.

/** Direction codes (DebugField convention): E, NE, N, NW, W, SW, S, SE; y grows southwards. */
export const DIR_X = new Float32Array([
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2,
]);
export const DIR_Y = new Float32Array([
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2,
  1,
  Math.SQRT1_2,
]);
export const DIR_NONE = 255;
const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
const STEP_Y = [0, -1, -1, -1, 0, 1, 1, 1];
const INF = 0x7fffffff;

const PHASE_IDLE = 0;
const PHASE_RESET = 1;
const PHASE_EXPAND = 2;
const PHASE_DIRS = 3;

export class FlowField {
  readonly cells: number;
  /** Active field read by movement. */
  dirs: Uint8Array;
  private work: Uint8Array;
  readonly dist: Int32Array;
  /** Four bucket queues (distance mod 4); a bucket only ever holds one distance value at a time. */
  private readonly buckets: Int32Array[];
  private readonly bucketLen = new Int32Array(4);
  private readonly seeds: Int32Array;
  private seedCount = 0;
  phase = PHASE_IDLE;
  private cursor = 0;
  private current = 0;
  /** Goal signature of the active field and of the job in progress. */
  activeSignature = -1;
  private jobSignature = -1;
  /** Number of computations started, for tests and debugging. */
  jobs = 0;

  constructor(
    readonly n: number,
    private readonly walkable: Uint8Array,
  ) {
    this.cells = n * n;
    this.dirs = new Uint8Array(this.cells).fill(DIR_NONE);
    this.work = new Uint8Array(this.cells).fill(DIR_NONE);
    this.dist = new Int32Array(this.cells).fill(INF);
    this.buckets = [0, 1, 2, 3].map(() => new Int32Array(this.cells));
    this.seeds = new Int32Array(this.cells);
  }

  get busy(): boolean {
    return this.phase !== PHASE_IDLE;
  }

  /** Buffers that no later read depends on while idle (left out of save games). */
  scratch(): ArrayBufferView[] {
    return this.busy ? [] : [this.work, this.seeds, ...this.buckets];
  }

  /** Starts a new computation towards `cells[0..count)` (deduplicated by the caller or not; both work). */
  start(cells: Int32Array, count: number, signature: number): void {
    for (let k = 0; k < count; k++) this.seeds[k] = cells[k] as number;
    this.seedCount = count;
    this.jobSignature = signature;
    this.jobs++;
    this.phase = PHASE_RESET;
    this.cursor = 0;
  }

  /** Advances the job by at most `budget` work units (about one cell each). */
  advance(budget: number): void {
    let left = budget;
    while (left > 0 && this.phase !== PHASE_IDLE) {
      if (this.phase === PHASE_RESET) left = this.reset(left);
      else if (this.phase === PHASE_EXPAND) left = this.expand(left);
      else left = this.computeDirs(left);
    }
  }

  private reset(budget: number): number {
    const end = Math.min(this.cells, this.cursor + budget);
    this.dist.fill(INF, this.cursor, end);
    const used = end - this.cursor;
    this.cursor = end;
    if (end < this.cells) return budget - used;
    this.bucketLen.fill(0);
    const b0 = this.buckets[0] as Int32Array;
    for (let k = 0; k < this.seedCount; k++) {
      const c = this.seeds[k] as number;
      if (this.walkable[c] && this.dist[c] !== 0) {
        this.dist[c] = 0;
        const len = this.bucketLen[0] as number;
        b0[len] = c;
        this.bucketLen[0] = len + 1;
      }
    }
    this.current = 0;
    this.cursor = 0;
    this.phase = PHASE_EXPAND;
    return budget - used;
  }

  private expand(budget: number): number {
    const { n, dist, walkable } = this;
    let left = budget;
    while (left > 0) {
      const b = this.current & 3;
      const queue = this.buckets[b] as Int32Array;
      if (this.cursor >= (this.bucketLen[b] as number)) {
        this.bucketLen[b] = 0;
        this.cursor = 0;
        const bl = this.bucketLen;
        if ((bl[0] as number) + (bl[1] as number) + (bl[2] as number) + (bl[3] as number) === 0) {
          this.phase = PHASE_DIRS;
          return left;
        }
        this.current++;
        continue;
      }
      const c = queue[this.cursor++] as number;
      left--;
      const d = dist[c] as number;
      if (d !== this.current) continue;
      const x = c % n;
      const y = (c - x) / n;
      const e = x < n - 1 && walkable[c + 1];
      const w = x > 0 && walkable[c - 1];
      const s = y < n - 1 && walkable[c + n];
      const no = y > 0 && walkable[c - n];
      if (e) this.relax(c + 1, d + 2);
      if (w) this.relax(c - 1, d + 2);
      if (s) this.relax(c + n, d + 2);
      if (no) this.relax(c - n, d + 2);
      if (e && no && walkable[c - n + 1]) this.relax(c - n + 1, d + 3);
      if (w && no && walkable[c - n - 1]) this.relax(c - n - 1, d + 3);
      if (e && s && walkable[c + n + 1]) this.relax(c + n + 1, d + 3);
      if (w && s && walkable[c + n - 1]) this.relax(c + n - 1, d + 3);
    }
    return 0;
  }

  private relax(c: number, d: number): void {
    if (d >= (this.dist[c] as number)) return;
    this.dist[c] = d;
    const b = d & 3;
    const len = this.bucketLen[b] as number;
    (this.buckets[b] as Int32Array)[len] = c;
    this.bucketLen[b] = len + 1;
  }

  private computeDirs(budget: number): number {
    const { n, dist, walkable, work } = this;
    const end = Math.min(this.cells, this.cursor + budget);
    for (let c = this.cursor; c < end; c++) {
      const d = dist[c] as number;
      work[c] = DIR_NONE;
      if (d === 0 || d === INF || !walkable[c]) continue;
      const x = c % n;
      const y = (c - x) / n;
      let best = INF;
      for (let k = 0; k < 8; k++) {
        const sx = STEP_X[k] as number;
        const sy = STEP_Y[k] as number;
        const nx = x + sx;
        const ny = y + sy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (!walkable[j]) continue;
        if (sx !== 0 && sy !== 0 && (!walkable[y * n + nx] || !walkable[ny * n + x])) continue;
        const v = (dist[j] as number) + (sx !== 0 && sy !== 0 ? 3 : 2);
        if (v < best) {
          best = v;
          work[c] = k;
        }
      }
    }
    const used = end - this.cursor;
    this.cursor = end;
    if (end === this.cells) {
      const active = this.dirs;
      this.dirs = work;
      this.work = active;
      this.activeSignature = this.jobSignature;
      this.phase = PHASE_IDLE;
      this.cursor = 0;
    }
    return budget - used;
  }

  /** Job progress, for the world hash. */
  progress(): number {
    return ((this.phase & 3) << 28) | (this.cursor & 0x0fffffff);
  }
  get currentDistance(): number {
    return this.current;
  }
}
