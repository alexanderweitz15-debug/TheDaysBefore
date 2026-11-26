import { describe, expect, it } from 'vitest';
import { type Command, CommandQueue } from '../../src/core/commands';

const spawn = (tick: number, playerId: number, count = 1): Command => ({
  tick,
  playerId,
  type: 'DebugSpawn',
  payload: { x: 0, y: 0, count },
});

describe('CommandQueue', () => {
  it('drain returns only due commands and keeps future ones', () => {
    const q = new CommandQueue();
    q.push(spawn(1, 0));
    q.push(spawn(5, 0));
    q.push(spawn(3, 0));
    const due = q.drain(3);
    expect(due.map((c) => c.tick)).toEqual([1, 3]);
    expect(q.size).toBe(1);
    expect(q.drain(4)).toEqual([]);
    expect(q.drain(5).map((c) => c.tick)).toEqual([5]);
    expect(q.size).toBe(0);
  });

  it('drain removes commands, a second drain returns nothing', () => {
    const q = new CommandQueue();
    q.push(spawn(0, 0));
    expect(q.drain(0)).toHaveLength(1);
    expect(q.drain(0)).toHaveLength(0);
  });

  it('sorts by tick, then playerId, then arrival order', () => {
    const q = new CommandQueue();
    q.push(spawn(2, 1, 10)); // arrival 0
    q.push(spawn(1, 5, 11)); // 1
    q.push(spawn(2, 0, 12)); // 2
    q.push(spawn(2, 1, 13)); // 3, same tick+player as arrival 0
    q.push(spawn(1, 2, 14)); // 4
    const counts = q.drain(2).map((c) => (c.type === 'DebugSpawn' ? c.payload.count : -1));
    expect(counts).toEqual([14, 11, 12, 10, 13]);
  });

  it('arrival order is stable across drains (late command keeps its sequence)', () => {
    const q = new CommandQueue();
    q.push(spawn(9, 0, 1));
    q.drain(0);
    q.push(spawn(9, 0, 2));
    q.push(spawn(9, 0, 3));
    const counts = q.drain(9).map((c) => (c.type === 'DebugSpawn' ? c.payload.count : -1));
    expect(counts).toEqual([1, 2, 3]);
  });

  it('log collects drained commands in applied order across drains', () => {
    const q = new CommandQueue();
    q.push(spawn(2, 0, 2));
    q.push(spawn(1, 0, 1));
    q.push(spawn(4, 0, 4));
    q.drain(2);
    expect(q.log.map((c) => c.tick)).toEqual([1, 2]);
    q.drain(4);
    expect(q.log.map((c) => c.tick)).toEqual([1, 2, 4]);
  });

  it('log is not touched when nothing is due', () => {
    const q = new CommandQueue();
    q.push(spawn(10, 0));
    q.drain(0);
    expect(q.log).toHaveLength(0);
  });

  it('overdue commands (tick < current) are still delivered', () => {
    const q = new CommandQueue();
    q.push(spawn(1, 0));
    expect(q.drain(100)).toHaveLength(1);
  });
});
