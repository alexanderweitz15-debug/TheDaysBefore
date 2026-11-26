// Movement values for zombies and civilians in M1 (GDD 4, 7, 8). Starting values for balancing.

export const AGENT_CAPACITY = {
  zombies: 60_000,
  civilians: 30_000,
} as const;

export const ZOMBIE_MOVEMENT = {
  /** Walker speed in m/s (type 1, GDD 8). */
  walkerSpeedMps: 0.9,
  /** Sight range for a direct target (GDD 8 rule 1). */
  sightRangeM: 25,
  /** Agent radius used for separation. */
  radiusM: 0.35,
  /** Strength of the separation push relative to speed. */
  separationWeight: 1.2,
  /** Max zombies per 4 m map cell (density cap, GDD 8 rule 4). */
  maxPerCell: 12,
  /** Random heading noise per tick in radians, keeps the mass organic. */
  headingNoiseRad: 0.15,
} as const;

export const CIVILIAN_MOVEMENT = {
  walkSpeedMps: 1.4,
  runSpeedMps: 5,
  radiusM: 0.3,
  /** Pause at a destination in seconds before choosing the next one. */
  dwellMinS: 20,
  dwellMaxS: 120,
  /** Daily routine destination weights (GDD 7 Zivilisten Alltag). */
  routine: { home: 0.45, work: 0.35, market: 0.2 },
} as const;

export const SPATIAL_HASH = {
  /** Cell edge in meters (GDD 4). */
  cellM: 8,
} as const;

export const FLOW_FIELD = {
  /** Coarse block edge in map cells (GDD 4). */
  blockCells: 32,
  /** Time budget per tick for incremental flow field updates, in ms of a 20 ms tick. Enforced by work units, not wall time. */
  maxCellsPerTick: 40_000,
} as const;
