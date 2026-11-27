// The simulation world: generated city, horde, civilians, outbreak. Runs the systems in GDD 4 order on a
// shared SimState; the systems live in horde/, infection/, population/ and systems/.
import type { Command } from '../core/commands';
import { createHash, type HashState } from '../core/hash';
import { TICK_RATE } from '../core/loop';
import type { StructureView, UnitView } from '../core/types/combat';
import { CELL_SIZE_M, type CityMapData, type CitySize } from '../core/types/map';
import type { MissionView } from '../core/types/mission';
import type { GarrisonView, OrderView, ReserveView } from '../core/types/orders';
import type { DebriefData } from '../core/types/outcome';
import type {
  CreateWorld,
  DebugField,
  DebugFieldKind,
  RestoreWorld,
  SimCounters,
  SimWorld,
  WorldOptions,
} from '../core/types/sim';
import type { AgentSection } from '../core/types/snapshot';
import type { ZoneView } from '../core/types/zones';
import { SAFETY_FIELD } from '../data/agents/civilians';
import {
  CIVILIAN_MOVEMENT,
  CIVILIAN_ROUTINE,
  ENGINE,
  FLOW_FIELD,
  ZOMBIE_MOVEMENT,
} from '../data/agents/horde';
import { STRUCTURE_RULES } from '../data/buildings/defense';
import { CITY_SIZES } from '../data/city/generator';
import { PATIENT_ZERO } from '../data/pathogens/viral';
import { UNITS } from '../data/units/present';
import { SCREAMER } from '../data/zombies/viral-types';
import { fireUnits } from './combat/fire';
import { advanceUnitInfection } from './combat/unit-damage';
import { applyUnitCommand, moveUnits } from './combat/unit-move';
import { missionTick, setupMission } from './economy/mission';
import { applyMissionCommand, missionView } from './economy/mission-view';
import { setupEconomy } from './economy/production';
import type { FlowField } from './horde/flow-field';
import { ZombieGoals } from './horde/goals';
import type { AgentPool } from './horde/pool';
import { screams } from './horde/screamer';
import { moveZombies, type ZombieMoveParams } from './horde/zombie-move';
import { zombieAttacks } from './infection/attack';
import { advanceInfection, startOutbreak } from './infection/incubation';
import { generateCity, hashCityMap } from './map/generate';
import { unitsFromRad } from './math/trig';
import { applyOrderCommand, buyUnit, orderViews, updateOrders } from './orders/order-system';
import { buildDebrief } from './outcome/debrief';
import { evaluateOutcome, setupResult } from './outcome/result';
import { CS_INCUBATING } from './population/civilian-traits';
import { moveFlight } from './population/flight-move';
import { perceive } from './population/perception';
import type { CivilianRoutine } from './population/routine';
import { moveRoutine, type RoutineParams } from './population/routine-move';
import { ZK_CORRIDOR, ZK_RALLY, ZK_SAFE } from './population/zones';
import { checkSave, loadInto, serializeWorld } from './save/world-save';
import { SimState } from './state';
import { detonate, updateStructures } from './structures/structure-system';
import { hashWorld } from './world-hash';
import { findCenterCell, placeCivilians, placeResidents, placeWalkers } from './world-setup';

/** Noise level shown as 255 in the debug field. */
const NOISE_DEBUG_FULL = 100;

export class CityWorld implements SimWorld {
  readonly map: CityMapData;
  readonly widthM: number;
  readonly heightM: number;
  readonly s: SimState;
  private readonly params: ZombieMoveParams;
  private readonly routineParams: RoutineParams;
  readonly mapHash: number;
  readonly seed: number;
  readonly size: CitySize;
  /** Ticks stepped so far (save header). */
  completedTicks = 0;

