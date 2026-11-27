// Civilian daily routine (GDD 7, Zivilisten Alltag): commuting between home, work and market.
// Destinations are grouped into clusters (clustersPerSide^2 per category). Each category/cluster pair has one
// shared flow field towards the door cells (walkable 4-neighbors) of its buildings, computed once over the first
// ticks by a work budget and cached; the map is static in M1. Civilians follow the field of their current
// destination, dwell on arrival, then pick the next destination by the routine weights.
import type { Rng } from '../../core/rng';
import type { CityMapData } from '../../core/types/map';
import { DISTRICTS, type District, TERRAIN } from '../../core/types/map';
import { CIVILIAN_ROUTINE } from '../../data/agents/horde';
import { DIR_NONE } from '../horde/flow-field';
import { CostFieldSolver } from '../pathing/cost-field';

export const CATEGORY_HOME = 0;
export const CATEGORY_WORK = 1;
export const CATEGORY_MARKET = 2;
const CATEGORIES = 3;

/** Civilian state codes (pool.kind); M1 only uses the routine. */
export const CIVILIAN_ROUTINE_STATE = 0;

export class CivilianRoutine {
  readonly n: number;
  readonly cells: number;
  readonly fieldCount: number;
  /** Per field: category and cluster. */
  readonly fieldCategory: Uint8Array;
  readonly fieldCluster: Uint16Array;
  /** Per field: 1 once computed. */
  readonly fieldReady: Uint8Array;
  /** fieldCount x cells direction codes (DIR_NONE at goals and unreachable cells). */
  readonly dirs: Uint8Array;
  /** Door cells of field f: seeds[seedStart[f] .. seedStart[f + 1]). */
  readonly seeds: Int32Array;
  readonly seedStart: Int32Array;
  /** Per civilian slot: field index for home, work and market (-1 none), current destination (-1 dwelling). */
  readonly home: Int16Array;
  readonly work: Int16Array;
  readonly market: Int16Array;
  readonly dest: Int16Array;
  /** Remaining dwell ticks. */
  readonly timer: Uint16Array;
  private readonly clusterSide: number;
  private readonly clusterCells: number;
  /** Home field of the nearest cluster that has one, per cluster (-1 if no homes at all). */
  private readonly homeOfCluster: Int16Array;
  /** Cumulative weights over work / market fields for weighted picks. */
  private readonly workPick: Float64Array;
  private readonly workIds: Int16Array;
  private readonly marketPick: Float64Array;
  private readonly marketIds: Int16Array;
  private readonly solver: CostFieldSolver;
  /** Next field to compute (fields are computed in index order). */
  nextField = 0;
  private restart = false;
  /** True from invalidate() until every field is recomputed. */
  recomputing = false;

