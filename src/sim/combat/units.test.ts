// Squads (GDD 9): placement, movement, suppression, morale, stances, bites, collateral, determinism.
import { describe, expect, it } from 'vitest';
import { createHash } from '../../core/hash';
import { TICK_RATE } from '../../core/loop';
import { ECONOMY_M3, UNIT_BEHAVIOUR, UNITS } from '../../data/units/present';
import { ZOMBIE_TYPE_SPECS } from '../../data/zombies/viral-types';
import { ZT_COLOSSUS } from '../horde/zombie-traits';
import { CityWorld } from '../world';
import { placeCivilians } from '../world-setup';
import { emptyWorld, pin, run, SEED, send, unitAt, zombieAt } from './test-fixtures';
import { damageUnit, infectMember } from './unit-damage';
import { ST_RETREAT } from './units';

describe('units: placement, budget, views', () => {
  it('PlaceUnit buys at cost and refuses without budget; startBudget overrides the data value', () => {
    expect(new CityWorld(SEED, { size: 'small' }).counters.budget).toBe(ECONOMY_M3.startBudget);
    const w = emptyWorld(700);
    send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'infantry', x: 50, y: 50 } });
    expect(w.unitCount).toBe(1);
    expect(w.counters.budget).toBe(700 - UNITS.infantry.cost);
    send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'mortar', x: 50, y: 50 } });
    expect(w.unitCount).toBe(1);
    const v = w.units()[0];
    expect(v).toMatchObject({
      type: 'infantry',
      members: 8,
      hp: 1,
      ammo: 1,
      stance: 'hold',
      fireMode: 'free',
    });
    const sec = { count: 1, ids: new Uint32Array(1), pos: new Float32Array(2), kind: new Uint8Array(1) };
    w.writeUnits(sec);
    expect(sec.ids[0]).toBe(v?.id);
    expect(sec.kind[0]).toBe(0);
  });
});

describe('units: placement refusals', () => {
  it('PlaceUnit off the map or on a non-walkable cell is refused without spending budget', () => {
    const w = emptyWorld(10_000);
    const s = w.s;
    const n = s.n;
    let blocked = -1;
    for (let c = 0; c < s.cells && blocked < 0; c++) if (!s.walkable[c]) blocked = c;
    expect(blocked).toBeGreaterThanOrEqual(0);
    const bx = ((blocked % n) + 0.5) * s.cellM;
    const by = (Math.floor(blocked / n) + 0.5) * s.cellM;
    for (const [x, y] of [
      [-50, 50],
      [50, 1e9],
      [s.sizeM, 50],
      [50, -0.1],
      [bx, by],
    ] as const)
      send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'infantry', x, y } });
    expect(w.unitCount).toBe(0);
    expect(w.counters.budget).toBe(10_000);
    // Control: the same order on open ground buys the squad exactly there.
    send(w, { playerId: 0, type: 'PlaceUnit', payload: { unitType: 'infantry', x: 50, y: 50 } });
    expect(w.unitCount).toBe(1);
    expect(w.counters.budget).toBe(10_000 - UNITS.infantry.cost);
  });
});

describe('units: movement and paths', () => {
  it('MoveUnits follows an A* path around buildings and never enters blocked cells', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'infantry', 50, 50);
    // Far goal across the city.
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: [u], x: 500, y: 500, append: false, facing: null },
    });
    let bad = 0;
    run(w, 20 * TICK_RATE * 30, () => {
      if (!s.walkable[s.units.pool.cell[u] as number]) bad++;
    });
    expect(bad).toBe(0);
    const p = s.units.pool;
    // The goal snaps to the nearest walkable cell; the squad ends within a cell or two of the point.
    const d = Math.hypot((p.posX[u] as number) - 500, (p.posY[u] as number) - 500);
    expect(d).toBeLessThan(12);
    expect(s.planner.finished).toBeGreaterThan(0);
  });

  it('append queues waypoints; the squad visits them in order', () => {
    const w = emptyWorld();
    const u = unitAt(w, 'infantry', 10, 10);
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: [u], x: 80, y: 10, append: false, facing: null },
    });
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: [u], x: 80, y: 80, append: true, facing: null },
    });
    const p = w.s.units.pool;
    let reachedFirst = -1;
    run(w, 120 * TICK_RATE, (ww) => {
      if (reachedFirst < 0 && Math.hypot((p.posX[u] as number) - 80, (p.posY[u] as number) - 10) < 1)
        reachedFirst = ww.s.tick;
    });
    expect(reachedFirst).toBeGreaterThan(0);
    expect(Math.hypot((p.posX[u] as number) - 80, (p.posY[u] as number) - 80)).toBeLessThan(1);
    expect(w.units()[0]?.target).toBeNull();
  });

  it('group moves spread squads on a grid around the point', () => {
    const w = emptyWorld();
    const ids = [unitAt(w, 'infantry', 20, 20), unitAt(w, 'infantry', 22, 20), unitAt(w, 'infantry', 24, 20)];
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: ids, x: 60, y: 60, append: false, facing: null },
    });
    run(w, 60 * TICK_RATE);
    const p = w.s.units.pool;
    const [a, b] = ids as [number, number];
    const d01 = Math.hypot(
      (p.posX[a] as number) - (p.posX[b] as number),
      (p.posY[a] as number) - (p.posY[b] as number),
    );
    expect(d01).toBeGreaterThan(UNIT_BEHAVIOUR.formationSpacingM * 0.9);
  });
});

