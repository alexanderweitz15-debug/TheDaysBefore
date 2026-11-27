// Safety field (GDD 7 Flucht): one shared weighted field towards the walkable cells of open safe zones and rally
// points. Entry costs: terrain step cost x 4, corridor cells x corridorCostFactor, cells near zombies (coarse
// density) x zombieRepelCost. Costs are fixed per job; jobs run on the work budget into a back buffer that is
// swapped in when complete. Restarts when the goal set changes (zones.goalsVersion), or when a check every
// recomputeEveryTicks finds that the zombie repulsion changed in at least repelChangeCells coarse cells.
// The cost pass before a job is spread over ticks (costCellsPerTick).
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { SAFETY_FIELD } from '../../data/agents/civilians';
import { CIVILIAN_ROUTINE } from '../../data/agents/horde';
import { DIR_NONE } from '../horde/flow-field';
import type { SimState } from '../state';
import { CostFieldSolver } from './cost-field';

const INF = 0x7fffffff;
/** Terrain step costs are scaled up so the corridor factor stays an integer cost. */
const BASE_SCALE = 4;

export class SafetyField {
  readonly cells: number;
  /** Directions of the active field, DIR_NONE at goals and unreachable cells. */
  dirs: Uint8Array;
  /** Distances of the active field (INF unreachable). */
  readonly dist: Int32Array;
  /** 1 while the active field leads to the current goals. */
  ready = 0;
  /** zones.goalsVersion of the last started job, tick it started. */
  jobVersion = -1;
  lastStart = 0;
  private back: Uint8Array;
  private readonly base: Uint8Array;
  private readonly cost: Uint8Array;
  private readonly repel: Uint8Array;
  private readonly repelNext: Uint8Array;
  /** Next map cell of the running cost pass, -1 when idle. */
  private costCursor = -1;
  private lastCheck = 0;
  private readonly coarseOfCell: Int32Array;
  private readonly seeds: Int32Array;
  private readonly solver: CostFieldSolver;

  constructor(s: SimState) {
    const n = s.n;
    this.cells = s.cells;
    this.dirs = new Uint8Array(this.cells).fill(DIR_NONE);
    this.back = new Uint8Array(this.cells).fill(DIR_NONE);
    this.dist = new Int32Array(this.cells).fill(INF);
    this.cost = new Uint8Array(this.cells);
    this.seeds = new Int32Array(this.cells);
    this.base = new Uint8Array(this.cells);
    const sc = CIVILIAN_ROUTINE.stepCost;
    const costOf: number[] = [];
    costOf[TERRAIN.road] = sc.road;
    costOf[TERRAIN.bridge] = sc.bridge;
    costOf[TERRAIN.ground] = sc.ground;
    costOf[TERRAIN.park] = sc.park;
    costOf[TERRAIN.forest] = sc.forest;
    costOf[TERRAIN.rail] = sc.rail;
    const t = s.map.terrain;
    for (let c = 0; c < this.cells; c++) this.base[c] = (costOf[t[c] as number] ?? sc.ground) * BASE_SCALE;
    const side = s.density.side;
    this.repel = new Uint8Array(side * side);
    this.repelNext = new Uint8Array(side * side);
    this.coarseOfCell = new Int32Array(this.cells);
    const ratio = s.density.cellM / CELL_SIZE_M;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        this.coarseOfCell[y * n + x] =
          Math.min(side - 1, Math.floor(y / ratio)) * side + Math.min(side - 1, Math.floor(x / ratio));
    this.solver = new CostFieldSolver(n, s.walkable, this.cost);
  }

  get busy(): boolean {
    return this.solver.busy || this.costCursor >= 0;
  }

  /** Walkability changed: restart with the current goals once the running job is done. */
  invalidate(): void {
    this.jobVersion = -1;
  }

