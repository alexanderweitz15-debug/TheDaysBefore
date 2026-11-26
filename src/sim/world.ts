// The simulation world (M1): generated city, zombie horde with flow fields, commuting civilians.
import type { Command } from '../core/commands';
import { createHash, type HashState, hashU32, hashView } from '../core/hash';
import { TICK_RATE } from '../core/loop';
import { createRng, deriveSeed, type Rng } from '../core/rng';
import { CELL_SIZE_M, type CityMapData, DISTRICTS, RINGS } from '../core/types/map';
import type { CreateWorld, DebugField, DebugFieldKind, SimWorld, WorldOptions } from '../core/types/sim';
import type { AgentSection } from '../core/types/snapshot';
import {
  AGENT_CAPACITY,
  CIVILIAN_MOVEMENT,
  CIVILIAN_ROUTINE,
  ENGINE,
  FLOW_FIELD,
  SPATIAL_HASH,
  ZOMBIE_MOVEMENT,
} from '../data/agents/horde';
import { CITY_SIZES, DISTRICT_SPECS } from '../data/city/generator';
import { FlowField } from './horde/flow-field';
import { AgentPool } from './horde/pool';
import { CellBuckets, SpatialHash } from './horde/spatial-hash';
import { type HordeState, moveZombies, type ZombieMoveParams } from './horde/zombie-move';
import { generateCity, hashCityMap } from './map/generate';
import { isWalkable } from './map/grid';
import { unitsFromRad } from './math/trig';
import { CivilianRoutine, type RoutineParams } from './population/routine';

/** RNG stream of the running simulation, independent of the map generator stream. */
const SIM_STREAM = 1;

export class CityWorld implements SimWorld {
  readonly map: CityMapData;
  readonly widthM: number;
  readonly heightM: number;
  readonly zombies = new AgentPool(AGENT_CAPACITY.zombies);
  readonly civilians = new AgentPool(AGENT_CAPACITY.civilians);
  readonly flow: FlowField;
  private readonly n: number;
  private readonly walkable: Uint8Array;
  private readonly zombieCells: Uint16Array;
  private readonly civilianCells: Uint16Array;
  private readonly rng: Rng;
  private readonly state: HordeState;
  private readonly params: ZombieMoveParams;
  private readonly mapHash: number;
  private civiliansDirty = true;
  // Goal evaluation buffers (flow field targets).
  private readonly blockSide: number;
  private readonly blockCount: Int32Array;
  private readonly goalCells: Int32Array;
  /** Per block: 1 while it is a flow goal (hysteresis between goalEnterFrac and goalLeaveFrac). */
  private readonly goalFlag: Uint8Array;
  private lastGoalStart = 0;
  readonly routine: CivilianRoutine;
  private readonly routineParams: RoutineParams;
  /** Slots allocated by the last placeAround call. */
  private readonly placed: Int32Array;
  /** Flow fallback goal (GDD 8 rule 3). */
  readonly centerCell: number;

  constructor(seed: number, options: WorldOptions) {
    this.map = generateCity(seed, options.size);
    const n = this.map.widthCells;
    this.n = n;
    this.widthM = n * CELL_SIZE_M;
    this.heightM = this.map.heightCells * CELL_SIZE_M;
    this.walkable = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) this.walkable[i] = isWalkable(this.map.terrain[i] as number) ? 1 : 0;
    this.zombieCells = new Uint16Array(n * n);
    this.civilianCells = new Uint16Array(n * n);
    this.rng = createRng(deriveSeed(seed, SIM_STREAM));
    this.flow = new FlowField(n, this.walkable);
    const h = createHash();
    hashCityMap(h, this.map);
    this.mapHash = h.value;

