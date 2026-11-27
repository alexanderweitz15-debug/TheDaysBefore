// Unit paths: A* on the 4 m map grid (octile costs 10/14, no corner cutting) over s.walkable, so walls, gates and
// every placed structure are respected exactly (the road graph knows neither structures nor open squares).
// Requests are queued and served with a node budget per tick; a search can span ticks. Unreachable goals end at
// the reached cell closest to the goal. Paths are smoothed to corners by grid line tests.
import { UNIT_ENGINE } from '../../data/units/present';
import { nearestCell } from '../map/grid';
import type { SimState } from '../state';
import { lineClear } from './line';
import { PATH_NONE, PATH_PENDING, PATH_READY } from './units';

const STRAIGHT = 10;
const DIAG = 14;
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];

export class PathPlanner {
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  /** Search generation per cell: seen (g valid) and closed. */
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private readonly heapCell: Int32Array;
  private readonly heapF: Int32Array;
  private heapSize = 0;
  private readonly chain: Int32Array;
  /** FIFO of unit slots waiting for a path. */
  private readonly queue: Int32Array;
  private qHead = 0;
  private qLen = 0;
  private current = -1;
  private goalCell = -1;
  private gx = 0;
  private gy = 0;
  private expansions = 0;
  private bestCell = -1;
  private bestH = 0;
  /** Searches finished, for tests. */
  finished = 0;

  constructor(
    private readonly n: number,
    capacity: number,
  ) {
    const cells = n * n;
    this.g = new Int32Array(cells);
    this.parent = new Int32Array(cells);
    this.seen = new Uint32Array(cells);
    this.closed = new Uint32Array(cells);
    const heapCap = UNIT_ENGINE.pathMaxExpansions * 8 + 16;
    this.heapCell = new Int32Array(heapCap);
    this.heapF = new Int32Array(heapCap);
    this.chain = new Int32Array(cells);
    this.queue = new Int32Array(capacity);
  }

  /** Queues unit u for a path to its goal (goalX/goalY). A running search for u restarts. */
  request(s: SimState, u: number): void {
    if (u === this.current) this.current = -1;
    s.units.pathState[u] = PATH_PENDING;
    if (!this.inQueue(u)) this.push(u);
  }

  private inQueue(u: number): boolean {
    const cap = this.queue.length;
    for (let k = 0; k < this.qLen; k++) if (this.queue[(this.qHead + k) % cap] === u) return true;
    return false;
  }

  private push(u: number): void {
    const cap = this.queue.length;
    if (this.qLen >= cap) return;
    this.queue[(this.qHead + this.qLen) % cap] = u;
    this.qLen++;
  }

  get pending(): number {
    return this.qLen + (this.current >= 0 ? 1 : 0);
  }

  /** Serves requests within `budget` node expansions. */
  advance(s: SimState, budget: number): void {
    const U = s.units;
    let left = budget;
    while (left > 0) {
      if (this.current < 0) {
        if (this.qLen === 0) return;
        const u = this.queue[this.qHead] as number;
        this.qHead = (this.qHead + 1) % this.queue.length;
        this.qLen--;
        if (!U.pool.alive[u] || U.pathState[u] !== PATH_PENDING) continue;
        if (!this.begin(s, u)) continue;
      }
      left = this.expand(s, left);
    }
  }

