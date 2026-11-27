// Render tuning for units, structures, projectiles, effects and previews (M3 B2). Display only, never read by the simulation.
import type { StructureKind, UnitTypeId } from '../core/commands';
import type { FxType } from '../core/types/combat';

/** Zoom at which units switch from tactical symbols to top-down silhouettes. Below ZOOM_STRATEGIC (render.ts) symbols shrink. */
export const ZOOM_CLOSE = 4;
/** Tactical symbol edge in screen px at full strength, in tactical and strategic zoom. */
export const UNIT_SYMBOL_PX = 16;
export const UNIT_SYMBOL_PX_STRATEGIC = 10;
/** Symbol size factor range by squad strength (members / squad size). */
export const UNIT_SYMBOL_MIN_SCALE = 0.75;
/** Units farther than this outside the camera rectangle are not drawn (meters). */
export const UNIT_CULL_MARGIN_M = 30;
/** A unit that moves farther than this between two snapshots is a reused slot: no interpolation. */
export const UNIT_MAX_STEP_M = 25;

/** Silhouette geometry in meters: head radius, shoulder half-width and half-depth, spacing between soldiers. */
export const SOLDIER = { headR: 0.4, shoulderW: 0.65, shoulderD: 0.35, spacing: 2.4 } as const;
/** Per-type extras of the close view: weapon length m, optional gear. */
export const UNIT_GEAR: Record<
  UnitTypeId,
  { weaponM: number; weaponW: number; gear: 'none' | 'tripod' | 'tube' | 'pack' | 'shield' | 'bag' | 'scope' }
> = {
  infantry: { weaponM: 0.7, weaponW: 0.05, gear: 'none' },
  mgTeam: { weaponM: 0.9, weaponW: 0.09, gear: 'tripod' },
  sniperTeam: { weaponM: 1.2, weaponW: 0.04, gear: 'scope' },
  mortar: { weaponM: 0.9, weaponW: 0.14, gear: 'tube' },
  engineers: { weaponM: 0.5, weaponW: 0.05, gear: 'pack' },
  riotPolice: { weaponM: 0.4, weaponW: 0.05, gear: 'shield' },
  medics: { weaponM: 0.3, weaponW: 0.04, gear: 'bag' },
};

/** Status bars above units: size in screen px, thresholds from GDD 14 (yellow at 25 %, red and pulsing at 10 %). */
export const BAR_WIDTH_PX = 18;
export const BAR_HEIGHT_PX = 2.5;
export const BAR_GAP_PX = 1;
export const BAR_OFFSET_PX = 4;
export const BAR_WARN = 0.25;
export const BAR_CRITICAL = 0.1;
export const BAR_PULSE_MS = 600;

/** Structure drawing. Minimum drawn thickness in screen px and unit scale. */
export const STRUCTURE_MIN_PX = 3;
export const STRUCTURE_OUTLINE_PX = 1.5;
export const STRUCTURE_FILL_ALPHA = 0.9;
export const STRUCTURE_BUILDING_ALPHA = 0.35;
export const STRUCTURE_RUBBLE_ALPHA = 0.8;
/** Rubble chunk spacing in meters along a destroyed line and chunks per point structure. */
export const RUBBLE_SPACING_M = 2.2;
export const RUBBLE_POINT_CHUNKS = 7;
/** HP share below which damage cracks are drawn. */
export const DAMAGE_SHOW_BELOW = 0.95;
/** Radius ring shown around a selected depot is read from STRUCTURE_RULES; ring alpha here. */
export const RADIUS_RING_ALPHA = 0.5;
export const RADIUS_FILL_ALPHA = 0.06;
/** Gate leaf gap when open, share of the gate width. */
export const GATE_OPEN_GAP = 0.45;
/** Mines inside a minefield footprint: dots drawn. */
export const MINE_DOTS = 9;

/** Projectile kinds by snapshot kind byte. */
export const PROJECTILE_BULLET = 0;
export const TRACER_LENGTH_M = 3;
export const TRACER_MIN_PX = 5;
export const SHELL_RADIUS_PX = 3;

