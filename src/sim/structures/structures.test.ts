import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../../core/loop';
import { TERRAIN } from '../../core/types/map';
import { STRUCTURE_RULES, STRUCTURES } from '../../data/buildings/defense';
import { UNITS } from '../../data/units/present';
import { ZOMBIE_TYPE_SPECS } from '../../data/zombies/viral-types';
import { FX } from '../combat/fx';
import { emptyWorld, pin, run, send, unitAt, zombieAt } from '../combat/test-fixtures';
import { ZT_COLOSSUS } from '../horde/zombie-traits';
import type { CityWorld } from '../world';
import { placeCivilians } from '../world-setup';
import { SK, SS_DESTROYED, SS_DONE } from './kinds';
import { finishStructure } from './structure-system';

const place = (
  w: CityWorld,
  kind: Parameters<CityWorld['s']['structures']['place']>[1],
  points: number[],
  rotation = 0,
) => send(w, { playerId: 0, type: 'PlaceStructure', payload: { kind, points, rotation } });

/** Slots of all live structures. */
const slots = (w: CityWorld): number[] => {
  const S = w.s.structures;
  const out: number[] = [];
  for (let i = 0; i < S.highWater; i++) if (S.alive[i]) out.push(i);
  return out;
};

const finishAll = (w: CityWorld): void => {
  for (const i of slots(w)) if (w.s.structures.state[i] !== SS_DONE) finishStructure(w.s, i, w.s.tick);
};

const fxCount = (w: CityWorld, type: number): number => {
  const out = new Float32Array(w.fxCount * 4);
  w.writeFx(out);
  let k = 0;
  for (let j = 0; j < out.length; j += 4) if (out[j] === type) k++;
  return k;
};

describe('placement', () => {
  it('lines are split into segments, cost per meter is paid, budget stops placement', () => {
    const w = emptyWorld(10_000);
    place(w, 'wall', [10, 10, 90, 10]);
    const v = w.structures();
    expect(v.length).toBe(Math.ceil(80 / STRUCTURE_RULES.segmentM));
    expect(w.counters.budget).toBe(10_000 - v.length * STRUCTURES.wall.cost * STRUCTURE_RULES.segmentM);
    expect(v[0]).toMatchObject({ kind: 'wall', state: 'building', progress: 0, flag: false });
    expect(v[0]?.maxHp).toBeCloseTo(STRUCTURES.wall.hp * STRUCTURE_RULES.segmentM, 3);
    const poor = emptyWorld(STRUCTURES.wall.cost * STRUCTURE_RULES.segmentM * 2);
    place(poor, 'wall', [10, 10, 90, 10]);
    expect(poor.structures().length).toBe(2);
  });

  it('points off the map are refused, not clamped to the border; no budget is spent', () => {
    const w = emptyWorld(10_000);
    const edge = w.s.sizeM;
    place(w, 'wall', [-20, 10, 40, 10]);
    place(w, 'barricade', [10, 10, 10, edge + 5]);
    place(w, 'watchtower', [-5, 50]);
    place(w, 'depot', [50, 1e9]);
    place(w, 'mines', [edge, 50]);
    expect(w.structures().length).toBe(0);
    expect(w.counters.budget).toBe(10_000);
    // Control: the same tower on open ground is placed.
    place(w, 'watchtower', [50, 50]);
    expect(w.structures().length).toBe(1);
  });

  it('only walkable, free cells are claimed; water and occupied cells are refused', () => {
    const w = emptyWorld();
    const s = w.s;
    const n = s.n;
    // A building cell with walkable cells two to the left and right.
    let b = -1;
    for (let c = 2 * n; c < s.cells - 2 * n && b < 0; c++)
      if (s.map.terrain[c] === TERRAIN.building && s.walkable[c - 2] && s.walkable[c + 3]) b = c;
    const y = (Math.floor(b / n) + 0.5) * 4;
    const x = ((b % n) + 0.5) * 4;
    place(w, 'barricade', [x - 8, y, x + 8, y]);
    for (const i of slots(w)) for (const c of s.structures.cellsOf(i)) expect(s.terrainWalk[c]).toBe(1);
    expect(s.structAt[b]).toBe(-1);
    let water = -1;
    for (let c = 0; c < s.cells && water < 0; c++) if (s.map.terrain[c] === TERRAIN.water) water = c;
    const before = w.structures().length;
    place(w, 'depot', [((water % n) + 0.5) * 4, (Math.floor(water / n) + 0.5) * 4]);
    // Overlapping an existing structure is refused too.
    place(w, 'wall', [x - 8, y, x - 6, y]);
    expect(w.structures().length).toBe(before);
  });

  it('lines rasterize 4-connected (no diagonal gaps)', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'wall', [10, 10, 70, 50]);
    const cells: number[] = [];
    for (const i of slots(w)) cells.push(...s.structures.cellsOf(i));
    const set = new Set(cells);
    const n = s.n;
    for (const c of cells) {
      const x = c % n;
      const y = Math.floor(c / n);
      // Every diagonal neighbor in the set must be bridged by an edge neighbor.
      for (const [dx, dy] of [
        [1, 1],
        [1, -1],
      ] as const) {
        const d = (y + dy) * n + x + dx;
        if (set.has(d)) expect(set.has(y * n + x + dx) || set.has((y + dy) * n + x)).toBe(true);
      }
    }
  });
});

