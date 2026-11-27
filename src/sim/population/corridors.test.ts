// Corridor scenarios and deterministic flight (GDD 7). Heavy: runs in the slow project.
import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { runHeadless } from '../../core/headless';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { SAFETY_FIELD, ZONES } from '../../data/agents/civilians';
import { DIR_NONE } from '../horde/flow-field';
import { killZombie } from '../horde/zombie-traits';
import { CityWorld, createWorld } from '../world';
import {
  countKind,
  emptyWorld,
  place,
  roadNear,
  SEED,
  SMALL,
  settleSafety,
  stepCell,
} from './civilian-fixtures';
import { CS_ALERTED, CS_SHELTERED } from './civilian-traits';
import { ZK_CORRIDOR, ZK_RALLY } from './zones';

describe('zones and flight', () => {
  it('a corridor raises arrivals in a distant zone (small scenario, same seed)', () => {
    const run = (corridor: boolean): { sheltered: number; meanTick: number } => {
      const w = emptyWorld();
      const s = w.s;
      const goal = roadNear(s, 500, 500);
      s.zones.add(s, ZK_RALLY, [goal.x, goal.y]);
      let t = settleSafety(w, 0);
      // Start beyond the zone's guidance range; the corridor follows the field's own route.
      const start = roadNear(s, 500 + SAFETY_FIELD.zoneGuidanceRangeM + 120, 500 + 60);
      if (corridor) {
        const pts: number[] = [];
        const n = s.n;
        let c = start.cell;
        for (let k = 0; s.safety.dirs[c] !== DIR_NONE && k < 4 * n; k++) {
          if (k % 8 === 0) pts.push(((c % n) + 0.5) * CELL_SIZE_M, (Math.floor(c / n) + 0.5) * CELL_SIZE_M);
          c = stepCell(c, s.safety.dirs[c] as number, n);
        }
        pts.push(goal.x, goal.y);
        s.zones.add(s, ZK_CORRIDOR, pts.slice(0, 2 * ZONES.maxCorridorPoints));
        t = settleSafety(w, t + 1);
      }
      place(w, start.x, start.y, 60, CS_ALERTED);
      let sum = 0;
      let last = 0;
      for (let k = 0; k < 6000; k++) {
        w.step(++t);
        const sh = w.counters.sheltered;
        sum += (sh - last) * k;
        last = sh;
      }
      return { sheltered: last, meanTick: last > 0 ? sum / last : Number.POSITIVE_INFINITY };
    };
    const without = run(false);
    const withCorridor = run(true);
    expect(withCorridor.sheltered).toBeGreaterThan(without.sheltered + 20);
    expect(withCorridor.meanTick).toBeLessThan(without.meanTick);
  });

  it('with residents: a corridor from a residential quarter to a distant zone rescues at least 20 % more (2 seeds)', () => {
    const run = (seed: number, corridor: boolean): number => {
      const w = new CityWorld(seed, SMALL);
      const s = w.s;
      // Zone on the most built-up 100 m block (capacity is no bottleneck).
      const Z = 25;
      let zb = 0;
      let zbest = -1;
      for (let by = 1; by < s.n / Z - 1; by++)
        for (let bx = 1; bx < s.n / Z - 1; bx++) {
          let k = 0;
          let open = 0;
          for (let y = by * Z; y < (by + 1) * Z; y++)
            for (let x = bx * Z; x < (bx + 1) * Z; x++) {
              if (s.map.terrain[y * s.n + x] === TERRAIN.building) k++;
              if (s.walkable[y * s.n + x]) open++;
            }
          // Enough streets inside for civilians to enter.
          if (open >= (Z * Z) / 4 && k > zbest) {
            zbest = k;
            zb = by * 1000 + bx;
          }
        }
      const zx = ((zb % 1000) + 0.5) * Z * CELL_SIZE_M;
      const zy = (Math.floor(zb / 1000) + 0.5) * Z * CELL_SIZE_M;
      // Densest 64 m block of residents 260..360 m from the zone (beyond the zone's guidance range).
      const B = 64;
      const side = Math.ceil(s.sizeM / B);
      const per = new Int32Array(side * side);
      for (let i = 0; i < s.civilians.highWater; i++) {
        if (!s.civilians.alive[i]) continue;
        const bx = Math.floor((s.civilians.posX[i] as number) / B);
        const by = Math.floor((s.civilians.posY[i] as number) / B);
        per[by * side + bx] = (per[by * side + bx] as number) + 1;
      }
      let best = -1;
      for (let b = 0; b < per.length; b++) {
        const d = Math.hypot(((b % side) + 0.5) * B - zx, (Math.floor(b / side) + 0.5) * B - zy);
        if (d >= 260 && d <= 360 && (best < 0 || (per[b] as number) > (per[best] as number))) best = b;
      }
      const qx = ((best % side) + 0.5) * B;
      const qy = (Math.floor(best / side) + 0.5) * B;
      const cmds: Command[] = [
        // Only the city alarm: patient zero is removed right after the start (no spread).
        { tick: 0, playerId: 0, type: 'StartOutbreak', payload: { x: s.sizeM - 60, y: 60, family: 'viral' } },
        {
          tick: 0,
          playerId: 0,
          type: 'PlaceSafeZone',
          payload: { x0: zx - 50, y0: zy - 50, x1: zx + 50, y1: zy + 50 },
        },
      ];
      if (corridor)
        cmds.push({ tick: 0, playerId: 0, type: 'DrawCorridor', payload: { points: [qx, qy, zx, zy] } });
      for (const c of cmds) w.applyCommand(c);
      killZombie(s, s.outbreak.pzSlot);
      for (let t = 0; t < 12_000; t++) w.step(t);
      expect(w.zones()[0]?.occupants).toBeLessThan(w.zones()[0]?.capacity ?? 0);
      return w.counters.sheltered;
    };
    for (const seed of [11, 22]) {
      const without = run(seed, false);
      const withCorridor = run(seed, true);
      expect(without).toBeGreaterThan(0);
      expect(withCorridor).toBeGreaterThanOrEqual(without * 1.2);
    }
  }, 120_000);
});

