import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { hashHex } from '../src/core/hash';
import { runHeadless } from '../src/core/headless';
import { SimHost } from '../src/core/sim-host';
import { createWorld } from '../src/sim/world';

const TICKS = 6000;
const SEED = 20260101;

const spawn = (tick: number, playerId: number, x: number, y: number, count: number): Command => ({
  tick,
  playerId,
  type: 'DebugSpawn',
  payload: { x, y, count },
});

const speed = (tick: number, speedValue: 0 | 1 | 2 | 4): Command => ({
  tick,
  playerId: 0,
  type: 'SetGameSpeed',
  payload: { speed: speedValue },
});

const SPAWNS: Command[] = [
  spawn(0, 0, 500, 500, 200),
  spawn(10, 1, 1500, 700, 300),
  spawn(10, 0, 100, 1900, 50),
  spawn(777, 2, 1000, 1000, 400),
  spawn(2999, 0, 20, 20, 25),
  spawn(3000, 1, 1990, 1990, 25),
  spawn(5999, 0, 1000, 10, 10),
];

describe('determinism (GDD section 4)', () => {
  it('same seed and commands give the same hash after 6000 ticks', () => {
    const a = runHeadless(createWorld, SEED, TICKS, SPAWNS);
    const b = runHeadless(createWorld, SEED, TICKS, SPAWNS);
    expect(a.ticks).toBe(TICKS);
    expect(a.hash).toBe(b.hash);
  });

  it('a different seed gives a different hash', () => {
    const a = runHeadless(createWorld, SEED, TICKS, SPAWNS);
    const b = runHeadless(createWorld, SEED + 1, TICKS, SPAWNS);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different commands give a different hash', () => {
    const a = runHeadless(createWorld, SEED, 200, SPAWNS);
    const b = runHeadless(createWorld, SEED, 200, SPAWNS.slice(0, -1).concat(spawn(10, 1, 1500, 700, 301)));
    expect(a.hash).not.toBe(b.hash);
  });

  it('command array order does not change the result', () => {
    const a = runHeadless(createWorld, SEED, 1000, SPAWNS);
    const b = runHeadless(createWorld, SEED, 1000, [...SPAWNS].reverse());
    expect(a.hash).toBe(b.hash);
  });

  it('one run equals two halves driven through SimHost', () => {
    const whole = runHeadless(createWorld, SEED, TICKS, SPAWNS);

    const host = new SimHost(SEED, createWorld);
    for (const cmd of SPAWNS) host.enqueue(cmd);
    for (let i = 0; i < TICKS / 2; i++) host.runTick();
    const mid = hashHex(host.hash());
    for (let i = 0; i < TICKS / 2; i++) host.runTick();

    expect(host.tick).toBe(TICKS);
    expect(hashHex(host.hash())).toBe(whole.hash);
    expect(mid).not.toBe(whole.hash);
  });

  it('SetGameSpeed commands do not change the world state', () => {
    const speeds = [speed(5, 2), speed(100, 0), speed(101, 4), speed(2000, 1)];
    const plain = runHeadless(createWorld, SEED, 2500, SPAWNS);
    const withSpeed = runHeadless(createWorld, SEED, 2500, [...SPAWNS, ...speeds]);
    expect(withSpeed.hash).toBe(plain.hash);
  });
});
