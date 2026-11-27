import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../../core/loop';
import { SCORE_LINE_KEYS } from '../../core/types/outcome';
import { DEFEAT, SCORE_POINTS, VICTORY } from '../../data/scoring';
import { pin, zombieAt } from '../combat/test-fixtures';
import { missionWorld, run, send } from '../economy/test-fixtures';
import { killZombie, ZT_WALKER } from '../horde/zombie-traits';
import { removeCivilian } from '../infection/attack';
import { CS_SHELTERED } from '../population/civilian-traits';
import type { CityWorld } from '../world';
import { CityWorld as World } from '../world';

const EVAL = VICTORY.evaluateEveryTicks;
const trigger = (w: CityWorld) => send(w, { playerId: 0, type: 'TriggerOutbreak', payload: {} });

/** Removes every zombie and every infected civilian (corpses of zombie kills never rise). */
function clearInfection(w: CityWorld): void {
  const s = w.s;
  for (let i = 0; i < s.zombies.highWater; i++) if (s.zombies.alive[i]) killZombie(s, i);
  for (let j = 0; j < s.civilians.highWater; j++)
    if (s.civilians.alive[j] && (s.ct.turnTick[j] as number) >= 0) removeCivilian(s, j);
}

/** Classic start: the outbreak begins on the next tick. */
function outbreakWorld(over: Parameters<typeof missionWorld>[0] = {}): CityWorld {
  const w = missionWorld({ classicStart: true, ...over });
  trigger(w);
  run(w, 1);
  expect(w.s.outbreak.started).toBe(true);
  return w;
}

describe('outcome: victory conditions', () => {
  it('eradication: no zombies, no incubating, nothing left to rise', () => {
    const w = outbreakWorld({ victory: { kinds: ['eradication'], all: false } });
    run(w, EVAL);
    expect(w.mission().outcome).toBeNull();
    expect(w.mission().objectives).toEqual([
      { kind: 'eradication', progress: expect.any(Number), met: false },
    ]);
    clearInfection(w);
    run(w, EVAL);
    const o = w.mission().outcome;
    expect(o).toMatchObject({ result: 'victory', reason: 'eradication' });
    expect((o?.tick ?? 0) % EVAL).toBe(0);
    expect(w.mission().phase).toBe('ended');
  });

  it('evacuation: healthy civilians in safe zones plus early evacuees reach the share', () => {
    const w = outbreakWorld({ victory: { kinds: ['evacuation'], all: false }, evacuationShare: 0.05 });
    const s = w.s;
    const want = Math.ceil(0.05 * s.result.populationStart);
    // Sheltered but infected civilians do not count as rescued.
    let k = 0;
    for (let j = 0; j < s.civilians.highWater && k < 10; j++) {
      if (!s.civilians.alive[j] || (s.ct.turnTick[j] as number) >= 0) continue;
      s.civilians.kind[j] = CS_SHELTERED;
      if (k === 0) s.ct.turnTick[j] = s.tick + 100_000;
      k++;
    }
    s.counters.incubating++;
    run(w, EVAL);
    expect(s.result.saved).toBe(9);
    expect(s.result.savedInfected).toBe(1);
    expect(w.mission().outcome).toBeNull();
    s.eco.evacuated = want - 9;
    run(w, EVAL);
    expect(w.mission().outcome).toMatchObject({ result: 'victory', reason: 'evacuation' });
  });

  it('hold: game time reaches holdUntilS while the inner ring has fewer zombies than the limit', () => {
    const w = outbreakWorld({ victory: { kinds: ['hold'], all: false }, holdUntilS: 60 });
    const s = w.s;
    // Crowd the inner ring at the zombie fallback goal.
    const c = s.goals.centerCell;
    const pins: number[] = [];
    for (let k = 0; k < VICTORY.holdCoreMaxZombies; k++)
      pins.push(zombieAt(w, ((c % s.n) + 0.5) * s.cellM, (Math.floor(c / s.n) + 0.5) * s.cellM, ZT_WALKER));
    const x = s.zombies.posX[pins[0] as number] as number;
    const y = s.zombies.posY[pins[0] as number] as number;
    while (s.tick < 60 * TICK_RATE + EVAL) {
      run(w, 1);
      for (const i of pins) pin(w, i, x, y);
    }
    expect(s.result.innerZombies).toBeGreaterThanOrEqual(VICTORY.holdCoreMaxZombies);
    expect(w.mission().objectives[0]).toMatchObject({ kind: 'hold', progress: 1, met: false });
    expect(w.mission().outcome).toBeNull();
    for (const i of pins) killZombie(s, i);
    run(w, EVAL);
    expect(w.mission().outcome).toMatchObject({ result: 'victory', reason: 'hold' });
  });

  it('containment: infected area below the share for the hold time; a new horde resets the clock', () => {
    const w = outbreakWorld({ victory: { kinds: ['containment'], all: false } });
    clearInfection(w);
    run(w, EVAL);
    const since = w.s.result.containSince;
    expect(since).toBeGreaterThan(0);
    run(w, VICTORY.containmentHoldS * TICK_RATE - 2 * EVAL);
    expect(w.mission().outcome).toBeNull();
    expect(w.mission().objectives[0]?.progress).toBeGreaterThan(0.9);
    run(w, 2 * EVAL);
    expect(w.mission().outcome).toMatchObject({ result: 'victory', reason: 'containment' });

    const v = outbreakWorld({ victory: { kinds: ['containment'], all: false } });
    clearInfection(v);
    run(v, 10 * EVAL);
    // Zombies spread over more than 1 % of the coarse cells.
    const s = v.s;
    for (let x = 20; x < s.sizeM; x += 60)
      for (let y = 20; y < s.sizeM; y += 120)
        send(v, { playerId: 0, type: 'DebugSpawn', payload: { x, y, count: 1, kind: 'zombie' } });
    run(v, EVAL);
    expect(s.result.infectedArea).toBeGreaterThan(VICTORY.containmentAreaShare);
    expect(s.result.containSince).toBe(-1);
  });

  it('all: every condition is needed; any: one suffices', () => {
    const all = outbreakWorld({ victory: { kinds: ['eradication', 'hold'], all: true }, holdUntilS: 60 });
    clearInfection(all);
    run(all, EVAL);
    expect(all.mission().outcome).toBeNull();
    expect(all.mission().objectives.map((o) => o.met)).toEqual([true, false]);
    run(all, 60 * TICK_RATE);
    expect(all.mission().outcome).toMatchObject({ result: 'victory', reason: 'eradication' });
    const any = outbreakWorld({ victory: { kinds: ['hold', 'eradication'], all: false }, holdUntilS: 600 });
    clearInfection(any);
    run(any, EVAL);
    expect(any.mission().outcome).toMatchObject({ result: 'victory', reason: 'eradication' });
  });

  it('no victory before the outbreak', () => {
    const w = missionWorld({
      victory: { kinds: ['eradication', 'containment', 'hold'], all: false },
      holdUntilS: 60,
    });
    run(w, 61 * TICK_RATE);
    expect(w.s.outbreak.started).toBe(false);
    expect(w.mission().outcome).toBeNull();
  });
});

