import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import type { HashState } from '../../src/core/hash';
import { hashU32 } from '../../src/core/hash';
import { SimHost } from '../../src/core/sim-host';
import type { SimWorld } from '../../src/core/types/sim';

/** Minimal world: counts steps, sums spawn counts, records the call order. */
class FakeWorld implements SimWorld {
  readonly widthM = 100;
  readonly heightM = 100;
  agentCount = 0;
  stepsRun = 0;
  readonly calls: string[] = [];
  readonly applied: Command[] = [];

  applyCommand(cmd: Command): void {
    this.calls.push(`apply:${cmd.type}@${cmd.tick}`);
    this.applied.push(cmd);
    if (cmd.type === 'DebugSpawn') this.agentCount += cmd.payload.count;
  }

  step(tick: number): void {
    this.calls.push(`step:${tick}`);
    this.stepsRun++;
  }

  hash(h: HashState): void {
    hashU32(h, this.agentCount);
    hashU32(h, this.stepsRun);
  }

  writePositions(out: Float32Array): void {
    out.fill(0, 0, this.agentCount * 2);
  }
}

function makeHost(seed = 1): { host: SimHost; world: FakeWorld; seeds: number[] } {
  const seeds: number[] = [];
  let world!: FakeWorld;
  const host = new SimHost(seed, (s) => {
    seeds.push(s);
    world = new FakeWorld();
    return world;
  });
  return { host, world, seeds };
}

describe('SimHost', () => {
  it('creates the world with the given seed', () => {
    const { seeds, host } = makeHost(4242);
    expect(seeds).toEqual([4242]);
    expect(host.seed).toBe(4242);
    expect(host.tick).toBe(0);
  });

  it('runTick steps the world with the current tick and increments', () => {
    const { host, world } = makeHost();
    host.runTick();
    host.runTick();
    expect(world.calls).toEqual(['step:0', 'step:1']);
    expect(host.tick).toBe(2);
  });

  it('submit stamps the next tick to run', () => {
    const { host } = makeHost();
    expect(host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 1, y: 1, count: 1 } }).tick).toBe(0);
    host.runTick();
    host.runTick();
    const cmd = host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 1, y: 1, count: 1 } });
    expect(cmd.tick).toBe(2);
  });

  it('submit overrides a tick smuggled into the input', () => {
    const { host } = makeHost();
    host.runTick();
    const input = { playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 1 }, tick: 99 };
    // CommandInput omits tick; extra property at runtime must not win.
    const cmd = host.submit(input as unknown as Parameters<SimHost['submit']>[0]);
    expect(cmd.tick).toBe(1);
  });

  it('applies due commands before step within the same tick', () => {
    const { host, world } = makeHost();
    host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 3 } });
    host.runTick();
    expect(world.calls).toEqual(['apply:DebugSpawn@0', 'step:0']);
    expect(world.agentCount).toBe(3);
  });

  it('command submitted after a tick runs in the following tick only', () => {
    const { host, world } = makeHost();
    host.runTick();
    host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 2 } });
    expect(world.agentCount).toBe(0);
    host.runTick();
    expect(world.calls).toEqual(['step:0', 'apply:DebugSpawn@1', 'step:1']);
  });

  it('applies commands in (playerId, arrival) order', () => {
    const { host, world } = makeHost();
    host.submit({ playerId: 2, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 20 } });
    host.submit({ playerId: 1, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 10 } });
    host.submit({ playerId: 1, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 11 } });
    host.runTick();
    const counts = world.applied.map((c) => (c.type === 'DebugSpawn' ? c.payload.count : -1));
    expect(counts).toEqual([10, 11, 20]);
  });

  it('enqueue accepts pre-stamped future commands and replays them at their tick', () => {
    const { host, world } = makeHost();
    host.enqueue({ tick: 2, playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 5 } });
    host.runTick();
    host.runTick();
    expect(world.agentCount).toBe(0);
    host.runTick();
    expect(world.agentCount).toBe(5);
    expect(world.calls.slice(-2)).toEqual(['apply:DebugSpawn@2', 'step:2']);
  });

  it('SetGameSpeed sets loop.speed and is also forwarded to the world', () => {
    const { host, world } = makeHost();
    expect(host.loop.speed).toBe(1);
    host.submit({ playerId: 0, type: 'SetGameSpeed', payload: { speed: 2 } });
    host.runTick();
    expect(host.loop.speed).toBe(2);
    expect(world.applied.map((c) => c.type)).toEqual(['SetGameSpeed']);
    host.submit({ playerId: 0, type: 'SetGameSpeed', payload: { speed: 0 } });
    host.runTick();
    expect(host.loop.speed).toBe(0);
  });

  it('paused loop (speed 0) stops advancing, resume continues', () => {
    const { host } = makeHost();
    host.submit({ playerId: 0, type: 'SetGameSpeed', payload: { speed: 0 } });
    host.runTick();
    expect(host.loop.advance(1000)).toBe(0);
    expect(host.tick).toBe(1);
    host.loop.speed = 1;
    expect(host.loop.advance(100)).toBe(2);
    expect(host.tick).toBe(3);
  });

  it('loop.advance drives runTick', () => {
    const { host, world } = makeHost();
    expect(host.loop.advance(1000)).toBe(16); // capped, see loop tests
    expect(world.stepsRun).toBe(16);
    expect(host.tick).toBe(16);
  });

  it('hash changes with state and is reproducible for equal state', () => {
    const a = makeHost();
    const b = makeHost();
    expect(a.host.hash().value).toBe(b.host.hash().value);
    const h0 = a.host.hash().value;
    a.host.runTick();
    expect(a.host.hash().value).not.toBe(h0);
    b.host.runTick();
    expect(a.host.hash().value).toBe(b.host.hash().value);
    a.host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 1 } });
    a.host.runTick();
    b.host.runTick();
    expect(a.host.hash().value).not.toBe(b.host.hash().value);
  });

  it('hash() returns a fresh state each call', () => {
    const { host } = makeHost();
    expect(host.hash().value).toBe(host.hash().value);
  });

  it('onTickTimed receives the elapsed time from the injected clock', () => {
    const timings: number[] = [];
    let t = 0;
    const host = new SimHost(
      1,
      () => new FakeWorld(),
      (ms) => timings.push(ms),
      () => {
        t += 3;
        return t;
      },
    );
    host.runTick();
    host.runTick();
    expect(timings).toEqual([3, 3]);
  });

  it('queue log records applied commands', () => {
    const { host } = makeHost();
    host.submit({ playerId: 0, type: 'DebugSpawn', payload: { x: 0, y: 0, count: 1 } });
    host.runTick();
    expect(host.queue.log).toHaveLength(1);
    expect(host.queue.log[0]?.tick).toBe(0);
  });
});