describe('construction', () => {
  it('builds slowly without engineers and fast with engineers in range', () => {
    const slow = emptyWorld();
    place(slow, 'barricade', [20, 20, 28, 20]);
    const t = STRUCTURES.barricade.buildS * 8;
    run(slow, Math.ceil(t * STRUCTURE_RULES.slowBuildFactor * TICK_RATE * 0.5));
    const half = slow.structures()[0]?.progress ?? 0;
    expect(half).toBeGreaterThan(0.45);
    expect(half).toBeLessThan(0.55);
    const fast = emptyWorld();
    place(fast, 'barricade', [20, 20, 28, 20]);
    unitAt(fast, 'engineers', 30, 30);
    run(fast, Math.ceil(t * TICK_RATE) + 2);
    expect(fast.structures()[0]?.state).toBe('done');
  });

  it('engineers repair damaged structures', () => {
    const w = emptyWorld();
    place(w, 'wall', [20, 20, 28, 20]);
    finishAll(w);
    const i = slots(w)[0] as number;
    w.s.structures.hp[i] = 100;
    unitAt(w, 'engineers', 24, 30);
    run(w, TICK_RATE);
    expect(w.s.structures.hp[i]).toBeCloseTo(100 + STRUCTURE_RULES.repairHpPerS, 0);
  });
});

