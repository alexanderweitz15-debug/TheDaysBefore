import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { hashHex } from '../src/core/hash';
import { runHeadless } from '../src/core/headless';
import { SimHost } from '../src/core/sim-host';
import { createWorld } from '../src/sim/world';

const TICKS = 6000;
const SEED = 20260101;
/** Small city (1 x 1 km) keeps the 6000-tick runs short. */
const OPTIONS = { size: 'small' } as const;

const spawn = (
  tick: number,
  playerId: number,
  x: number,
  y: number,
  count: number,
  kind: 'zombie' | 'civilian' = 'zombie',
): Command => ({
  tick,
  playerId,
  type: 'DebugSpawn',
  payload: { x, y, count, kind },
});

const speed = (tick: number, speedValue: 0 | 1 | 2 | 4): Command => ({
  tick,
  playerId: 0,
  type: 'SetGameSpeed',
  payload: { speed: speedValue },
});

// About 2000 zombies and 1000 extra civilians on top of the 5000 residents of the small city,
// spread over the map and over time, including the last tick.
const SPAWNS: Command[] = [
  spawn(0, 0, 250, 250, 400),
  spawn(10, 1, 750, 350, 300),
  spawn(10, 0, 100, 900, 200),
  spawn(10, 2, 500, 500, 300, 'civilian'),
  spawn(777, 2, 500, 500, 500),
  spawn(900, 1, 800, 800, 400, 'civilian'),
  spawn(2999, 0, 20, 20, 300),
  spawn(3000, 1, 990, 990, 200),
  spawn(3500, 0, 300, 700, 300, 'civilian'),
  spawn(5999, 0, 500, 10, 10),
];

/** The full 6000-tick reference run, computed once and shared by the tests that compare against it. */
let reference: ReturnType<typeof runHeadless> | undefined;
const fullRun = (): ReturnType<typeof runHeadless> => {
  reference ??= runHeadless(createWorld, SEED, OPTIONS, TICKS, SPAWNS);
  return reference;
};

const SLOW = 60_000;

describe('determinism (GDD section 4)', () => {
  it(
    'same seed and commands give the same hash after 6000 ticks',
    () => {
      const a = fullRun();
      const b = runHeadless(createWorld, SEED, OPTIONS, TICKS, SPAWNS);
      expect(a.ticks).toBe(TICKS);
      expect(a.hash).toBe(b.hash);
    },
    SLOW,
  );

  it('a different seed gives a different hash', () => {
    const a = runHeadless(createWorld, SEED, OPTIONS, 600, SPAWNS);
    const b = runHeadless(createWorld, SEED + 1, OPTIONS, 600, SPAWNS);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different commands give a different hash', () => {
    const a = runHeadless(createWorld, SEED, OPTIONS, 200, SPAWNS);
    const b = runHeadless(
      createWorld,
      SEED,
      OPTIONS,
      200,
      SPAWNS.slice(0, -1).concat(spawn(10, 1, 750, 350, 501)),
    );
    expect(a.hash).not.toBe(b.hash);
  });

  it('command array order does not change the result', () => {
    const a = runHeadless(createWorld, SEED, OPTIONS, 1000, SPAWNS);
    const b = runHeadless(createWorld, SEED, OPTIONS, 1000, [...SPAWNS].reverse());
    expect(a.hash).toBe(b.hash);
  });

  it(
    'one run equals two halves driven through SimHost',
    () => {
      const whole = fullRun();
      const host = new SimHost(SEED, OPTIONS, createWorld);
      for (const cmd of SPAWNS) host.enqueue(cmd);
      for (let i = 0; i < TICKS / 2; i++) host.runTick();
      const mid = hashHex(host.hash());
      for (let i = 0; i < TICKS / 2; i++) host.runTick();

      expect(host.tick).toBe(TICKS);
      expect(hashHex(host.hash())).toBe(whole.hash);
      expect(mid).not.toBe(whole.hash);
    },
    SLOW,
  );

  it('SetGameSpeed commands do not change the world state', () => {
    const speeds = [speed(5, 2), speed(100, 0), speed(101, 4), speed(2000, 1)];
    const plain = runHeadless(createWorld, SEED, OPTIONS, 1500, SPAWNS);
    const withSpeed = runHeadless(createWorld, SEED, OPTIONS, 1500, [...SPAWNS, ...speeds]);
    expect(withSpeed.hash).toBe(plain.hash);
  });
});