describe('units: suppression, morale, stances', () => {
  it('MG fire suppresses zombies in its cone (-30 % speed)', () => {
    const w = emptyWorld();
    const s = w.s;
    unitAt(w, 'mgTeam', 10, 50);
    const z = zombieAt(w, 60, 50, ZT_COLOSSUS);
    s.zombies.hp[z] = 1e6;
    run(w, TICK_RATE, () => pin(w, z, 60, 50));
    expect(s.suppressUntil[s.cellOf(40, 50)]).toBeGreaterThan(s.tick);
    expect(s.suppressUntil[s.cellOf(40, 90)]).toBeLessThanOrEqual(s.tick);
    // A walker inside the cone moves slower than its type speed.
    const v = zombieAt(w, 45, 50);
    run(w, 2);
    const sp = Math.hypot(s.zombies.velX[v] as number, s.zombies.velY[v] as number);
    expect(sp).toBeLessThanOrEqual(ZOMBIE_TYPE_SPECS.walker.speedMps * (1 - UNITS.mgTeam.suppression) + 1e-6);
  });

  it('losses cost morale; holdUntilLosses retreats at 50 % strength to the nearest rally point', () => {
    const w = emptyWorld();
    const s = w.s;
    send(w, { playerId: 0, type: 'SetRallyPoint', payload: { x: 90, y: 90 } });
    const u = unitAt(w, 'infantry', 20, 20);
    send(w, { playerId: 0, type: 'SetStance', payload: { unitIds: [u], stance: 'holdUntilLosses' } });
    damageUnit(s, u, 2 * UNITS.infantry.hpPerMember, false);
    expect(s.units.members[u]).toBe(6);
    expect(w.counters.soldiersLost).toBe(2);
    expect(s.units.morale[u]).toBeCloseTo(1 - 2 * UNIT_BEHAVIOUR.moraleLossPerMember, 5);
    damageUnit(s, u, 2 * UNITS.infantry.hpPerMember, false);
    run(w, 1);
    expect(s.units.stance[u]).toBe(ST_RETREAT);
    run(w, 90 * TICK_RATE);
    const p = s.units.pool;
    expect(Math.hypot((p.posX[u] as number) - 90, (p.posY[u] as number) - 90)).toBeLessThan(1);
  });

  it('colossi nearby lower morale; broken squads retreat on their own and ignore orders', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'medics', 20, 50);
    s.units.morale[u] = UNIT_BEHAVIOUR.moraleBreakThreshold + 0.01;
    const c = zombieAt(w, 40, 50, ZT_COLOSSUS);
    run(w, 2 * TICK_RATE, () => pin(w, c, 40, 50));
    expect(s.units.broken[u]).toBe(1);
    send(w, {
      playerId: 0,
      type: 'MoveUnits',
      payload: { unitIds: [u], x: 80, y: 80, append: false, facing: null },
    });
    expect(s.units.goalX[u]).not.toBe(80);
  });

  it('aggressive squads close in on zombies out of range', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'riotPolice', 10, 50);
    send(w, { playerId: 0, type: 'SetStance', payload: { unitIds: [u], stance: 'aggressive' } });
    const z = zombieAt(w, 80, 50, ZT_COLOSSUS);
    s.zombies.hp[z] = 1e6;
    run(w, 50 * TICK_RATE, () => pin(w, z, 80, 50));
    expect(80 - (s.units.pool.posX[u] as number)).toBeLessThanOrEqual(UNITS.riotPolice.rangeM);
    expect(s.units.ammo[u]).toBeLessThan(UNITS.riotPolice.ammo);
  });

  it('cover next to buildings halves damage', () => {
    const w = emptyWorld();
    const s = w.s;
    // Find a walkable cell next to a building.
    const n = s.n;
    let cell = -1;
    for (let c = n + 1; c < s.cells - n - 1 && cell < 0; c++)
      if (s.walkable[c] && s.map.terrain[c + 1] === 3 && s.walkable[c - 1]) cell = c;
    const u = unitAt(w, 'infantry', ((cell % n) + 0.5) * 4, (Math.floor(cell / n) + 0.5) * 4);
    expect(s.units.cover[u]).toBe(1);
    damageUnit(s, u, 100, false);
    expect(s.units.pool.hp[u]).toBeCloseTo(800 - 100 * (1 - UNIT_BEHAVIOUR.coverDamageReduction), 3);
  });

  it('medics heal nearby squads up to their living members', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'infantry', 50, 50);
    unitAt(w, 'medics', 55, 50);
    s.units.pool.hp[u] = 750;
    run(w, 3 * TICK_RATE);
    expect(s.units.pool.hp[u]).toBeGreaterThan(750);
    expect(s.units.pool.hp[u]).toBeLessThanOrEqual(800);
  });
});

