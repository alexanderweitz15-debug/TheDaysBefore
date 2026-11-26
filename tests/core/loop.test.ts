import { describe, expect, it } from 'vitest';
import { FixedStepLoop, MAX_TICKS_PER_ADVANCE, TICK_MS, TICK_RATE } from '../../src/core/loop';

/** Feeds `totalMs` of wall time in chunks of `stepMs` and returns the ticks run. */
function run(speed: number, totalMs: number, stepMs: number): number {
  let ticks = 0;
  const loop = new FixedStepLoop(() => {
    ticks++;
  });
  loop.speed = speed;
  let fed = 0;
  while (fed + stepMs <= totalMs + 1e-9) {
    loop.advance(stepMs);
    fed += stepMs;
  }
  return ticks;
}

describe('FixedStepLoop', () => {
  it('constants: 20 Hz, 50 ms', () => {
    expect(TICK_RATE).toBe(20);
    expect(TICK_MS).toBe(50);
  });

  it('speed 1: 1000 ms = 20 ticks with 50 ms steps', () => {
    expect(run(1, 1000, 50)).toBe(20);
  });

  it('speed 1: 1000 ms = 20 ticks with 16 ms frames (odd steps)', () => {
    // 62 * 16 = 992 ms -> 19 ticks; add remaining 8 ms below.
    let ticks = 0;
    const loop = new FixedStepLoop(() => {
      ticks++;
    });
    for (let i = 0; i < 62; i++) loop.advance(16);
    loop.advance(8);
    expect(ticks).toBe(20);
  });

  it('speed 1: odd frame times stay within one tick of the ideal', () => {
    for (const step of [16.7, 7, 13.3, 33.3, 1]) {
      const ticks = run(1, 1000, step);
      const fed = Math.floor(1000 / step) * step;
      expect(Math.abs(ticks - Math.floor(fed / TICK_MS))).toBeLessThanOrEqual(1);
      expect(ticks).toBeGreaterThanOrEqual(19);
      expect(ticks).toBeLessThanOrEqual(20);
    }
  });

  it('speed 1 with 16.7 ms frames over 60 frames (~1002 ms) gives 20 ticks', () => {
    expect(run(1, 60 * 16.7, 16.7)).toBe(20);
  });

  it('speed 2: 1000 ms = 40 ticks', () => {
    expect(run(2, 1000, 50)).toBe(40);
  });

  it('speed 2 with 16 ms frames lands on 40 ticks (+-1)', () => {
    const ticks = run(2, 1000, 16);
    expect(ticks).toBeGreaterThanOrEqual(39);
    expect(ticks).toBeLessThanOrEqual(40);
  });

  it('speed 0.5 and 0.25 and 4 scale ticks accordingly', () => {
    expect(run(0.5, 1000, 50)).toBe(10);
    expect(run(0.25, 1000, 50)).toBe(5);
    expect(run(4, 1000, 12.5)).toBe(80);
  });

  it('speed 0 runs no ticks and does not bank time', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(() => {
      ticks++;
    });
    loop.speed = 0;
    expect(loop.advance(5000)).toBe(0);
    expect(ticks).toBe(0);
    loop.speed = 1;
    expect(loop.advance(49)).toBe(0);
  });

  it('advance returns the number of ticks run', () => {
    const loop = new FixedStepLoop(() => {});
    expect(loop.advance(120)).toBe(2);
    expect(loop.advance(30)).toBe(1); // 20 ms carry + 30
  });

  it('caps ticks per advance at MAX_TICKS_PER_ADVANCE', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(() => {
      ticks++;
    });
    expect(loop.advance(60_000)).toBe(MAX_TICKS_PER_ADVANCE);
    expect(ticks).toBe(MAX_TICKS_PER_ADVANCE);
  });

  it('after hitting the cap the backlog is dropped (at most one tick carried)', () => {
    const loop = new FixedStepLoop(() => {});
    loop.advance(60_000);
    expect(loop.advance(0)).toBeLessThanOrEqual(1);
    expect(loop.advance(0)).toBe(0);
  });

  it('runTick is called once per counted tick', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(() => {
      ticks++;
    });
    const n = loop.advance(260);
    expect(n).toBe(5);
    expect(ticks).toBe(5);
  });
});
