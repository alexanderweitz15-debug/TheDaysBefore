// Contract between the sim host (src/core) and the simulation (src/sim). Implemented by sim-engine.
import type { Command } from '../commands';
import type { HashState } from '../hash';
import type { StructureView, UnitView } from './combat';
import type { CityMapData, CitySize } from './map';
import type { MissionView, ScenarioDef } from './mission';
import type { GarrisonView, OrderView, ReserveView } from './orders';
import type { DebriefData } from './outcome';
import type { AgentSection } from './snapshot';
import type { ZoneView } from './zones';

export type DebugFieldKind = 'flow' | 'density' | 'infection' | 'noise' | 'safety';

/** Debug overlay grid. flow: direction 0..7 (E, NE, N, NW, W, SW, S, SE), 255 = none. density: agents per cell. */
export interface DebugField {
  kind: DebugFieldKind;
  widthCells: number;
  heightCells: number;
  cellSizeM: number;
  data: Uint8Array;
}

export interface SimWorld {
  readonly widthM: number;
  readonly heightM: number;
  readonly map: CityMapData;
  readonly zombieCount: number;
  readonly civilianCount: number;
  readonly corpseCount: number;
  /** Outcome counters for HUD and scoring. */
  readonly counters: SimCounters;
  /** Increments whenever zones change; the host resends zones() then. */
  readonly zonesVersion: number;
  zones(): ZoneView[];
  readonly unitCount: number;
  /** Units: position per squad, kind = UNIT index into unit type list of the data. */
  writeUnits(out: AgentSection): void;
  units(): UnitView[];
  /** Increments when structures are added/removed/change state; hp is resent once per second. */
  readonly structuresVersion: number;
  structures(): StructureView[];
  /** Order system (no RTS): orders, reserve and garrisons. Changes bump ordersVersion; resent once per second. */
  readonly ordersVersion: number;
  orders(): { orders: OrderView[]; reserve: ReserveView; garrisons: GarrisonView[] };
  /** Phase, economy, population, warnings; polled once per second by the worker. */
  mission(): MissionView;
  /** Full debrief after the mission ended (null before). May allocate. */
  debrief(): DebriefData | null;
  /**
   * Versioned full state for save games; flow/safety fields may be recomputed on load.
   * Contract: bytes 0..3 = completed tick count (Uint32 little endian), bytes 4..7 = format version.
   * restore(serialize()) must continue bit-identically (same hash after the same further commands).
   */
  serialize(): Uint8Array;
  /** Projectiles in flight: kind = projectile type index. */
  readonly projectileCount: number;
  writeProjectiles(out: AgentSection): void;
  /** FX events since the last writeFx call (accumulated across ticks, capped), flat [type, x, y, param]. writeFx clears them. */
  readonly fxCount: number;
  writeFx(out: Float32Array): void;
  /** Called at the start of a tick, once per due command, in queue order. Must ignore non-sim commands. */
  applyCommand(cmd: Command): void;
  /** Runs all systems for `tick` in the order of GDD section 4. No allocations. */
  step(tick: number): void;
  /** Folds the full simulation state (including map and RNG state) into `h`. */
  hash(h: HashState): void;
  /** Fills sections whose count equals zombieCount / civilianCount. */
  writeZombies(out: AgentSection): void;
  writeCivilians(out: AgentSection): void;
  writeCorpses(out: AgentSection): void;
  /** Debug only, may allocate. Null if the field does not exist. */
  debugField(kind: DebugFieldKind): DebugField | null;
}

export interface SimCounters {
  /** Civilians currently sheltered in safe zones or at rally points (rescued for scoring, GDD 10). */
  sheltered: number;
  /** Infected but not yet turned (hidden from the player without research, GDD 7). */
  incubating: number;
  civiliansDead: number;
  zombiesKilled: number;
  /** Tick of outbreak start, -1 before. */
  outbreakTick: number;
  /** Civilians killed by own weapons (GDD 9/10 collateral, -30 score each). */
  collateralKills: number;
  soldiersLost: number;
  /** Spendable budget (economy arrives in M4; M3 uses a start budget from data). */
  budget: number;
}

export interface WorldOptions {
  size: CitySize;
  /** Overrides the start budget (bench, sandbox). */
  startBudget?: number;
  /** Mission setup. Without a scenario the world runs in free mode (no farm phase, legacy debug behaviour). */
  scenario?: ScenarioDef;
}

export type CreateWorld = (seed: number, options: WorldOptions) => SimWorld;
/** Restores a world from serialize() output; throws with a clear message on version mismatch. */
export type RestoreWorld = (seed: number, options: WorldOptions, state: Uint8Array) => SimWorld;