  constructor(seed: number, options: WorldOptions) {
    this.seed = seed;
    this.size = options.size;
    this.map = generateCity(seed, options.size);
    const s = new SimState(this.map, seed);
    this.s = s;
    this.widthM = s.sizeM;
    this.heightM = this.map.heightCells * CELL_SIZE_M;
    const h = createHash();
    hashCityMap(h, this.map);
    this.mapHash = h.value;
    if (options.startBudget !== undefined && Number.isFinite(options.startBudget))
      s.counters.budget = options.startBudget;
    s.goals = new ZombieGoals(s.n, findCenterCell(s));
    this.params = {
      dt: 1 / TICK_RATE,
      sightM: ZOMBIE_MOVEMENT.sightRangeM,
      separationWeight: ZOMBIE_MOVEMENT.separationWeight,
      maxPerCell: ZOMBIE_MOVEMENT.maxPerCell,
      noiseUnits: unitsFromRad(ZOMBIE_MOVEMENT.headingNoiseRad),
      idleHeadingScale: ZOMBIE_MOVEMENT.idleHeadingScale,
      targetScanInterval: ENGINE.targetScanInterval,
      maxSeparationNeighbors: ENGINE.maxSeparationNeighbors,
      auraRadiusM: PATIENT_ZERO.auraRadiusM,
      auraBonus: PATIENT_ZERO.auraSpeedBonus,
      screamBonus: SCREAMER.speedBonus,
      suppression: UNITS.mgTeam.suppression,
    };
    this.routineParams = {
      speedMps: CIVILIAN_MOVEMENT.walkSpeedMps,
      dt: 1 / TICK_RATE,
      homeWeight: CIVILIAN_MOVEMENT.routine.home,
      workWeight: CIVILIAN_MOVEMENT.routine.work,
      dwellMinTicks: CIVILIAN_MOVEMENT.dwellMinS * TICK_RATE,
      dwellMaxTicks: CIVILIAN_MOVEMENT.dwellMaxS * TICK_RATE,
      retryTicks: CIVILIAN_MOVEMENT.retryS * TICK_RATE,
    };
    const sc = options.scenario;
    placeResidents(
      s,
      sc?.population ?? CITY_SIZES[options.size].population,
      this.routineParams.dwellMaxTicks,
    );
    // The first field is ready before tick 0.
    s.goals.evaluate(s, 0);
    s.flow.advance(Number.POSITIVE_INFINITY);
    if (sc) {
      setupEconomy(s, sc.startResources ?? {});
      setupMission(s, sc);
      setupResult(s, sc);
    }
  }

  get zombies(): AgentPool {
    return this.s.zombies;
  }
  get civilians(): AgentPool {
    return this.s.civilians;
  }
  get flow(): FlowField {
    return this.s.flow;
  }
  get routine(): CivilianRoutine {
    return this.s.routine;
  }
  get centerCell(): number {
    return this.s.goals.centerCell;
  }
  get zombieCount(): number {
    return this.s.zombies.count;
  }
  get civilianCount(): number {
    return this.s.civilians.count;
  }
  get corpseCount(): number {
    return this.s.corpses.count;
  }
  get counters(): SimCounters {
    return this.s.counters;
  }
  get zonesVersion(): number {
    return this.s.zones.version;
  }
  zones(): ZoneView[] {
    return this.s.zones.views();
  }
  get unitCount(): number {
    return this.s.units.count;
  }
  writeUnits(out: AgentSection): void {
    this.s.units.write(out);
  }
  units(): UnitView[] {
    return this.s.units.views();
  }
  get structuresVersion(): number {
    return this.s.structures.version;
  }
  structures(): StructureView[] {
    return this.s.structures.views();
  }
  get projectileCount(): number {
    return this.s.projectiles.pool.count;
  }
  writeProjectiles(out: AgentSection): void {
    writeSection(this.s.projectiles.pool, out, null);
  }
  get fxCount(): number {
    return this.s.fx.count;
  }
  writeFx(out: Float32Array): void {
    this.s.fx.drain(out);
  }

  get ordersVersion(): number {
    return this.s.orders.version;
  }
  orders(): { orders: OrderView[]; reserve: ReserveView; garrisons: GarrisonView[] } {
    return orderViews(this.s);
  }

  mission(): MissionView {
    return missionView(this.s);
  }