describe('units: zombies attack soldiers', () => {
  it('zombies chase and hit squads; bitten members turn, colossi preferred', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'medics', 50, 50);
    const z = zombieAt(w, 60, 50);
    run(w, 15 * TICK_RATE);
    expect(s.zt.unitTarget[z] === u || !s.zombies.alive[z]).toBe(true);
    expect(s.units.pool.hp[u]).toBeLessThan(4 * UNITS.medics.hpPerMember);
    // Infection: members turn after incubation, preferring colossi.
    const w2 = emptyWorld();
    const s2 = w2.s;
    const v = unitAt(w2, 'infantry', 50, 50);
    for (let k = 0; k < 8; k++) infectMember(s2, v);
    expect(s2.units.infCount[v]).toBe(8);
    const z0 = s2.zombies.count;
    run(w2, 35 * TICK_RATE);
    expect(s2.units.pool.alive[v]).toBe(0);
    expect(w2.counters.soldiersLost).toBe(8);
    expect(s2.zombies.count - z0).toBeGreaterThanOrEqual(1);
  });

  it('soldiers turn into colossi more often than civilians', () => {
    let colossi = 0;
    let total = 0;
    const w = emptyWorld();
    const s = w.s;
    for (let k = 0; k < 20; k++) {
      const v = unitAt(w, 'infantry', 10 + (k % 5) * 18, 10 + Math.floor(k / 5) * 20);
      send(w, { playerId: 0, type: 'SetFireMode', payload: { unitIds: [v], mode: 'onCommand' } });
      for (let m = 0; m < 8; m++) infectMember(s, v);
    }
    const before = s.zombies.highWater;
    run(w, 35 * TICK_RATE);
    for (let i = before; i < s.zombies.highWater; i++) {
      if (!s.zombies.alive[i]) continue;
      total++;
      if (s.zombies.kind[i] === ZT_COLOSSUS) colossi++;
    }
    // Turned members attack their own squad, so not every bitten soldier gets to turn.
    expect(total).toBeGreaterThan(40);
    expect(colossi / total).toBeGreaterThan(UNIT_BEHAVIOUR.soldierColossusChance * 0.6);
  });
});

describe('A3 collateral', () => {
  it('area fire kills civilians in the blast and counts them as collateral; corpses do not rise', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'mortar', 5, 50);
    placeCivilians(s, 85, 50, 12, 10_000);
    send(w, { playerId: 0, type: 'AttackArea', payload: { unitIds: [u], x: 85, y: 50 } });
    run(w, 10 * TICK_RATE);
    expect(w.counters.collateralKills).toBeGreaterThan(0);
    expect(w.counters.civiliansDead).toBe(w.counters.collateralKills);
    for (let k = 0; k < s.corpses.pool.highWater; k++)
      if (s.corpses.pool.alive[k]) expect(s.corpses.riseTick[k]).toBe(-1);
    expect(s.units.morale[u]).toBeLessThan(1);
  });
});

describe('determinism', () => {
  it('same seed and commands give the same hash with units, fire and structures', () => {
    const play = (): number => {
      const w = emptyWorld();
      const a = unitAt(w, 'infantry', 20, 50);
      unitAt(w, 'mortar', 5, 20);
      unitAt(w, 'engineers', 40, 40);
      for (let k = 0; k < 30; k++) zombieAt(w, 80, 30 + k);
      send(w, {
        playerId: 0,
        type: 'PlaceStructure',
        payload: { kind: 'wall', points: [60, 20, 60, 80], rotation: 0 },
      });
      send(w, {
        playerId: 0,
        type: 'MoveUnits',
        payload: { unitIds: [a], x: 40, y: 60, append: false, facing: null },
      });
      run(w, 20 * TICK_RATE);
      const h = createHash();
      w.hash(h);
      return h.value;
    };
    expect(play()).toBe(play());
  });
});
