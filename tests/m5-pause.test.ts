// Regression for the M5 acceptance findings B1/B3: pause must be reversible and surrender must work while paused.
import { describe, expect, it } from 'vitest';
import { SimHost } from '../src/core/sim-host';
import type { ScenarioDef } from '../src/core/types/mission';
import type { WorldOptions } from '../src/core/types/sim';
import { createWorld } from '../src/sim/world';
import { FakeWorld } from './core/fake-world';

const SPEED = (speed: 0 | 1 | 2 | 4) => ({ playerId: 0, type: 'SetGameSpeed', payload: { speed } }) as const;

describe('pause (M5 B1)', () => {
  it('SetGameSpeed 0 then 1 without any tick in between resumes the loop', () => {
    const world = new FakeWorld(1, { size: 'small' });
    const host = new SimHost(1, { size: 'small' }, () => world);
    host.loop.advance(100);
    host.submit(SPEED(0));
    expect(host.loop.speed).toBe(0);
    const before = host.tick;
    expect(host.loop.advance(1000)).toBe(0);
    expect(host.tick).toBe(before);
    host.submit(SPEED(1));
    expect(host.loop.speed).toBe(1);
    expect(host.loop.advance(100)).toBeGreaterThan(0);
    expect(host.tick).toBeGreaterThan(before);
  });

  it('speed 0 then 4 applies the new speed at once; paused commands wait for the next tick', () => {
    const world = new FakeWorld(1, { size: 'small' });
    const host = new SimHost(1, { size: 'small' }, () => world);
    host.submit(SPEED(0));
    host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 1, y: 1, count: 3 } });
    expect(host.loop.advance(500)).toBe(0);
    expect(world.zombieCount).toBe(0);
    host.submit(SPEED(4));
    expect(host.loop.speed).toBe(4);
    host.loop.advance(50);
    expect(world.zombieCount).toBe(3);
  });

  it('the speed command does not change the world hash, with or without pause', () => {
    const run = (pause: boolean): string => {
      const w = new FakeWorld(5, { size: 'small' });
      const h = new SimHost(5, { size: 'small' }, () => w);
      for (let i = 0; i < 50; i++) h.runTick();
      if (pause) {
        h.submit(SPEED(0));
        h.submit(SPEED(1));
      }
      for (let i = 0; i < 50; i++) h.runTick();
      return JSON.stringify(h.hash());
    };
    expect(run(true)).toBe(run(false));
  });
});

describe('surrender while paused (M5 B1)', () => {
  const def: ScenarioDef = {
    id: 'm5-pause',
    textKey: 'scenario.test',
    seed: 31337,
    size: 'small',
    era: 'present',
    faction: 'army',
    pathogen: 'viral',
    patientZeroSite: 'random',
    farmDurationS: 60,
    classicStart: false,
    startResources: { budget: 100_000, material: 1000, ammo: 1500, food: 1500 },
    difficulty: 'normal',
    victory: { kinds: ['hold'], all: false },
  };
  const options: WorldOptions = { size: def.size, scenario: def };

  it('ends the mission with outcome defeat/surrender without the loop running', () => {
    const host = new SimHost(def.seed, options, createWorld);
    for (let i = 0; i < 100; i++) host.runTick();
    host.submit(SPEED(0));
    expect(host.world.mission().outcome).toBeNull();
    host.submit({ playerId: 0, type: 'Surrender', payload: {} });
    const o = host.world.mission().outcome;
    expect(o?.result).toBe('defeat');
    expect(o?.reason).toBe('surrender');
    expect(host.loop.advance(1000)).toBe(0);
  });

  it('a surrender while running behaves the same (outcome set, stays)', () => {
    const host = new SimHost(def.seed, options, createWorld);
    for (let i = 0; i < 100; i++) host.runTick();
    host.submit({ playerId: 0, type: 'Surrender', payload: {} });
    host.runTick();
    host.runTick();
    expect(host.world.mission().outcome?.reason).toBe('surrender');
  });
});
