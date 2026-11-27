// Shared fixtures for the economy and mission tests (imported only by *.test.ts).
import type { Command, CommandInput } from '../../core/commands';
import { DISTRICTS, type District } from '../../core/types/map';
import type { ScenarioDef } from '../../core/types/mission';
import { ECONOMY_RULES } from '../../data/economy/economy';
import { CityWorld } from '../world';

/** Small map with suburb, harbor, hospital and residential districts. */
export const SEED = 31337;

export function scenario(over: Partial<ScenarioDef> = {}): ScenarioDef {
  return {
    id: 'test',
    textKey: 'scenario.test',
    seed: SEED,
    size: 'small',
    era: 'present',
    faction: 'army',
    pathogen: 'viral',
    patientZeroSite: 'random',
    farmDurationS: 600,
    classicStart: false,
    startResources: { budget: 6000, material: 400, food: 1500 },
    difficulty: 'normal',
    victory: { kinds: ['hold'], all: false },
    ...over,
  };
}

export const missionWorld = (over: Partial<ScenarioDef> = {}): CityWorld =>
  new CityWorld(SEED, { size: 'small', scenario: scenario(over) });

export function send(w: CityWorld, input: CommandInput): void {
  w.applyCommand({ ...input, tick: w.s.tick } as Command);
}

export function run(w: CityWorld, ticks: number): void {
  for (let k = 0; k < ticks; k++) w.step(w.s.tick + 1);
}

/** Runs whole economy passes. */
export const passes = (w: CityWorld, n: number): void => run(w, n * ECONOMY_RULES.passTicks);

/** First city building of a district that is not yet an economy building. */
export function buildingIn(w: CityWorld, district: District, skip = 0): number {
  const B = w.map.buildings;
  const d = DISTRICTS.indexOf(district);
  let k = skip;
  for (let i = 0; i < B.count; i++)
    if (B.district[i] === d && (w.s.eco.slotOf[i] as number) < 0 && k-- === 0) return i;
  throw new Error(`no ${district} building`);
}

export const view = (w: CityWorld) => w.mission();
export const bview = (w: CityWorld, buildingId: number) =>
  w.mission().buildings.find((b) => b.buildingId === buildingId);
