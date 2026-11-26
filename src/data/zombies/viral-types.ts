// Viral zombie types 1-4 (GDD 8, Die 18 Typen). Speed in m/s, HP relative to a 100 HP soldier.

export interface ZombieTypeSpec {
  speedMps: number;
  hp: number;
  /** Damage reduction 0..1 (used from M3 on). */
  armor: number;
  /** Attack: damage per hit and hits per second against humans. */
  attackDamage: number;
  attacksPerS: number;
  /** Weight of the noise field in movement (GDD 7 Lärm: screamers react strongly). */
  noiseWeight: number;
  /** Render radius in meters (GDD 5: shape and size per type). */
  radiusM: number;
}

export const ZOMBIE_TYPE_SPECS: Record<'walker' | 'sprinter' | 'screamer' | 'colossus', ZombieTypeSpec> = {
  walker: {
    speedMps: 0.9,
    hp: 100,
    armor: 0,
    attackDamage: 15,
    attacksPerS: 1,
    noiseWeight: 1,
    radiusM: 0.35,
  },
  sprinter: {
    speedMps: 4.5,
    hp: 60,
    armor: 0,
    attackDamage: 12,
    attacksPerS: 1.5,
    noiseWeight: 1,
    radiusM: 0.3,
  },
  screamer: {
    speedMps: 1.2,
    hp: 120,
    armor: 0,
    attackDamage: 10,
    attacksPerS: 1,
    noiseWeight: 2,
    radiusM: 0.4,
  },
  colossus: {
    speedMps: 1.2,
    hp: 1500,
    armor: 0.3,
    attackDamage: 60,
    attacksPerS: 0.5,
    noiseWeight: 0.5,
    radiusM: 1.2,
  },
};

export const SCREAMER = {
  /** Scream calls zombies in this radius and boosts their speed. */
  radiusM: 80,
  speedBonus: 0.2,
  durationS: 10,
  cooldownS: 20,
  /** Noise emitted by a scream (noise units, see NOISE). */
  noise: 80,
} as const;

/** Attack reach in meters from zombie center to human center. */
export const ATTACK_REACH_M = 1.0;
/** Human hit points (civilians); infected on a hit with infectChance, killed at 0 HP. */
export const CIVILIAN_HP = 60;
