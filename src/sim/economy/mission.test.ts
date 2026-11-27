import { describe, expect, it } from 'vitest';
import { createHash, hashHex } from '../../core/hash';
import { TICK_RATE } from '../../core/loop';
import { KEY_SITES } from '../../core/types/map';
import { PHASES, POPULATION, WARNINGS } from '../../data/economy/economy';
import { ZT_PATIENT_ZERO } from '../horde/zombie-traits';
import { CityWorld } from '../world';
import { buildRate, PH_FARM, WS_ESCALATED, WS_INVESTIGATED, WS_INVESTIGATING, WS_OPEN } from './mission';
import { buildingCentre } from './production';
import { missionWorld, run, scenario, send } from './test-fixtures';

const investigate = (w: CityWorld, warningId: number) =>
  send(w, { playerId: 0, type: 'InvestigateWarning', payload: { warningId } });
const trigger = (w: CityWorld) => send(w, { playerId: 0, type: 'TriggerOutbreak', payload: {} });
const hash = (w: CityWorld): string => {
  const h = createHash();
  w.hash(h);
  return hashHex(h);
};
/** Opens warning k now (instead of waiting for its tick). */
const open = (w: CityWorld, k: number) => {
  w.s.mission.wAt[k] = w.s.tick + 1;
  run(w, 1);
  expect(w.s.mission.wState[k]).toBe(WS_OPEN);
};

describe('mission: countdown and outbreak', () => {
  it('farm phase counts down (visible on normal, hidden on hard), then patient zero appears at the site', () => {
    const w = missionWorld({ farmDurationS: 5, patientZeroSite: 'hospital' });
    expect(missionWorld({ difficulty: 'hard' }).mission().countdownTicks).toBeNull();
    expect(w.mission()).toMatchObject({ phase: 'farm', countdownTicks: 5 * TICK_RATE, classicStart: false });
    run(w, 5 * TICK_RATE - 1);
    expect(w.counters.outbreakTick).toBe(-1);
    run(w, 1);
    expect(w.mission().phase).toBe('outbreak');
    expect(w.counters.outbreakTick).toBe(5 * TICK_RATE);
    expect(w.s.eco.postOutbreak).toBe(true);
    // Patient zero at the busy spot nearest to the first hospital building, within the search radius.
    const B = w.map.buildings;
    let b = 0;
    while (B.keySite[b] !== KEY_SITES.indexOf('hospital')) b++;
    const c = buildingCentre(w.s, b);
    const z = w.s.zombies;
    let pz = 0;
    while (!(z.alive[pz] && z.kind[pz] === ZT_PATIENT_ZERO)) pz++;
    const d = Math.hypot((z.posX[pz] as number) - c.x, (z.posY[pz] as number) - c.y);
    expect(d).toBeLessThan(PHASES.patientZeroCrowdSearchM + 2 * w.s.civilianHash.cellM);
  });

  it('patient zero appears in a crowd and has bitten the nearest of it (first chain at once)', () => {
    const w = missionWorld({ farmDurationS: 1, patientZeroSite: 'random' });
    run(w, TICK_RATE + 1);
    const s = w.s;
    const pz = s.outbreak.pzSlot;
    const x = s.zombies.posX[pz] as number;
    const y = s.zombies.posY[pz] as number;
    const c = s.civilians;
    // Crowd: civilians within the crowd window (+-1 cell of 8 m) around patient zero.
    const win = (PHASES.patientZeroCrowdWindowCells + 1) * s.civilianHash.cellM;
    let near = 0;
    let bitten = 0;
    let maxBitten = 0;
    let minHealthy = Number.POSITIVE_INFINITY;
    for (let i = 0; i < c.highWater; i++) {
      if (!c.alive[i]) continue;
      const di = Math.hypot((c.posX[i] as number) - x, (c.posY[i] as number) - y);
      if (Math.abs((c.posX[i] as number) - x) < win && Math.abs((c.posY[i] as number) - y) < win) near++;
      if ((s.ct.turnTick[i] as number) >= 0) {
        bitten++;
        maxBitten = Math.max(maxBitten, di);
      } else if (di < minHealthy) minHealthy = di;
    }
    expect(near).toBeGreaterThanOrEqual(PHASES.patientZeroCrowdMin - PHASES.patientZeroFirstChain);
    expect(bitten).toBeGreaterThanOrEqual(PHASES.patientZeroFirstChain);
    expect(s.counters.incubating).toBe(bitten);
    expect(maxBitten).toBeLessThan(win * 1.5);
  });

  it('outbreak reaches defense within 2400 ticks on small/normal for seeds 11, 22, 33', () => {
    for (const seed of [11, 22, 33]) {
      const w = new CityWorld(seed, {
        size: 'small',
        scenario: scenario({ seed, farmDurationS: 1, patientZeroSite: 'random', difficulty: 'normal' }),
      });
      run(w, TICK_RATE);
      expect(w.mission().phase).toBe('outbreak');
      const start = w.counters.outbreakTick;
      while (w.mission().phase === 'outbreak' && w.s.tick - start <= 2400) run(w, 1);
      expect(w.mission().phase, `seed ${seed}`).toBe('defense');
      expect(w.s.tick - start).toBeLessThanOrEqual(2400);
    }
  });

  it('outbreak turns into defense once the infected exceed the threshold', () => {
    const w = missionWorld({ farmDurationS: 1 });
    run(w, TICK_RATE + 1);
    expect(w.mission().phase).toBe('outbreak');
    send(w, {
      playerId: 0,
      type: 'DebugSpawn',
      payload: { x: w.s.mission.pzX, y: w.s.mission.pzY, count: PHASES.outbreakToDefenseInfected + 5 },
    });
    run(w, 1);
    expect(w.mission().phase).toBe('defense');
  });

  it('classic start: no countdown, no warnings, outbreak only on TriggerOutbreak (refused otherwise)', () => {
    const w = missionWorld({ classicStart: true, farmDurationS: 1 });
    w.s.mission.wAt[0] = 1;
    run(w, 3 * TICK_RATE);
    expect(w.mission()).toMatchObject({
      phase: 'farm',
      countdownTicks: null,
      classicStart: true,
      warnings: [],
    });
    trigger(w);
    run(w, 1);
    expect(w.counters.outbreakTick).toBeGreaterThanOrEqual(0);
    expect(w.mission().phase).toBe('outbreak');
    const normal = missionWorld();
    trigger(normal);
    run(normal, 1);
    expect(normal.s.mission.phase).toBe(PH_FARM);
  });
});

