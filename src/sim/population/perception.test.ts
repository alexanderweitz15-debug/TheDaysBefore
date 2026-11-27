// Perception, panic and the city alarm (GDD 7, M2 A2).
import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../../core/loop';
import { CIVILIAN_ALERT, CIVILIAN_PANIC } from '../../data/agents/civilians';
import { killZombie, spawnZombie, ZT_WALKER } from '../horde/zombie-traits';
import { countKind, emptyWorld, place, roadNear, SCAN, scanRounds } from './civilian-fixtures';
import { CS_ALERTED, CS_FLEEING, CS_PANIC, CS_ROUTINE } from './civilian-traits';
import { perceive } from './perception';

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
