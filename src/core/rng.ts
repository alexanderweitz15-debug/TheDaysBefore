// xoshiro128** seeded via splitmix32. The only randomness source allowed in src/sim and src/ai.

export interface Rng {
  /** Uniform uint32. */
  nextU32(): number;
  /** Uniform float in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [min, maxExclusive). */
  nextInt(min: number, maxExclusive: number): number;
  /** Copy of the internal state, for save games and hashing. */
  getState(): Uint32Array;
  setState(state: Uint32Array): void;
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

export function createRng(seed: number): Rng {
  const s = new Uint32Array(4);
  const mix = splitmix32(seed);
  for (let i = 0; i < 4; i++) s[i] = mix();
  if (s.every((v) => v === 0)) s[0] = 1;

  const nextU32 = (): number => {
    const s0 = s[0] as number;
    const s1 = s[1] as number;
    const s2 = s[2] as number;
    const s3 = s[3] as number;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    const n2 = (s2 ^ s0) >>> 0;
    const n3 = (s3 ^ s1) >>> 0;
    s[1] = s1 ^ n2;
    s[0] = s0 ^ n3;
    s[2] = n2 ^ t;
    s[3] = rotl(n3, 11);
    return result;
  };

  return {
    nextU32,
    nextFloat: () => nextU32() / 4294967296,
    nextInt: (min, maxExclusive) => min + Math.floor((nextU32() / 4294967296) * (maxExclusive - min)),
    getState: () => s.slice(),
    setState: (state) => s.set(state),
  };
}

/** Derives an independent stream (e.g. one per bot) from a base seed and a stream id. */
export function deriveSeed(baseSeed: number, streamId: number): number {
  return splitmix32((baseSeed ^ Math.imul(streamId + 1, 0x27d4eb2d)) >>> 0)();
}