describe('outcome: defeat', () => {
  it('HQ lost: its building stays overrun for hqOverrunS', () => {
    const w = outbreakWorld();
    const s = w.s;
    const { hqX, hqY } = s.eco;
    const pins: number[] = [];
    for (let k = 0; k < 12; k++) pins.push(zombieAt(w, hqX, hqY + 8));
    const px = s.zombies.posX[pins[0] as number] as number;
    const py = s.zombies.posY[pins[0] as number] as number;
    let ended = -1;
    for (let k = 0; k < (DEFEAT.hqOverrunS + 3) * TICK_RATE && ended < 0; k++) {
      run(w, 1);
      for (const i of pins) pin(w, i, px, py);
      if (w.mission().outcome) ended = s.tick;
    }
    expect(w.mission().outcome).toMatchObject({ result: 'defeat', reason: 'hqLost' });
    expect(ended - s.result.hqOverrunSince).toBeGreaterThanOrEqual(DEFEAT.hqOverrunS * TICK_RATE);
    expect(s.stats.hqFallTick).toBe(ended);
    expect(w.debrief()?.causes[0]).toMatchObject({ key: 'hqOverrun', tick: ended });
    expect(w.debrief()?.moments.map((m) => m.key)).toContain('hqLost');
  });

  it('population below the share after the outbreak', () => {
    const w = outbreakWorld();
    const s = w.s;
    const keep = Math.floor(DEFEAT.populationShare * s.result.populationStart) - 1;
    let alive = s.civilians.count;
    for (let j = 0; j < s.civilians.highWater && alive > keep; j++)
      if (s.civilians.alive[j]) {
        removeCivilian(s, j);
        alive--;
      }
    run(w, EVAL);
    expect(w.mission().outcome).toMatchObject({ result: 'defeat', reason: 'populationLost' });
  });

  it('time limit and surrender; unlosable ignores defeats except surrender', () => {
    const w = missionWorld({ timeLimitS: 30 });
    run(w, 30 * TICK_RATE);
    expect(w.mission().outcome).toMatchObject({
      result: 'defeat',
      reason: 'timeLimit',
      tick: 30 * TICK_RATE,
    });

    const u = missionWorld({ timeLimitS: 30, unlosable: true });
    run(u, 31 * TICK_RATE);
    expect(u.mission().outcome).toBeNull();
    send(u, { playerId: 0, type: 'Surrender', payload: {} });
    expect(u.mission().outcome).toMatchObject({ result: 'defeat', reason: 'surrender', tick: u.s.tick });
  });

  it('after the end the sim keeps running but the outcome and score stay fixed', () => {
    const w = outbreakWorld();
    send(w, { playerId: 0, type: 'Surrender', payload: {} });
    const o = w.mission().outcome;
    const score = w.mission().score;
    const tick = w.s.tick;
    const z = zombieAt(w, w.s.eco.hqX, w.s.eco.hqY);
    killZombie(w.s, z);
    clearInfection(w);
    run(w, 3 * EVAL);
    expect(w.s.tick).toBe(tick + 3 * EVAL);
    expect(w.mission().outcome).toEqual(o);
    expect(w.mission().score).toEqual(score);
    send(w, { playerId: 0, type: 'Surrender', payload: {} });
    expect(w.mission().outcome).toEqual(o);
  });

  it('free mode has no objectives and no outcome; Surrender is ignored', () => {
    const w = new World(7, { size: 'small' });
    send(w, { playerId: 0, type: 'Surrender', payload: {} });
    run(w, EVAL);
    const m = w.mission();
    expect(m.objectives).toEqual([]);
    expect(m.outcome).toBeNull();
    expect(m.score.multiplier).toBe(1);
    expect(w.debrief()).toBeNull();
  });
});

