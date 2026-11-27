// M4 rules (GDD 6): scenario files, post-outbreak build costs, strike and volunteers, same scenario -> same world.
// Black-box through commands and mission(); morale is pinned via the economy state
// because reaching the 30/80 thresholds by play takes minutes.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { hashHex } from '../src/core/hash';
import { SimHost } from '../src/core/sim-host';
import { DISTRICTS, TERRAIN } from '../src/core/types/map';
import type { ScenarioDef } from '../src/core/types/mission';
import { STRUCTURES } from '../src/data/buildings/defense';
import { ECONOMY_BUILDINGS, MORALE, PHASES } from '../src/data/economy/economy';
import { SCENARIOS } from '../src/data/scenarios';
import { parseScenario } from '../src/data/scenarios/schema';
import { CityWorld, createWorld } from '../src/sim/world';

const SEED = 31337;

function scenario(over: Partial<ScenarioDef> = {}): ScenarioDef {
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
    startResources: { budget: 100_000, material: 100, food: 1500 },
    difficulty: 'normal',
    victory: { kinds: ['hold'], all: false },
    ...over,
  };
}

const world = (over: Partial<ScenarioDef> = {}): CityWorld =>
  new CityWorld(SEED, { size: 'small', scenario: scenario(over) });

const send = (w: CityWorld, cmd: Omit<Command, 'tick'>): void =>
  w.applyCommand({ ...cmd, tick: w.s.tick } as Command);
const run = (w: CityWorld, ticks: number): void => {
  for (let k = 0; k < ticks; k++) w.step(w.s.tick + 1);
};

describe('scenario files (zod)', () => {
  it('ships valid scenarios with unique ids that load without throwing', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(() => parseScenario(`${s.id}.ts`, s)).not.toThrow();
  });

  it('errors name the file, the field and the expectation', () => {
    const good = SCENARIOS[0] as ScenarioDef;
    const bad = (patch: Record<string, unknown>) => () => parseScenario('broken.ts', { ...good, ...patch });
    expect(bad({ size: 'huge' })).toThrow(/broken\.ts.*size.*small \| medium/);
    expect(bad({ pathogen: 'magic' })).toThrow(/broken\.ts.*pathogen.*viral/);
    expect(bad({ farmDurationS: 5 })).toThrow(/broken\.ts.*farmDurationS/);
    expect(bad({ seed: 'x' })).toThrow(/broken\.ts.*seed.*number/);
    expect(bad({ difficulty: undefined })).toThrow(/broken\.ts.*difficulty/);
    expect(bad({ victory: { kinds: [], all: false } })).toThrow(/broken\.ts.*victory\.kinds/);
    expect(bad({ startResources: { gold: 1 } })).toThrow(/broken\.ts.*startResources/);
    expect(bad({ patientZeroSite: 'nowhere' })).toThrow(/broken\.ts.*patientZeroSite/);
    expect(() => parseScenario('empty.ts', null)).toThrow(/empty\.ts/);
  });

  it('reports every broken field, not only the first', () => {
    const good = SCENARIOS[0] as ScenarioDef;
    expect(() => parseScenario('two.ts', { ...good, size: 'huge', era: 'future' })).toThrow(
      /size.*;.*era|era.*;.*size/,
    );
  });
});

describe('scenario -> world (headless restart path)', () => {
  const hashAfter = (def: ScenarioDef, ticks: number): string => {
    const host = new SimHost(def.seed, { size: def.size, scenario: def }, createWorld);
    for (let i = 0; i < ticks; i++) host.runTick();
    return hashHex(host.hash());
  };

  it('same scenario gives the same hash twice; another scenario gives another', () => {
    const def = scenario({ farmDurationS: 120 });
    expect(hashAfter(def, 400)).toBe(hashAfter(def, 400));
    expect(hashAfter(def, 400)).not.toBe(
      hashAfter(scenario({ farmDurationS: 120, classicStart: true, seed: SEED + 1 }), 400),
    );
    expect(hashAfter(def, 400)).not.toBe(hashAfter({ ...def, startResources: { budget: 1 } }, 400));
  });

  it('a restart (fresh world of the same scenario) matches the first run, also after play', () => {
    const def = scenario({ farmDurationS: 90 });
    const play = (host: SimHost): string => {
      host.enqueue({
        tick: 5,
        playerId: 0,
        type: 'AssignWorkers',
        payload: { workers: 55, conscripts: 5, helpers: 10 },
      });
      host.enqueue({
        tick: 50,
        playerId: 0,
        type: 'SetDecree',
        payload: { decree: 'rationing', active: true },
      });
      for (let i = 0; i < 600; i++) host.runTick();
      return hashHex(host.hash());
    };
    const options = { size: def.size, scenario: def } as const;
    expect(play(new SimHost(def.seed, options, createWorld))).toBe(
      play(new SimHost(def.seed, options, createWorld)),
    );
  });

  it('a world without scenario is not the scenario world (free mode stays separate)', () => {
    const def = scenario();
    const free = new SimHost(def.seed, { size: 'small' }, createWorld);
    const mission = new SimHost(def.seed, { size: 'small', scenario: def }, createWorld);
    for (let i = 0; i < 100; i++) {
      free.runTick();
      mission.runTick();
    }
    expect(mission.world.mission().phase).toBe('farm');
    expect(free.world.mission().phase).not.toBe('farm');
  });
});

