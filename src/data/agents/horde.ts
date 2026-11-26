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
  /** From standstill the noise draw times this (angle units, 4096 per turn) picks a new heading. */
  idleHeadingScale: 25,
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
  /** Max civilians per 4 m map cell when placing residents and spawning. */
  maxPerCell: 6,
  /** Retry delay in seconds when the chosen destination field is not computed yet. */
  retryS: 2,
} as const;

/** Destinations of the daily routine: districts per category and shared destination fields (GDD 7). */
export const CIVILIAN_ROUTINE = {
  homeDistricts: ['oldtown', 'residential', 'highrise', 'suburb'],
  workDistricts: ['industrial', 'commercial', 'university', 'hospital'],
  marketDistricts: ['commercial'],
  /** The map is split into this many clusters per side; one shared flow field per category and cluster. */
  clustersPerSide: 4,
  /** Straight step cost when entering a cell, by terrain (diagonal = 1.5x). Low on roads, so streams follow them. */
  stepCost: { road: 2, bridge: 2, ground: 4, park: 4, forest: 5, rail: 5 },
  /** Work units (about one cell each) per tick for computing destination fields. */
  fieldCellsPerTick: 60_000,
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
  /** Goal hysteresis: a block becomes a goal at this multiple of the mean civilians per populated block... */
  goalEnterFrac: 1,
  /** ...and stops being one below this multiple, so commuting does not flip goals constantly. */
  goalLeaveFrac: 0.5,
  /** Goals with an unchanged block set are re-seeded from current civilian cells after this many ticks. */
  goalRefreshTicks: 1200,
  /** A changed goal set starts a new field at most this often (ticks); the horde follows the older one meanwhile. */
  goalMinIntervalTicks: 400,
} as const;

/** Engine scheduling constants (performance knobs, not balance). */
export const ENGINE = {
  /** Each zombie searches for a direct target every this many ticks, staggered by slot. */
  targetScanInterval: 10,
  /** Flow goals are re-evaluated every this many ticks while no field is being computed. */
  goalEvalInterval: 40,
  /** Moving civilians are re-bucketed for the zombie target search every this many ticks (staleness < 0.4 m). */
  civilianHashInterval: 5,
  /** Separation considers at most this many overlapping neighbors. */
  maxSeparationNeighbors: 8,
} as const;
