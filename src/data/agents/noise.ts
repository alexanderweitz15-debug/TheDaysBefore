// Noise field (GDD 7 Lärm). Grid of noise level per coarse cell with decay.

export const NOISE = {
  /** Coarse cell edge in meters. */
  cellM: 16,
  /** Fraction kept per second (exponential decay). */
  keepPerS: 0.7,
  /** Below this level noise is ignored. */
  minLevel: 1,
  /** Zombies are attracted to noise above this level within hearing range. */
  hearingRangeM: 200,
  /** Weight of the noise gradient vs. flow field for walkers (noiseWeight 1). */
  attraction: 0.6,
  /** Noise of an attack on a human (screams of the victim) and its radius. */
  attackNoise: 30,
  attackRadiusM: 48,
} as const;
