import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { runHeadless } from '../../core/headless';
import { TICK_RATE } from '../../core/loop';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { CIVILIAN_MOVEMENT, ENGINE, FLOW_FIELD } from '../../data/agents/horde';
import { DIR_NONE, DIR_X, DIR_Y } from '../horde/flow-field';
import { isWalkable } from '../map/grid';
import { CostFieldSolver } from '../pathing/cost-field';
import { CityWorld, createWorld } from '../world';
import { CATEGORY_MARKET, CIVILIAN_ROUTINE_STATE } from './routine';

const SEED = 31337;
const SMALL = { size: 'small' } as const;

/** Every live civilian sits on a walkable cell matching its position; cell counts match. */
function checkCivilians(w: CityWorld): void {
  const n = w.map.widthCells;
  const c = w.civilians;
  const counts = new Uint16Array(n * n);
  for (let i = 0; i < c.highWater; i++) {
    if (!c.alive[i]) continue;
    const cell =
      Math.floor((c.posY[i] as number) / CELL_SIZE_M) * n + Math.floor((c.posX[i] as number) / CELL_SIZE_M);
    if (c.cell[i] !== cell || !isWalkable(w.map.terrain[cell] as number))
      throw new Error(`civilian ${i} at cell ${cell} (stored ${c.cell[i]})`);
    counts[cell] = (counts[cell] as number) + 1;
  }
  expect(Array.from((w as unknown as { civilianCells: Uint16Array }).civilianCells)).toEqual(
    Array.from(counts),
  );
}

function isDoor(w: CityWorld, f: number, cell: number): boolean {
  const r = w.routine;
  for (let k = r.seedStart[f] as number; k < (r.seedStart[f + 1] as number); k++)
    if (r.seeds[k] === cell) return true;
  return false;
}

describe('cost field solver', () => {
  /** 9 x 9 ground (cost 4) with a road (cost 2) along row 0 and column 8; goal in the bottom-right corner. */
  function roadGrid(): { n: number; walkable: Uint8Array; cost: Uint8Array } {
    const n = 9;
    const walkable = new Uint8Array(n * n).fill(1);
    const cost = new Uint8Array(n * n).fill(4);
    for (let x = 0; x < n; x++) cost[x] = 2;
    for (let y = 0; y < n; y++) cost[y * n + 8] = 2;
    return { n, walkable, cost };
  }

  it('prefers cheap road cells and reaches the goal', () => {
    const { n, walkable, cost } = roadGrid();
    const s = new CostFieldSolver(n, walkable, cost);
    const out = new Uint8Array(n * n);
    const goal = n * n - 1;
    s.start(Int32Array.from([goal]), 0, 1, out, 0);
    s.advance(Number.POSITIVE_INFINITY);
    expect(s.busy).toBe(false);
    expect(out[goal]).toBe(DIR_NONE);
    // From (1, 0) on the road: walk along the road (east), not diagonally across the ground.
    let c = 1;
    const path: number[] = [];
    for (let k = 0; k < 40 && out[c] !== DIR_NONE; k++) {
      const d = out[c] as number;
      c = (Math.floor(c / n) + Math.round(DIR_Y[d] as number)) * n + (c % n) + Math.round(DIR_X[d] as number);
      path.push(c);
    }
    expect(c).toBe(goal);
    expect(path.every((p) => cost[p] === 2)).toBe(true);
  });

  it('budgeted computation equals a one-shot computation', () => {
    const { n, walkable, cost } = roadGrid();
    for (let y = 2; y < 7; y++) walkable[y * n + 4] = 0;
    const once = new Uint8Array(n * n);
    const a = new CostFieldSolver(n, walkable, cost);
    a.start(Int32Array.from([40, 0]), 0, 2, once, 0);
    a.advance(Number.POSITIVE_INFINITY);
    const sliced = new Uint8Array(2 * n * n);
    const b = new CostFieldSolver(n, walkable, cost);
    b.start(Int32Array.from([40, 0]), 0, 2, sliced, n * n);
    let calls = 0;
    while (b.busy) {
      b.advance(5);
      calls++;
    }
    expect(calls).toBeGreaterThan(5);
    expect(Array.from(sliced.subarray(n * n))).toEqual(Array.from(once));
    expect(sliced.subarray(0, n * n).every((v) => v === 0)).toBe(true);
    // Wall cells keep no direction.
    expect(once[3 * n + 4]).toBe(DIR_NONE);
  });
});

