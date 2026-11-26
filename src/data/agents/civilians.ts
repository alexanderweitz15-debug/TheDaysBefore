// Civilian alert, panic and flight (GDD 7 Zivilisten). Starting values for balancing.

export const CIVILIAN_ALERT = {
  /** Sees a zombie within this range -> alerted. */
  sightRangeM: 25,
  /** Hears noise above this level -> alerted. */
  noiseThreshold: 20,
  /** City-wide alarm after outbreak start: all routine civilians become alerted after this delay. */
  cityAlarmDelayS: 30,
  /** Each civilian looks and listens every this many ticks, staggered by slot. */
  scanIntervalTicks: 10,
  /** Fleeing civilians calm down to alerted after this long without a zombie in sight. */
  calmDownS: 15,
  /** The alarm reaches each civilian at a random time within this many seconds after cityAlarmDelayS. */
  alarmSpreadS: 180,
  /** Share of civilians that heed the alarm (go home or to a known zone); the rest keep their routine. */
  alarmHeedShare: 0.7,
} as const;

/** Running costs stamina (GDD 8: human walking 1.4 m/s, running 5 m/s). */
export const CIVILIAN_STAMINA = {
  /** Seconds of running when rested; afterwards only walking speed. */
  runS: 15,
  /** Running seconds regained per second when not running. */
  recoverPerS: 0.25,
} as const;

/** Home is no safe place (GDD 7): zombies at the door of hiding civilians break in. */
export const HOME_BREAK_IN = {
  /** Chance per attack that the door gives way; then the hider is trapped and hit. */
  chancePerAttack: 0.5,
  /** Noise of a zombie hammering at a door. */
  doorNoise: 12,
  doorNoiseRadiusM: 32,
} as const;

export const CIVILIAN_PANIC = {
  /** Panic 0..1 grows per second with nearby zombies (count within sight) and noise. */
  perZombiePerS: 0.04,
  perNoisePerS: 0.002,
  /** Decay per second when no threat is near. */
  decayPerS: 0.05,
  /** Above this panic value the civilian is in panic (runs headless, partly ignores corridors). */
  panicThreshold: 0.6,
  /** Probability per decision that a panicking civilian ignores the safety field. */
  ignoreGuidanceChance: 0.4,
  /** Headless run: random heading change per tick in radians. */
  headlessJitterRad: 0.6,
  /** Panicking civilians calm down to fleeing below this value (hysteresis). */
  panicExitThreshold: 0.4,
} as const;

/** Movement of alarmed civilians: alerted walk (home or towards guidance), fleeing and panicking run. */
export const CIVILIAN_FLIGHT = {
  alertedSpeedMps: 1.4,
  fleeSpeedMps: 5,
  panicSpeedMps: 5,
} as const;

export const SAFETY_FIELD = {
  /** Cost multiplier for cells near zombies (repulsion), radius in meters. */
  zombieRepelRadiusM: 30,
  zombieRepelCost: 8,
  /** Corridor cells cost this fraction of normal cells (preferred escape route). */
  corridorCostFactor: 0.25,
  /** Corridor width in meters. */
  corridorWidthM: 12,
  /** Recompute cadence in ticks (spread over ticks with the flow-field budget). */
  recomputeEveryTicks: 100,
  /** At that cadence the field restarts only if this many coarse cells changed their zombie repulsion. */
  repelChangeCells: 12,
  /** Map cells per tick for rebuilding the cost array before a job (spreads the full-map pass). */
  costCellsPerTick: 80_000,
  /** Civilians follow the safety field only where they know the way: near an open zone or near a corridor. */
  zoneGuidanceRangeM: 150,
  corridorGuidanceRangeM: 100,
  /** Work units per tick for the safety field (same budget logic as the zombie flow field). */
  cellsPerTick: 40_000,
} as const;

export const ZONES = {
  /** Safe zone capacity per m² of building footprint inside (GDD 7: capacity). */
  safeZoneCapacityPerM2: 0.5,
  safeZoneMinCapacity: 50,
  rallyPointCapacity: 300,
  rallyPointRadiusM: 15,
  /** Cap on simultaneous zones. */
  maxZones: 32,
  /** Max polyline points kept per corridor. */
  maxCorridorPoints: 64,
  /** Occupant changes are published to zones() at most this often (ticks). */
  occupantsPublishTicks: 20,
} as const;

export const CORPSES = {
  /** Corpse pool size; when full, no new corpse is left (the body is lost). */
  capacity: 20_000,
} as const;
