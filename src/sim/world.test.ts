import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { createHash, hashHex } from '../core/hash';
import { runHeadless } from '../core/headless';
import { CELL_SIZE_M, TERRAIN } from '../core/types/map';
import type { AgentSection } from '../core/types/snapshot';
import { AGENT_CAPACITY, ZOMBIE_MOVEMENT } from '../data/agents/horde';
import { CITY_SIZES } from '../data/city/generator';
import { DIR_NONE } from './horde/flow-field';
import { isWalkable } from './map/grid';
import { CityWorld, createWorld } from './world';

const SEED = 31337;
const SMALL = { size: 'small' } as const;
const spawn = (tick: number, x: number, y: number, count: number, kind?: 'zombie' | 'civilian'): Command => ({
  tick,
  playerId: 0,
  type: 'DebugSpawn',
  payload: kind ? { x, y, count, kind } : { x, y, count },
});
const worldHash = (w: CityWorld): string => {
  const h = createHash();
  w.hash(h);
  return hashHex(h);
};
const section = (count: number): AgentSection => ({
  count,
  ids: new Uint32Array(count),
  pos: new Float32Array(2 * count),
  kind: new Uint8Array(count),
});

/** Every live zombie sits on a walkable cell matching its position, and no cell exceeds the cap. */
function checkInvariants(w: CityWorld): void {
  const n = w.map.widthCells;
  const z = w.zombies;
  const perCell = new Map<number, number>();
  for (let i = 0; i < z.highWater; i++) {
    if (!z.alive[i]) continue;
    const c =
      Math.floor((z.posY[i] as number) / CELL_SIZE_M) * n + Math.floor((z.posX[i] as number) / CELL_SIZE_M);
    expect(z.cell[i]).toBe(c);
    expect(isWalkable(w.map.terrain[c] as number)).toBe(true);
    perCell.set(c, (perCell.get(c) ?? 0) + 1);
  }
  for (const v of perCell.values()) expect(v).toBeLessThanOrEqual(ZOMBIE_MOVEMENT.maxPerCell);
}