    this.blockSide = Math.ceil(n / FLOW_FIELD.blockCells);
    this.blockCount = new Int32Array(this.blockSide * this.blockSide);
    this.goalCells = new Int32Array(AGENT_CAPACITY.civilians + 1);
    this.goalFlag = new Uint8Array(this.blockSide * this.blockSide);
    this.placed = new Int32Array(Math.max(AGENT_CAPACITY.zombies, AGENT_CAPACITY.civilians));
    this.routine = new CivilianRoutine(this.map, this.walkable, AGENT_CAPACITY.civilians);
    this.routineParams = {
      speedMps: CIVILIAN_MOVEMENT.walkSpeedMps,
      dt: 1 / TICK_RATE,
      homeWeight: CIVILIAN_MOVEMENT.routine.home,
      workWeight: CIVILIAN_MOVEMENT.routine.work,
      dwellMinTicks: CIVILIAN_MOVEMENT.dwellMinS * TICK_RATE,
      dwellMaxTicks: CIVILIAN_MOVEMENT.dwellMaxS * TICK_RATE,
      retryTicks: CIVILIAN_MOVEMENT.retryS * TICK_RATE,
    };
    this.centerCell = this.findCenterCell();

    this.state = {
      n,
      cellM: CELL_SIZE_M,
      sizeM: this.widthM,
      walkable: this.walkable,
      zombieCells: this.zombieCells,
      zombies: this.zombies,
      civilians: this.civilians,
      zombieBuckets: new CellBuckets(n * n, AGENT_CAPACITY.zombies),
      civilianHash: new SpatialHash(this.widthM, SPATIAL_HASH.cellM, AGENT_CAPACITY.civilians),
      flow: this.flow,
      rng: this.rng,
    };
    this.params = {
      speedMps: ZOMBIE_MOVEMENT.walkerSpeedMps,
      dt: 1 / TICK_RATE,
      sightM: ZOMBIE_MOVEMENT.sightRangeM,
      diameterM: 2 * ZOMBIE_MOVEMENT.radiusM,
      separationWeight: ZOMBIE_MOVEMENT.separationWeight,
      maxPerCell: ZOMBIE_MOVEMENT.maxPerCell,
      noiseUnits: unitsFromRad(ZOMBIE_MOVEMENT.headingNoiseRad),
      idleHeadingScale: ZOMBIE_MOVEMENT.idleHeadingScale,
      targetScanInterval: ENGINE.targetScanInterval,
      maxSeparationNeighbors: ENGINE.maxSeparationNeighbors,
    };

