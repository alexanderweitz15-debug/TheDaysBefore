// Contract between the sim host (src/core) and the simulation (src/sim). Implemented by sim-engine.
import type { Command } from '../commands';
import type { HashState } from '../hash';
import type { CityMapData, CitySize } from './map';
import type { AgentSection } from './snapshot';

export type DebugFieldKind = 'flow' | 'density';

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
  /** Called at the start of a tick, once per due command, in queue order. Must ignore non-sim commands. */
  applyCommand(cmd: Command): void;
  /** Runs all systems for `tick` in the order of GDD section 4. No allocations. */
  step(tick: number): void;
  /** Folds the full simulation state (including map and RNG state) into `h`. */
  hash(h: HashState): void;
  /** Fills sections whose count equals zombieCount / civilianCount. */
  writeZombies(out: AgentSection): void;
  writeCivilians(out: AgentSection): void;
  /** Debug only, may allocate. Null if the field does not exist. */
  debugField(kind: DebugFieldKind): DebugField | null;
}

export interface WorldOptions {
  size: CitySize;
}

export type CreateWorld = (seed: number, options: WorldOptions) => SimWorld;