describe('build costs after the outbreak', () => {
  /** Open ground cells, far enough apart for watchtowers. */
  function openSpots(w: CityWorld, n: number): [number, number][] {
    const { terrain, widthCells: wc, heightCells: hc, cellSizeM: cs } = w.map;
    const out: [number, number][] = [];
    for (let cy = 8; cy < hc - 8; cy += 6) {
      for (let cx = 8; cx < wc - 8; cx += 6) {
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++)
          for (let dx = -2; dx <= 2 && ok; dx++) {
            const t = terrain[(cy + dy) * wc + cx + dx];
            ok = t === TERRAIN.ground || t === TERRAIN.park;
          }
        if (ok) out.push([(cx + 0.5) * cs, (cy + 0.5) * cs]);
        if (out.length >= n) return out;
      }
    }
    return out;
  }

  it('a structure costs the data price before and +25 % (rounded up) after the outbreak', () => {
    const w = world({ classicStart: true, startResources: { budget: 100_000, material: 1000, food: 1500 } });
    const [a, b] = openSpots(w, 2) as [[number, number], [number, number]];
    const place = (p: [number, number]): number => {
      const before = w.counters.budget;
      send(w, {
        playerId: 0,
        type: 'PlaceStructure',
        payload: { kind: 'watchtower', points: [p[0], p[1]], rotation: 0 },
      });
      return before - w.counters.budget;
    };
    expect(place(a)).toBe(STRUCTURES.watchtower.cost);
    send(w, { playerId: 0, type: 'TriggerOutbreak', payload: {} });
    run(w, 3);
    expect(w.mission().phase).not.toBe('farm');
    expect(place(b)).toBe(Math.ceil(STRUCTURES.watchtower.cost * PHASES.postOutbreakCostFactor));
  });
});

describe('morale thresholds (strike, volunteers)', () => {
  /** A staffed scrapyard on a harbor/industry building. Returns its material output per minute and the world. */
  function withScrapyard(morale: number): { w: CityWorld; out: () => number } {
    const w = world();
    const B = w.map.buildings;
    const ok = ECONOMY_BUILDINGS.scrapyard.fromDistricts.map((d) => DISTRICTS.indexOf(d));
    let id = -1;
    for (let i = 0; i < B.count && id < 0; i++) if (ok.includes(B.district[i] as number)) id = i;
    send(w, { playerId: 0, type: 'RepurposeBuilding', payload: { buildingId: id, kind: 'scrapyard' } });
    send(w, { playerId: 0, type: 'AssignWorkers', payload: { workers: 60, conscripts: 0, helpers: 10 } });
    run(w, (ECONOMY_BUILDINGS.scrapyard.repurposeS + 10) * 20);
    w.s.eco.morale = morale;
    run(w, 20);
    // Pin morale again so the pass that produced the view ran at the tested value.
    w.s.eco.morale = morale;
    run(w, 20);
    const out = (): number =>
      w.mission().buildings.find((x) => x.buildingId === id)?.outputPerMin.material ?? 0;
    return { w, out };
  }

  it('production halves below the strike threshold and gets a bonus above the volunteer threshold', () => {
    const normal = withScrapyard(50).out();
    const strike = withScrapyard(MORALE.strikeBelow - 5).out();
    const high = withScrapyard(MORALE.volunteersAbove + 5).out();
    expect(normal).toBeGreaterThan(0);
    expect(strike).toBeCloseTo(normal * MORALE.strikeProductionFactor, 1);
    expect(high).toBeGreaterThan(normal);
  });

  it('volunteers (extra helpers) appear only above the threshold', () => {
    const calm = withScrapyard(60);
    const high = withScrapyard(MORALE.volunteersAbove + 5);
    expect(high.w.mission().population.helpers).toBeGreaterThan(calm.w.mission().population.helpers);
    expect(high.w.s.eco.volunteers).toBeGreaterThan(0);
    expect(calm.w.s.eco.volunteers).toBe(0);
  });
});
