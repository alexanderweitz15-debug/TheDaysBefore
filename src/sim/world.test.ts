import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { createHash, hashHex } from '../core/hash';
import { runHeadless } from '../core/headless';
import { DUMMY_SIM } from '../data/dev/dummy-sim';
import { createDummyWorld, createWorld } from './world';

const SEED = 12345;
const spawn = (tick: number, x: number, y: number, count: number): Command => ({
  tick,
  playerId: 0,
  type: 'DebugSpawn',
  payload: { x, y, count },
});
const worldHash = (w: { hash: (h: ReturnType<typeof createHash>) => void }): string => {
  const h = createHash();
  w.hash(h);
  return hashHex(h);
};

describe('dummy world', () => {
  it('starts with initialAgents inside the world', () => {
    const w = createWorld(SEED);
    expect(w.widthM).toBe(DUMMY_SIM.widthM);
    expect(w.heightM).toBe(DUMMY_SIM.heightM);
    expect(w.agentCount).toBe(DUMMY_SIM.initialAgents);
  });

  it('same seed and commands give the same hash after 6000 ticks, another seed differs', () => {
    const cmds = [spawn(10, 500, 500, 300), spawn(3000, 1990, 5, 200)];
    const a = runHeadless(createWorld, SEED, 6000, cmds);
    const b = runHeadless(createWorld, SEED, 6000, cmds);
    const c = runHeadless(createWorld, SEED + 1, 6000, cmds);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });

  it('hash changes when the state advances', () => {
    const w = createWorld(SEED);
    const h0 = worldHash(w);
    w.step(0);
    expect(worldHash(w)).not.toBe(h0);
  });

  it('agents stay inside the bounds', () => {
    const w = createDummyWorld(SEED, { ...DUMMY_SIM, widthM: 60, heightM: 40, initialAgents: 1000 });
    w.applyCommand(spawn(0, 0, 0, 500));
    for (let t = 0; t < 2000; t++) w.step(t);
    const out = new Float32Array(2 * w.agentCount);
    w.writePositions(out);
    for (let i = 0; i < w.agentCount; i++) {
      expect(out[2 * i]).toBeGreaterThanOrEqual(0);
      expect(out[2 * i]).toBeLessThanOrEqual(60);
      expect(out[2 * i + 1]).toBeGreaterThanOrEqual(0);
      expect(out[2 * i + 1]).toBeLessThanOrEqual(40);
    }
  });

  it('DebugSpawn adds agents within the spawn radius', () => {
    const w = createWorld(SEED);
    const before = w.agentCount;
    w.applyCommand(spawn(0, 1000, 1000, 250));
    expect(w.agentCount).toBe(before + 250);
    const out = new Float32Array(2 * w.agentCount);
    w.writePositions(out);
    for (let i = before; i < w.agentCount; i++) {
      const d = Math.hypot((out[2 * i] as number) - 1000, (out[2 * i + 1] as number) - 1000);
      expect(d).toBeLessThanOrEqual(DUMMY_SIM.spawnRadiusM + 1e-3);
    }
  });

  it('DebugSpawn is capped at capacity and ignores invalid counts', () => {
    const w = createWorld(SEED);
    w.applyCommand(spawn(0, 10, 10, DUMMY_SIM.capacity * 2));
    expect(w.agentCount).toBe(DUMMY_SIM.capacity);
    w.applyCommand(spawn(0, 10, 10, 5));
    expect(w.agentCount).toBe(DUMMY_SIM.capacity);
    const s = createWorld(SEED);
    s.applyCommand(spawn(0, 10, 10, -3));
    s.applyCommand(spawn(0, Number.NaN, 10, 3));
    expect(s.agentCount).toBe(DUMMY_SIM.initialAgents);
  });

  it('ignores SetGameSpeed', () => {
    const w = createWorld(SEED);
    const h0 = worldHash(w);
    w.applyCommand({ tick: 0, playerId: 0, type: 'SetGameSpeed', payload: { speed: 4 } });
    expect(worldHash(w)).toBe(h0);
  });

  it('keeps its preallocated buffers across ticks and spawns', () => {
    const w = createDummyWorld(SEED, DUMMY_SIM);
    const buffers = [w.agents.posX, w.agents.posY, w.agents.velX, w.agents.velY].map((a) => a.buffer);
    for (let t = 0; t < 100; t++) {
      if (t % 10 === 0) w.applyCommand(spawn(t, 100, 100, 100));
      w.step(t);
    }
    const after = [w.agents.posX, w.agents.posY, w.agents.velX, w.agents.velY].map((a) => a.buffer);
    for (let i = 0; i < after.length; i++) expect(after[i]).toBe(buffers[i]);
  });
});