  constructor(map: CityMapData, walkable: Uint8Array, capacity: number) {
    const n = map.widthCells;
    this.n = n;
    this.cells = n * n;
    const side = CIVILIAN_ROUTINE.clustersPerSide;
    this.clusterSide = side;
    this.clusterCells = Math.ceil(n / side);
    const clusters = side * side;

    // Category of every district (bit mask, commercial is work and market).
    const mask = new Uint8Array(DISTRICTS.length);
    const mark = (list: readonly District[], cat: number): void => {
      for (const d of list) mask[DISTRICTS.indexOf(d)] = (mask[DISTRICTS.indexOf(d)] as number) | (1 << cat);
    };
    mark(CIVILIAN_ROUTINE.homeDistricts, CATEGORY_HOME);
    mark(CIVILIAN_ROUTINE.workDistricts, CATEGORY_WORK);
    mark(CIVILIAN_ROUTINE.marketDistricts, CATEGORY_MARKET);

    // Building weight (floor area) per category and cluster.
    const b = map.buildings;
    const weight = new Float64Array(CATEGORIES * clusters);
    const buildingCluster = new Int32Array(b.count);
    for (let i = 0; i < b.count; i++) {
      const cl = this.clusterOfCell(
        ((b.y[i] as number) + ((b.h[i] as number) >> 1)) * n + (b.x[i] as number) + ((b.w[i] as number) >> 1),
      );
      buildingCluster[i] = cl;
      const m = mask[b.district[i] as number] as number;
      const area = (b.floors[i] as number) * (b.w[i] as number) * (b.h[i] as number);
      for (let cat = 0; cat < CATEGORIES; cat++) {
        const k = cat * clusters + cl;
        if (m & (1 << cat)) weight[k] = (weight[k] as number) + area;
      }
    }
    const fieldOf = new Int16Array(CATEGORIES * clusters).fill(-1);
    // Work and market fields first: residents start at home and need those for their first trips.
    const order = [CATEGORY_WORK, CATEGORY_MARKET, CATEGORY_HOME];
    let fields = 0;
    for (const cat of order)
      for (let cl = 0; cl < clusters; cl++)
        if ((weight[cat * clusters + cl] as number) > 0) fieldOf[cat * clusters + cl] = fields++;
    this.fieldCount = fields;
    this.fieldCategory = new Uint8Array(fields);
    this.fieldCluster = new Uint16Array(fields);
    this.fieldReady = new Uint8Array(fields);
    for (let k = 0; k < CATEGORIES * clusters; k++) {
      const f = fieldOf[k] as number;
      if (f < 0) continue;
      this.fieldCategory[f] = Math.floor(k / clusters);
      this.fieldCluster[f] = k % clusters;
    }

    // Door cells per field (deduplicated per field by a stamp).
    const lists: number[][] = [];
    for (let f = 0; f < fields; f++) lists.push([]);
    const stamp = new Int32Array(this.cells).fill(-1);
    const terrain = map.terrain;
    for (let cat = 0; cat < CATEGORIES; cat++) {
      for (let cl = 0; cl < clusters; cl++) {
        const f = fieldOf[cat * clusters + cl] as number;
        if (f < 0) continue;
        const list = lists[f] as number[];
        for (let i = 0; i < b.count; i++) {
          if (buildingCluster[i] !== cl || !((mask[b.district[i] as number] as number) & (1 << cat)))
            continue;
          const x0 = b.x[i] as number;
          const y0 = b.y[i] as number;
          const x1 = x0 + (b.w[i] as number);
          const y1 = y0 + (b.h[i] as number);
          for (let y = y0 - 1; y <= y1; y++) {
            for (let x = x0 - 1; x <= x1; x++) {
              const corner = (x === x0 - 1 || x === x1) && (y === y0 - 1 || y === y1);
              const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
              if (corner || inside || x < 0 || y < 0 || x >= n || y >= n) continue;
              const c = y * n + x;
              if (!walkable[c] || stamp[c] === f) continue;
              stamp[c] = f;
              list.push(c);
            }
          }
        }
      }
    }
    this.seedStart = new Int32Array(fields + 1);
    let total = 0;
    for (let f = 0; f < fields; f++) {
      this.seedStart[f] = total;
      total += (lists[f] as number[]).length;
    }
    this.seedStart[fields] = total;
    this.seeds = new Int32Array(total);
    for (let f = 0; f < fields; f++) this.seeds.set(lists[f] as number[], this.seedStart[f] as number);

    // Home field per cluster: own, else the nearest cluster with homes.
    this.homeOfCluster = new Int16Array(clusters).fill(-1);
    for (let cl = 0; cl < clusters; cl++) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let o = 0; o < clusters; o++) {
        const f = fieldOf[CATEGORY_HOME * clusters + o] as number;
        if (f < 0) continue;
        const dx = (o % side) - (cl % side);
        const dy = Math.floor(o / side) - Math.floor(cl / side);
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      this.homeOfCluster[cl] = best;
    }
    const pick = (cat: number): [Float64Array, Int16Array] => {
      const ids: number[] = [];
      const cum: number[] = [];
      let sum = 0;
      for (let cl = 0; cl < clusters; cl++) {
        const f = fieldOf[cat * clusters + cl] as number;
        if (f < 0) continue;
        sum += weight[cat * clusters + cl] as number;
        ids.push(f);
        cum.push(sum);
      }
      return [Float64Array.from(cum, (v) => v / sum), Int16Array.from(ids)];
    };
    [this.workPick, this.workIds] = pick(CATEGORY_WORK);
    [this.marketPick, this.marketIds] = pick(CATEGORY_MARKET);

