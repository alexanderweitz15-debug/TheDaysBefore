import { describe, expect, it } from 'vitest';
import { CAUSE_KEYS, MOMENT_KEYS } from '../../core/types/outcome';
import { MORALE } from '../../data/economy/economy';
import { CAUSES, DEBRIEF } from '../../data/scoring';
import { pin, unitAt, zombieAt } from '../combat/test-fixtures';
import { damageUnit } from '../combat/unit-damage';
import { R } from '../economy/economy';
import { missionWorld, run, send } from '../economy/test-fixtures';
import { ZT_COLOSSUS } from '../horde/zombie-traits';
import { infectCivilian, killCivilian, removeCivilian } from '../infection/attack';
import { SK, SS_DESTROYED } from '../structures/kinds';
import type { CityWorld } from '../world';
import { GRID_INFECTION } from './recorder';

const surrender = (w: CityWorld) => send(w, { playerId: 0, type: 'Surrender', payload: {} });
const trigger = (w: CityWorld) => send(w, { playerId: 0, type: 'TriggerOutbreak', payload: {} });

describe('debrief: statistics', () => {
  it('is null before the end, then holds history, heatmaps, frames and moments', () => {
    const w = missionWorld({ classicStart: true });
    expect(w.debrief()).toBeNull();
    trigger(w);
    run(w, 3 * DEBRIEF.historySampleTicks);
    surrender(w);
    const d = w.debrief();
    if (!d) throw new Error('no debrief');
    expect(d.outcome).toMatchObject({ result: 'defeat', reason: 'surrender' });
    const samples = d.history.infected.length;
    expect(samples).toBe(Math.floor(w.s.tick / DEBRIEF.historySampleTicks) + 1);
    expect(d.history.civilians[0]).toBe(w.s.result.populationStart);
    expect(d.history.infected[samples - 1]).toBeGreaterThan(0);
    for (const k of ['soldiers', 'morale', 'budget'] as const) expect(d.history[k].length).toBe(samples);
    const g = d.grids;
    const n = g.widthCells * g.heightCells;
    expect(g.cellM).toBe(DEBRIEF.gridCellM);
    expect(g.widthCells).toBe(Math.ceil(w.s.sizeM / DEBRIEF.gridCellM));
    expect(g.frames.length).toBe(g.frameCount * 2 * n);
    // Frame f: zombie density, then civilian density.
    let civ = 0;
    for (let i = n; i < 2 * n; i++) civ += g.frames[i] as number;
    expect(civ).toBeGreaterThan(0.9 * w.s.result.populationStart);
    let zFirst = 0;
    for (let i = 0; i < n; i++) zFirst += g.frames[i] as number;
    // Only patient zero at the first frame.
    expect(zFirst).toBe(1);
    // The first chain of infections shows up in the infection heatmap.
    expect(Math.max(...g.infection)).toBe(255);
    const keys = d.moments.map((m) => m.key);
    expect(keys[0]).toBe('outbreak');
    expect(keys).toContain('defeat');
    for (const k of keys) expect(MOMENT_KEYS).toContain(k);
    expect(d.causes.every((c) => (CAUSE_KEYS as readonly string[]).includes(c.key))).toBe(true);
  });

  it('full history and frame buffers drop every second entry and double the interval', () => {
    const w = missionWorld();
    const st = w.s.stats;
    st.samples = DEBRIEF.maxSamples;
    st.frameCount = DEBRIEF.maxFrames;
    const m = DEBRIEF.maxSamples;
    for (let k = 0; k < m; k++) st.history[m + k] = k;
    const n = 2 * st.gridCells;
    for (let f = 0; f < DEBRIEF.maxFrames; f++) st.frames[f * n] = f % 256;
    w.s.tick = DEBRIEF.maxSamples * DEBRIEF.historySampleTicks;
    st.record(w.s, w.s.tick);
    expect(st.sampleTicks).toBe(2 * DEBRIEF.historySampleTicks);
    expect(st.samples).toBe(m / 2 + 1);
    expect(st.history[m + 3]).toBe(6);
    expect(st.frameTicks).toBe(2 * DEBRIEF.timelapseFrameTicks);
    expect(st.frameCount).toBe(DEBRIEF.maxFrames / 2 + 1);
    expect(st.frames[5 * n]).toBe(10);
  });

  it('losses and collateral heatmaps, first colossus', () => {
    const w = missionWorld({ classicStart: true });
    const s = w.s;
    trigger(w);
    run(w, 1);
    const j = s.placed[0] as number;
    for (let k = 0; k < s.civilians.highWater; k++) {
      if (!s.civilians.alive[k]) continue;
      killCivilian(s, k);
      break;
    }
    expect(j).toBeGreaterThanOrEqual(0);
    zombieAt(w, s.eco.hqX, s.eco.hqY, ZT_COLOSSUS);
    surrender(w);
    const d = w.debrief();
    expect(Math.max(...(d?.grids.losses ?? []))).toBe(255);
    expect(d?.moments.find((m) => m.key === 'firstColossus')).toMatchObject({ tick: s.tick });
  });
});