describe('mission: warning signs', () => {
  it('signs appear on schedule with family keys; ignored ones escalate: pressure up, countdown shorter', () => {
    const w = missionWorld();
    const m = w.s.mission;
    const farm = 600 * TICK_RATE;
    expect(m.wAt[0]).toBe(Math.floor(farm * WARNINGS.firstAtFraction));
    expect(w.mission().warnings).toEqual([]);
    open(w, 0);
    const v = w.mission().warnings;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: 1, key: `warning.${WARNINGS.keys.viral[0]}`, investigated: false });
    expect(v[0]?.escalatesInTicks).toBe(WARNINGS.escalateAfterS * TICK_RATE);
    m.wUntil[0] = w.s.tick + 1;
    const left = m.outbreakAt - (w.s.tick + 1);
    run(w, 1);
    expect(m.wState[0]).toBe(WS_ESCALATED);
    expect(m.pressure).toBe(WARNINGS.pressurePerEscalation);
    expect(m.outbreakAt - w.s.tick).toBe(Math.floor(left * (1 - WARNINGS.pressurePerEscalation)));
    // Escalated signs can no longer be investigated.
    const budget = w.counters.budget;
    investigate(w, 1);
    expect(w.counters.budget).toBe(budget);
  });

  it('investigating costs budget and time and extends the countdown; the station lockdown softens escalation', () => {
    const w = missionWorld();
    const m = w.s.mission;
    open(w, 1);
    const budget = w.counters.budget;
    const at = m.outbreakAt;
    investigate(w, 2);
    expect(m.wState[1]).toBe(WS_INVESTIGATING);
    expect(w.counters.budget).toBe(budget - WARNINGS.investigateCost.budget);
    run(w, WARNINGS.investigateS * TICK_RATE);
    expect(m.wState[1]).toBe(WS_INVESTIGATED);
    expect(m.outbreakAt).toBe(at + WARNINGS.investigateRewardS * TICK_RATE);
    expect(w.mission().warnings[0]?.investigated).toBe(true);
    const lock = missionWorld();
    send(lock, { playerId: 0, type: 'SetDecree', payload: { decree: 'stationLockdown', active: true } });
    open(lock, 0);
    lock.s.mission.wUntil[0] = lock.s.tick + 1;
    run(lock, 1);
    expect(lock.s.mission.pressure).toBeCloseTo(WARNINGS.pressurePerEscalation * 0.6, 6);
  });

  it('full pressure starts the outbreak at once', () => {
    const w = missionWorld();
    w.s.mission.pressure = 1;
    run(w, 1);
    expect(w.mission().phase).toBe('outbreak');
    expect(w.counters.outbreakTick).toBe(1);
  });
});

describe('mission: building and determinism', () => {
  it('helpers speed up building; zombies at the site halve it; free mode builds at rate 1', () => {
    const w = missionWorld();
    const s = w.s;
    send(w, { playerId: 0, type: 'AssignWorkers', payload: { workers: 30, conscripts: 0, helpers: 50 } });
    send(w, {
      playerId: 0,
      type: 'PlaceStructure',
      payload: { kind: 'watchtower', points: [50, 20], rotation: 0 },
    });
    run(w, 20);
    const bonus = 1 + POPULATION.helperBuildBonusPer10Pct * 5;
    expect(buildRate(s, 0)).toBeCloseTo(bonus, 2);
    send(w, { playerId: 0, type: 'DebugSpawn', payload: { x: 50, y: 22, count: 3 } });
    s.density.build(s.zombies);
    expect(buildRate(s, 0)).toBeCloseTo(bonus / PHASES.underFireBuildFactor, 2);
    s.eco.active = false;
    expect(buildRate(s, 0)).toBe(1);
  });

  it('same scenario and commands give the same hash; missions hash their economy', () => {
    const play = (): string => {
      const w = missionWorld({ farmDurationS: 10 });
      send(w, { playerId: 0, type: 'AssignWorkers', payload: { workers: 40, conscripts: 10, helpers: 10 } });
      send(w, { playerId: 0, type: 'SetDecree', payload: { decree: 'rationing', active: true } });
      run(w, 300);
      return hash(w);
    };
    const a = play();
    expect(play()).toBe(a);
    const w = missionWorld({ farmDurationS: 10 });
    const h0 = hash(w);
    w.s.eco.morale += 1;
    expect(hash(w)).not.toBe(h0);
  });
});
