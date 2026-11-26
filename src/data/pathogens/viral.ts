// Viral pathogen family (GDD 8, Erregerfamilien). Starting values for balancing.

export interface PathogenSpec {
  /** Infection chance per successful attack on a human. */
  infectChance: number;
  /** Incubation range in seconds. */
  incubationMinS: number;
  incubationMaxS: number;
  /** Chance that a corpse rises, and delay in seconds. */
  corpseRiseChance: number;
  corpseRiseDelayS: number;
  /** Transformation table: weights per zombie type id (ZOMBIE_TYPES order, patientZero excluded). */
  turnWeights: Record<'walker' | 'sprinter' | 'screamer' | 'colossus', number>;
  /** Special-type share multiplier reached after maturityFullS seconds of outbreak (GDD 8: up to 2x after 20 min). */
  maturityMaxFactor: number;
  maturityFullS: number;
}

export const VIRAL: PathogenSpec = {
  infectChance: 0.6,
  incubationMinS: 10,
  incubationMaxS: 30,
  corpseRiseChance: 0.3,
  corpseRiseDelayS: 60,
  turnWeights: { walker: 0.75, sprinter: 0.18, screamer: 0.05, colossus: 0.02 },
  maturityMaxFactor: 2,
  maturityFullS: 1200,
};

export const PATIENT_ZERO = {
  hpFactor: 2,
  /** Patient zero hunts actively (faster than a walking human), so the first infection chain starts reliably. */
  speedMps: 1.8,
  auraRadiusM: 30,
  auraSpeedBonus: 0.15,
  /** Killed within this many seconds -> spread slows (GDD 8). */
  earlyKillWindowS: 120,
  slowdownDurationS: 300,
  /** Infection chance multiplier while slowed. */
  slowdownInfectFactor: 0.5,
} as const;

/** Infection density field (GDD 7 Infektion): increments per event, 0..255 per map cell. */
export const INFECTION_FIELD = {
  bite: 64,
  turn: 128,
  /** Once per second every cell with zombies is raised to at least base + perZombie x count. */
  base: 32,
  perZombie: 24,
} as const;
