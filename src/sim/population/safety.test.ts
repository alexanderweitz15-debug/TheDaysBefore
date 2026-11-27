// Safety field (GDD 7): distance to open zones, zombie repulsion, corridors, restarts.
import { describe, expect, it } from 'vitest';
import { SAFETY_FIELD } from '../../data/agents/civilians';
import { DIR_NONE } from '../horde/flow-field';
import { killZombie, spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import { emptyWorld, roadNear, settleSafety, stepCell } from './civilian-fixtures';
import { ZK_CORRIDOR, ZK_RALLY } from './zones';

describe('safety field', () => {
  it('debugField safety: 255 at the zone, falling with distance, 0 where unreachable; empty without zones', () => {
    const w = emptyWorld();
    const s = w.s;
    expect(Array.from(w.debugField('safety')?.data ?? []).every((v) => v === 0)).toBe(true);
    const p = roadNear(s, 500, 500);
    const id = s.zones.add(s, ZK_RALLY, [p.x, p.y]);
    settleSafety(w, 0);
    const f = w.debugField('safety');
    expect(f?.widthCells).toBe(s.n);
    const d = f?.data as Uint8Array;
    expect(d[p.cell]).toBe(255);
    for (let c = 0; c < s.cells; c++) if (!s.walkable[c]) expect(d[c]).toBe(0);
    // Following the field from any reachable cell never lowers the value and ends in the zone.
    const n = s.n;
    let c = roadNear(s, 100, 100).cell;
    let steps = 0;
    while (s.safety.dirs[c] !== DIR_NONE && steps < 4 * n) {
      const dir = s.safety.dirs[c] as number;
      const next = stepCell(c, dir, n);
      expect(d[next] as number).toBeGreaterThanOrEqual(d[c] as number);
      c = next;
      steps++;
    }
    expect(s.zones.zoneOfCell[c]).toBeGreaterThanOrEqual(0);
    s.zones.remove(s, id);
    settleSafety(w, 1000);
    expect(s.safety.ready).toBe(0);
    expect(Array.from(w.debugField('safety')?.data ?? []).every((v) => v === 0)).toBe(true);
  });

  it('zombies repel the field and corridor cells make it cheaper', () => {
    const w = emptyWorld();
    const s = w.s;
    const goal = roadNear(s, 500, 500);
    const from = roadNear(s, 300, 500);
    s.zones.add(s, ZK_RALLY, [goal.x, goal.y]);
    let t = settleSafety(w, 0);
    const base = s.safety.dist[from.cell] as number;
    // Zombies around the start cell: the way from there costs more.
    for (let k = 0; k < 20; k++) spawnZombie(s, from.x, from.y, ZT_WALKER);
    s.density.build(s.zombies);
    t = settleSafety(w, t + SAFETY_FIELD.recomputeEveryTicks);
    expect(s.safety.dist[from.cell] as number).toBeGreaterThan(base);
    for (let j = 0; j < s.zombies.highWater; j++) if (s.zombies.alive[j]) killZombie(s, j);
    s.density.build(s.zombies);
    // A corridor from the start to the zone.
    s.zones.add(s, ZK_CORRIDOR, [from.x, from.y, goal.x, goal.y]);
    settleSafety(w, t + 1);
    expect(s.safety.dist[from.cell] as number).toBeLessThan(base);
    expect(s.zones.corridor[from.cell]).toBe(1);
  });

  it('restarts on goal changes and on noticeable zombie movement only; budgeted per tick', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    s.zones.add(s, ZK_RALLY, [p.x, p.y]);
    w.step(0);
    expect(s.safety.busy).toBe(true);
    let t = settleSafety(w, 1);
    expect(s.safety.ready).toBe(1);
    expect(s.safety.lastStart).toBe(0);
    // No zombies moved: the periodic check does not restart.
    t += SAFETY_FIELD.recomputeEveryTicks;
    s.safety.update(s, t, 1);
    expect(s.safety.busy).toBe(false);
    // A group of zombies appears: the next check restarts the field.
    for (let k = 0; k < 10; k++) spawnZombie(s, 300, 300, ZT_WALKER);
    s.density.build(s.zombies);
    s.safety.update(s, t + 1, 1);
    expect(s.safety.busy).toBe(false);
    t += SAFETY_FIELD.recomputeEveryTicks;
    s.safety.update(s, t, 1);
    expect(s.safety.busy).toBe(true);
    // The active field stays usable while the next one is computed.
    expect(s.safety.ready).toBe(1);
    expect(s.safety.dirs[roadNear(s, 200, 200).cell]).not.toBe(DIR_NONE);
    // A goal change restarts at once.
    t = settleSafety(w, t + 1);
    s.zones.add(s, ZK_RALLY, [200, 800]);
    s.safety.update(s, t + 1, 1);
    expect(s.safety.busy).toBe(true);
  });
});
