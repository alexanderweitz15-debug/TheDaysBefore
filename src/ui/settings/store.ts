// Versioned settings store. Each option is a signal; every write persists. Only options that have an effect live here.
import { type Signal, signal } from '@preact/signals';
import { z } from 'zod';
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save/versioned-storage';
import {
  AUDIO,
  AUTOSAVE_OPTIONS,
  DEFAULT_KEYS,
  DEFAULT_SPEEDS,
  FPS_LIMITS,
  GRAPHICS_PRESET_VALUES,
  GRAPHICS_PRESETS,
  RENDER_SCALE,
} from '../../data/game';
import { CORPSE_LIMIT } from '../../data/render';

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const VIOLENCE_LEVELS = ['off', 'low', 'normal'] as const;
export type Violence = (typeof VIOLENCE_LEVELS)[number];

export const UNIT_BAR_MODES = ['always', 'damaged', 'never'] as const;
export type UnitBarMode = (typeof UNIT_BAR_MODES)[number];

export const PARTICLE_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type ParticleLevel = (typeof PARTICLE_LEVELS)[number];

export const SETTING_LIMITS = {
  /** Max corpse decals drawn (GDD 5, Atmosphäre). */
  corpseLimit: { min: CORPSE_LIMIT.min, max: CORPSE_LIMIT.max, step: CORPSE_LIMIT.step },
  uiScale: { min: 75, max: 200, step: 5 },
  /** Percent of the base camera speed. */
  cameraSpeed: { min: 25, max: 300, step: 5 },
  /** Visible zombies above which the density texture replaces sprites (GDD 4, Rendering). */
  spriteLimit: { min: 5000, max: 30000, step: 1000 },
  renderScale: RENDER_SCALE,
  volume: { min: 0, max: 100, step: 5 },
} as const;

const schema = z.object({
  language: z.enum(LANGUAGES),
  uiScale: z.number().int().min(SETTING_LIMITS.uiScale.min).max(SETTING_LIMITS.uiScale.max),
  perfOverlay: z.boolean(),
  edgeScroll: z.boolean(),
  cameraSpeed: z.number().int().min(SETTING_LIMITS.cameraSpeed.min).max(SETTING_LIMITS.cameraSpeed.max),
  buildings3d: z.boolean(),
  spriteLimit: z.number().int().min(SETTING_LIMITS.spriteLimit.min).max(SETTING_LIMITS.spriteLimit.max),
  devTools: z.boolean(),
  corpseLimit: z.number().int().min(SETTING_LIMITS.corpseLimit.min).max(SETTING_LIMITS.corpseLimit.max),
  violence: z.enum(VIOLENCE_LEVELS),
  /** Pattern mode: shapes and line patterns instead of hue alone (GDD 5, 13). */
  patternMode: z.boolean(),
  reducedMotion: z.boolean(),
  /** Zone removal waits a few seconds and can be undone (GDD 13, confirmations). */
  confirmRemoval: z.boolean(),
  /** Health and ammo bars above own units (GDD 13, Lebensbalken). */
  unitBars: z.enum(UNIT_BAR_MODES),
  particles: z.enum(PARTICLE_LEVELS),
  /** Short screen shake on heavy explosions (GDD 5). */
  screenShake: z.boolean(),
  /** No bright flashes at explosions or muzzles (photosensitivity, GDD 13). */
  noFlashes: z.boolean(),
  /** Speed applied when a mission starts (GDD 13). */
  gameSpeed: z.number().refine((v) => DEFAULT_SPEEDS.includes(v as never)),
  /** Pause automatically when the outbreak starts or the defense phase begins. */
  autopause: z.boolean(),
  /** Autosave interval in minutes, 0 = off (GDD 4). */
  autosaveMin: z.number().refine((v) => AUTOSAVE_OPTIONS.includes(v as never)),
  /** Ask before restart and leaving to the main menu (surrender always asks). */
  confirmLeave: z.boolean(),
  graphicsPreset: z.enum(GRAPHICS_PRESETS),
  /** Percent of the device resolution the map is rendered at. */
  renderScale: z.number().int().min(RENDER_SCALE.min).max(RENDER_SCALE.max),
  fpsLimit: z.number().refine((v) => FPS_LIMITS.includes(v as never)),
  volMaster: z.number().int().min(0).max(100),
  volEffects: z.number().int().min(0).max(100),
  volAmbient: z.number().int().min(0).max(100),
  volUi: z.number().int().min(0).max(100),
  volHorde: z.number().int().min(0).max(100),
  monoAudio: z.boolean(),
  muteInBackground: z.boolean(),
  /** Key bindings: action -> KeyboardEvent.code; missing actions use the defaults. */
  keys: z.record(z.string(), z.string()),
});

export type Settings = z.infer<typeof schema>;

export const SETTING_DEFAULTS: Settings = {
  language: 'de',
  uiScale: 100,
  perfOverlay: false,
  edgeScroll: true,
  cameraSpeed: 100,
  buildings3d: true,
  spriteLimit: 20000,
  devTools: false,
  corpseLimit: CORPSE_LIMIT.default,
  violence: 'normal',
  patternMode: false,
  reducedMotion: false,
  confirmRemoval: true,
  unitBars: 'damaged',
  particles: 'medium',
  screenShake: true,
  noFlashes: false,
  gameSpeed: 1,
  autopause: true,
  autosaveMin: 5,
  confirmLeave: true,
  graphicsPreset: 'medium',
  renderScale: 100,
  fpsLimit: 0,
  volMaster: AUDIO.defaults.master,
  volEffects: AUDIO.defaults.effects,
  volAmbient: AUDIO.defaults.ambient,
  volUi: AUDIO.defaults.ui,
  volHorde: AUDIO.defaults.horde,
  monoAudio: false,
  muteInBackground: true,
  keys: {},
};

const spec: VersionedSpec<Settings> = {
  key: 'sperrzone.settings',
  version: 1,
  schema,
  defaults: SETTING_DEFAULTS,
};

type SettingSignals = { [K in keyof Settings]: Signal<Settings[K]> };

const initial = loadVersioned(spec);
const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];

export const settings = Object.fromEntries(KEYS.map((k) => [k, signal(initial[k])])) as SettingSignals;

function current(): Settings {
  return Object.fromEntries(KEYS.map((k) => [k, settings[k].peek()])) as Settings;
}

const PRESET_KEYS = ['particles', 'buildings3d', 'spriteLimit', 'corpseLimit', 'renderScale'] as const;

function put<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key].value = value;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  put(key, value);
  // Changing a preset-controlled option by hand switches to "custom".
  if ((PRESET_KEYS as readonly string[]).includes(key)) put('graphicsPreset', 'custom');
  saveVersioned(spec, current());
}

export function applyGraphicsPreset(preset: Settings['graphicsPreset']): void {
  put('graphicsPreset', preset);
  if (preset !== 'custom') {
    const v = GRAPHICS_PRESET_VALUES[preset];
    for (const k of PRESET_KEYS) put(k, v[k] as never);
  }
  saveVersioned(spec, current());
}

/** Key code bound to an action. */
export function keyOf(action: keyof typeof DEFAULT_KEYS): string {
  return settings.keys.value[action] ?? DEFAULT_KEYS[action];
}

/** Resets all settings, or only the given groups of keys. */
export function resetSettings(only?: readonly (keyof Settings)[]): void {
  for (const k of only ?? KEYS) put(k, SETTING_DEFAULTS[k] as never);
  saveVersioned(spec, current());
}
