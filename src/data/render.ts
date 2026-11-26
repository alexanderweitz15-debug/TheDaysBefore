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
export const ZOMBIE_CAPACITY = 60_000;
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