describe('civilian routine', () => {
  it('residents get home, work and market fields and stay in the routine state', () => {
    const w = new CityWorld(SEED, SMALL);
    const r = w.routine;
    expect(r.fieldCount).toBeGreaterThan(3);
    const hasMarket = r.fieldCategory.some((cat) => cat === CATEGORY_MARKET);
    for (let i = 0; i < w.civilians.highWater; i++) {
      expect(r.home[i]).toBeGreaterThanOrEqual(0);
      expect(r.work[i]).toBeGreaterThanOrEqual(0);
      // Without a commercial district there is no market; such trips go home instead.
      expect((r.market[i] as number) >= 0).toBe(hasMarket);
    }
    for (let t = 0; t < 400; t++) w.step(t);
    expect(r.ready).toBe(true);
    expect(w.civilians.kind.every((k) => k === CIVILIAN_ROUTINE_STATE)).toBe(true);
  });

  it('civilians never leave walkable cells while commuting', () => {
    const w = new CityWorld(SEED, SMALL);
    for (let t = 0; t < 2400; t++) {
      w.step(t);
      if (t % 200 === 199) checkCivilians(w);
    }
  });

  it('civilians reach their destinations (door cells) and mostly walk on roads', () => {
    const w = new CityWorld(SEED, SMALL);
    const r = w.routine;
    const c = w.civilians;
    const prev = Int16Array.from(r.dest);
    let arrivals = 0;
    let moving = 0;
    let onRoad = 0;
    for (let t = 0; t < 3000; t++) {
      w.step(t);
      for (let i = 0; i < c.highWater; i++) {
        const f = prev[i] as number;
        if (f >= 0 && r.dest[i] === -1) {
          arrivals++;
          expect(isDoor(w, f, c.cell[i] as number)).toBe(true);
        }
        prev[i] = r.dest[i] as number;
        if (t % 100 === 0 && (r.dest[i] as number) >= 0) {
          moving++;
          const tr = w.map.terrain[c.cell[i] as number];
          if (tr === TERRAIN.road || tr === TERRAIN.bridge) onRoad++;
        }
      }
    }
    expect(arrivals).toBeGreaterThan(c.count / 10);
    // Roads are about a quarter of the walkable cells; streams follow them.
    expect(onRoad / moving).toBeGreaterThan(0.6);
  });

  it('same seed gives the same hash with moving civilians', () => {
    const cmds: Command[] = [
      { tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x: 300, y: 300, count: 500 } },
      {
        tick: 30,
        playerId: 0,
        type: 'DebugSpawn',
        payload: { x: 600, y: 500, count: 200, kind: 'civilian' },
      },
    ];
    const a = runHeadless(createWorld, SEED, SMALL, 1500, cmds);
    const b = runHeadless(createWorld, SEED, SMALL, 1500, cmds);
    const c = runHeadless(createWorld, SEED, SMALL, 1499, cmds);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    // Civilians really move: positions change between two late ticks.
    const w = new CityWorld(SEED, SMALL);
    for (let t = 0; t < 1200; t++) w.step(t);
    const before = Float32Array.from(w.civilians.posX);
    w.step(1200);
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== w.civilians.posX[i]) changed++;
    expect(changed).toBeGreaterThan(100);
  });

  it('spawned civilians join the routine and respect the civilian placement density', () => {
    const w = new CityWorld(SEED, SMALL);
    const hw = w.civilians.highWater;
    w.applyCommand({
      tick: 0,
      playerId: 0,
      type: 'DebugSpawn',
      payload: { x: 500, y: 500, count: 600, kind: 'civilian' },
    });
    const r = w.routine;
    const cells = (w as unknown as { civilianCells: Uint16Array }).civilianCells;
    for (let i = hw; i < w.civilians.highWater; i++) {
      expect(r.home[i]).toBeGreaterThanOrEqual(0);
      expect(r.timer[i]).toBeLessThanOrEqual(CIVILIAN_MOVEMENT.dwellMinS * TICK_RATE);
      expect(cells[w.civilians.cell[i] as number]).toBeLessThanOrEqual(CIVILIAN_MOVEMENT.maxPerCell);
    }
    checkCivilians(w);
  });
});

describe('zombie flow goals with commuting civilians', () => {
  it('commuting does not restart the flow field every evaluation', () => {
    const w = new CityWorld(SEED, SMALL);
    const jobs0 = w.flow.jobs;
    const ticks = 3000;
    let busy = 0;
    for (let t = 0; t < ticks; t++) {
      w.step(t);
      if (w.flow.busy) busy++;
    }
    const evaluations = ticks / ENGINE.goalEvalInterval;
    expect(w.flow.jobs - jobs0).toBeLessThan(evaluations / 5);
    expect(busy).toBeLessThan(ticks / 10);
  });

  it('an unchanged goal starts no new field until the refresh interval', () => {
    const w = new CityWorld(SEED, SMALL);
    // Freeze all civilians at home: the goal block set cannot change.
    w.routine.timer.fill(0xffff);
    const jobs0 = w.flow.jobs;
    const sig = w.flow.activeSignature;
    for (let t = 0; t < FLOW_FIELD.goalRefreshTicks; t++) w.step(t);
    expect(w.flow.jobs).toBe(jobs0);
    w.step(FLOW_FIELD.goalRefreshTicks);
    expect(w.flow.jobs).toBe(jobs0 + 1);
    while (w.flow.busy) w.step(FLOW_FIELD.goalRefreshTicks + 1);
    expect(w.flow.activeSignature).toBe(sig);
  });
});
