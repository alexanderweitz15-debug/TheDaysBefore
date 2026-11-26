import { describe, expect, it } from 'vitest';
import { DIR_NONE, DIR_X, DIR_Y, FlowField } from './flow-field';
import { AgentPool } from './pool';
import { CellBuckets, SpatialHash } from './spatial-hash';

/** 20 x 20 open grid with a vertical wall at x = 10 from y = 0 to 15 (gap at the bottom). */
function wallGrid(): { n: number; walkable: Uint8Array } {
  const n = 20;
  const walkable = new Uint8Array(n * n).fill(1);
  for (let y = 0; y < 16; y++) walkable[y * n + 10] = 0;
  return { n, walkable };
}

/** Follows the field from `start` and returns the cell reached (or -1 when stuck or walking into a wall). */
function follow(f: FlowField, n: number, walkable: Uint8Array, start: number): number {
  let c = start;
  for (let step = 0; step < 200; step++) {
    const d = f.dirs[c] as number;
    if (d === DIR_NONE) return c;
    const x = (c % n) + Math.round(DIR_X[d] as number);
    const y = Math.floor(c / n) + Math.round(DIR_Y[d] as number);
    c = y * n + x;
    if (!walkable[c]) return -1;
  }
  return -1;
}

describe('flow field', () => {
  it('leads around walls to the goal', () => {
    const { n, walkable } = wallGrid();
    const f = new FlowField(n, walkable);
    const goal = 2 * n + 15;
    f.start(Int32Array.from([goal]), 1, 1);
    f.advance(Number.POSITIVE_INFINITY);
    expect(f.busy).toBe(false);
    expect(f.dirs[goal]).toBe(DIR_NONE);
    expect(follow(f, n, walkable, 2 * n + 2)).toBe(goal);
    expect(follow(f, n, walkable, 19 * n + 0)).toBe(goal);
    // Wall cells have no direction.
    expect(f.dirs[5 * n + 10]).toBe(DIR_NONE);
  });

  it('budgeted computation equals a one-shot computation and swaps in only when done', () => {
    const { n, walkable } = wallGrid();
    const once = new FlowField(n, walkable);
    once.start(Int32Array.from([0, 399]), 2, 7);
    once.advance(Number.POSITIVE_INFINITY);
    const sliced = new FlowField(n, walkable);
    sliced.start(Int32Array.from([0, 399]), 2, 7);
    let ticks = 0;
    while (sliced.busy) {
      expect(sliced.activeSignature).toBe(-1);
      sliced.advance(37);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(10);
    expect(sliced.activeSignature).toBe(7);
    expect(Array.from(sliced.dirs)).toEqual(Array.from(once.dirs));
  });

  it('marks cells that cannot reach any goal as none', () => {
    const n = 10;
    const walkable = new Uint8Array(n * n).fill(1);
    for (let y = 0; y < n; y++) walkable[y * n + 5] = 0;
    const f = new FlowField(n, walkable);
    f.start(Int32Array.from([0]), 1, 1);
    f.advance(Number.POSITIVE_INFINITY);
    expect(f.dirs[1]).not.toBe(DIR_NONE);
    expect(f.dirs[9]).toBe(DIR_NONE);
  });
});

describe('agent pool', () => {
  it('reuses freed slots (LIFO) and keeps other ids stable', () => {
    const p = new AgentPool(4);
    expect([p.alloc(), p.alloc(), p.alloc()]).toEqual([0, 1, 2]);
    p.posX[2] = 5;
    p.release(1);
    expect(p.count).toBe(2);
    expect(p.alloc()).toBe(1);
    expect(p.alloc()).toBe(3);
    expect(p.alloc()).toBe(-1);
    expect(p.posX[2]).toBe(5);
    expect(p.highWater).toBe(4);
  });
});

describe('spatial structures', () => {
  it('spatial hash buckets agents by 8 m cell and counts windows', () => {
    const p = new AgentPool(8);
    const pts = [
      [1, 1],
      [7, 7],
      [9, 1],
      [30, 30],
    ];
    for (const [x, y] of pts) {
      const i = p.alloc();
      p.posX[i] = x as number;
      p.posY[i] = y as number;
    }
    const h = new SpatialHash(32, 8, 8);
    h.build(p);
    h.buildCounts();
    expect(Array.from(h.items.subarray(h.start[0] as number, h.start[1] as number))).toEqual([0, 1]);
    expect(h.windowCount(0, 0, 1, 0)).toBe(3);
    expect(h.windowCount(0, 0, 3, 3)).toBe(4);
    expect(h.windowCount(2, 2, 2, 2)).toBe(0);
  });

  it('cell buckets copy positions in bucket order', () => {
    const p = new AgentPool(4);
    for (const c of [3, 1, 3]) {
      const i = p.alloc();
      p.cell[i] = c;
      p.posX[i] = i * 10;
    }
    const b = new CellBuckets(4, 4);
    b.build(p);
    expect(Array.from(b.items.subarray(0, 3))).toEqual([1, 0, 2]);
    expect(Array.from(b.x.subarray(0, 3))).toEqual([10, 0, 20]);
    expect(b.start[3]).toBe(1);
    expect(b.start[4]).toBe(3);
  });
});
