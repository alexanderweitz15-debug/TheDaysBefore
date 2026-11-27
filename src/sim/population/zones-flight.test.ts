// Zone commands, guided flight, shelter capacity, breaches (GDD 7, M2 A2/A3).
import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { ZONES } from '../../data/agents/civilians';
import { DIR_NONE } from '../horde/flow-field';
import { spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import { countKind, emptyWorld, place, roadNear } from './civilian-fixtures';
import { CS_ALERTED, CS_FLEEING, CS_PANIC, CS_SHELTERED } from './civilian-traits';
import { ZK_RALLY } from './zones';

describe('zones and flight', () => {
  it('zone commands: safe zone capacity from buildings, rally point, corridor mask, removal', () => {
    const w = emptyWorld();
    const s = w.s;
    const v0 = w.zonesVersion;
    const cmd = (c: Omit<Command, 'tick' | 'playerId'>): void =>
      w.applyCommand({ tick: 0, playerId: 0, ...c } as Command);
    cmd({ type: 'PlaceSafeZone', payload: { x0: 400, y0: 400, x1: 480, y1: 470 } });
    cmd({ type: 'PlaceSafeZone', payload: { x0: 10, y0: 10, x1: 11, y1: 50 } });
    cmd({ type: 'SetRallyPoint', payload: { x: 700, y: 700 } });
    cmd({ type: 'DrawCorridor', payload: { points: [100, 100, 300, 100, 300, 300] } });
    cmd({ type: 'DrawCorridor', payload: { points: [100, 100] } });
    const views = w.zones();
    expect(views.map((v) => v.kind)).toEqual(['safeZone', 'rallyPoint', 'corridor']);
    expect(w.zonesVersion).toBeGreaterThan(v0);
    let buildings = 0;
    for (let y = 100; y < 118; y++)
      for (let x = 100; x < 120; x++) if (s.map.terrain[y * s.n + x] === TERRAIN.building) buildings++;
    const safe = views[0];
    expect(safe?.capacity).toBe(
      Math.max(
        ZONES.safeZoneMinCapacity,
        Math.floor(buildings * CELL_SIZE_M * CELL_SIZE_M * ZONES.safeZoneCapacityPerM2),
      ),
    );
    expect(views[1]?.capacity).toBe(ZONES.rallyPointCapacity);
    expect(s.zones.zoneOfCell[s.cellOf(450, 430)]).toBe(s.zones.id.indexOf(safe?.id ?? -1));
    expect(s.zones.zoneOfCell[s.cellOf(700 + ZONES.rallyPointRadiusM - 2, 700)]).toBeGreaterThanOrEqual(0);
    expect(s.zones.zoneOfCell[s.cellOf(700 + ZONES.rallyPointRadiusM + 6, 700)]).toBe(-1);
    expect(s.zones.corridor[s.cellOf(200, 100)]).toBe(1);
    expect(s.zones.corridor[s.cellOf(300, 200)]).toBe(1);
    expect(s.zones.corridor[s.cellOf(200, 200)]).toBe(0);
    cmd({ type: 'RemoveZone', payload: { id: views[2]?.id ?? -1 } });
    expect(s.zones.corridor[s.cellOf(200, 100)]).toBe(0);
    expect(w.zones().length).toBe(2);
  });

  it('guided civilians flee along the field into the zone, are sheltered and stop; removal releases them', () => {
    const w = emptyWorld();
    const s = w.s;
    const goal = roadNear(s, 500, 500);
    const id = s.zones.add(s, ZK_RALLY, [goal.x, goal.y]);
    const start = roadNear(s, 500 + 80, 500 + 40);
    const slots = place(w, start.x, start.y, 30, CS_ALERTED);
    let t = 0;
    while (w.counters.sheltered < 30 && t < 1200) w.step(t++);
    expect(w.counters.sheltered).toBe(30);
    expect(countKind(s, CS_SHELTERED)).toBe(30);
    expect(w.zones()[0]?.occupants).toBe(30);
    const x = s.civilians.posX[slots[0] as number];
    w.step(t++);
    expect(s.civilians.posX[slots[0] as number]).toBe(x);
    for (const i of slots) expect(s.zones.zoneOfCell[s.civilians.cell[i] as number]).toBe(s.ct.zone[i]);
    w.applyCommand({ tick: t, playerId: 0, type: 'RemoveZone', payload: { id } });
    expect(w.counters.sheltered).toBe(0);
    expect(countKind(s, CS_ALERTED)).toBe(30);
  });

  it('zone capacity is never exceeded; the rest is led to the next open zone', () => {
    const w = emptyWorld();
    const s = w.s;
    const a = roadNear(s, 500, 500);
    const b = roadNear(s, 500, 640);
    s.zones.add(s, ZK_RALLY, [a.x, a.y]);
    s.zones.add(s, ZK_RALLY, [b.x, b.y]);
    const start = roadNear(s, 560, 470);
    place(w, start.x, start.y, 450, CS_FLEEING);
    const cap = ZONES.rallyPointCapacity;
    let t = 0;
    for (; t < 6000 && w.counters.sheltered < 450; t++) {
      w.step(t);
      const occ = s.zones.occupants;
      expect(occ[0] as number).toBeLessThanOrEqual(cap);
      expect(occ[1] as number).toBeLessThanOrEqual(cap);
      expect(w.counters.sheltered).toBe((occ[0] as number) + (occ[1] as number));
    }
    expect(s.zones.occupants[0]).toBe(cap);
    expect(s.zones.isOpen(0)).toBe(false);
    expect(s.zones.occupants[1]).toBeGreaterThan(0);
    expect(w.counters.sheltered).toBe(countKind(s, CS_SHELTERED));
  });

  it('without zones alerted civilians walk home and fleeing ones run away from zombies', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    let t = 0;
    while (!s.routine.ready) w.step(t++);
    const [a] = place(w, p.x, p.y, 1, CS_ALERTED) as [number];
    const hf = s.routine.home[a] as number;
    for (; t < 3000 && s.routine.dirs[hf * s.cells + (s.civilians.cell[a] as number)] !== DIR_NONE; t++)
      w.step(t);
    expect(s.routine.dirs[hf * s.cells + (s.civilians.cell[a] as number)]).toBe(DIR_NONE);
    // At home it hides and stays.
    const x = s.civilians.posX[a];
    for (let k = 0; k < 40; k++) w.step(t++);
    expect(s.civilians.posX[a]).toBe(x);
    const q = roadNear(s, 300, 300);
    const [b] = place(w, q.x, q.y, 1, CS_ALERTED) as [number];
    const zx = (s.civilians.posX[b] as number) + 6;
    const zy = s.civilians.posY[b] as number;
    const z = spawnZombie(s, zx, zy, ZT_WALKER);
    s.zombies.velX[z] = 0;
    for (let k = 0; k < 60; k++) w.step(t++);
    expect(s.civilians.kind[b] === CS_FLEEING || s.civilians.kind[b] === CS_PANIC).toBe(true);
    const d = Math.hypot((s.civilians.posX[b] as number) - zx, (s.civilians.posY[b] as number) - zy);
    expect(d).toBeGreaterThan(12);
  });

  it('a civilian turning inside a zone breaches it: everyone inside panics, the zone closes', () => {
    const w = emptyWorld();
    const s = w.s;
    const goal = roadNear(s, 500, 500);
    s.zones.add(s, ZK_RALLY, [goal.x, goal.y]);
    const slots = place(w, goal.x, goal.y, 20, CS_FLEEING);
    let t = 0;
    while (w.counters.sheltered < 20 && t < 200) w.step(t++);
    expect(w.counters.sheltered).toBe(20);
    const inf = slots[0] as number;
    s.ct.turnTick[inf] = t + 1;
    w.counters.incubating++;
    w.step(t++);
    w.step(t++);
    expect(w.zones()[0]?.breached).toBe(true);
    expect(w.counters.sheltered).toBe(0);
    expect(w.counters.incubating).toBe(0);
    expect(w.zombieCount).toBe(1);
    expect(countKind(s, CS_PANIC)).toBe(19);
    expect(s.zones.isOpen(0)).toBe(false);
    // No new arrivals in a breached zone.
    for (let k = 0; k < 40; k++) w.step(t++);
    expect(w.counters.sheltered).toBe(0);
  });
});
