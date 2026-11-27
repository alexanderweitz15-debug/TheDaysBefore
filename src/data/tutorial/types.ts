// Tutorial data format (GDD 15): steps with text key, marker, completion condition and start actions.
import type { CommandType, GameSpeed } from '../../core/commands';
import type { ScenarioDef } from '../../core/types/mission';
import type { MessageKey } from '../i18n/de';

/** Completion condition: an event (command, camera) or a state (count, speed, panel). */
export type Condition =
  | { kind: 'command'; command: CommandType; match?: Record<string, string | number | boolean> }
  | { kind: 'cameraMoved' }
  | { kind: 'zoomed' }
  | { kind: 'selected'; min: number }
  | { kind: 'speed'; atLeast?: GameSpeed; exactly?: GameSpeed }
  | { kind: 'sheltered'; min: number }
  /** Phase reached or passed. */
  | { kind: 'phase'; phase: 'farm' | 'outbreak' | 'defense' | 'ended' }
  | { kind: 'panel'; panel: 'economy' | 'population' | 'decrees' }
  | { kind: 'structureCount'; structure: string; min: number }
  | { kind: 'all'; of: readonly Condition[] };

/** Where the hint points: a UI element by data-tutorial-id or a map area (fractions of the world size). */
export type Marker = { ui: string } | { area: { x: number; y: number; r: number } } | { none: true };

/** Actions executed once when a step starts. */
export type StartAction =
  | { kind: 'speed'; value: GameSpeed }
  | { kind: 'outbreak' }
  | { kind: 'spawn'; x: number; y: number; count: number; zombie: boolean }
  | { kind: 'focus'; x: number; y: number; zoom: number };

export interface TutorialStep {
  id: string;
  /** i18n key, at most two sentences (GDD 15). */
  text: MessageKey;
  marker: Marker;
  done: Condition;
  start?: readonly StartAction[];
}

export interface Lesson {
  id: string;
  /** i18n keys for title and goal. */
  title: MessageKey;
  goal: MessageKey;
  /** Lessons 1 and 2 cannot be lost: a defeat restarts the lesson instead (GDD 15). */
  unlosable: boolean;
  scenario: ScenarioDef;
  steps: readonly TutorialStep[];
}
