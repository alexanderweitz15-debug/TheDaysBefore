import { describe, expect, it } from 'vitest';
import { STRUCTURES } from '../../data/buildings/defense';
import {
  ECONOMY_BUILDINGS,
  PHASES,
  POPULATION,
  START_RESOURCES,
  STRUCTURE_MATERIAL,
} from '../../data/economy/economy';
import { ECONOMY_M3, UNITS } from '../../data/units/present';
import { spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import { CityWorld } from '../world';
import { EB_KINDS, R } from './economy';
import { buildingCentre } from './production';
import { buildingIn, bview, missionWorld, passes, run, SEED, send, view } from './test-fixtures';

const repurpose = (w: CityWorld, buildingId: number, kind: (typeof EB_KINDS)[number]) =>
  send(w, { playerId: 0, type: 'RepurposeBuilding', payload: { buildingId, kind } });
const assign = (w: CityWorld, workers: number, conscripts = 0, helpers = 0) =>
  send(w, { playerId: 0, type: 'AssignWorkers', payload: { workers, conscripts, helpers } });

describe('economy: setup and free mode', () => {
  it('missions start with scenario stocks and an HQ next to the centre; free mode keeps the M3 budget', () => {
    const w = missionWorld({ startResources: { budget: 5000, material: 99_999 } });
    const m = view(w);
    expect(m.resources.budget.amount).toBe(5000);
    // Clamped to the HQ storage.
    expect(m.resources.material.amount).toBe(ECONOMY_BUILDINGS.hq.storage.material);
    expect(m.resources.ammo.capacity).toBe(ECONOMY_BUILDINGS.hq.storage.ammo);
    expect(m.buildings).toHaveLength(1);
    expect(m.buildings[0]).toMatchObject({ kind: 'hq', progress: 1 });
    const free = new CityWorld(SEED, { size: 'small' });
    expect(free.counters.budget).toBe(ECONOMY_M3.startBudget);
    expect(free.s.eco.active).toBe(false);
    expect(free.mission()).toMatchObject({ phase: 'defense', countdownTicks: null, buildings: [] });
  });
});

describe('economy: repurposing and production', () => {
  it('repurposing needs a matching district and the cost, takes repurposeS, then produces', () => {
    const w = missionWorld();
    const budget = w.counters.budget;
    const res = buildingIn(w, 'residential');
    repurpose(w, res, 'scrapyard');
    repurpose(w, 1e9, 'scrapyard');
    repurpose(w, buildingIn(w, 'harbor'), 'hq');
    expect(view(w).buildings).toHaveLength(1);
    const b = buildingIn(w, 'harbor');
    repurpose(w, b, 'scrapyard');
    repurpose(w, b, 'warehouse');
    expect(view(w).buildings).toHaveLength(2);
    expect(w.counters.budget).toBe(budget - (ECONOMY_BUILDINGS.scrapyard.repurposeCost.budget as number));
    assign(w, 100);
    const helperBonus = w.s.eco.helperBonus();
    passes(w, Math.floor(ECONOMY_BUILDINGS.scrapyard.repurposeS / helperBonus) - 1);
    expect(bview(w, b)?.progress).toBeLessThan(1);
    passes(w, 2);
    expect(bview(w, b)?.progress).toBe(1);
    const before = view(w).resources.material.amount;
    passes(w, 30);
    const m = view(w);
    expect(m.resources.material.amount).toBeCloseTo(
      before + (ECONOMY_BUILDINGS.scrapyard.outputsPerMin.material as number) / 2,
      0,
    );
    expect(m.resources.material.perMin).toBeGreaterThan(0);
    expect(bview(w, b)).toMatchObject({ workers: 40, bottleneck: null });
  });

  it('too few workers: output scales down and the bottleneck is workers', () => {
    const w = missionWorld();
    const b = buildingIn(w, 'harbor');
    repurpose(w, b, 'scrapyard');
    w.s.eco.progress[w.s.eco.slotOf[b] as number] = 1;
    assign(w, 0);
    passes(w, 2);
    expect(bview(w, b)).toMatchObject({ workers: 0, bottleneck: 'workers', outputPerMin: {} });
  });

  it('power: consumers without supply stop (bottleneck power); a fuelled generator powers them, no fuel = input', () => {
    const w = missionWorld({ startResources: { budget: 6000, material: 400, fuel: 0 } });
    const e = w.s.eco;
    const lab = buildingIn(w, 'hospital');
    repurpose(w, lab, 'lab');
    const gen = buildingIn(w, 'residential');
    repurpose(w, gen, 'generator');
    for (const b of [lab, gen]) e.progress[e.slotOf[b] as number] = 1;
    assign(w, 100);
    passes(w, 2);
    expect(bview(w, gen)?.bottleneck).toBe('input');
    expect(bview(w, lab)).toMatchObject({ bottleneck: 'power', powered: false });
    expect(view(w).resources.power.amount).toBeLessThan(0);
    e.amount[R.fuel] = 100;
    passes(w, 2);
    // A generator (30) covers a lab (20).
    expect(bview(w, lab)).toMatchObject({ bottleneck: null, powered: true });
    expect(view(w).resources.power.amount).toBeCloseTo(
      -ECONOMY_BUILDINGS.generator.power - ECONOMY_BUILDINGS.lab.power,
      3,
    );
    expect(view(w).resources.fuel.amount).toBeLessThan(100);
  });

  it('chains have at most two stages: every input is produced by a building without inputs', () => {
    for (const k of EB_KINDS) {
      for (const r of Object.keys(ECONOMY_BUILDINGS[k].inputsPerMin)) {
        const raw = EB_KINDS.some(
          (p) =>
            (ECONOMY_BUILDINGS[p].outputsPerMin as Record<string, number>)[r] &&
            Object.keys(ECONOMY_BUILDINGS[p].inputsPerMin).length === 0,
        );
        expect(raw, `${k} needs ${r}`).toBe(true);
      }
    }
  });

  it('full storage: output is clipped at capacity and the bottleneck is storage', () => {
    const cap = ECONOMY_BUILDINGS.hq.storage.food as number;
    const w = missionWorld({ startResources: { budget: 6000, food: cap } });
    const b = buildingIn(w, 'suburb');
    repurpose(w, b, 'farm');
    w.s.eco.progress[w.s.eco.slotOf[b] as number] = 1;
    assign(w, 100);
    passes(w, 3);
    expect(view(w).resources.food.amount).toBeLessThanOrEqual(cap);
    expect(bview(w, b)?.bottleneck).toBe('storage');
  });

  it('zombies at the walls shut a building down', () => {
    const w = missionWorld();
    const b = buildingIn(w, 'harbor');
    repurpose(w, b, 'scrapyard');
    w.s.eco.progress[w.s.eco.slotOf[b] as number] = 1;
    assign(w, 100);
    passes(w, 2);
    expect(bview(w, b)?.workers).toBe(40);
    const p = buildingCentre(w.s, b);
    for (let k = 0; k < 20; k++) spawnZombie(w.s, p.x, p.y, ZT_WALKER);
    w.s.density.build(w.s.zombies);
    passes(w, 1);
    expect(bview(w, b)).toMatchObject({ workers: 0, bottleneck: 'workers', outputPerMin: {} });
  });
});

describe('economy: income and purchases', () => {
  it('taxes follow population x morale; conscripts pay none', () => {
    const income = (conscripts: number, morale: number): number => {
      const w = missionWorld();
      assign(w, 30, conscripts, 0);
      w.s.eco.morale = morale;
      const b0 = w.counters.budget;
      passes(w, 1);
      return w.counters.budget + (w.s.eco.amount[R.budget] as number) - b0;
    };
    const base = income(0, 50);
    expect(base).toBeGreaterThan(0);
    expect(income(0, 100)).toBeGreaterThan(base * 1.9);
    expect(income(50, 50)).toBeCloseTo(base * (1 - 0.5 * POPULATION.conscriptTaxPenalty), 1);
  });

  it('food is eaten every pass; without food the population goes hungry', () => {
    const w = missionWorld({ startResources: { budget: 6000, food: 100 } });
    passes(w, 1);
    expect(view(w).resources.food.amount).toBeLessThan(100);
    expect(w.s.eco.hungry).toBe(false);
    w.s.eco.amount[R.food] = 0;
    passes(w, 1);
    expect(w.s.eco.hungry).toBe(true);
  });

  it('structures cost budget and material (x1.25 after the outbreak); refused without material', () => {
    const w = missionWorld({ startResources: { budget: 100_000, material: 1000 } });
    const s = w.s;
    // Open ground on the SEED map (see combat/test-fixtures OPEN).
    const x = 50;
    const y = 20;
    const place = (px: number, py: number) =>
      send(w, {
        playerId: 0,
        type: 'PlaceStructure',
        payload: { kind: 'watchtower', points: [px, py], rotation: 0 },
      });
    place(x, y);
    expect(w.structures()).toHaveLength(1);
    expect(w.counters.budget).toBe(100_000 - STRUCTURES.watchtower.cost);
    expect(s.eco.amount[R.material]).toBeCloseTo(1000 - STRUCTURE_MATERIAL.watchtower, 3);
    s.eco.postOutbreak = true;
    place(x + 20, y);
    place(x - 20, y);
    const built = w.structures().length - 1;
    expect(built).toBeGreaterThan(0);
    expect(w.counters.budget).toBe(
      100_000 -
        STRUCTURES.watchtower.cost -
        built * Math.ceil(STRUCTURES.watchtower.cost * PHASES.postOutbreakCostFactor),
    );
    s.eco.amount[R.material] = 0;
    const n = w.structures().length;
    place(x, y + 20);
    expect(w.structures()).toHaveLength(n);
  });

  it('buying 12 squads (4 infantry, 1 MG, ...) leaves the ammo stock untouched', () => {
    const w = missionWorld({ startResources: { budget: 6000, ammo: START_RESOURCES.ammo } });
    const s = w.s;
    const e = s.eco;
    const n = s.n;
    let c = s.cellOf(e.hqX, e.hqY);
    while (!s.walkable[c]) c++;
    const at = { x: ((c % n) + 0.5) * s.cellM, y: (Math.floor(c / n) + 0.5) * s.cellM };
    const types = ['infantry', 'infantry', 'infantry', 'infantry', 'mgTeam'] as const;
    for (let k = 0; k < 12; k++) {
      send(w, {
        playerId: 0,
        type: 'PlaceUnit',
        payload: { unitType: types[k % types.length] ?? 'infantry', ...at },
      });
    }
    expect(w.unitCount).toBe(12);
    expect(e.amount[R.ammo]).toBe(START_RESOURCES.ammo);
  });

  it('purchase includes the full loadout without touching the stock; refill at depot/HQ draws from the stock', () => {
    const w = missionWorld({ startResources: { budget: 100_000, ammo: 100 } });
    const s = w.s;
    const e = s.eco;
    const n = s.n;
    const c0 = s.cellOf(e.hqX, e.hqY);
    let c = c0;
    while (!s.walkable[c]) c++;
    send(w, {
      playerId: 0,
      type: 'PlaceUnit',
      payload: { unitType: 'infantry', x: ((c % n) + 0.5) * s.cellM, y: (Math.floor(c / n) + 0.5) * s.cellM },
    });
    let u = 0;
    while (!s.units.pool.alive[u]) u++;
    expect(w.unitCount).toBe(1);
    expect(s.units.ammo[u]).toBe(UNITS.infantry.ammo);
    expect(e.amount[R.ammo]).toBe(100);
    s.units.ammo[u] = 0;
    e.amount[R.ammo] = 50;
    run(w, 40);
    expect(s.units.ammo[u]).toBeGreaterThan(0);
    expect((s.units.ammo[u] as number) + (e.amount[R.ammo] as number)).toBeCloseTo(50, 3);
  });

  it('perMin is running income minus running use; purchases, building and repurposing do not count', () => {
    const w = missionWorld({ startResources: { budget: 100_000, material: 5000, food: 1500, ammo: 500 } });
    const s = w.s;
    const e = s.eco;
    passes(w, 10);
    const r0 = view(w).resources;
    expect(r0.budget.perMin).toBeGreaterThan(0);
    expect(r0.food.perMin).toBeLessThan(0);
    expect(r0.ammo.perMin).toBe(0);
    const n = s.n;
    let c = s.cellOf(e.hqX, e.hqY);
    while (!s.walkable[c]) c++;
    const x = ((c % n) + 0.5) * s.cellM;
    const y = (Math.floor(c / n) + 0.5) * s.cellM;
    for (let k = 0; k < 10; k++)
      send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'infantry', x, y } });
    repurpose(w, buildingIn(w, 'harbor'), 'scrapyard');
    send(w, {
      playerId: 0,
      type: 'PlaceStructure',
      payload: { kind: 'wall', points: [x, y + 20, x + 40, y + 20], rotation: 0 },
    });
    const spent = 100_000 - w.counters.budget;
    expect(spent).toBeGreaterThan(3000);
    passes(w, 1);
    const r1 = view(w).resources;
    expect(r1.budget.perMin).toBeCloseTo(r0.budget.perMin, -1);
    expect(r1.material.perMin).toBeGreaterThanOrEqual(0);
    // Refilling at the HQ is running use and shows up.
    let u = 0;
    while (!s.units.pool.alive[u]) u++;
    s.units.ammo[u] = 0;
    passes(w, 2);
    expect(view(w).resources.ammo.perMin).toBeLessThan(0);
  });
});