describe('blocking and pressure', () => {
  it('a finished wall blocks zombies, civilians and unit paths; pathing refreshes after the debounce', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'wall', [50, 0, 50, 100]);
    finishAll(w);
    const cells = slots(w).flatMap((i) => [...s.structures.cellsOf(i)]);
    for (const c of cells) {
      expect(s.walkable[c]).toBe(0);
      expect(s.zombieWalk[c]).toBe(0);
      expect(s.civWalk[c]).toBe(0);
    }
    const jobs = s.flow.jobs;
    run(w, STRUCTURE_RULES.repathDebounceTicks + 2 * 40 + 1);
    expect(s.flow.jobs).toBeGreaterThan(jobs);
    // A zombie lured by a civilian across the wall presses against it but never crosses.
    const z = zombieAt(w, 44, 50);
    placeCivilians(s, 56, 50, 1, 100_000);
    let crossed = false;
    run(w, 10 * TICK_RATE, () => {
      if ((s.zombies.posX[z] as number) > 48) crossed = true;
    });
    expect(crossed).toBe(false);
    // A squad ordered across takes a path around the wall's end.
    const u = unitAt(w, 'infantry', 40, 50);
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: [u], x: 60, y: 50, append: false, facing: null },
    });
    let inside = 0;
    run(w, 3 * TICK_RATE, () => {
      if (!s.walkable[s.units.pool.cell[u] as number]) inside++;
    });
    expect(inside).toBe(0);
    expect(s.units.pathLen[u]).toBeGreaterThan(1);
  });

  it('zombies next to a wall deal pressure damage by their number; breaking it reopens the cells', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'barricade', [50, 40, 50, 48]);
    finishAll(w);
    const i = slots(w)[0] as number;
    const zs: number[] = [];
    for (let k = 0; k < 10; k++) zs.push(zombieAt(w, 46, 42 + (k % 4)));
    const hp0 = s.structures.hp[i] as number;
    run(w, STRUCTURE_RULES.pressureIntervalTicks, () => {
      for (const [k, z] of zs.entries()) pin(w, z, 46.5, 41 + (k % 4) * 1.5);
    });
    const lost = hp0 - (s.structures.hp[i] as number);
    const expected =
      10 * STRUCTURE_RULES.pressureDpsPerZombie * (STRUCTURE_RULES.pressureIntervalTicks / TICK_RATE);
    expect(lost).toBeCloseTo(expected, 3);
    expect(fxCount(w, FX.wallHit)).toBeGreaterThan(0);
    s.structures.hp[i] = 1;
    run(w, STRUCTURE_RULES.pressureIntervalTicks, () => {
      for (const [k, z] of zs.entries()) pin(w, z, 46.5, 41 + (k % 4) * 1.5);
    });
    expect(s.structures.state[i]).toBe(SS_DESTROYED);
    for (const c of s.structures.cellsOf(i)) expect(s.zombieWalk[c]).toBe(1);
    run(w, STRUCTURE_RULES.rubbleS * TICK_RATE + 1);
    expect(s.structures.alive[i]).toBe(0);
  });

  it('at high density single zombies climb over a barricade', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'barricade', [50, 30, 50, 70]);
    finishAll(w);
    for (const i of slots(w)) s.structures.hp[i] = 1e6;
    for (let k = 0; k < 400; k++) zombieAt(w, 44, 40 + (k % 20));
    placeCivilians(s, 60, 50, 1, 100_000);
    run(w, 30 * TICK_RATE);
    let over = 0;
    for (let i = 0; i < s.zombies.highWater; i++)
      if (s.zombies.alive[i] && (s.zombies.posX[i] as number) > 52) over++;
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(400);
  });

  it('wire slows zombies by 60 %', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'wire', [40, 20, 40, 80]);
    finishAll(w);
    const z = zombieAt(w, 40, 50);
    pin(w, z, 41, 50);
    run(w, 2);
    const sp = Math.hypot(s.zombies.velX[z] as number, s.zombies.velY[z] as number);
    expect(sp).toBeLessThanOrEqual(ZOMBIE_TYPE_SPECS.walker.speedMps * (1 - STRUCTURES.wire.slow) + 1e-5);
    expect(s.zombieWalk[s.cellOf(41, 50)]).toBe(1);
  });

  it('agents standing in cells that become blocked are moved out', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'wall', [60, 40, 60, 48]);
    const z = zombieAt(w, 61, 42);
    pin(w, z, 61, 42);
    finishAll(w);
    run(w, 1);
    expect(s.zombieWalk[s.zombies.cell[z] as number]).toBe(1);
  });
});