    this.placeResidents(CITY_SIZES[options.size].population);
    // The first field is ready before tick 0.
    this.evaluateGoals(0);
    this.flow.advance(Number.POSITIVE_INFINITY);
  }

  get zombieCount(): number {
    return this.zombies.count;
  }

  get civilianCount(): number {
    return this.civilians.count;
  }

  applyCommand(cmd: Command): void {
    if (cmd.type !== 'DebugSpawn') return;
    const { x, y, count, kind } = cmd.payload;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(count) || count < 1) return;
    if (kind === 'civilian') {
      this.placeCivilians(x, y, Math.floor(count), this.routineParams.dwellMinTicks);
      this.civiliansDirty = true;
    } else
      this.placeAround(this.zombies, this.zombieCells, ZOMBIE_MOVEMENT.maxPerCell, x, y, Math.floor(count));
  }

  step(tick: number): void {
    const s = this.state;
    if (!this.flow.busy && tick % ENGINE.goalEvalInterval === 0) this.evaluateGoals(tick);
    this.flow.advance(FLOW_FIELD.maxCellsPerTick);
    this.routine.advanceFields(CIVILIAN_ROUTINE.fieldCellsPerTick);
    const moved = this.routine.move(
      this.civilians,
      this.civilianCells,
      this.walkable,
      this.rng,
      this.routineParams,
      CELL_SIZE_M,
    );
    if (this.civiliansDirty || (moved > 0 && tick % ENGINE.civilianHashInterval === 0)) {
      s.civilianHash.build(this.civilians);
      s.civilianHash.buildCounts();
      this.civiliansDirty = false;
    }
    s.zombieBuckets.build(this.zombies);
    moveZombies(s, this.params, tick);
  }

  hash(h: HashState): void {
    hashU32(h, this.mapHash);
    hashView(h, this.rng.getState());
    for (const p of [this.zombies, this.civilians]) {
      const hw = p.highWater;
      hashU32(h, hw);
      hashU32(h, p.count);
      hashView(h, p.freeSlots());
      for (const a of [p.posX, p.posY, p.velX, p.velY, p.kind, p.alive, p.cell, p.target])
        hashView(h, a.subarray(0, hw));
    }
    hashView(h, this.zombieCells);
    hashView(h, this.civilianCells);
    hashView(h, this.flow.dirs);
    hashView(h, this.flow.dist);
    hashU32(h, this.flow.progress());
    hashU32(h, this.flow.currentDistance);
    hashU32(h, this.flow.activeSignature);
    hashView(h, this.goalFlag);
    hashU32(h, this.lastGoalStart);
    const r = this.routine;
    const chw = this.civilians.highWater;
    for (const a of [r.home, r.work, r.market, r.dest, r.timer]) hashView(h, a.subarray(0, chw));
    hashU32(h, r.progress());
  }

  writeZombies(out: AgentSection): void {
    this.writeSection(this.zombies, out);
  }

  writeCivilians(out: AgentSection): void {
    this.writeSection(this.civilians, out);
  }

  debugField(kind: DebugFieldKind): DebugField | null {
    const n = this.n;
    const base = { kind, widthCells: n, heightCells: n, cellSizeM: CELL_SIZE_M };
    if (kind === 'flow') return { ...base, data: this.flow.dirs.slice() };
    const data = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) data[i] = Math.min(255, this.zombieCells[i] as number);
    return { ...base, data };
  }

  private writeSection(p: AgentPool, out: AgentSection): void {
    let k = 0;
    const hw = p.highWater;
    for (let i = 0; i < hw && k < out.count; i++) {
      if (!p.alive[i]) continue;
      out.ids[k] = i;
      out.pos[2 * k] = p.posX[i] as number;
      out.pos[2 * k + 1] = p.posY[i] as number;
      out.kind[k] = p.kind[i] as number;
      k++;
    }
  }

  /**
   * Flow goals: civilians in goal blocks. A block becomes a goal when its civilian count reaches goalEnterFrac of
   * the mean of populated blocks and stays one until it falls below goalLeaveFrac. The signature covers only the
   * goal block set, so commuting inside it starts no new field. A changed set restarts at most every
   * goalMinIntervalTicks; an unchanged one is re-seeded from current cells after goalRefreshTicks.
   * Without civilians the horde drifts to the city center (GDD 8 rule 3).
   */
  private evaluateGoals(tick: number): void {
    const { civilians: c, blockCount, goalFlag } = this;
    const bc = FLOW_FIELD.blockCells;
    const n = this.n;
    blockCount.fill(0);
    let total = 0;
    let used = 0;
    for (let i = 0; i < c.highWater; i++) {
      if (!c.alive[i]) continue;
      const cell = c.cell[i] as number;
      const b = Math.floor(Math.floor(cell / n) / bc) * this.blockSide + Math.floor((cell % n) / bc);
      if (blockCount[b] === 0) used++;
      blockCount[b] = (blockCount[b] as number) + 1;
      total++;
    }
    let sig = 0x811c9dc5;
    for (let b = 0; b < goalFlag.length; b++) {
      const weighted = (blockCount[b] as number) * used;
      if (goalFlag[b]) {
        if (weighted < total * FLOW_FIELD.goalLeaveFrac) goalFlag[b] = 0;
      } else if (total > 0 && weighted >= total * FLOW_FIELD.goalEnterFrac) goalFlag[b] = 1;
      if (goalFlag[b]) sig = Math.imul(sig ^ b, 0x01000193);
    }
    let k = 0;
    if (total > 0) {
      for (let i = 0; i < c.highWater; i++) {
        if (!c.alive[i]) continue;
        const cell = c.cell[i] as number;
        const b = Math.floor(Math.floor(cell / n) / bc) * this.blockSide + Math.floor((cell % n) / bc);
        if (goalFlag[b]) this.goalCells[k++] = cell;
      }
    }
    if (k === 0) {
      this.goalCells[k++] = this.centerCell;
      sig = Math.imul(sig ^ this.centerCell, 0x01000193) ^ 0x5a5a5a5a;
    }
    sig >>>= 0;
    const age = tick - this.lastGoalStart;
    const changed =
      sig !== this.flow.activeSignature && (age >= FLOW_FIELD.goalMinIntervalTicks || tick === 0);
    if (changed || age >= FLOW_FIELD.goalRefreshTicks) {
      this.flow.start(this.goalCells, k, sig);
      this.lastGoalStart = tick;
    }
  }

  /** Walkable cell nearest the center of the inner ring. */
  private findCenterCell(): number {
    const s = this.map.sectors;
    let x = this.widthM / 2;
    let y = this.heightM / 2;
    for (let i = 0; i < s.count; i++) {
      if (s.ring[i] === RINGS.indexOf('inner')) {
        x = s.centerX[i] as number;
        y = s.centerY[i] as number;
        break;
      }
    }
    const n = this.n;
    const cx = Math.min(n - 1, Math.floor(x / CELL_SIZE_M));
    const cy = Math.min(n - 1, Math.floor(y / CELL_SIZE_M));
    for (let r = 0; r < n; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < n && yy < n && this.walkable[yy * n + xx]) return yy * n + xx;
        }
      }
    }
    return 0;
  }

  /** Civilians around their homes, proportional to residents (floors x footprint x district density). */
  private placeResidents(population: number): void {
    const b = this.map.buildings;
    const area = CELL_SIZE_M * CELL_SIZE_M;
    let totalResidents = 0;
    const residents = new Float64Array(b.count);
    for (let i = 0; i < b.count; i++) {
      const spec = DISTRICT_SPECS[DISTRICTS[b.district[i] as number] ?? 'residential'];
      const r =
        (((b.floors[i] as number) * (b.w[i] as number) * (b.h[i] as number) * area) / 100) *
        spec.residentsPer100m2Floor;
      residents[i] = r;
      totalResidents += r;
    }
    if (totalResidents <= 0) return;
    const want = Math.min(population, AGENT_CAPACITY.civilians);
    let cumulative = 0;
    let placed = 0;
    for (let i = 0; i < b.count; i++) {
      cumulative += residents[i] as number;
      const quota = Math.round((cumulative / totalResidents) * want) - placed;
      if (quota <= 0) continue;
      const x = ((b.x[i] as number) + (b.w[i] as number) / 2) * CELL_SIZE_M;
      const y = ((b.y[i] as number) + (b.h[i] as number) / 2) * CELL_SIZE_M;
      placed += quota;
      this.placeCivilians(x, y, quota, this.routineParams.dwellMaxTicks);
    }
  }

  /** Places civilians around (x, y) and assigns their routine; they dwell up to `dwellTicks` first. */
  private placeCivilians(x: number, y: number, count: number, dwellTicks: number): void {
    const placed = this.placeAround(
      this.civilians,
      this.civilianCells,
      CIVILIAN_MOVEMENT.maxPerCell,
      x,
      y,
      count,
    );
    for (let k = 0; k < placed; k++) {
      const slot = this.placed[k] as number;
      this.routine.assign(slot, this.civilians.cell[slot] as number, this.rng, dwellTicks);
    }
  }

  /**
   * Places up to `count` agents on walkable cells around (x, y), filling each cell up to `cap`
   * and moving outwards ring by ring. Records the slots in `placed`. Returns the number placed.
   */
  private placeAround(
    pool: AgentPool,
    cells: Uint16Array,
    cap: number,
    x: number,
    y: number,
    count: number,
  ): number {
    const n = this.n;
    const cx = Math.min(Math.max(Math.floor(x / CELL_SIZE_M), 0), n - 1);
    const cy = Math.min(Math.max(Math.floor(y / CELL_SIZE_M), 0), n - 1);
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

export const createWorld: CreateWorld = (seed, options) => new CityWorld(seed, options);
