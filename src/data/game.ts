// Game frame data: settings limits and presets, key bindings, autosave, audio mix (GDD 13, 4, 5).
import type { GameSpeed } from '../core/commands';

/** Default game speeds offered in settings (GDD 13: 0.5x to 4x). */
export const DEFAULT_SPEEDS: readonly GameSpeed[] = [0.5, 1, 2, 4];
export const AUTOSAVE_OPTIONS = [0, 2, 5, 10] as const;
export const FPS_LIMITS = [30, 60, 120, 0] as const;
export const RENDER_SCALE = { min: 50, max: 100, step: 5 } as const;

/** Day length range (GDD 13), prepared for the day/night system (M7); not yet an option. */
export const DAY_LENGTH_MIN = { min: 8, max: 32, default: 16 } as const;

export const GRAPHICS_PRESETS = ['low', 'medium', 'high', 'custom'] as const;
export type GraphicsPreset = (typeof GRAPHICS_PRESETS)[number];

/** Values a graphics preset sets (the rest of the graphics options stay as they are). */
export const GRAPHICS_PRESET_VALUES = {
  low: { particles: 'low', buildings3d: false, spriteLimit: 8000, corpseLimit: 1000, renderScale: 75 },
  medium: { particles: 'medium', buildings3d: true, spriteLimit: 15000, corpseLimit: 3000, renderScale: 100 },
  high: { particles: 'high', buildings3d: true, spriteLimit: 25000, corpseLimit: 8000, renderScale: 100 },
} as const;

/** Estimated performance cost per option (GDD 13: low, medium, high). */
export const COST_LEVEL = {
  particles: 'high',
  buildings3d: 'medium',
  spriteLimit: 'high',
  corpseLimit: 'medium',
  renderScale: 'high',
  fpsLimit: 'low',
} as const;

export const SAVE_SLOT_PREFIX = 'manual-';
export const MAX_SAVE_LABEL = 48;
/** Poll interval for the autosave timer and the phase watcher (ms). */
export const AUTOSAVE_POLL_MS = 1000;

/** Bindable actions with default key codes (KeyboardEvent.code). Camera pan keys come as pairs. */
export const KEY_ACTIONS = [
  'pause',
  'speedUp',
  'speedDown',
  'tabDefense',
  'stance',
  'fireMode',
  'demolish',
  'home',
  'overlay',
  'toolCorridor',
  'toolSafeZone',
  'toolRally',
  'population',
  'panUp',
  'panDown',
  'panLeft',
  'panRight',
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  pause: 'Space',
  speedUp: 'Equal',
  speedDown: 'Minus',
  tabDefense: 'KeyB',
  stance: 'KeyH',
  fireMode: 'KeyF',
  demolish: 'KeyX',
  home: 'Home',
  overlay: 'KeyO',
  toolCorridor: 'KeyK',
  toolSafeZone: 'KeyZ',
  toolRally: 'KeyV',
  population: 'KeyP',
  panUp: 'KeyW',
  panDown: 'KeyS',
  panLeft: 'KeyA',
  panRight: 'KeyD',
};

/** Always-available alternatives that are not rebindable (arrows pan, numpad speed keys). */
export const FIXED_PAN_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
export const FIXED_SPEED_KEYS = { up: ['NumpadAdd'], down: ['NumpadSubtract'] } as const;

/** Keys that cannot be bound (reserved by the game or the browser). */
export const RESERVED_KEYS: readonly string[] = ['Escape', 'F5', 'F11', 'F12', 'F10', 'Tab'];

/** Mixer defaults in percent and sound tuning (GDD 5 Audio). */
export const AUDIO = {
  defaults: { master: 70, effects: 80, ambient: 60, ui: 70, horde: 70 },
  /** Zombies visible on screen at which the horde carpet reaches full level. */
  hordeFullCount: 2000,
  hordeMinCount: 20,
  /** Distance (m) beyond which shots and explosions are silent, and the zoom-independent reference. */
  hearingRangeM: 500,
  maxSoundsPerSecond: 24,
  hordeUpdateMs: 250,
  ambientGustMs: [6000, 14000],
  ambientDistantShotMs: [9000, 25000],
} as const;

/** Debrief screen (GDD 10): time-lapse length, map size and chart sizes. */
export const DEBRIEF_UI = {
  /** Time-lapse plays the whole mission in this many seconds. */
  timelapseS: 45,
  mapPx: 512,
  chartW: 220,
  chartH: 64,
  /** Heatmap cells below this byte value stay transparent. */
  heatMin: 6,
  heatMaxAlpha: 0.85,
  /** Density bytes are scaled by this factor for the time-lapse, so thin crowds stay visible. */
  frameGain: 2,
} as const;
