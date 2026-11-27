// Worker protocol. Main thread -> worker: ToWorker. Worker -> main thread: FromWorker.
import type { Command, CommandInput } from '../commands';
import type { StructureView, UnitView } from './combat';
import type { CityMapData, CitySize } from './map';
import type { MissionView, ScenarioDef } from './mission';
import type { GarrisonView, OrderView, ReserveView } from './orders';
import type { DebriefData } from './outcome';
import type { ReplayData, SaveGame } from './save';
import type { DebugField, DebugFieldKind, SimCounters } from './sim';
import type { ZoneView } from './zones';

export interface SimStats {
  tick: number;
  speed: number;
  /** Ticks actually simulated during the last wall-clock second. */
  ticksPerSecond: number;
  /** Mean and max duration of one tick during the last second, in ms. */
  tickMsAvg: number;
  tickMsMax: number;
  zombies: number;
  civilians: number;
  corpses: number;
  counters: SimCounters;
  /** Time to generate the world, in ms. */
  worldGenMs: number;
}

export type ToWorker =
  | { type: 'init'; seed: number; size: CitySize; scenario?: ScenarioDef }
  | { type: 'command'; cmd: CommandInput }
  /** Hands a consumed snapshot buffer back for reuse. */
  | { type: 'returnBuffer'; buffer: ArrayBuffer }
  /** Requests a debug field with every snapshot; null stops it. */
  | { type: 'debugField'; kind: DebugFieldKind | null }
  /** Requests the full state; answered with 'save'. */
  | { type: 'save'; requestId: number }
  /** Replaces the running world with a saved one. */
  | { type: 'load'; save: SaveGame }
  /** Requests replay data (seed, setup, command log, end hash); answered with 'replay'. */
  | { type: 'replay'; requestId: number }
  /** Runs a replay headless in the worker as fast as possible and reports the end hash. */
  | { type: 'verifyReplay'; requestId: number; replay: ReplayData };

export type FromWorker =
  | { type: 'map'; map: CityMapData; worldGenMs: number }
  | { type: 'snapshot'; buffer: ArrayBuffer; stats: SimStats }
  | { type: 'debugField'; field: DebugField }
  | { type: 'zones'; zones: ZoneView[] }
  | { type: 'units'; units: UnitView[] }
  | { type: 'structures'; structures: StructureView[] }
  | { type: 'mission'; mission: MissionView }
  | { type: 'debrief'; debrief: DebriefData }
  | { type: 'orders'; orders: OrderView[]; reserve: ReserveView; garrisons: GarrisonView[] }
  | { type: 'save'; requestId: number; save: Omit<SaveGame, 'meta'> & { tick: number } }
  | { type: 'replay'; requestId: number; replay: ReplayData }
  | { type: 'verifyReplay'; requestId: number; hash: string; tick: number }
  | { type: 'error'; message: string; seed: number; commandLog: Command[] };
