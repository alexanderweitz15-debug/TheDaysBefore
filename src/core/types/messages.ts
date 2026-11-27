// Worker protocol. Main thread -> worker: ToWorker. Worker -> main thread: FromWorker.
import type { Command, CommandInput } from '../commands';
import type { StructureView, UnitView } from './combat';
import type { CityMapData, CitySize } from './map';
import type { MissionView, ScenarioDef } from './mission';
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
  | { type: 'debugField'; kind: DebugFieldKind | null };

export type FromWorker =
  | { type: 'map'; map: CityMapData; worldGenMs: number }
  | { type: 'snapshot'; buffer: ArrayBuffer; stats: SimStats }
  | { type: 'debugField'; field: DebugField }
  | { type: 'zones'; zones: ZoneView[] }
  | { type: 'units'; units: UnitView[] }
  | { type: 'structures'; structures: StructureView[] }
  | { type: 'mission'; mission: MissionView }
  | { type: 'error'; message: string; seed: number; commandLog: Command[] };
