// Versioned settings store. Each option is a signal; every write persists. Only options that have an effect live here.
import { type Signal, signal } from '@preact/signals';
import { z } from 'zod';
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save/versioned-storage';

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const SETTING_LIMITS = {
  uiScale: { min: 75, max: 200, step: 5 },
  /** Percent of the base camera speed. */
  cameraSpeed: { min: 25, max: 300, step: 5 },
  /** Visible zombies above which the density texture replaces sprites (GDD 4, Rendering). */
  spriteLimit: { min: 5000, max: 30000, step: 1000 },
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
});

export type Settings = z.infer<typeof schema>;

export const SETTING_DEFAULTS: Settings = {
  language: 'de',
  uiScale: 100,
  perfOverlay: true,
  edgeScroll: true,
  cameraSpeed: 100,
  buildings3d: true,
  spriteLimit: 20000,
  devTools: false,
};

const spec: VersionedSpec<Settings> = {
  key: 'sperrzone.settings',
  version: 1,
  schema,
  defaults: SETTING_DEFAULTS,
};

type SettingSignals = { [K in keyof Settings]: Signal<Settings[K]> };

const initial = loadVersioned(spec);

export const settings: SettingSignals = {
  language: signal(initial.language),
  uiScale: signal(initial.uiScale),
  perfOverlay: signal(initial.perfOverlay),
  edgeScroll: signal(initial.edgeScroll),
  cameraSpeed: signal(initial.cameraSpeed),
  buildings3d: signal(initial.buildings3d),
  spriteLimit: signal(initial.spriteLimit),
  devTools: signal(initial.devTools),
};

function current(): Settings {
  return {
    language: settings.language.peek(),
    uiScale: settings.uiScale.peek(),
    perfOverlay: settings.perfOverlay.peek(),
    edgeScroll: settings.edgeScroll.peek(),
    cameraSpeed: settings.cameraSpeed.peek(),
    buildings3d: settings.buildings3d.peek(),
    spriteLimit: settings.spriteLimit.peek(),
    devTools: settings.devTools.peek(),
  };
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key].value = value;
  saveVersioned(spec, current());
}

export function resetSettings(): void {
  settings.language.value = SETTING_DEFAULTS.language;
  settings.uiScale.value = SETTING_DEFAULTS.uiScale;
  settings.perfOverlay.value = SETTING_DEFAULTS.perfOverlay;
  settings.edgeScroll.value = SETTING_DEFAULTS.edgeScroll;
  settings.cameraSpeed.value = SETTING_DEFAULTS.cameraSpeed;
  settings.buildings3d.value = SETTING_DEFAULTS.buildings3d;
  settings.spriteLimit.value = SETTING_DEFAULTS.spriteLimit;
  settings.devTools.value = SETTING_DEFAULTS.devTools;
  saveVersioned(spec, current());
}
