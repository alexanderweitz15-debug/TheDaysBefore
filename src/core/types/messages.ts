// Worker protocol. Main thread -> worker: ToWorker. Worker -> main thread: FromWorker.
import type { Command, CommandInput } from '../commands';

export interface SimStats {
  tick: number;
  speed: number;
  /** Ticks actually simulated during the last wall-clock second. */
  ticksPerSecond: number;
  /** Mean and max duration of one tick during the last second, in ms. */
  tickMsAvg: number;
  tickMsMax: number;
  agentCount: number;
}

export type ToWorker = { type: 'init'; seed: number } | { type: 'command'; cmd: CommandInput };

export type FromWorker =
  | { type: 'snapshot'; buffer: ArrayBuffer; stats: SimStats }
  | { type: 'error'; message: string; seed: number; commandLog: Command[] };
