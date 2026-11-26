// Contract between the sim host (src/core) and the simulation (src/sim). Implemented by sim-engine.
import type { Command } from '../commands';
import type { HashState } from '../hash';

export interface SimWorld {
  /** World extent in meters. */
  readonly widthM: number;
  readonly heightM: number;
  /** Number of live agents to be written into a snapshot. */
  readonly agentCount: number;
  /** Called at the start of a tick, once per due command, in queue order. Must ignore non-sim commands. */
  applyCommand(cmd: Command): void;
  /** Runs all systems for `tick` in the order of GDD section 4. No allocations. */
  step(tick: number): void;
  /** Folds the full simulation state (including RNG state) into `h`. */
  hash(h: HashState): void;
  /** Writes interleaved x,y (meters) of `agentCount` agents into `out` (length >= 2 * agentCount). */
  writePositions(out: Float32Array): void;
}

export type CreateWorld = (seed: number) => SimWorld;
