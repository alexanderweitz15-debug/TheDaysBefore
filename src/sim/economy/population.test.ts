import { describe, expect, it } from 'vitest';
import { CIVILIAN_ALERT } from '../../data/agents/civilians';
import { DECREES, MORALE, POPULATION } from '../../data/economy/economy';
import { UNITS } from '../../data/units/present';
import { emptyWorld, unitAt } from '../combat/test-fixtures';
import { loseMorale } from '../combat/unit-damage';
import { R } from './economy';
import { productionFactor } from './production';
import { missionWorld, passes, send } from './test-fixtures';

const assign = (w: ReturnType<typeof missionWorld>, workers: number, conscripts: number, helpers: number) =>
  send(w, { playerId: 0, type: 'AssignWorkers', payload: { workers, conscripts, helpers } });
const decree = (w: ReturnType<typeof missionWorld>, name: string, active: boolean) =>
  send(w, { playerId: 0, type: 'SetDecree', payload: { decree: name, active } });
const factor = (w: ReturnType<typeof missionWorld>, key: string) =>
  w.mission().moraleFactors.find((f) => f.key === key)?.value;

describe('population: assignment', () => {
  it('AssignWorkers takes shares up to 100 %; invalid input is ignored; the view splits the residents', () => {
    const w = missionWorld();
    assign(w, 50, 20, 20);
    assign(w, 60, 30, 20);
    assign(w, -1, 0, 0);
    assign(w, Number.NaN, 0, 0);
    expect([w.s.eco.workersPct, w.s.eco.conscriptsPct, w.s.eco.helpersPct]).toEqual([50, 20, 20]);
    const p = w.mission().population;
    expect(p.total).toBe(w.civilianCount);
    expect(p.workers + p.conscripts + p.helpers + p.free).toBe(p.total);
    expect(p.workers).toBe(Math.floor(p.total * 0.5));
  });

  it('conscripts form militia squads next to the HQ, paid with militiaCost, at most one per conscriptsPerMilitia', () => {
    const w = missionWorld({ population: 200, startResources: { budget: 10_000 } });
    assign(w, 0, 50, 0);
    passes(w, 60);
    const conscripts = Math.floor((w.civilianCount * 50) / 100);
    const expected = Math.min(
      POPULATION.militiaMaxSquads,
      Math.floor(conscripts / POPULATION.conscriptsPerMilitia),
    );
    expect(expected).toBeGreaterThan(0);
    expect(w.unitCount).toBe(expected);
    expect(w.units().every((u) => u.type === POPULATION.militiaUnitType)).toBe(true);
    expect(w.s.eco.militia).toBe(expected);
    expect(POPULATION.militiaUnitType).toBe('militia');
  });

  it('militia is its own type: PlaceUnit refuses it, it loses morale faster than infantry (GDD 9)', () => {
    const w = emptyWorld();
    send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'militia', x: 50, y: 50 } });
    expect(w.unitCount).toBe(0);
    const mil = unitAt(w, 'militia', 30, 30);
    const inf = unitAt(w, 'infantry', 70, 70);
    expect(mil).toBeGreaterThanOrEqual(0);
    expect(w.units().find((u) => u.id === mil)?.type).toBe('militia');
    loseMorale(w.s, mil, 0.1);
    loseMorale(w.s, inf, 0.1);
    const U = w.s.units.morale;
    expect(1 - (U[mil] as number)).toBeCloseTo((1 - (U[inf] as number)) * UNITS.militia.moraleLossFactor, 5);
    expect(UNITS.militia.moraleLossFactor).toBeGreaterThan(1);
  });
});

