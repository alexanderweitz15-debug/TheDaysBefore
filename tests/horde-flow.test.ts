// Core statement of M1: hordes flow through the city towards civilians (GDD 8 rules 1 to 3).
import { describe, expect, it } from 'vitest';
import { ATTACK_REACH_M, CIVILIAN_HP } from '../src/data/zombies/viral-types';
import { CityWorld } from '../src/sim/world';

const CHECK_EVERY = 600;
const TICKS = 3000;
const SPAWN_ZOMBIES = 300;
const SPAWN_CIVILIANS = 150;

/** Mean distance from every zombie to its nearest living civilian, in meters. */
function meanNearestDistance(w: CityWorld): number {
  const z = w.zombies;
  const c = w.civilians;
  let sum = 0;
  for (let i = 0; i < z.highWater; i++) {
    if (!z.alive[i]) continue;
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < c.highWater; j++) {
      if (!c.alive[j]) continue;
      const dx = (c.posX[j] as number) - (z.posX[i] as number);
      const dy = (c.posY[j] as number) - (z.posY[i] as number);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    sum += best;
  }
  return sum / z.count;
}

/** City without residents: one civilian group in the south-east, one zombie group in the north-west. */
function isolatedScenario(seed: number): CityWorld {
  const w = new CityWorld(seed, { size: 'small' });
  for (let i = 0; i < w.civilians.highWater; i++) w.civilians.release(i);
  const cmd = (x: number, y: number, count: number, kind: 'zombie' | 'civilian') =>
    w.applyCommand({ tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x, y, count, kind } });
  cmd(850, 850, SPAWN_CIVILIANS, 'civilian');
  cmd(150, 150, SPAWN_ZOMBIES, 'zombie');
  return w;
}

describe('horde flow (M1: hordes flow through the city)', () => {
  for (const seed of [1, 31337]) {
    it(`seed ${seed}: the mean distance zombie to nearest civilian shrinks steadily`, () => {
      const w = isolatedScenario(seed);
      expect(w.zombieCount).toBe(SPAWN_ZOMBIES);
      expect(w.civilianCount).toBe(SPAWN_CIVILIANS);
      const start = meanNearestDistance(w);
      expect(start).toBeGreaterThan(800);
      const samples = [start];
      for (let t = 0; t < TICKS; t++) {
        w.step(t);
        if ((t + 1) % CHECK_EVERY === 0) samples.push(meanNearestDistance(w));
      }
      // Never grows between checkpoints and ends clearly below the start (walker 0.9 m/s: at most 135 m).
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i] as number).toBeLessThan(samples[i - 1] as number);
      }
      expect(samples[samples.length - 1] as number).toBeLessThan(start * 0.95);
    });
  }

  it('a zombie within sight of a civilian walks up to it (rule 1)', () => {
    const w = new CityWorld(31337, { size: 'small' });
    for (let i = 0; i < w.civilians.highWater; i++) w.civilians.release(i);
    const spawn = (x: number, y: number, kind: 'zombie' | 'civilian') =>
      w.applyCommand({ tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x, y, count: 1, kind } });
    spawn(500, 500, 'civilian');
    // Hold the civilian in place: a long dwell timer keeps the daily routine from moving it.
    for (let i = 0; i < w.civilians.highWater; i++) if (w.civilians.alive[i]) w.routine.timer[i] = 0xffff;
    spawn(512, 500, 'zombie');
    const start = meanNearestDistance(w);
    expect(start).toBeGreaterThan(5);
    expect(start).toBeLessThan(25);
    // The victim flees after the first hit (M2), so check the approach and the hit, not the end state.
    let victim = -1;
    for (let i = 0; i < w.civilians.highWater; i++) if (w.civilians.alive[i]) victim = i;
    let closest = start;
    let hit = false;
    for (let t = 0; t < 400 && !hit; t++) {
      w.step(t);
      if (w.civilians.alive[victim]) closest = Math.min(closest, meanNearestDistance(w));
      hit =
        !w.civilians.alive[victim] ||
        (w.civilians.hp[victim] as number) < CIVILIAN_HP ||
        (w.s.ct.turnTick[victim] as number) >= 0;
    }
    expect(hit).toBe(true);
    expect(closest).toBeLessThanOrEqual(ATTACK_REACH_M + 0.5);
  });

  it('overlapping zombies are pushed apart by separation (rule 4)', () => {
    for (const seed of [31337, 5]) {
      const w = new CityWorld(seed, { size: 'small' });
      for (let i = 0; i < w.civilians.highWater; i++) w.civilians.release(i);
      w.applyCommand({ tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x: 500, y: 500, count: 2 } });
      const z = w.zombies;
      // Put the second zombie 0.2 m beside the first, inside the same map cell.
      z.posX[1] = (z.posX[0] as number) + 0.2;
      z.posY[1] = z.posY[0] as number;
      z.cell[1] = z.cell[0] as number;
      expect(Math.floor((z.posX[1] as number) / 4)).toBe(Math.floor((z.posX[0] as number) / 4));
      const gap = (): number =>
        Math.hypot(
          (z.posX[0] as number) - (z.posX[1] as number),
          (z.posY[0] as number) - (z.posY[1] as number),
        );
      expect(gap()).toBeCloseTo(0.2, 3);
      for (let t = 0; t < 40; t++) w.step(t);
      // Separation distance is two radii (0.7 m), clearly more than the 0.2 m start.
      expect(gap()).toBeGreaterThan(0.6);
    }
  });
});
