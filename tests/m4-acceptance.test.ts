// M4 acceptance (GDD 6, 17): briefing data -> farm phase -> outbreak -> defense, economy rules, classic start.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { TICK_RATE } from '../src/core/loop';
import { SimHost } from '../src/core/sim-host';
import { DISTRICTS } from '../src/core/types/map';
import type { ScenarioDef } from '../src/core/types/mission';
import type { WorldOptions } from '../src/core/types/sim';
import { ECONOMY_BUILDINGS } from '../src/data/economy/economy';
import { createWorld } from '../src/sim/world';

const SEED = 11;
const FARM_S = 60;
const SCRAPYARD_REPURPOSE_S = 20;
/** Defense must follow the outbreak within this many ticks (target of M4 plan; do not raise). */
const DEFENSE_MAX_TICKS = 2400;
const LONG_FARM_S = 600;
const HUNGER_TICKS = 3 * 60 * TICK_RATE;

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
    farmDurationS: FARM_S,
    classicStart: false,
    startResources: { budget: 6000, material: 100, food: 1500 },
    difficulty: 'normal',
    victory: { kinds: ['hold'], all: false },
    ...over,
  };
}

function start(def: ScenarioDef): SimHost {
  const options: WorldOptions = { size: def.size, scenario: def };
  return new SimHost(def.seed, options, createWorld);
}

const cmd = <T extends Command['type']>(
  host: SimHost,
  type: T,
  payload: Extract<Command, { type: T }>['payload'],
) => host.enqueue({ tick: host.tick, playerId: 0, type, payload } as Command);

function advance(host: SimHost, ticks: number, until?: () => boolean): number {
  let n = 0;
  while (n < ticks && !(until?.() ?? false)) {
    host.runTick();
    n++;
  }
  return n;
}

/** First building in a district that may be repurposed into a scrapyard (data-driven; seed 11 small has harbor, no industry). */
function scrapyardSite(host: SimHost): number {
  const { buildings } = host.world.map;
  const ok = ECONOMY_BUILDINGS.scrapyard.fromDistricts.map((d) => DISTRICTS.indexOf(d));
  for (let i = 0; i < buildings.count; i++) if (ok.includes(buildings.district[i] as number)) return i;
  throw new Error('no building of a scrapyard district on this map');
}

describe('M4 farm loop', () => {
  it('farm with countdown -> repurpose (harbor/industry) -> resources rise -> outbreak -> defense', () => {
    const host = start(scenario());
    const m0 = host.world.mission();
    expect(m0.phase).toBe('farm');
    expect(m0.countdownTicks).toBeGreaterThan(0);
    expect(host.world.counters.outbreakTick).toBe(-1);

    cmd(host, 'RepurposeBuilding', { buildingId: scrapyardSite(host), kind: 'scrapyard' });
    cmd(host, 'AssignWorkers', { workers: 60, conscripts: 0, helpers: 10 });
    advance(host, (SCRAPYARD_REPURPOSE_S + 5) * TICK_RATE);
    const m1 = host.world.mission();
    expect(m1.countdownTicks).toBeLessThan(m0.countdownTicks as number);
    expect(m1.buildings.some((b) => b.kind === 'scrapyard' && b.progress === 1)).toBe(true);
    const material1 = m1.resources.material.amount;
    advance(host, 10 * TICK_RATE);
    expect(host.world.mission().resources.material.amount).toBeGreaterThan(material1);
    expect(host.world.mission().phase).toBe('farm');

    advance(host, FARM_S * TICK_RATE + 10, () => host.world.mission().phase !== 'farm');
    expect(host.world.mission().phase).toBe('outbreak');
    expect(host.world.counters.outbreakTick).toBeGreaterThanOrEqual(0);
    advance(host, DEFENSE_MAX_TICKS, () => host.world.mission().phase === 'defense');
    expect(host.world.mission().phase).toBe('defense');
  });

  it('classic start: no outbreak without TriggerOutbreak, immediately with it', () => {
    const host = start(scenario({ classicStart: true }));
    advance(host, (FARM_S + 60) * TICK_RATE);
    expect(host.world.mission().classicStart).toBe(true);
    expect(host.world.mission().countdownTicks).toBeNull();
    expect(host.world.mission().phase).toBe('farm');
    expect(host.world.counters.outbreakTick).toBe(-1);
    cmd(host, 'TriggerOutbreak', {});
    advance(host, 2);
    expect(host.world.counters.outbreakTick).toBeGreaterThanOrEqual(0);
    expect(host.world.mission().phase).not.toBe('farm');
  });

  it('ignored warning signs start the outbreak before the countdown; investigated ones do not', () => {
    const farmTicks = LONG_FARM_S * TICK_RATE;
    const ignored = start(scenario({ farmDurationS: LONG_FARM_S }));
    advance(ignored, farmTicks + 10, () => ignored.world.counters.outbreakTick >= 0);
    expect(ignored.world.counters.outbreakTick).toBeGreaterThanOrEqual(0);
    expect(ignored.world.counters.outbreakTick).toBeLessThan(farmTicks);

    const careful = start(scenario({ farmDurationS: LONG_FARM_S }));
    const seen = new Set<number>();
    for (let i = 0; i < farmTicks && careful.world.counters.outbreakTick < 0; i++) {
      for (const w of careful.world.mission().warnings) {
        if (!w.investigated && !seen.has(w.id)) {
          seen.add(w.id);
          cmd(careful, 'InvestigateWarning', { warningId: w.id });
        }
      }
      careful.runTick();
    }
    expect(seen.size).toBeGreaterThan(0);
    // -1 = the extended countdown outlasts the loop, i.e. later than any outbreak.
    const late = careful.world.counters.outbreakTick;
    expect(late === -1 || late >= ignored.world.counters.outbreakTick).toBe(true);
  });

  it('morale falls with hunger and not with food', () => {
    const hungry = start(scenario({ startResources: { budget: 6000, food: 0 } }));
    const fed = start(scenario({ startResources: { budget: 6000, food: 5000 } }));
    advance(hungry, HUNGER_TICKS);
    advance(fed, HUNGER_TICKS);
    const h = hungry.world.mission();
    const f = fed.world.mission();
    expect(h.morale).toBeLessThan(f.morale);
    expect(h.moraleFactors.find((x) => x.key === 'food')?.value).toBeLessThan(0);
  });

  it('free mode without scenario keeps the legacy budget and has no countdown', () => {
    const host = new SimHost(SEED, { size: 'small', startBudget: 5000 }, createWorld);
    advance(host, 200);
    expect(host.world.counters.budget).toBe(5000);
    expect(host.world.mission().countdownTicks).toBeNull();
    expect(host.world.mission().phase).not.toBe('farm');
  });
});