    this.dirs = new Uint8Array(fields * this.cells).fill(DIR_NONE);
    const sc = CIVILIAN_ROUTINE.stepCost;
    const costOf: number[] = [];
    costOf[TERRAIN.road] = sc.road;
    costOf[TERRAIN.bridge] = sc.bridge;
    costOf[TERRAIN.ground] = sc.ground;
    costOf[TERRAIN.park] = sc.park;
    costOf[TERRAIN.forest] = sc.forest;
    costOf[TERRAIN.rail] = sc.rail;
    const cost = new Uint8Array(this.cells);
    for (let c = 0; c < this.cells; c++) cost[c] = costOf[terrain[c] as number] ?? sc.ground;
    this.solver = new CostFieldSolver(n, walkable, cost);

    this.home = new Int16Array(capacity).fill(-1);
    this.work = new Int16Array(capacity).fill(-1);
    this.market = new Int16Array(capacity).fill(-1);
    this.dest = new Int16Array(capacity).fill(-1);
    this.timer = new Uint16Array(capacity);
  }

  clusterOfCell(c: number): number {
    const x = c % this.n;
    const y = (c - x) / this.n;
    return Math.floor(y / this.clusterCells) * this.clusterSide + Math.floor(x / this.clusterCells);
  }

  /** True once every destination field is computed. */
  get ready(): boolean {
    return this.nextField >= this.fieldCount && !this.solver.busy;
  }

  /**
   * Walkability changed: recompute every field from the first one (each field keeps its old directions until its
   * own job starts). A running job is abandoned.
   */
  invalidate(): void {
    this.nextField = 0;
    this.restart = true;
    this.recomputing = true;
  }

  /** Computes destination fields within `budget` work units. */
  advanceFields(budget: number): void {
    let left = budget;
    while (left > 0) {
      if (!this.solver.busy || this.restart) {
        this.restart = false;
        if (this.nextField >= this.fieldCount) {
          this.recomputing = false;
          return;
        }
        const f = this.nextField;
        this.solver.start(
          this.seeds,
          this.seedStart[f] as number,
          this.seedStart[f + 1] as number,
          this.dirs,
          f * this.cells,
        );
        if (!this.solver.busy) {
          // No walkable door: the field stays all-none.
          this.fieldReady[f] = 1;
          this.nextField++;
          continue;
        }
      }
      left = this.solver.advance(left);
      if (!this.solver.busy) {
        this.fieldReady[this.nextField] = 1;
        this.nextField++;
      }
    }
  }

  /** Assigns home, work and market to a new civilian at its current cell and lets it dwell first. */
  assign(slot: number, cell: number, rng: Rng, dwellTicks: number): void {
    this.home[slot] = this.homeOfCluster[this.clusterOfCell(cell)] as number;
    this.work[slot] = pickWeighted(this.workPick, this.workIds, rng.nextFloat());
    this.market[slot] = pickWeighted(this.marketPick, this.marketIds, rng.nextFloat());
    this.dest[slot] = -1;
    this.timer[slot] = Math.min(0xffff, Math.floor(rng.nextFloat() * dwellTicks));
  }

  /** Solver progress, for the world hash (field contents follow from map and progress). */
  progress(): number {
    return (
      ((this.nextField << 16) ^
        this.solver.progress() ^
        (this.restart ? 0x8000 : 0) ^
        (this.recomputing ? 0x4000 : 0)) >>>
      0
    );
  }
}

function pickWeighted(cum: Float64Array, ids: Int16Array, r: number): number {
  for (let k = 0; k < cum.length; k++) if (r < (cum[k] as number)) return ids[k] as number;
  return ids.length > 0 ? (ids[ids.length - 1] as number) : -1;
}
