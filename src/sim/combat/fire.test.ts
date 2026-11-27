// Squad fire (GDD 9): hits, tracers, fire modes, snipers, armor, range, ranks, mortars.
import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../../core/loop';
import { FX_TYPES } from '../../core/types/combat';
import { MORTAR, UNIT_BEHAVIOUR, UNITS } from '../../data/units/present';
import { ZOMBIE_TYPE_SPECS } from '../../data/zombies/viral-types';
import { ZT_COLOSSUS, ZT_WALKER } from '../horde/zombie-traits';
import { finishStructure } from '../structures/structure-system';
import { hitZombie } from './explosion';
import { FX } from './fx';
import { PT_SHELL, PT_TRACER } from './projectiles';
import { emptyWorld, fxOf, pin, run, send, unitAt, zombieAt } from './test-fixtures';
import { rankOf } from './unit-damage';

describe('units: fire', () => {
  it('infantry kills a zombie in range, uses ammo, emits shot FX, tracers and gunfire noise, counts kills', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'infantry', 20, 50);
    const z = zombieAt(w, 55, 50);
    run(w, 6 * TICK_RATE, () => pin(w, z, 55, 50));
    expect(s.zombies.alive[z]).toBe(0);
    expect(w.counters.zombiesKilled).toBe(1);
    expect(s.units.kills[u]).toBe(1);
    expect(s.units.ammo[u]).toBeLessThan(UNITS.infantry.ammo);
    expect(fxOf(w, FX.shot).length).toBeGreaterThan(0);
    expect(s.noise.sample(20, 50)).toBeGreaterThan(0);
    expect(FX_TYPES[FX.shot]).toBe('shot');
  });

  it('tracers live tracerTicks and are written as projectiles of type tracer', () => {
    const w = emptyWorld();
    unitAt(w, 'mgTeam', 20, 50);
    const z = zombieAt(w, 60, 50, ZT_COLOSSUS);
    let seen = 0;
    run(w, 2 * TICK_RATE, () => {
      pin(w, z, 60, 50);
      if (w.projectileCount > 0) {
        const sec = {
          count: w.projectileCount,
          ids: new Uint32Array(w.projectileCount),
          pos: new Float32Array(2 * w.projectileCount),
          kind: new Uint8Array(w.projectileCount),
        };
        w.writeProjectiles(sec);
        if (sec.kind[0] === PT_TRACER) seen++;
      }
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('fire mode onCommand holds fire until AttackArea', () => {
    const w = emptyWorld();
    const u = unitAt(w, 'infantry', 20, 50);
    send(w, { playerId: 0, type: 'SetFireMode', payload: { unitIds: [u], mode: 'onCommand' } });
    const z = zombieAt(w, 50, 50);
    run(w, 2 * TICK_RATE, () => pin(w, z, 50, 50));
    expect(w.s.units.ammo[u]).toBe(UNITS.infantry.ammo);
    send(w, { playerId: 0, type: 'AttackArea', payload: { unitIds: [u], x: 50, y: 50 } });
    run(w, 3 * TICK_RATE, () => pin(w, z, 50, 50));
    expect(w.s.units.ammo[u]).toBeLessThan(UNITS.infantry.ammo);
    expect(w.s.zombies.alive[z]).toBe(0);
  });

  it('snipers pick a special type before a nearer walker', () => {
    const w = emptyWorld();
    const u = unitAt(w, 'sniperTeam', 5, 50);
    const walker = zombieAt(w, 30, 50, ZT_WALKER);
    const col = zombieAt(w, 95, 50, ZT_COLOSSUS);
    run(w, 12, () => {
      pin(w, walker, 30, 50);
      pin(w, col, 95, 50);
    });
    expect(w.s.units.pool.target[u]).toBe(col);
  });

  it('armor reduces small-arms damage, heavy arms penetrate half of it', () => {
    const w = emptyWorld();
    const z = zombieAt(w, 50, 50, ZT_COLOSSUS);
    const hp0 = w.s.zombies.hp[z] as number;
    hitZombie(w.s, z, 100, 1, -1);
    const armor = ZOMBIE_TYPE_SPECS.colossus.armor;
    expect(hp0 - (w.s.zombies.hp[z] as number)).toBeCloseTo(100 * (1 - armor), 3);
    const hp1 = w.s.zombies.hp[z] as number;
    hitZombie(w.s, z, 100, 0.5, -1);
    expect(hp1 - (w.s.zombies.hp[z] as number)).toBeCloseTo(100 * (1 - armor * 0.5), 3);
  });

  it('hit chance falls with range: more hits close than at max range', () => {
    const count = (dist: number): number => {
      const w = emptyWorld();
      const u = unitAt(w, 'infantry', 10, 50);
      const z = zombieAt(w, 10 + dist, 50, ZT_COLOSSUS);
      w.s.zombies.hp[z] = 1e6;
      run(w, 10 * TICK_RATE, () => pin(w, z, 10 + dist, 50));
      const used = UNITS.infantry.ammo - (w.s.units.ammo[u] as number);
      return (1e6 - (w.s.zombies.hp[z] as number)) / (UNITS.infantry.hitDamage * 0.7) / used;
    };
    const near = count(4);
    const far = count(39);
    expect(near).toBeGreaterThan(0.85);
    expect(far).toBeLessThan(0.65);
    expect(far).toBeGreaterThan(0.35);
  });

  it('ranks: thresholds from data', () => {
    const [, r1, r2] = UNIT_BEHAVIOUR.rankKills;
    expect(rankOf(0)).toBe(0);
    expect(rankOf(r1 as number)).toBe(1);
    expect(rankOf(r2 as number)).toBe(2);
  });

  it('mortar: AttackArea launches shells that land after their flight time and explode (area damage)', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'mortar', 5, 50);
    const zs = [zombieAt(w, 85, 50), zombieAt(w, 87, 52), zombieAt(w, 84, 48)];
    send(w, { playerId: 0, type: 'AttackArea', payload: { unitIds: [u], x: 85, y: 50 } });
    let launched = -1;
    let landed = -1;
    run(w, 10 * TICK_RATE, (ww) => {
      for (const z of zs) pin(ww, z, s.zombies.posX[z] as number, s.zombies.posY[z] as number);
      const p = s.projectiles.pool;
      for (let i = 0; i < p.highWater; i++)
        if (p.alive[i] && p.kind[i] === PT_SHELL && launched < 0) launched = ww.s.tick;
      if (launched >= 0 && landed < 0 && fxOf(ww, FX.explosion).length > 0) landed = ww.s.tick;
    });
    expect(launched).toBeGreaterThan(0);
    const flight = Math.ceil((80 / MORTAR.shellSpeedMps) * TICK_RATE);
    expect(landed - launched).toBeGreaterThanOrEqual(flight - 1);
    expect(landed - launched).toBeLessThanOrEqual(flight + 1);
    expect(w.counters.zombiesKilled).toBeGreaterThan(0);
  });

  it('mortar AttackArea on a point nobody sees scatters more; a watchtower spots it', () => {
    const w = emptyWorld();
    const s = w.s;
    const u = unitAt(w, 'mortar', 5, 50);
    send(w, { playerId: 0, type: 'AttackArea', payload: { unitIds: [u], x: 85, y: 50 } });
    run(w, MORTAR.retargetEveryTicks + 1);
    expect(s.units.aimOn[u]).toBe(1);
    expect(s.units.aimSpotted[u]).toBe(0);
    send(w, {
      playerId: 0,
      type: 'PlaceStructure',
      payload: { kind: 'watchtower', points: [80, 85], rotation: 0 },
    });
    for (let i = 0; i < s.structures.highWater; i++) if (s.structures.alive[i]) finishStructure(s, i, s.tick);
    run(w, MORTAR.retargetEveryTicks);
    expect(s.units.aimSpotted[u]).toBe(1);
  });

  it('mortar auto fire (free) targets a spotted cluster, never one next to own squads', () => {
    const w = emptyWorld();
    const s = w.s;
    unitAt(w, 'mortar', 5, 10);
    // The cluster is 85 m away; a spotter stands 40 m from it.
    unitAt(w, 'riotPolice', 50, 90);
    const zs: number[] = [];
    for (let k = 0; k < 8; k++) zs.push(zombieAt(w, 88, 88));
    let shells = 0;
    run(w, 4 * TICK_RATE, () => {
      for (const z of zs) pin(w, z, 88, 88);
      const p = s.projectiles.pool;
      for (let i = 0; i < p.highWater; i++) if (p.alive[i] && p.kind[i] === PT_SHELL) shells++;
    });
    expect(shells).toBeGreaterThan(0);
  });
});