/** Particle system. Capacity per pool; the setting scales spawn counts. */
export const PARTICLE_CAPACITY = 3000;
export const PARTICLE_SCALE = { off: 0, low: 0.3, medium: 0.65, high: 1 } as const;
/** Reduced motion multiplies the particle amount by this. */
export const PARTICLE_REDUCED_FACTOR = 0.5;
export const PARTICLE_TEX_PX = 16;
/** Pool of rings (shock waves, muzzle flashes, flashes). */
export const SPRITE_FX_CAPACITY = 400;

/** Effect parameters. Counts are at particle level "high"; lifetimes in ms. */
export const FX = {
  shot: { flashM: 1.6, flashMs: 70, sparks: 1, tracerLifeMs: 60 },
  impact: { sparks: 5, sparkSpeedMps: 7, sparkMs: 300, puffs: 1, puffMs: 500 },
  wallHit: { debris: 8, debrisSpeedMps: 6, debrisMs: 600, dust: 3, dustMs: 700 },
  explosion: {
    ringMs: 550,
    ringEndFactor: 1.15,
    fireballMs: 260,
    flashMs: 90,
    fire: 36,
    smoke: 24,
    debris: 22,
    fireSpeedMps: 12,
    smokeMs: 1800,
    debrisMs: 900,
    craterMs: 20_000,
    craterAlpha: 0.55,
  },
  mineBlast: { radiusFactor: 0.6, scale: 0.7 },
  death: { puffs: 3, puffMs: 450 },
} as const satisfies Record<FxType, object>;
/** Default blast radius in meters when an explosion event carries no parameter. */
export const EXPLOSION_DEFAULT_RADIUS_M = 8;
/** Max craters kept as decals. */
export const CRATER_CAPACITY = 64;

/** Screen shake on heavy explosions: radius that counts as heavy, amplitude in px per radius meter (capped), duration ms. */
export const SHAKE_MIN_RADIUS_M = 10;
export const SHAKE_PX_PER_M = 0.35;
export const SHAKE_MAX_PX = 8;
export const SHAKE_MS = 320;
export const SHAKE_MAX_DISTANCE_PX = 1400;

/** Build preview. Alpha values and the cost label offset in screen px. */
export const PREVIEW_FILL_ALPHA = 0.28;
export const PREVIEW_LINE_ALPHA = 0.85;
export const PREVIEW_LABEL_PX = 12;
export const PREVIEW_LABEL_OFFSET_PX = 18;
/** Sample spacing for terrain checks along a line, meters. */
export const PREVIEW_SAMPLE_M = 2;
/** Unit placement footprint radius in meters. */
export const UNIT_PLACE_RADIUS_M = 1.5;

/** Attack-area targeting. */
export const ATTACK_KEY = 'KeyG';
export const ATTACK_PREVIEW_FILL_ALPHA = 0.16;
export const ATTACK_ESTIMATE_MS = 150;
export const ATTACK_CROSS_PX = 10;

/** Symbol per structure kind: which family draws it. */
export const STRUCTURE_FAMILY: Record<
  StructureKind,
  'wall' | 'barricade' | 'wire' | 'gate' | 'mines' | 'charge' | 'tower' | 'depot'
> = {
  wall: 'wall',
  barricade: 'barricade',
  wire: 'wire',
  gate: 'gate',
  mines: 'mines',
  charge: 'charge',
  watchtower: 'tower',
  depot: 'depot',
};

/** Preview alphas (build and attack previews). */
export const PREVIEW_LINE_BOOST = 0.2;
export const PREVIEW_POINT_BOOST = 0.1;
export const PREVIEW_MINES_FACTOR = 0.6;
export const PREVIEW_RING_ALPHA = 0.4;
export const PREVIEW_RANGE_ALPHA = 0.35;
export const PREVIEW_MIN_RANGE_ALPHA = 0.2;
export const PREVIEW_AIM_ALPHA = 0.5;
export const PREVIEW_AIM_DIM_ALPHA = 0.2;
export const PREVIEW_LABEL_BG_ALPHA = 0.85;
export const ATTACK_RING_ALPHA = 0.9;
