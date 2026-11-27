// Save games and replays (GDD 4 Speichern). Save = versioned full state; replay = seed + setup + commands.
import type { Command } from '../commands';
import type { CitySize } from './map';
import type { ScenarioDef } from './mission';

export const SAVE_FORMAT_VERSION = 1;

export interface SaveMeta {
  formatVersion: number;
  scenarioId: string | null;
  tick: number;
  /** Wall-clock ISO timestamp, set by the UI (never by the sim). */
  savedAt: string;
  label: string;
}

export interface SaveGame {
  meta: SaveMeta;
  seed: number;
  size: CitySize;
  scenario: ScenarioDef | null;
  /** Serialized simulation state (gzip-compressed by core before storage). */
  state: Uint8Array;
  /** Commands so far, so a replay of the whole mission stays possible after loading. */
  commands: Command[];
}

export interface ReplayData {
  formatVersion: number;
  seed: number;
  size: CitySize;
  scenario: ScenarioDef | null;
  commands: Command[];
  /** Tick count and state hash at the end, to verify the replay. */
  endTick: number;
  endHash: string;
}