describe('population: morale', () => {
  it('morale moves toward the sum of its factors at ratePerMin; hunger and conscription lower it', () => {
    const fed = missionWorld({ startResources: { budget: 6000, food: 3000 } });
    const hungry = missionWorld({ startResources: { budget: 6000, food: 0 } });
    const drafted = missionWorld({ startResources: { budget: 6000, food: 3000 } });
    assign(drafted, 30, 50, 0);
    for (const w of [fed, hungry, drafted]) passes(w, 60);
    expect(factor(fed, 'food')).toBe(MORALE.foodOk);
    expect(factor(hungry, 'food')).toBe(MORALE.hunger);
    expect(factor(drafted, 'conscription')).toBe(-5 * POPULATION.conscriptMoralePenaltyPer10Pct);
    expect(hungry.s.eco.morale).toBeLessThan(fed.s.eco.morale);
    expect(drafted.s.eco.morale).toBeLessThan(fed.s.eco.morale);
    // One minute moves at most ratePerMin.
    expect(Math.abs(fed.s.eco.morale - MORALE.start)).toBeLessThanOrEqual(MORALE.ratePerMin + 1e-6);
    const sum = fed.mission().moraleFactors.reduce((a, f) => a + f.value, 0);
    // Close to the target it settles there.
    fed.s.eco.morale = sum - 0.05;
    passes(fed, 2);
    expect(fed.s.eco.morale).toBeCloseTo(Math.min(100, Math.max(0, sum)), 3);
  });

  it('strikes below strikeBelow, a bonus and volunteers above volunteersAbove', () => {
    const w = missionWorld();
    const e = w.s.eco;
    e.morale = MORALE.strikeBelow - 1;
    expect(productionFactor(e)).toBe(MORALE.strikeProductionFactor);
    e.morale = 50;
    expect(productionFactor(e)).toBe(1);
    e.morale = MORALE.volunteersAbove + 5;
    expect(productionFactor(e)).toBeCloseTo(1 + MORALE.productionBonusAbove80, 6);
    // Morale stays high for the pass: the factors are pinned near it.
    passes(w, 1);
    expect(e.morale).toBeGreaterThan(MORALE.volunteersAbove);
    expect(e.volunteers).toBeGreaterThan(0);
    expect(w.mission().population.helpers).toBeGreaterThan(
      Math.floor((w.civilianCount * e.helpersPct) / 100),
    );
  });
});

/** Panic of routine civilian `i` after its first perception scan with loud noise at its position. */
function panicAfterNoise(w: ReturnType<typeof missionWorld>, i: number): number {
  const c = w.s.civilians;
  for (let k = 0; k < CIVILIAN_ALERT.scanIntervalTicks; k++) {
    w.s.noise.emit(c.posX[i] as number, c.posY[i] as number, 60, 30);
    w.step(w.s.tick + 1);
    if ((w.s.ct.panic[i] as number) > 0) break;
  }
  return w.s.ct.panic[i] as number;
}

describe('population: panic', () => {
  it('curfew and martial law damp the panic rise; morale below strikeBelow raises it (GDD 6)', () => {
    const base = missionWorld();
    const curfew = missionWorld();
    const martial = missionWorld();
    const low = missionWorld();
    decree(curfew, 'curfew', true);
    decree(martial, 'martialLaw', true);
    low.s.eco.morale = MORALE.strikeBelow - 1;
    let i = 0;
    while (!base.s.civilians.alive[i]) i++;
    const p0 = panicAfterNoise(base, i);
    expect(p0).toBeGreaterThan(0);
    expect(p0).toBeLessThan(1);
    expect(panicAfterNoise(curfew, i) / p0).toBeCloseTo(DECREES.curfew?.panicFactor as number, 4);
    expect(panicAfterNoise(martial, i) / p0).toBeCloseTo(DECREES.martialLaw?.panicFactor as number, 4);
    expect(panicAfterNoise(low, i) / p0).toBeCloseTo(MORALE.lowMoralePanicFactor, 4);
    expect(low.s.eco.morale).toBeLessThan(MORALE.strikeBelow);
  });
});

describe('population: decrees', () => {
  it('SetDecree toggles known decrees; their factors apply (martial law: taxes x0.8, morale target lower)', () => {
    const w = missionWorld();
    decree(w, 'martialLaw', true);
    decree(w, 'nonsense', true);
    expect(w.mission().activeDecrees).toEqual(['martialLaw']);
    expect(w.s.eco.decreeFactor('taxFactor')).toBe(DECREES.martialLaw?.taxFactor);
    passes(w, 1);
    expect(factor(w, 'decrees')).toBeCloseTo(
      (DECREES.martialLaw?.moralePerMin as number) * MORALE.decreeTargetPerRate,
      6,
    );
    decree(w, 'martialLaw', false);
    expect(w.mission().activeDecrees).toEqual([]);
    expect(w.s.eco.decreeFactor('taxFactor')).toBe(1);
  });

  it('early evacuation removes its share of healthy residents once (fewer workers)', () => {
    const w = missionWorld();
    const before = w.civilianCount;
    decree(w, 'earlyEvacuation', true);
    const share = DECREES.earlyEvacuation?.earlyEvacuationShare as number;
    expect(w.civilianCount).toBeCloseTo(before * (1 - share), -1);
    expect(w.s.eco.evacuated).toBe(before - w.civilianCount);
    decree(w, 'earlyEvacuation', false);
    decree(w, 'earlyEvacuation', true);
    expect(w.s.eco.evacuated).toBe(before - w.civilianCount);
    expect(w.s.eco.amount[R.budget]).toBeGreaterThanOrEqual(0);
  });
});