  /** Starts the search for u; returns false if it finished immediately. */
  private begin(s: SimState, u: number): boolean {
    const U = s.units;
    const n = this.n;
    const walk = s.walkable;
    let goal = s.cellOf(U.goalX[u] as number, U.goalY[u] as number);
    if (!walk[goal]) goal = nearestCell(n, goal % n, Math.floor(goal / n), (i) => walk[i] === 1);
    const start = U.pool.cell[u] as number;
    if (goal < 0) {
      U.pathState[u] = PATH_NONE;
      U.moving[u] = 0;
      return false;
    }
    this.gen++;
    if (this.gen === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
    this.current = u;
    this.goalCell = goal;
    this.gx = goal % n;
    this.gy = (goal - this.gx) / n;
    this.expansions = 0;
    this.heapSize = 0;
    this.seen[start] = this.gen;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.bestCell = start;
    this.bestH = this.h(start);
    this.heapPush(start, this.bestH);
    return true;
  }

  private h(c: number): number {
    const x = c % this.n;
    const y = (c - x) / this.n;
    const dx = Math.abs(x - this.gx);
    const dy = Math.abs(y - this.gy);
    return dx < dy ? DIAG * dx + STRAIGHT * (dy - dx) : DIAG * dy + STRAIGHT * (dx - dy);
  }

  private expand(s: SimState, budget: number): number {
    const n = this.n;
    const walk = s.walkable;
    const { g, seen, closed, parent } = this;
    const gen = this.gen;
    let left = budget;
    while (left > 0) {
      if (this.heapSize === 0 || this.expansions >= UNIT_ENGINE.pathMaxExpansions) {
        this.finish(s, this.bestCell);
        return left;
      }
      const c = this.heapPop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      left--;
      this.expansions++;
      if (c === this.goalCell) {
        this.finish(s, c);
        return left;
      }
      const hc = this.h(c);
      if (hc < this.bestH) {
        this.bestH = hc;
        this.bestCell = c;
      }
      const x = c % n;
      const y = (c - x) / n;
      const gc = g[c] as number;
      for (let k = 0; k < 8; k++) {
        const sx = DX[k] as number;
        const sy = DY[k] as number;
        const nx = x + sx;
        const ny = y + sy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (!walk[j] || closed[j] === gen) continue;
        const diag = sx !== 0 && sy !== 0;
        if (diag && (!walk[y * n + nx] || !walk[ny * n + x])) continue;
        const gj = gc + (diag ? DIAG : STRAIGHT);
        if (seen[j] === gen && gj >= (g[j] as number)) continue;
        seen[j] = gen;
        g[j] = gj;
        parent[j] = c;
        this.heapPush(j, gj + this.h(j));
      }
    }
    return 0;
  }

  /** Builds the smoothed corner list for the current unit, ending at `end`. */
  private finish(s: SimState, end: number): void {
    const u = this.current;
    this.current = -1;
    this.finished++;
    const U = s.units;
    const n = this.n;
    const cm = s.cellM;
    let len = 0;
    for (let c = end; c >= 0; c = this.parent[c] as number) this.chain[len++] = c;
    // chain[len-1] is the start; walk forward, keeping a corner whenever the straight line breaks.
    const base = u * U.maxCorners;
    let corners = 0;
    let ax = (U.pool.posX[u] as number) / cm;
    let ay = (U.pool.posY[u] as number) / cm;
    const walk = s.walkable;
    let partial = 0;
    let k = len - 2;
    while (k >= 0) {
      const c = this.chain[k] as number;
      if (lineClear(n, walk, ax, ay, (c % n) + 0.5, Math.floor(c / n) + 0.5)) {
        k--;
        continue;
      }
      // Corner at the last visible cell; neighbors see each other, so the next test from there succeeds.
      if (corners >= U.maxCorners - 1) {
        partial = 1;
        break;
      }
      const p = this.chain[k + 1] as number;
      ax = (p % n) + 0.5;
      ay = Math.floor(p / n) + 0.5;
      U.pathX[base + corners] = ax * cm;
      U.pathY[base + corners] = ay * cm;
      corners++;
    }
    if (!partial) {
      // Final point: the exact goal if it lies in the reached goal cell, else the reached cell's center.
      const gx = U.goalX[u] as number;
      const gy = U.goalY[u] as number;
      const exact = end === this.goalCell && s.cellOf(gx, gy) === end;
      U.pathX[base + corners] = exact ? gx : ((end % n) + 0.5) * cm;
      U.pathY[base + corners] = exact ? gy : (Math.floor(end / n) + 0.5) * cm;
      corners++;
    }
    U.pathLen[u] = corners;
    U.pathIdx[u] = 0;
    U.pathPartial[u] = partial;
    U.pathState[u] = PATH_READY;
  }

  private heapPush(c: number, f: number): void {
    const hc = this.heapCell;
    const hf = this.heapF;
    if (this.heapSize >= hc.length) return;
    let i = this.heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pf = hf[p] as number;
      if (pf < f || (pf === f && (hc[p] as number) <= c)) break;
      hc[i] = hc[p] as number;
      hf[i] = pf;
      i = p;
    }
    hc[i] = c;
    hf[i] = f;
  }

  private heapPop(): number {
    const hc = this.heapCell;
    const hf = this.heapF;
    const top = hc[0] as number;
    const size = --this.heapSize;
    if (size === 0) return top;
    const c = hc[size] as number;
    const f = hf[size] as number;
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= size) break;
      const r = m + 1;
      if (
        r < size &&
        ((hf[r] as number) < (hf[m] as number) ||
          ((hf[r] as number) === (hf[m] as number) && (hc[r] as number) < (hc[m] as number)))
      )
        m = r;
      const mf = hf[m] as number;
      if (f < mf || (f === mf && c <= (hc[m] as number))) break;
      hc[i] = hc[m] as number;
      hf[i] = mf;
      i = m;
    }
    hc[i] = c;
    hf[i] = f;
    return top;
  }

  hashValues(): number[] {
    return [
      this.current,
      this.qHead,
      this.qLen,
      this.expansions,
      this.heapSize,
      this.goalCell,
      this.finished,
    ];
  }
}
