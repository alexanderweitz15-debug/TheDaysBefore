// Scoring, victory and defeat thresholds, debrief sampling (GDD 10). Starting values.

export const SCORE_POINTS = {
  civilianSaved: 10,
  soldierSurvived: 3,
  zombieKilled: 0.2,
  /** Fast victory bonus, linear falloff over fastVictoryWindowS (GDD 10: up to +2,000 over 40 min). */
  fastVictoryMax: 2000,
  fastVictoryWindowS: 2400,
  civilianKilledByOwnWeapons: -30,
  infectedEvacuated: -50,
  sectorAbandoned: -500,
} as const;

export const DIFFICULTY_MULTIPLIER = { easy: 0.5, normal: 1, hard: 1.5, nightmare: 2.5 } as const;

export const VICTORY = {
  /** Default evacuation share (GDD 10: 60 %). Evacuation itself arrives in M8; until then shelter counts. */
  evacuationShare: 0.6,
  /** Containment: infection below this share of city area for containmentHoldS (GDD 10: 1 %, 3 min). */
  containmentAreaShare: 0.01,
  containmentHoldS: 180,
  /** Hold without holdUntilS in the scenario; hold and fast-victory time count from the outbreak. */
  holdDefaultS: 1800,
  /** The core (inner ring) counts as held while fewer zombies are inside. */
  holdCoreMaxZombies: 40,
  /** Victory and defeat are checked every this many ticks (GDD 4 step 15). */
  evaluateEveryTicks: 20,
} as const;

export const DEFEAT = {
  /** Population below this share without evacuation -> defeat (GDD 10). */
  populationShare: 0.1,
  /** The HQ falls when its building stays overrun (ECONOMY_RULES.overrunZombies) this long. */
  hqOverrunS: 20,
} as const;

export const DEBRIEF = {
  historySampleTicks: 200,
  gridCellM: 32,
  timelapseFrameTicks: 200,
  /** Upper bound for time-lapse frames (memory). */
  maxFrames: 900,
  maxMoments: 32,
  /** History samples kept; when full, every second sample is dropped and the interval doubles. */
  maxSamples: 900,
} as const;

/** Defeat cause analysis (GDD 15 "Warum habe ich verloren?"): thresholds and ranking weights. */
export const CAUSES = {
  maxCauses: 3,
  /** Infections inside shelters: share of all infections and minimum count. */
  shelterInfectionShare: 0.2,
  shelterInfectionMin: 20,
  /** Fewer squads than this when the outbreak starts. */
  fewSquads: 2,
  collateralKillsMin: 10,
  /** Wall lost: zombies, colossi and anti-armor squads are counted within these radii. */
  wallScanRadiusM: 30,
  antiArmorRadiusM: 150,
  /** Squads counted around the HQ when it falls. */
  hqSquadRadiusM: 100,
  weights: {
    hqOverrun: 100,
    noAntiArmor: 65,
    lateOutbreakResponse: 55,
    zoneBreached: 35,
    ammoOut: 45,
    wallLost: 40,
    populationLost: 90,
    timeLimit: 90,
    collateral: 30,
    lowMorale: 25,
  },
} as const;

export const AUTOSAVE = {
  /** Default interval in minutes (GDD 4: every 5 min + on phase change). */
  intervalMin: 5,
} as const;
