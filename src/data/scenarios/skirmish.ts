// Quick skirmish (GDD 12): random city, 5 minutes of farm phase, 10 to 15 minutes in total.
import type { ScenarioDef } from '../../core/types/mission';

const SCENARIO_TEXT_KEY_SKIRMISH = 'skirmish';

import { parseScenario } from './schema';

const PATHOGENS = ['viral', 'bacterial', 'fungal', 'parasitic', 'chemical'] as const;
const SIZES = ['small', 'medium'] as const;
const FARM_S = 300;

/** Deterministic mini RNG for scenario setup only (never used by the simulation). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a skirmish for a seed: the seed also fixes the city, pathogen and size. */
export function makeSkirmish(seed: number): ScenarioDef {
  const r = mulberry(seed);
  return parseScenario('skirmish', {
    id: 'skirmish',
    textKey: SCENARIO_TEXT_KEY_SKIRMISH,
    seed,
    size: SIZES[Math.floor(r() * SIZES.length)],
    era: 'present',
    faction: 'army',
    pathogen: PATHOGENS[Math.floor(r() * PATHOGENS.length)],
    patientZeroSite: 'random',
    farmDurationS: FARM_S,
    classicStart: false,
    startResources: { budget: 4000, material: 300, fuel: 150, ammo: 1000, medicine: 80, food: 1000 },
    difficulty: 'normal',
    victory: { kinds: ['eradication', 'hold', 'evacuation'], all: false },
    holdUntilS: 600,
    medals: { bronze: 1500, silver: 3500, gold: 6000 },
  });
}

/** Random seed from the clock; only for choosing a new skirmish, never inside the sim. */
export const newSkirmishSeed = (): number => Math.floor(Math.random() * 0x7fffffff);
