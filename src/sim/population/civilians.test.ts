import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { runHeadless } from '../../core/headless';
import { TICK_RATE } from '../../core/loop';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { CIVILIAN_ALERT, CIVILIAN_PANIC, SAFETY_FIELD, ZONES } from '../../data/agents/civilians';
import { DIR_NONE } from '../horde/flow-field';
import { killZombie, spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import type { SimState } from '../state';
import { CityWorld, createWorld } from '../world';
import { placeCivilians } from '../world-setup';
import { CS_ALERTED, CS_FLEEING, CS_PANIC, CS_ROUTINE, CS_SHELTERED } from './civilian-traits';
import { perceive } from './perception';
import { ZK_CORRIDOR, ZK_RALLY } from './zones';

const SEED = 31337;
const SMALL = { size: 'small' } as const;
const SCAN = CIVILIAN_ALERT.scanIntervalTicks;
/** Cell steps per direction code (E, NE, N, NW, W, SW, S, SE; y grows southwards). */
const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
const STEP_Y = [0, -1, -1, -1, 0, 1, 1, 1];
const stepCell = (c: number, d: number, n: number): number =>
  c + (STEP_Y[d] as number) * n + (STEP_X[d] as number);

/** World without residents, so single agents can be studied. */
function emptyWorld(seed = SEED): CityWorld {
  const w = new CityWorld(seed, SMALL);
  const s = w.s;
  for (let i = 0; i < s.civilians.highWater; i++) {
    s.civilianCells[s.civilians.cell[i] as number] =
      (s.civilianCells[s.civilians.cell[i] as number] as number) - 1;
    s.civilians.release(i);
  }
  s.civiliansDirty = true;
  return w;
}

/** Nearest road cell to (x, y), as cell center meters. */
function roadNear(s: SimState, x: number, y: number): { x: number; y: number; cell: number } {
  const n = s.n;
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let c = 0; c < s.cells; c++) {
    if (s.map.terrain[c] !== TERRAIN.road) continue;
    const dx = ((c % n) + 0.5) * CELL_SIZE_M - x;
    const dy = (Math.floor(c / n) + 0.5) * CELL_SIZE_M - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: ((best % n) + 0.5) * CELL_SIZE_M, y: (Math.floor(best / n) + 0.5) * CELL_SIZE_M, cell: best };
}

function place(w: CityWorld, x: number, y: number, count: number, kind = CS_ROUTINE): number[] {
  const s = w.s;
  const k = placeCivilians(s, x, y, count, 0xffff);
  const slots = Array.from(s.placed.subarray(0, k));
  for (const i of slots) {
    s.civilians.kind[i] = kind;
    s.routine.timer[i] = 0xffff;
  }
  return slots;
}

/** Runs the safety field until a job completes. */
function settleSafety(w: CityWorld, tick: number): number {
  let t = tick;
  w.s.safety.update(w.s, t, SAFETY_FIELD.cellsPerTick);
  while (w.s.safety.busy) w.s.safety.update(w.s, ++t, SAFETY_FIELD.cellsPerTick);
  return t;
}

function countKind(s: SimState, kind: number): number {
  let k = 0;
  for (let i = 0; i < s.civilians.highWater; i++)
    if (s.civilians.alive[i] && s.civilians.kind[i] === kind) k++;
  return k;
}

/** Perception only (no movement): density from the current zombies, then `scans` full scan rounds. */
function scanRounds(s: SimState, from: number, scans: number): number {
  s.density.build(s.zombies);
  let t = from;
  for (let k = 0; k < scans * SCAN; k++) perceive(s, t++);
  return t;
}

