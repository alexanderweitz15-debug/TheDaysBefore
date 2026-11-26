import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import { type HashState, hashU32 } from '../../src/core/hash';
import { runHeadless } from '../../src/core/headless';
import { createRng, type Rng } from '../../src/core/rng';
import type { SimWorld } from '../../src/core/types/sim';

/** Fake world: RNG-driven state plus a spawn counter; records the tick of each applied command. */
class FakeWorld implements SimWorld {
  readonly widthM = 100;
  readonly heightM = 100;
  agentCount = 0;
  readonly appliedAt: { cmdTick: number; stepTick: number }[] = [];
  private readonly rng: Rng;
  private acc = 0;
  private lastStep = -1;

  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  applyCommand(cmd: Command): void {
    // Applied before step(tick), so the pending tick is lastStep + 1.
    this.appliedAt.push({ cmdTick: cmd.tick, stepTick: this.lastStep + 1 });
    if (cmd.type === 'DebugSpawn') this.agentCount += cmd.payload.count;
  }

  step(tick: number): void {
    this.lastStep = tick;
    this.acc = (this.acc + this.rng.nextU32()) >>> 0;
  }

  hash(h: HashState): void {
    hashU32(h, this.acc);
    hashU32(h, this.agentCount);
  }

  writePositions(out: Float32Array): void {
    out.fill(0, 0, this.agentCount * 2);
  }
}

const spawn = (tick: number, playerId: number, count: number): Command => ({
  tick,
  playerId,
  type: 'DebugSpawn',
  payload: { x: 0, y: 0, count },
});

describe('runHeadless', () => {
  it('same seed and commands give the same hash', () => {
    const cmds = [spawn(3, 0, 5), spawn(10, 1, 2)];
    const a = runHeadless((s) => new FakeWorld(s), 7, 50, cmds);
    const b = runHeadless((s) => new FakeWorld(s), 7, 50, cmds);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('different seed gives a different hash', () => {
    const a = runHeadless((s) => new FakeWorld(s), 1, 50);
    const b = runHeadless((s) => new FakeWorld(s), 2, 50);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different commands give a different hash', () => {
    const a = runHeadless((s) => new FakeWorld(s), 1, 50, [spawn(3, 0, 5)]);
    const b = runHeadless((s) => new FakeWorld(s), 1, 50, [spawn(3, 0, 6)]);
    const c = runHeadless((s) => new FakeWorld(s), 1, 50);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });

  it('more ticks change the hash', () => {
    const a = runHeadless((s) => new FakeWorld(s), 1, 50);
    const b = runHeadless((s) => new FakeWorld(s), 1, 51);
    expect(a.hash).not.toBe(b.hash);
  });

  it('input order of commands in the array does not matter for the same ticks and players', () => {
    const a = runHeadless((s) => new FakeWorld(s), 1, 20, [spawn(2, 0, 1), spawn(5, 0, 2)]);
    const b = runHeadless((s) => new FakeWorld(s), 1, 20, [spawn(5, 0, 2), spawn(2, 0, 1)]);
    expect(a.hash).toBe(b.hash);
  });

  it('result.ticks equals the requested tick count and tickMs has one entry per tick', () => {
    const r = runHeadless((s) => new FakeWorld(s), 1, 37);
    expect(r.ticks).toBe(37);
    expect(r.tickMs).toHaveLength(37);
    const zero = runHeadless((s) => new FakeWorld(s), 1, 0);
    expect(zero.ticks).toBe(0);
    expect(zero.tickMs).toEqual([]);
  });

  it('tickMs uses the injected clock (default clock gives zeros)', () => {
    expect(runHeadless((s) => new FakeWorld(s), 1, 3).tickMs).toEqual([0, 0, 0]);
    let t = 0;
    const r = runHeadless(
      (s) => new FakeWorld(s),
      1,
      3,
      [],
      () => {
        t += 2;
        return t;
      },
    );
    expect(r.tickMs).toEqual([2, 2, 2]);
  });

  it('pre-stamped commands are applied at exactly their tick', () => {
    let world!: FakeWorld;
    runHeadless(
      (s) => {
        world = new FakeWorld(s);
        return world;
      },
      1,
      10,
      [spawn(0, 0, 1), spawn(4, 0, 1), spawn(9, 0, 1)],
    );
    expect(world.appliedAt).toEqual([
      { cmdTick: 0, stepTick: 0 },
      { cmdTick: 4, stepTick: 4 },
      { cmdTick: 9, stepTick: 9 },
    ]);
    expect(world.agentCount).toBe(3);
  });

  it('commands beyond the run length are not applied', () => {
    let world!: FakeWorld;
    runHeadless(
      (s) => {
        world = new FakeWorld(s);
        return world;
      },
      1,
      5,
      [spawn(5, 0, 1), spawn(100, 0, 1)],
    );
    expect(world.appliedAt).toEqual([]);
    expect(world.agentCount).toBe(0);
  });
});
