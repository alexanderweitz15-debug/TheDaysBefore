import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../../src/core/rng';

const take = (seed: number, n: number): number[] => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.nextU32());
};

describe('rng', () => {
  it('same seed gives same sequence', () => {
    expect(take(42, 100)).toEqual(take(42, 100));
  });

  it('different seeds give different sequences', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('seed 0 works and is not stuck', () => {
    const seq = take(0, 20);
    expect(new Set(seq).size).toBeGreaterThan(15);
  });

  it('golden: first 5 nextU32 for seed 12345', () => {
    expect(take(12345, 5)).toEqual([518667457, 440444462, 4232892992, 3757857622, 3939018813]);
  });

  it('nextU32 stays within uint32', () => {
    for (const v of take(7, 1000)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('nextFloat is in [0, 1)', () => {
    const r = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('nextInt respects bounds including negative min', () => {
    const r = createRng(5);
    for (let i = 0; i < 10000; i++) {
      const a = r.nextInt(3, 9);
      expect(a).toBeGreaterThanOrEqual(3);
      expect(a).toBeLessThan(9);
      const b = r.nextInt(-5, 5);
      expect(b).toBeGreaterThanOrEqual(-5);
      expect(b).toBeLessThan(5);
      expect(Number.isInteger(b)).toBe(true);
    }
  });

  it('nextInt hits every value of a small range and is roughly uniform', () => {
    const r = createRng(2024);
    const buckets = new Array<number>(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const k = r.nextInt(0, 10);
      buckets[k] = (buckets[k] as number) + 1;
    }
    for (const c of buckets) {
      expect(c).toBeGreaterThan(n / 10 - 600);
      expect(c).toBeLessThan(n / 10 + 600);
    }
  });

  it('nextFloat mean is near 0.5', () => {
    const r = createRng(31337);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r.nextFloat();
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('getState/setState continues the sequence exactly', () => {
    const r = createRng(777);
    for (let i = 0; i < 50; i++) r.nextU32();
    const state = r.getState();
    const expected = Array.from({ length: 30 }, () => r.nextU32());

    const other = createRng(1);
    other.setState(state);
    expect(Array.from({ length: 30 }, () => other.nextU32())).toEqual(expected);
  });

  it('getState returns a copy', () => {
    const r = createRng(8);
    const s = r.getState();
    const first = createRng(8).nextU32();
    s.fill(0);
    expect(r.nextU32()).toBe(first);
  });

  it('deriveSeed is deterministic and yields distinct streams', () => {
    expect(deriveSeed(100, 3)).toBe(deriveSeed(100, 3));
    const seeds = new Set(Array.from({ length: 64 }, (_, i) => deriveSeed(100, i)));
    expect(seeds.size).toBe(64);
    expect(deriveSeed(100, 0)).not.toBe(deriveSeed(101, 0));
    expect(take(deriveSeed(100, 0), 10)).not.toEqual(take(deriveSeed(100, 1), 10));
  });
});