describe('outcome: score', () => {
  it('lines from GDD 10, difficulty multiplier, fast-victory bonus and medals', () => {
    const w = outbreakWorld({
      difficulty: 'hard',
      victory: { kinds: ['eradication'], all: false },
      medals: { bronze: 1, silver: 2, gold: 1e9 },
    });
    const s = w.s;
    s.counters.collateralKills = 2;
    clearInfection(w);
    run(w, EVAL);
    const sc = w.mission().score;
    expect(sc.lines.map((l) => l.key)).toEqual([...SCORE_LINE_KEYS]);
    const line = (k: string) => sc.lines.find((l) => l.key === k);
    expect(line('zombieKilled')).toMatchObject({ count: s.counters.zombiesKilled });
    expect(line('civilianKilledByOwnWeapons')).toMatchObject({
      count: 2,
      points: 2 * SCORE_POINTS.civilianKilledByOwnWeapons,
    });
    const t = s.result.endTick / TICK_RATE;
    expect(line('fastVictory')?.points).toBe(
      Math.round(SCORE_POINTS.fastVictoryMax * (1 - t / SCORE_POINTS.fastVictoryWindowS)),
    );
    expect(sc.multiplier).toBe(1.5);
    const raw =
      s.result.saved * SCORE_POINTS.civilianSaved +
      s.result.soldiers * SCORE_POINTS.soldierSurvived +
      s.counters.zombiesKilled * SCORE_POINTS.zombieKilled +
      SCORE_POINTS.fastVictoryMax * (1 - t / SCORE_POINTS.fastVictoryWindowS) +
      2 * SCORE_POINTS.civilianKilledByOwnWeapons;
    expect(sc.total).toBe(Math.round(raw * 1.5));
    expect(sc.medal).toBe('silver');
  });

  it('defeat: no fast-victory bonus and no medal', () => {
    const w = outbreakWorld({ medals: { bronze: -1e9, silver: -1e9, gold: -1e9 } });
    expect(w.mission().score.medal).toBe('gold');
    send(w, { playerId: 0, type: 'Surrender', payload: {} });
    const sc = w.mission().score;
    expect(sc.medal).toBe('none');
    expect(sc.lines.find((l) => l.key === 'fastVictory')?.points).toBe(0);
  });
});
