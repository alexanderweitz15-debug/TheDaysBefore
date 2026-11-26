import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import { runHeadless } from '../../src/core/headless';
import type { WorldOptions } from '../../src/core/types/sim';
import { createFakeWorld, type FakeWorld } from './fake-world';

const OPTS: WorldOptions = { size: 'small' };

const spawn = (tick: number, playerId: number, count: number): Command => ({
  tick,
  playerId,
  type: 'DebugSpawn',
  payload: { x: 0, y: 0, count },
});

describe('runHeadless', () => {
  it('same seed and commands give the same hash', () => {
    const cmds = [spawn(3, 0, 5), spawn(10, 1, 2)];
    const a = runHeadless(createFakeWorld, 7, OPTS, 50, cmds);
    const b = runHeadless(createFakeWorld, 7, OPTS, 50, cmds);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('different seed gives a different hash', () => {
    const a = runHeadless(createFakeWorld, 1, OPTS, 50);
    const b = runHeadless(createFakeWorld, 2, OPTS, 50);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different commands give a different hash', () => {
    const a = runHeadless(createFakeWorld, 1, OPTS, 50, [spawn(3, 0, 5)]);
    const b = runHeadless(createFakeWorld, 1, OPTS, 50, [spawn(3, 0, 6)]);
    const c = runHeadless(createFakeWorld, 1, OPTS, 50);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });

  it('more ticks change the hash', () => {
    const a = runHeadless(createFakeWorld, 1, OPTS, 50);
    const b = runHeadless(createFakeWorld, 1, OPTS, 51);
    expect(a.hash).not.toBe(b.hash);
  });

  it('input order of commands in the array does not matter for the same ticks and players', () => {
    const a = runHeadless(createFakeWorld, 1, OPTS, 20, [spawn(2, 0, 1), spawn(5, 0, 2)]);
    const b = runHeadless(createFakeWorld, 1, OPTS, 20, [spawn(5, 0, 2), spawn(2, 0, 1)]);
    expect(a.hash).toBe(b.hash);
  });

  it('world options reach createWorld', () => {
    let world!: FakeWorld;
    runHeadless(
      (s, o) => {
        world = createFakeWorld(s, o);
        return world;
      },
      1,
      { size: 'medium' },
      1,
    );
    expect(world.options.size).toBe('medium');
  });

  it('civilian and zombie spawns are counted separately and both affect the hash', () => {
    const z = runHeadless(createFakeWorld, 1, OPTS, 5, [spawn(0, 0, 3)]);
    const c = runHeadless(createFakeWorld, 1, OPTS, 5, [
      { tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 3, kind: 'civilian' } },
    ]);
    expect(z.hash).not.toBe(c.hash);
  });

  it('result.ticks equals the requested tick count and tickMs has one entry per tick', () => {
    const r = runHeadless(createFakeWorld, 1, OPTS, 37);
    expect(r.ticks).toBe(37);
    expect(r.tickMs).toHaveLength(37);
    const zero = runHeadless(createFakeWorld, 1, OPTS, 0);
    expect(zero.ticks).toBe(0);
    expect(zero.tickMs).toEqual([]);
  });

  it('tickMs uses the injected clock (default clock gives zeros)', () => {
    expect(runHeadless(createFakeWorld, 1, OPTS, 3).tickMs).toEqual([0, 0, 0]);
    let t = 0;
    const r = runHeadless(createFakeWorld, 1, OPTS, 3, [], () => {
      t += 2;
      return t;
    });
    expect(r.tickMs).toEqual([2, 2, 2]);
  });

  it('pre-stamped commands are applied at exactly their tick', () => {
    let world!: FakeWorld;
    runHeadless(
      (s, o) => {
        world = createFakeWorld(s, o);
        return world;
      },
      1,
      OPTS,
      10,
      [spawn(0, 0, 1), spawn(4, 0, 1), spawn(9, 0, 1)],
    );
    expect(world.appliedAt).toEqual([
      { cmdTick: 0, stepTick: 0 },
      { cmdTick: 4, stepTick: 4 },
      { cmdTick: 9, stepTick: 9 },
    ]);
    expect(world.zombieCount).toBe(3);
  });

  it('commands beyond the run length are not applied', () => {
    let world!: FakeWorld;
    runHeadless(
      (s, o) => {
        world = createFakeWorld(s, o);
        return world;
      },
      1,
      OPTS,
      5,
      [spawn(5, 0, 1), spawn(100, 0, 1)],
    );
    expect(world.appliedAt).toEqual([]);
    expect(world.zombieCount).toBe(0);
  });
});