describe('city world', () => {
  it('generates the map of the requested size and places the population', () => {
    const w = new CityWorld(SEED, SMALL);
    expect(w.widthM).toBe(CITY_SIZES.small.sizeM);
    expect(w.heightM).toBe(CITY_SIZES.small.sizeM);
    expect(w.civilianCount).toBe(CITY_SIZES.small.population);
    expect(w.zombieCount).toBe(0);
    expect(w.flow.busy).toBe(false);
  });

  it('same seed and commands give the same hash, another seed differs', () => {
    const cmds = [spawn(0, 200, 200, 800), spawn(50, 700, 600, 600), spawn(60, 500, 500, 50, 'civilian')];
    const a = runHeadless(createWorld, SEED, SMALL, 1200, cmds);
    const b = runHeadless(createWorld, SEED, SMALL, 1200, cmds);
    const c = runHeadless(createWorld, SEED + 1, SMALL, 1200, cmds);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  }, 20_000);

  it('DebugSpawn uses walkable cells only and spreads outwards from full cells', () => {
    const w = new CityWorld(SEED, SMALL);
    // Aim at the middle of a building.
    const b = w.map.buildings;
    const x = ((b.x[0] as number) + (b.w[0] as number) / 2) * CELL_SIZE_M;
    const y = ((b.y[0] as number) + (b.h[0] as number) / 2) * CELL_SIZE_M;
    expect(w.map.terrain[Math.floor(y / 4) * w.map.widthCells + Math.floor(x / 4)]).toBe(TERRAIN.building);
    w.applyCommand(spawn(0, x, y, 1500));
    expect(w.zombieCount).toBe(1500);
    checkInvariants(w);
  });

  it('DebugSpawn is capped at capacity and ignores invalid input and SetGameSpeed', () => {
    const w = new CityWorld(SEED, SMALL);
    const h0 = worldHash(w);
    w.applyCommand(spawn(0, 10, 10, -5));
    w.applyCommand(spawn(0, Number.NaN, 10, 5));
    w.applyCommand({ tick: 0, playerId: 0, type: 'SetGameSpeed', payload: { speed: 2 } });
    expect(worldHash(w)).toBe(h0);
    w.applyCommand(spawn(0, 500, 500, AGENT_CAPACITY.zombies + 5000));
    expect(w.zombieCount).toBe(AGENT_CAPACITY.zombies);
    w.applyCommand(spawn(0, 500, 500, AGENT_CAPACITY.civilians, 'civilian'));
    expect(w.civilianCount).toBe(AGENT_CAPACITY.civilians);
  });

  it('zombies never enter buildings or water and respect the density cap while moving', () => {
    const w = new CityWorld(SEED, SMALL);
    w.applyCommand(spawn(0, 500, 500, 4000));
    w.applyCommand(spawn(0, 100, 900, 2000));
    for (let t = 0; t < 400; t++) w.step(t);
    checkInvariants(w);
  });

  it('a zombie targets the nearest civilian within sight range (rule 1)', () => {
    const w = new CityWorld(SEED, SMALL);
    const z = w.zombies;
    const c = w.civilians;
    let checked = 0;
    for (const [x, y] of [
      [500, 500],
      [300, 650],
      [700, 300],
    ] as const) {
      w.applyCommand(spawn(0, x, y, 1));
      const i = z.highWater - 1;
      let best = -1;
      let bestD = ZOMBIE_MOVEMENT.sightRangeM * ZOMBIE_MOVEMENT.sightRangeM;
      for (let j = 0; j < c.highWater; j++) {
        const dx = (c.posX[j] as number) - (z.posX[i] as number);
        const dy = (c.posY[j] as number) - (z.posY[i] as number);
        if (dx * dx + dy * dy < bestD) {
          bestD = dx * dx + dy * dy;
          best = j;
        }
      }
      // Slot i scans on ticks where (i + tick) % interval === 0.
      w.step(10 - (i % 10));
      expect(z.target[i]).toBe(best);
      if (best >= 0) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('without civilians the flow field leads to the city center', () => {
    const w = new CityWorld(SEED, SMALL);
    for (let i = 0; i < w.civilians.highWater; i++) w.civilians.release(i);
    let t = 0;
    w.step(t++);
    while (w.flow.busy) w.step(t++);
    expect(w.flow.dist[w.centerCell]).toBe(0);
    expect(w.flow.dirs[w.centerCell]).toBe(DIR_NONE);
    // Some walkable cell far away has a direction.
    const n = w.map.widthCells;
    let pointed = 0;
    for (let i = 0; i < n * n; i += 97) if (w.flow.dirs[i] !== DIR_NONE) pointed++;
    expect(pointed).toBeGreaterThan(100);
  });

  it('flow field leads walkers towards civilians over time', () => {
    const w = new CityWorld(SEED, SMALL);
    // Far corner of the map, usually forest: start from a walkable spot near it.
    w.applyCommand(spawn(0, 30, 30, 200));
    const meanDist = (): number => {
      let s = 0;
      for (let i = 0; i < w.zombies.highWater; i++) s += w.flow.dist[w.zombies.cell[i] as number] as number;
      return s / w.zombies.count;
    };
    const before = meanDist();
    for (let t = 0; t < 600; t++) w.step(t);
    expect(meanDist()).toBeLessThan(before * 0.8);
  });

  it('writes snapshot sections with stable slot ids and debug fields', () => {
    const w = new CityWorld(SEED, SMALL);
    w.applyCommand(spawn(0, 500, 500, 300));
    w.step(0);
    const zs = section(w.zombieCount);
    w.writeZombies(zs);
    expect(Array.from(zs.ids.subarray(0, 3))).toEqual([0, 1, 2]);
    expect(zs.pos[2]).toBe(w.zombies.posX[1]);
    const cs = section(w.civilianCount);
    w.writeCivilians(cs);
    expect(cs.ids[cs.count - 1]).toBe(w.civilians.highWater - 1);
    const n = w.map.widthCells;
    const flow = w.debugField('flow');
    expect(flow?.data.length).toBe(n * n);
    const density = w.debugField('density');
    expect(density?.data.reduce((a, b) => a + b, 0)).toBe(300);
  });
});