describe('gates, mines, charges, towers, depots, demolition', () => {
  it('gates close with zombies within 15 m, block zombies always and humans only while closed', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'gate', [50, 50], Math.PI / 2);
    finishAll(w);
    const i = slots(w)[0] as number;
    const cells = [...s.structures.cellsOf(i)];
    run(w, STRUCTURE_RULES.gateCheckTicks);
    expect(w.structures()[0]?.flag).toBe(true);
    for (const c of cells) {
      expect(s.zombieWalk[c]).toBe(0);
      expect(s.civWalk[c]).toBe(1);
      expect(s.walkable[c]).toBe(1);
    }
    const z = zombieAt(w, 40, 50);
    run(w, STRUCTURE_RULES.gateCheckTicks, () => pin(w, z, 40, 50));
    expect(w.structures()[0]?.flag).toBe(false);
    for (const c of cells) expect(s.civWalk[c]).toBe(0);
  });

  it('mine fields fire one charge per zombie contact and vanish when empty', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'mines', [50, 50]);
    finishAll(w);
    const i = slots(w)[0] as number;
    const charges = s.structures.cellCount[i] as number;
    expect(charges).toBe(STRUCTURE_RULES.mines.charges);
    const z = zombieAt(w, 50, 50);
    run(w, 1, () => pin(w, z, 50, 50));
    run(w, 1);
    expect(s.zombies.alive[z]).toBe(0);
    expect(s.structures.cellCount[i]).toBe(charges - 1);
    expect(fxCount(w, FX.mineBlast)).toBe(1);
  });

  it('charges detonate only when armed and destroy structures and zombies in the blast', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'charge', [50, 50]);
    place(w, 'wall', [55, 40, 55, 48]);
    const [c, wall] = slots(w) as [number, number];
    const id = s.structures.id[c] as number;
    send(w, { playerId: 0, type: 'DetonateCharge', payload: { id } });
    expect(s.structures.alive[c]).toBe(1);
    finishAll(w);
    expect(w.structures().find((v) => v.id === id)?.flag).toBe(true);
    const zs = [zombieAt(w, 52, 50), zombieAt(w, 45, 52)];
    run(w, 1);
    send(w, { playerId: 0, type: 'DetonateCharge', payload: { id } });
    expect(s.structures.alive[c]).toBe(0);
    for (const z of zs) expect(s.zombies.alive[z]).toBe(0);
    expect(s.structures.state[wall]).toBe(SS_DESTROYED);
  });

  it('watchtowers extend the range of squads on them', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'watchtower', [20, 50]);
    finishAll(w);
    const u = unitAt(w, 'infantry', 24, 50);
    const far = 24 + UNITS.infantry.rangeM + STRUCTURES.watchtower.sightBonusM - 5;
    const z = zombieAt(w, far, 50, ZT_COLOSSUS);
    run(w, 2 * TICK_RATE, () => pin(w, z, far, 50));
    expect(s.units.rangeBonus[u]).toBe(STRUCTURES.watchtower.sightBonusM);
    expect(s.units.pool.target[u]).toBe(z);
  });

  it('depots resupply ammo within their radius', () => {
    const w = emptyWorld();
    const s = w.s;
    place(w, 'depot', [20, 50]);
    finishAll(w);
    const u = unitAt(w, 'infantry', 40, 50);
    s.units.ammo[u] = 0;
    run(w, 2 * TICK_RATE);
    expect(s.units.ammo[u]).toBeGreaterThan(0);
  });

  it('demolition refunds part of the cost and frees the cells', () => {
    const w = emptyWorld(10_000);
    place(w, 'depot', [50, 50]);
    finishAll(w);
    const s = w.s;
    const i = slots(w)[0] as number;
    const cells = [...s.structures.cellsOf(i)];
    const b = w.counters.budget;
    send(w, { playerId: 0, type: 'DemolishStructure', payload: { id: s.structures.id[i] as number } });
    expect(w.counters.budget).toBe(b + Math.floor(STRUCTURES.depot.cost * STRUCTURE_RULES.demolishRefund));
    for (const c of cells) {
      expect(s.structAt[c]).toBe(-1);
      expect(s.walkable[c]).toBe(1);
    }
    expect(w.structures().length).toBe(0);
    expect(SK.depot).toBeGreaterThan(0);
  });
});