describe('perception and panic', () => {
  it('panic rises with zombies in sight and falls without', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    const [i] = place(w, p.x, p.y, 1, CS_ALERTED) as [number];
    spawnZombie(s, p.x + 10, p.y, ZT_WALKER);
    let t = scanRounds(s, 0, 5);
    const risen = s.ct.panic[i] as number;
    // Five scans of half a second each with one zombie in sight.
    expect(risen).toBeCloseTo(CIVILIAN_PANIC.perZombiePerS * 5 * (SCAN / TICK_RATE), 4);
    expect(s.civilians.kind[i]).toBe(CS_FLEEING);
    expect(s.ct.lastThreat[i]).toBeGreaterThan(0);
    // Flee heading points away from the zombie.
    expect(s.ct.fleeX[i] as number).toBeLessThan(-0.9);
    // More zombies, faster rise.
    for (let k = 0; k < 5; k++) spawnZombie(s, p.x + 10, p.y, ZT_WALKER);
    t = scanRounds(s, t, 5);
    expect((s.ct.panic[i] as number) - risen).toBeCloseTo(
      CIVILIAN_PANIC.perZombiePerS * 6 * 5 * (SCAN / TICK_RATE),
      4,
    );
    // Above the threshold: panic state.
    expect(s.ct.panic[i] as number).toBeGreaterThanOrEqual(CIVILIAN_PANIC.panicThreshold);
    expect(s.civilians.kind[i]).toBe(CS_PANIC);
    for (let j = 0; j < s.zombies.highWater; j++) if (s.zombies.alive[j]) killZombie(s, j);
    const before = s.ct.panic[i] as number;
    t = scanRounds(s, t, 4);
    expect(before - (s.ct.panic[i] as number)).toBeCloseTo(
      CIVILIAN_PANIC.decayPerS * 4 * (SCAN / TICK_RATE),
      4,
    );
    // Below the exit threshold the civilian flees again (zombie still recently seen).
    while ((s.ct.panic[i] as number) >= CIVILIAN_PANIC.panicExitThreshold) t = scanRounds(s, t, 1);
    expect(s.civilians.kind[i]).toBe(CS_FLEEING);
  });

  it('zombies out of sight are not seen; each civilian scans once per interval', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    const [i] = place(w, p.x, p.y, 1, CS_ALERTED) as [number];
    spawnZombie(s, p.x + CIVILIAN_ALERT.sightRangeM + 12, p.y, ZT_WALKER);
    scanRounds(s, 0, 3);
    expect(s.ct.panic[i]).toBe(0);
    expect(s.civilians.kind[i]).toBe(CS_ALERTED);
    spawnZombie(s, p.x + 5, p.y, ZT_WALKER);
    s.density.build(s.zombies);
    let changed = 0;
    for (let t = 0; t < SCAN; t++) {
      const before = s.ct.panic[i] as number;
      perceive(s, 100 + t);
      if (s.ct.panic[i] !== before) changed++;
    }
    expect(changed).toBe(1);
  });

  it('unaware routine civilians ignore zombies; loud noise and the city alarm alert them', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    const q = roadNear(s, 200, 800);
    const [a] = place(w, p.x, p.y, 1) as [number];
    const [b] = place(w, q.x, q.y, 1) as [number];
    spawnZombie(s, p.x + 8, p.y, ZT_WALKER);
    let t = scanRounds(s, 0, 4);
    expect(s.civilians.kind[a]).toBe(CS_ROUTINE);
    expect(s.ct.panic[a]).toBe(0);
    // A scream nearby: now the zombie is recognized.
    s.noise.emit(p.x, p.y, CIVILIAN_ALERT.noiseThreshold * 2, 30);
    t = scanRounds(s, t, 1);
    expect(s.civilians.kind[a]).toBe(CS_FLEEING);
    expect(s.civilians.kind[b]).toBe(CS_ROUTINE);
    expect(s.civilians.kind[b]).toBe(CS_ROUTINE);
  });

  it('the city alarm is staggered over alarmSpreadS and heeded by alarmHeedShare', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 200, 800);
    const slots = place(w, p.x, p.y, 400);
    s.outbreak.startTick = 0;
    const delay = CIVILIAN_ALERT.cityAlarmDelayS * TICK_RATE;
    const spread = CIVILIAN_ALERT.alarmSpreadS * TICK_RATE;
    let t = scanRounds(s, delay - 4 * SCAN, 3);
    expect(countKind(s, CS_ALERTED)).toBe(0);
    t = scanRounds(s, delay + Math.floor(spread / 2), 1);
    const half = countKind(s, CS_ALERTED);
    t = scanRounds(s, delay + spread, 1);
    const all = countKind(s, CS_ALERTED);
    expect(all / slots.length).toBeGreaterThan(CIVILIAN_ALERT.alarmHeedShare - 0.08);
    expect(all / slots.length).toBeLessThan(CIVILIAN_ALERT.alarmHeedShare + 0.08);
    expect(half / all).toBeGreaterThan(0.35);
    expect(half / all).toBeLessThan(0.65);
    // Nobody else reacts later.
    scanRounds(s, t + 2 * spread, 1);
    expect(countKind(s, CS_ALERTED)).toBe(all);
  });

  it('fleeing civilians calm down to alerted after calmDownS without zombies; panickers may run headless', () => {
    const w = emptyWorld();
    const s = w.s;
    const p = roadNear(s, 500, 500);
    const slots = place(w, p.x, p.y, 200, CS_ALERTED);
    const z = spawnZombie(s, p.x, p.y, ZT_WALKER);
    for (const i of slots) s.ct.panic[i] = 1;
    let t = scanRounds(s, 0, 1);
    expect(countKind(s, CS_PANIC)).toBe(200);
    let headless = 0;
    for (const i of slots) headless += s.ct.headless[i] as number;
    expect(headless / 200).toBeGreaterThan(CIVILIAN_PANIC.ignoreGuidanceChance - 0.15);
    expect(headless / 200).toBeLessThan(CIVILIAN_PANIC.ignoreGuidanceChance + 0.15);
    killZombie(s, z);
    for (const i of slots) s.ct.panic[i] = 0;
    t = scanRounds(s, t, 1);
    expect(countKind(s, CS_FLEEING)).toBe(200);
    t = scanRounds(s, t + CIVILIAN_ALERT.calmDownS * TICK_RATE, 1);
    expect(countKind(s, CS_ALERTED)).toBe(200);
  });
});

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