describe('civilian flight runs deterministically', () => {
  it('outbreak with zones and corridor: same hash; counters match the agents', () => {
    const cmds: Command[] = [
      { tick: 0, playerId: 0, type: 'StartOutbreak', payload: { x: 500, y: 500, family: 'viral' } },
      { tick: 0, playerId: 0, type: 'PlaceSafeZone', payload: { x0: 640, y0: 640, x1: 760, y1: 760 } },
      { tick: 10, playerId: 0, type: 'SetRallyPoint', payload: { x: 250, y: 700 } },
      { tick: 20, playerId: 0, type: 'DrawCorridor', payload: { points: [500, 500, 700, 700] } },
    ];
    const a = runHeadless(createWorld, SEED, SMALL, 1500, cmds);
    const b = runHeadless(createWorld, SEED, SMALL, 1500, cmds);
    const c = runHeadless(createWorld, SEED, SMALL, 1500, cmds.slice(0, 2));
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    const w = new CityWorld(SEED, SMALL);
    for (const cmd of cmds) w.applyCommand(cmd);
    for (let t = 0; t < 1500; t++) w.step(t);
    const s = w.s;
    let incubating = 0;
    for (let i = 0; i < s.civilians.highWater; i++)
      if (s.civilians.alive[i] && (s.ct.turnTick[i] as number) >= 0) incubating++;
    expect(w.counters.sheltered).toBeGreaterThan(0);
    expect(w.counters.sheltered).toBe(countKind(s, CS_SHELTERED));
    expect(w.counters.incubating).toBe(incubating);
    expect(w.counters.civiliansDead + w.civilianCount + w.zombieCount).toBeGreaterThan(0);
    for (const v of w.zones()) expect(v.occupants).toBeLessThanOrEqual(v.capacity);
  }, 30_000);
});
