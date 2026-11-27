// Render tuning values (display only, never read by the simulation).

/** Below this zoom the view is "strategic": zombies are drawn as a density texture. */
export const ZOOM_STRATEGIC = 0.25;
/** Hysteresis so the density switch does not flicker around the threshold. */
export const ZOOM_STRATEGIC_HYSTERESIS = 1.15;
/** Edge length of one density-texture cell in meters. */
export const DENSITY_CELL_M = 8;
/** Zombies per density cell that reach full opacity. */
export const DENSITY_FULL_COUNT = 6;
/** Static map tile: edge in meters and baked pixels per meter. */
export const MAP_TILE_M = 256;
export const MAP_PX_PER_M = 2;
/** Max milliseconds per frame spent baking map tiles. */
export const MAP_BAKE_BUDGET_MS = 6;
/** Roof offset per floor in meters, and its cap. */
export const ROOF_OFFSET_PER_FLOOR_M = 1.2;
export const ROOF_OFFSET_MAX_M = 24;

/** Density texture opacity: a cell with any zombie gets the minimum, a full cell the maximum. */
export const DENSITY_ALPHA_MIN = 0.15;
export const DENSITY_ALPHA_MAX = 0.85;
/** Debug overlay "density": field value that reaches the maximum opacity, and that opacity. */
export const OVERLAY_DENSITY_FULL = 8;
export const OVERLAY_DENSITY_ALPHA_MAX = 0.85;
/** Agent sprite texture edge in px, initial pool sizes, world radius in meters. */
export const AGENT_TEX_SIZE = 16;
export const CIVILIAN_CAPACITY = 30_000;
export const ZOMBIE_RADIUS_M = 0.6;
export const CIVILIAN_RADIUS_M = 0.5;
/** On-screen sprite radius limits in px. */
export const AGENT_MIN_RADIUS_PX = 1.5;
export const AGENT_MAX_RADIUS_PX = 4;
/** Share of the sprite limit below which density mode switches back to sprites (hysteresis). */
export const SPRITE_LIMIT_HYSTERESIS = 0.95;
/** An agent that moves farther than this between two snapshots is a reused slot: set, do not interpolate. */
export const AGENT_MAX_STEP_M = 10;

// --- M2: zombie types, civilians, corpses, zones ---

export type ZombieShape = 'diamond' | 'ellipse' | 'notched' | 'rimmed' | 'star';
/** Look per zombie type, keyed like ZOMBIE_TYPES. Civilians are round dots, so no zombie shape is round. */
export const ZOMBIE_LOOK: Record<
  'walker' | 'sprinter' | 'screamer' | 'colossus' | 'patientZero',
  { shape: ZombieShape; radiusM: number; capacity: number }
> = {
  walker: { shape: 'diamond', radiusM: 0.6, capacity: 60_000 },
  sprinter: { shape: 'ellipse', radiusM: 0.6, capacity: 10_000 },
  screamer: { shape: 'notched', radiusM: 0.7, capacity: 5_000 },
  colossus: { shape: 'rimmed', radiusM: 1.4, capacity: 2_000 },
  patientZero: { shape: 'star', radiusM: 1.1, capacity: 64 },
};
/** Larger minimum on-screen radius for highlighted sprites (patient zero), px. */
export const HIGHLIGHT_MIN_RADIUS_PX = 5;
/** Panic flicker: full cycle in ms and the dim opacity of the off phase. */
export const PANIC_FLICKER_MS = 360;
export const PANIC_FLICKER_DIM = 0.45;
export const PANIC_CAPACITY = 10_000;

/** Corpse decals. */
export const CORPSE_RADIUS_M = 0.55;
export const CORPSE_CAPACITY = 5_000;
export const CORPSE_DARKEN = 0.5;
export const CORPSE_ALPHA_LOW = 0.55;
export const BLOOD_RADIUS_M = 1.1;
export const BLOOD_ALPHA = 0.6;

/** Zone drawing. Widths in screen px, dash and arrow spacing in screen px, label size in screen px. */
export const ZONE_FILL_ALPHA = 0.14;
export const ZONE_GLOW_ALPHA = 0.22;
export const ZONE_LINE_PX = 2;
export const ZONE_GLOW_PX = 7;
export const CORRIDOR_DASH_PX = 12;
export const CORRIDOR_GAP_PX = 8;
export const CORRIDOR_ARROW_SPACING_PX = 56;
export const CORRIDOR_ARROW_PX = 8;
export const ZONE_DOUBLE_LINE_GAP_PX = 4;
export const RALLY_RADIUS_M = 6;
export const ZONE_LABEL_PX = 12;
export const ZONE_PREVIEW_ALPHA = 0.7;
/** Seconds-scale window (ms) in which a zone removal can still be undone. */
export const ZONE_REMOVE_UNDO_MS = 4000;
/** How long a tool notice (for example the corridor point limit) stays visible, ms. */
export const TOOL_NOTICE_MS = 3000;
/** Pointer tolerance for picking a zone to remove, px. */
export const ZONE_PICK_TOLERANCE_PX = 10;
export const MIN_ZONE_SIZE_M = 8;

/** Debug fields (infection, noise, safety) arrive as 0..255; this value reaches the maximum opacity. */
export const OVERLAY_FIELD_FULL = 255;

/** Selectable limits and defaults for corpse decals and violence (settings). */
export const CORPSE_LIMIT = { min: 0, max: 20_000, step: 500, default: 5_000 } as const;

/** Agents farther than this outside the camera rectangle get no sprite (meters). */
export const AGENT_CULL_MARGIN_M = 20;

/** Initial camera fit: screen px kept free for the top bar and the command bar, and the share of the area used. */
export const FIT_INSET_TOP_PX = 90;
export const FIT_INSET_BOTTOM_PX = 130;
export const FIT_MARGIN = 0.95;