  applyCommand(cmd: Command): void {
    const s = this.s;
    s.tick = Math.max(s.tick, cmd.tick);
    switch (cmd.type) {
      case 'DebugSpawn': {
        const { x, y, count, kind } = cmd.payload;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(count) || count < 1) return;
        if (kind === 'civilian') placeCivilians(s, x, y, Math.floor(count), this.routineParams.dwellMinTicks);
        else placeWalkers(s, x, y, Math.floor(count));
        return;
      }
      case 'StartOutbreak': {
        const { x, y, family } = cmd.payload;
        // Only the viral family is simulated so far (M2).
        if (family === 'viral' && Number.isFinite(x) && Number.isFinite(y)) startOutbreak(s, x, y);
        return;
      }
      case 'PlaceSafeZone': {
        const { x0, y0, x1, y1 } = cmd.payload;
        s.zones.add(s, ZK_SAFE, [x0, y0, x1, y1]);
        return;
      }
      case 'SetRallyPoint':
        s.zones.add(s, ZK_RALLY, [cmd.payload.x, cmd.payload.y]);
        return;
      case 'DrawCorridor':
        if (Array.isArray(cmd.payload.points)) s.zones.add(s, ZK_CORRIDOR, cmd.payload.points);
        return;
      case 'RemoveZone':
        s.zones.remove(s, cmd.payload.id);
        return;
      case 'PlaceUnit':
        // Militia only from conscripts (economy/population.ts).
        if (!UNITS[cmd.payload.unitType]?.notPlaceable)
          buyUnit(s, cmd.payload.unitType, cmd.payload.x, cmd.payload.y);
        return;
      case 'PlaceStructure':
        s.structures.place(s, cmd.payload.kind, cmd.payload.points, cmd.payload.rotation);
        return;
      case 'DemolishStructure':
        s.structures.demolish(s, cmd.payload.id, s.tick);
        return;
      case 'DetonateCharge':
        detonate(s, cmd.payload.id);
        return;
      default:
        if (!applyMissionCommand(s, cmd) && !applyOrderCommand(s, cmd)) applyUnitCommand(s, cmd);
        return;
    }
  }

  step(tick: number): void {
    const s = this.s;
    s.tick = tick;
    missionTick(s, tick);
    perceive(s, tick);
    s.noise.decay(tick);
    if (!s.flow.busy && tick % ENGINE.goalEvalInterval === 0) s.goals.evaluate(s, tick);
    s.flow.advance(FLOW_FIELD.maxCellsPerTick);
    s.routine.advanceFields(
      s.routine.recomputing ? STRUCTURE_RULES.routineRepathCellsPerTick : CIVILIAN_ROUTINE.fieldCellsPerTick,
    );
    s.safety.update(s, tick, SAFETY_FIELD.cellsPerTick);
    let moved = moveRoutine(
      s.routine,
      s.civilians,
      s.civilianCells,
      s.civWalk,
      s.rng,
      this.routineParams,
      CELL_SIZE_M,
    );
    moved += moveFlight(s, tick);
    if (s.civiliansDirty || (moved > 0 && tick % ENGINE.civilianHashInterval === 0)) {
      s.civilianHash.build(s.civilians);
      s.civilianHash.buildCounts();
      s.civiliansDirty = false;
    }
    if (s.units.count > 0 || s.unitsDirty) {
      s.unitHash.build(s.units.pool);
      s.unitHash.buildCounts();
      s.unitsDirty = false;
    }
    s.zombieBuckets.build(s.zombies);
    // Density from the same positions as the buckets, so combat can skip empty coarse cells consistently.
    s.density.build(s.zombies);
    moveZombies(s, this.params, tick);
    updateOrders(s, tick);
    moveUnits(s, tick);
    screams(s);
    fireUnits(s, tick);
    zombieAttacks(s);
    advanceInfection(s);
    advanceUnitInfection(s);
    updateStructures(s, tick);
    evaluateOutcome(s, tick);
    s.stats.record(s, tick);
    s.zones.publish(tick);
    this.completedTicks = tick + 1;
  }

  hash(h: HashState): void {
    hashWorld(h, this.s, this.mapHash);
  }

  /** Full debrief once the mission ended (null before). */
  debrief(): DebriefData | null {
    return buildDebrief(this.s);
  }

  serialize(): Uint8Array {
    return serializeWorld(this);
  }

  writeZombies(out: AgentSection): void {
    writeSection(this.s.zombies, out, null);
  }

  writeCivilians(out: AgentSection): void {
    writeSection(this.s.civilians, out, this.s.ct.turnTick);
  }

  writeCorpses(out: AgentSection): void {
    writeSection(this.s.corpses.pool, out, null);
  }

  debugField(kind: DebugFieldKind): DebugField | null {
    const s = this.s;
    const n = s.n;
    const base = { kind, widthCells: n, heightCells: n, cellSizeM: CELL_SIZE_M };
    if (kind === 'flow') return { ...base, data: s.flow.dirs.slice() };
    if (kind === 'infection') return { ...base, data: s.infection.slice() };
    if (kind === 'noise') {
      const side = s.noise.side;
      const data = new Uint8Array(side * side);
      for (let i = 0; i < data.length; i++)
        data[i] = Math.min(255, Math.round(((s.noise.level[i] as number) * 255) / NOISE_DEBUG_FULL));
      return { kind, widthCells: side, heightCells: side, cellSizeM: s.noise.cellM, data };
    }
    if (kind === 'safety') return { ...base, data: s.safety.debug() };
    const data = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) data[i] = Math.min(255, s.zombieCells[i] as number);
    return { ...base, data };
  }
}

/** Live agents in slot order. With `turnTick`, infected civilians are written as incubating. */
function writeSection(p: AgentPool, out: AgentSection, turnTick: Int32Array | null): void {
  let k = 0;
  const hw = p.highWater;
  for (let i = 0; i < hw && k < out.count; i++) {
    if (!p.alive[i]) continue;
    out.ids[k] = i;
    out.pos[2 * k] = p.posX[i] as number;
    out.pos[2 * k + 1] = p.posY[i] as number;
    out.kind[k] = turnTick && (turnTick[i] as number) >= 0 ? CS_INCUBATING : (p.kind[i] as number);
    k++;
  }
}

export const createWorld: CreateWorld = (seed, options) => new CityWorld(seed, options);

/** Rebuilds the city from seed and options, then overwrites it with the saved state. */
export const restoreWorld: RestoreWorld = (seed, options, state) => {
  checkSave(state);
  const w = new CityWorld(seed, options);
  loadInto(w, state);
  return w;
};
