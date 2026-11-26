// Shared simulation state: map buffers, agent pools, spatial structures, counters. Systems read and write it;
// CityWorld (world.ts) owns one instance and runs the systems in GDD 4 order.
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { CELL_SIZE_M, type CityMapData } from '../core/types/map';
import type { SimCounters } from '../core/types/sim';
import { AGENT_CAPACITY, SPATIAL_HASH } from '../data/agents/horde';
import { FlowField } from './horde/flow-field';
import { AgentPool } from './horde/pool';
import { CellBuckets, SpatialHash } from './horde/spatial-hash';
import { ZombieDensity } from './horde/zombie-density';
import { ZombieTraits } from './horde/zombie-traits';
import { Corpses } from './infection/corpses';
import { Outbreak } from './infection/outbreak';
import { isWalkable } from './map/grid';
import { SafetyField } from './pathing/safety-field';
import { CivilianTraits } from './population/civilian-traits';
import { CivilianRoutine } from './population/routine';
import { Zones } from './population/zones';
import { NoiseField } from './systems/noise';

/** RNG stream of the running simulation, independent of the map generator stream. */
const SIM_STREAM = 1;

export class SimState {
  readonly n: number;
  readonly cells: number;
  readonly cellM = CELL_SIZE_M;
  readonly sizeM: number;
  readonly walkable: Uint8Array;
  readonly rng: Rng;
  readonly zombies = new AgentPool(AGENT_CAPACITY.zombies);
  readonly zombieCells: Uint16Array;
  readonly zt = new ZombieTraits(AGENT_CAPACITY.zombies);
  readonly civilians = new AgentPool(AGENT_CAPACITY.civilians);
  readonly civilianCells: Uint16Array;
  readonly ct = new CivilianTraits(AGENT_CAPACITY.civilians);
  readonly corpses = new Corpses();
  readonly routine: CivilianRoutine;
  /** Zombies per map cell, for separation, attacks and screams. */
  readonly zombieBuckets: CellBuckets;
  /** Civilians per 8 m cell, for the zombie target search. */
  readonly civilianHash: SpatialHash;
  /** Zombie counts and centroids per coarse noise cell (civilian perception, safety repulsion). */
  readonly density: ZombieDensity;
  readonly noise: NoiseField;
  readonly flow: FlowField;
  readonly outbreak = new Outbreak();
  readonly zones: Zones;
  /** Shared flight field towards open shelters (GDD 7 Flucht). */
  readonly safety: SafetyField;
  /** Per map cell: infection density 0..255 (overlay, statistics; GDD 7 Infektion). */
  readonly infection: Uint8Array;
  readonly counters: SimCounters = {
    sheltered: 0,
    incubating: 0,
    civiliansDead: 0,
    zombiesKilled: 0,
    outbreakTick: -1,
  };
  /** Slots allocated by the last placeAround call. */
  readonly placed: Int32Array;
  /** Set when civilians appear or vanish; the civilian hash is rebuilt then. */
  civiliansDirty = true;
  tick = 0;

  constructor(
    readonly map: CityMapData,
    seed: number,
  ) {
    const n = map.widthCells;
    this.n = n;
    this.cells = n * n;
    this.sizeM = n * CELL_SIZE_M;
    this.walkable = new Uint8Array(this.cells);
    for (let i = 0; i < this.cells; i++) this.walkable[i] = isWalkable(map.terrain[i] as number) ? 1 : 0;
    this.zombieCells = new Uint16Array(this.cells);
    this.civilianCells = new Uint16Array(this.cells);
    this.infection = new Uint8Array(this.cells);
    this.rng = createRng(deriveSeed(seed, SIM_STREAM));
    this.flow = new FlowField(n, this.walkable);
    this.routine = new CivilianRoutine(map, this.walkable, AGENT_CAPACITY.civilians);
    this.zombieBuckets = new CellBuckets(this.cells, AGENT_CAPACITY.zombies);
    this.civilianHash = new SpatialHash(this.sizeM, SPATIAL_HASH.cellM, AGENT_CAPACITY.civilians);
    this.noise = new NoiseField(this.sizeM);
    this.density = new ZombieDensity(this.sizeM, this.noise.cellM);
    this.zones = new Zones(n, this.noise.side, this.noise.cellM);
    this.safety = new SafetyField(this);
    this.placed = new Int32Array(Math.max(AGENT_CAPACITY.zombies, AGENT_CAPACITY.civilians));
  }

  cellOf(x: number, y: number): number {
    const n = this.n;
    const cx = Math.min(Math.max(Math.floor(x / CELL_SIZE_M), 0), n - 1);
    const cy = Math.min(Math.max(Math.floor(y / CELL_SIZE_M), 0), n - 1);
    return cy * n + cx;
  }

  /** Raises the infection density of a cell (saturating). */
  markInfection(cell: number, amount: number): void {
    this.infection[cell] = Math.min(255, (this.infection[cell] as number) + amount);
  }

  /**
   * Places up to `count` agents on walkable cells around (x, y), filling each cell up to `cap` and moving
   * outwards ring by ring. Records the slots in `placed`. Returns the number placed.
   */
  placeAround(pool: AgentPool, cells: Uint16Array, cap: number, x: number, y: number, count: number): number {
    const n = this.n;
    const c0 = this.cellOf(x, y);
    const cx = c0 % n;
    const cy = (c0 - cx) / n;
    let placed = 0;
    for (let r = 0; r < n && placed < count; r++) {
      for (let dy = -r; dy <= r && placed < count; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= n) continue;
        const step = dy === -r || dy === r ? 1 : 2 * r;
        for (let dx = -r; dx <= r && placed < count; dx += step) {
          const xx = cx + dx;
          if (xx < 0 || xx >= n) continue;
          const c = yy * n + xx;
          if (!this.walkable[c]) continue;
          while ((cells[c] as number) < cap && placed < count) {
            const slot = pool.alloc();
            if (slot < 0) return placed;
            // Keep a margin so float32 rounding never moves the agent into a neighbor cell.
            pool.posX[slot] = (xx + 0.05 + 0.9 * this.rng.nextFloat()) * CELL_SIZE_M;
            pool.posY[slot] = (yy + 0.05 + 0.9 * this.rng.nextFloat()) * CELL_SIZE_M;
            pool.cell[slot] = c;
            cells[c] = (cells[c] as number) + 1;
            this.placed[placed++] = slot;
          }
        }
      }
    }
    return placed;
  }
}