  /** Starts or advances the field within `budget` work units. */
  update(s: SimState, tick: number, budget: number): void {
    const solver = this.solver;
    if (this.costCursor < 0 && !solver.busy) {
      if (s.zones.goalsVersion === this.jobVersion) {
        if (!this.ready || tick - this.lastCheck < SAFETY_FIELD.recomputeEveryTicks) return;
        // Same goals: restart only on noticeable zombie movement.
        this.lastCheck = tick;
        this.buildRepel(s, this.repelNext);
        if (this.repelDiff() < SAFETY_FIELD.repelChangeCells) return;
      } else this.buildRepel(s, this.repelNext);
      this.jobVersion = s.zones.goalsVersion;
      this.lastStart = tick;
      this.lastCheck = tick;
      this.repel.set(this.repelNext);
      this.costCursor = 0;
    }
    if (this.costCursor >= 0) {
      this.buildCosts(s, SAFETY_FIELD.costCellsPerTick);
      if (this.costCursor >= 0) return;
      const k = s.zones.goalCells(s, this.seeds);
      if (k === 0) {
        this.ready = 0;
        return;
      }
      solver.start(this.seeds, 0, k, this.back, 0);
    }
    solver.advance(budget);
    if (solver.busy) return;
    const done = this.back;
    this.back = this.dirs;
    this.dirs = done;
    this.dist.set(solver.dist);
    this.ready = 1;
  }

  /** Coarse cells within zombieRepelRadiusM of any zombie into `out`. */
  private buildRepel(s: SimState, out: Uint8Array): void {
    const side = s.density.side;
    const count = s.density.count;
    const cm = s.density.cellM;
    const r = SAFETY_FIELD.zombieRepelRadiusM + cm / 2;
    const rc = Math.ceil(r / cm);
    const r2 = r * r;
    out.fill(0);
    for (let gy = 0; gy < side; gy++) {
      for (let gx = 0; gx < side; gx++) {
        if (count[gy * side + gx] === 0) continue;
        for (let dy = -rc; dy <= rc; dy++) {
          const yy = gy + dy;
          if (yy < 0 || yy >= side) continue;
          for (let dx = -rc; dx <= rc; dx++) {
            const xx = gx + dx;
            if (xx < 0 || xx >= side || (dx * dx + dy * dy) * cm * cm > r2) continue;
            out[yy * side + xx] = 1;
          }
        }
      }
    }
  }

  private repelDiff(): number {
    const a = this.repel;
    const b = this.repelNext;
    let k = 0;
    for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) k++;
    return k;
  }

  /** Continues the cost pass by `count` cells; costCursor becomes -1 when done. */
  private buildCosts(s: SimState, count: number): void {
    const { repel, cost, base, coarseOfCell } = this;
    const corridor = s.zones.corridor;
    const cf = SAFETY_FIELD.corridorCostFactor;
    const rf = SAFETY_FIELD.zombieRepelCost;
    const from = this.costCursor;
    const to = Math.min(this.cells, from + count);
    for (let c = from; c < to; c++) {
      let v = base[c] as number;
      if (corridor[c]) v *= cf;
      if (repel[coarseOfCell[c] as number]) v *= rf;
      cost[c] = Math.min(255, Math.max(1, Math.round(v)));
    }
    this.costCursor = to >= this.cells ? -1 : to;
  }

  /** Debug view 0..255: 255 at the goals, falling with distance, 0 unreachable or no field. */
  debug(): Uint8Array {
    const out = new Uint8Array(this.cells);
    if (!this.ready) return out;
    const d = this.dist;
    let max = 1;
    for (let c = 0; c < this.cells; c++) {
      const v = d[c] as number;
      if (v !== INF && v > max) max = v;
    }
    for (let c = 0; c < this.cells; c++) {
      const v = d[c] as number;
      if (v !== INF) out[c] = 255 - Math.floor((254 * v) / max);
    }
    return out;
  }

  /** Buffers that no later read depends on (left out of save games). */
  scratch(): ArrayBufferView[] {
    const solver = this.solver.scratch();
    return this.busy ? solver : [this.back, this.cost, this.seeds, ...solver];
  }

  hashValues(): number[] {
    return [
      this.ready,
      this.jobVersion,
      this.lastStart,
      this.lastCheck,
      this.costCursor,
      this.solver.progress(),
    ];
  }
}