describe('debrief: why did I lose (GDD 15)', () => {
  it('wall lost to colossi without anti-armor nearby ranks first, with time and parameters', () => {
    const w = missionWorld({ classicStart: true });
    const s = w.s;
    trigger(w);
    const x = s.eco.hqX + 60;
    const y = s.eco.hqY;
    send(w, {
      playerId: 0,
      type: 'PlaceStructure',
      payload: { kind: 'wall', points: [x - 8, y, x + 8, y], rotation: 0 },
    });
    run(w, 1);
    const S = s.structures;
    let i = -1;
    for (let k = 0; k < S.highWater; k++) if (S.alive[k] && S.kind[k] === SK.wall) i = k;
    expect(i).toBeGreaterThanOrEqual(0);
    const cols = [zombieAt(w, x, y + 10, ZT_COLOSSUS), zombieAt(w, x, y + 12, ZT_COLOSSUS)];
    for (const c of cols) pin(w, c, x, y + 10);
    S.damage(s, i, 1e9, s.tick);
    expect(S.state[i]).toBe(SS_DESTROYED);
    const t = s.tick;
    surrender(w);
    const causes = w.debrief()?.causes ?? [];
    expect(causes.length).toBeGreaterThanOrEqual(1);
    expect(causes.length).toBeLessThanOrEqual(CAUSES.maxCauses);
    expect(causes[0]).toMatchObject({ key: 'noAntiArmor', tick: t, params: { colossi: 2, antiArmor: 0 } });
    expect(w.debrief()?.moments.find((m) => m.key === 'firstWallLost')?.tick).toBe(t);
  });

  it('few squads at the outbreak and infections inside safe zones', () => {
    const w = missionWorld({ classicStart: true });
    const s = w.s;
    trigger(w);
    run(w, 1);
    const st = s.stats;
    expect(st.squadsAtOutbreak).toBe(0);
    // Infections inside a zone: mark healthy civilians as zone occupants, then infect them.
    let k = 0;
    for (let j = 0; j < s.civilians.highWater && k < CAUSES.shelterInfectionMin + 5; j++) {
      if (!s.civilians.alive[j] || (s.ct.turnTick[j] as number) >= 0) continue;
      s.ct.zone[j] = 0;
      infectCivilian(s, j);
      s.ct.zone[j] = -1;
      k++;
    }
    expect(st.shelterInfections).toBe(k);
    expect(st.infections).toBeGreaterThan(k);
    const before = s.stats.heat[GRID_INFECTION * st.gridCells + st.cellAt(s.eco.hqX, s.eco.hqY)];
    expect(before).toBeGreaterThanOrEqual(0);
    surrender(w);
    const keys = (w.debrief()?.causes ?? []).map((c) => c.key);
    expect([...keys].sort()).toEqual(['lateOutbreakResponse', 'zoneBreached']);
    const z = w.debrief()?.causes.find((c) => c.key === 'zoneBreached');
    expect(z?.params.pct).toBe(Math.round((100 * st.shelterInfections) / st.infections));
  });

  it('victories report no causes', () => {
    const w = missionWorld({ classicStart: true, victory: { kinds: ['hold'], all: false }, holdUntilS: 60 });
    trigger(w);
    run(w, 61 * 20);
    expect(w.mission().outcome?.result).toBe('victory');
    expect(w.debrief()?.causes).toEqual([]);
  });

  it('every defeat but surrender has a cause: time limit, population, collateral, low morale', () => {
    const t = missionWorld({ timeLimitS: 30 });
    run(t, 30 * 20);
    expect(t.debrief()?.causes[0]).toMatchObject({ key: 'timeLimit', params: { minutes: 1 } });

    const p = missionWorld({ classicStart: true });
    const s = p.s;
    trigger(p);
    run(p, 1);
    for (let j = 0; j < s.civilians.highWater; j++) if (s.civilians.alive[j]) removeCivilian(s, j);
    s.counters.collateralKills = CAUSES.collateralKillsMin;
    s.stats.collateralTick = 5;
    s.eco.morale = MORALE.strikeBelow - 5;
    run(p, 20);
    expect(p.mission().outcome).toMatchObject({ reason: 'populationLost' });
    const keys = (p.debrief()?.causes ?? []).map((c) => c.key);
    expect(keys[0]).toBe('populationLost');
    expect(p.debrief()?.causes[0]?.params).toEqual({ pct: 0 });
    // lateOutbreakResponse (no squads) outranks collateral and low morale; all three exist.
    const all = new Set([...keys]);
    expect(all.has('lateOutbreakResponse')).toBe(true);
    expect(keys.length).toBe(CAUSES.maxCauses);
    expect(s.stats.lowMoraleTick).toBeGreaterThan(0);
    expect(s.stats.lowMorale).toBeLessThan(MORALE.strikeBelow);
  });

  it('moments: ammo out and first soldier lost', () => {
    const w = missionWorld({ classicStart: true });
    const s = w.s;
    trigger(w);
    s.eco.amount[R.ammo] = 0;
    run(w, 20);
    const u = unitAt(w, 'infantry', s.eco.hqX + 20, s.eco.hqY);
    damageUnit(s, u, 1e6, true);
    surrender(w);
    const keys = (w.debrief()?.moments ?? []).map((m) => m.key);
    expect(keys).toContain('ammoOut');
    expect(keys).toContain('firstSoldierLost');
    expect(w.debrief()?.causes.map((c) => c.key)).toContain('ammoOut');
  });
});
