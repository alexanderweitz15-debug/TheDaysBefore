import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { allocAgents } from '../agents';
import { type WanderParams, wander } from './wander';

const P: WanderParams = { jitterUnits: 163, speedMps: 1.4, dt: 0.05, widthM: 100, heightM: 50 };

describe('wander', () => {
  it('keeps agents inside the bounds and at constant speed', () => {
    const a = allocAgents(500);
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      a.posX[i] = rng.nextFloat() * P.widthM;
      a.posY[i] = rng.nextFloat() * P.heightM;
      a.velX[i] = P.speedMps;
    }
    for (let t = 0; t < 4000; t++) wander(a, 500, rng, P);
    for (let i = 0; i < 500; i++) {
      const x = a.posX[i] as number;
      const y = a.posY[i] as number;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(P.widthM);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(P.heightM);
      expect(Math.hypot(a.velX[i] as number, a.velY[i] as number)).toBeCloseTo(P.speedMps, 5);
    }
  });

  it('reflects at an edge', () => {
    const a = allocAgents(1);
    a.posX[0] = 0.01;
    a.posY[0] = 25;
    a.velX[0] = -P.speedMps;
    wander(a, 1, createRng(1), { ...P, jitterUnits: 0 });
    expect(a.posX[0]).toBeGreaterThan(0);
    expect(a.velX[0]).toBeGreaterThan(0);
  });

  it('only touches agents below count', () => {
    const a = allocAgents(4);
    a.posX[3] = 9;
    wander(a, 3, createRng(1), P);
    expect(a.posX[3]).toBe(9);
    expect(a.velX[3]).toBe(0);
  });
});
