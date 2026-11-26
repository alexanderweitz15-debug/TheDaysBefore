import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { runHeadless } from '../../core/headless';
import { TICK_RATE } from '../../core/loop';
import type { AgentSection } from '../../core/types/snapshot';
import { CIVILIAN_STATES } from '../../core/types/zones';
import { NOISE } from '../../data/agents/noise';
import { PATIENT_ZERO, VIRAL } from '../../data/pathogens/viral';
import { CIVILIAN_HP, SCREAMER, ZOMBIE_TYPE_SPECS } from '../../data/zombies/viral-types';
import {
  killZombie,
  spawnZombie,
  ZT_COLOSSUS,
  ZT_PATIENT_ZERO,
  ZT_SCREAMER,
  ZT_SPRINTER,
  ZT_WALKER,
} from '../horde/zombie-traits';
import { CS_SHELTERED } from '../population/civilian-traits';
import { CityWorld, createWorld } from '../world';
import { placeCivilians } from '../world-setup';
import { hitCivilian } from './attack';

const SEED = 31337;
const SMALL = { size: 'small' } as const;
const outbreak = (tick: number, x = 500, y = 500): Command => ({
  tick,
  playerId: 0,
  type: 'StartOutbreak',
  payload: { x, y, family: 'viral' },
});

/** World without residents, so single agents can be studied. */
function emptyWorld(): CityWorld {
  const w = new CityWorld(SEED, SMALL);
  const s = w.s;
  for (let i = 0; i < s.civilians.highWater; i++) {
    s.civilianCells[s.civilians.cell[i] as number] =
      (s.civilianCells[s.civilians.cell[i] as number] as number) - 1;
    s.civilians.release(i);
  }
  s.civiliansDirty = true;
  return w;
}

const speed = (w: CityWorld, i: number): number =>
  Math.hypot(w.zombies.velX[i] as number, w.zombies.velY[i] as number);

describe('outbreak and zombie types', () => {
  it('StartOutbreak spawns patient zero once with doubled HP; other families are ignored', () => {
    const w = new CityWorld(SEED, SMALL);
    w.applyCommand({
      tick: 0,
      playerId: 0,
      type: 'StartOutbreak',
      payload: { x: 500, y: 500, family: 'fungal' },
    });
    expect(w.zombieCount).toBe(0);
    w.applyCommand(outbreak(0));
    w.applyCommand(outbreak(0, 100, 100));
    expect(w.zombieCount).toBe(1);
    expect(w.zombies.kind[0]).toBe(ZT_PATIENT_ZERO);
    expect(w.zombies.hp[0]).toBe(ZOMBIE_TYPE_SPECS.walker.hp * PATIENT_ZERO.hpFactor);
    expect(w.counters.outbreakTick).toBe(0);
  });

  it('each type moves at its own speed; the aura of patient zero adds its bonus', () => {
    const w = emptyWorld();
    const s = w.s;
    const walker = spawnZombie(s, 200, 200, ZT_WALKER);
    const sprinter = spawnZombie(s, 700, 700, ZT_SPRINTER);
    w.step(0);
    expect(speed(w, walker)).toBeCloseTo(ZOMBIE_TYPE_SPECS.walker.speedMps, 4);
    expect(speed(w, sprinter)).toBeCloseTo(ZOMBIE_TYPE_SPECS.sprinter.speedMps, 4);
    w.applyCommand(outbreak(1, (s.zombies.posX[walker] as number) + 10, s.zombies.posY[walker] as number));
    w.step(1);
    expect(speed(w, walker)).toBeCloseTo(
      ZOMBIE_TYPE_SPECS.walker.speedMps * (1 + PATIENT_ZERO.auraSpeedBonus),
      4,
    );
    expect(speed(w, sprinter)).toBeCloseTo(ZOMBIE_TYPE_SPECS.sprinter.speedMps, 4);
  });

  it('killing patient zero within the early window slows the spread for the slowdown duration', () => {
    const w = new CityWorld(SEED, SMALL);
    const s = w.s;
    w.applyCommand(outbreak(0));
    s.tick = 100;
    killZombie(s, s.outbreak.pzSlot);
    expect(w.counters.zombiesKilled).toBe(1);
    expect(s.outbreak.infectChance(200)).toBeCloseTo(VIRAL.infectChance * PATIENT_ZERO.slowdownInfectFactor);
    expect(s.outbreak.infectChance(100 + PATIENT_ZERO.slowdownDurationS * TICK_RATE)).toBe(
      VIRAL.infectChance,
    );
    const late = new CityWorld(SEED, SMALL);
    late.applyCommand(outbreak(0));
    late.s.tick = PATIENT_ZERO.earlyKillWindowS * TICK_RATE + 1;
    killZombie(late.s, 0);
    expect(late.s.outbreak.infectChance(late.s.tick + 1)).toBe(VIRAL.infectChance);
  });

  it('the transformation table follows the weights and maturity doubles special types', () => {
    const w = new CityWorld(SEED, SMALL);
    const s = w.s;
    s.outbreak.startTick = 0;
    const share = (tick: number): number[] => {
      const k = [0, 0, 0, 0];
      for (let i = 0; i < 20000; i++) {
        const t = s.outbreak.pickType(s.rng, tick);
        k[t] = (k[t] as number) + 1;
      }
      return k.map((v) => v / 20000);
    };
    const early = share(0);
    expect(early[ZT_WALKER]).toBeCloseTo(VIRAL.turnWeights.walker, 1);
    expect(early[ZT_SPRINTER]).toBeCloseTo(VIRAL.turnWeights.sprinter, 1);
    const mature = share(VIRAL.maturityFullS * TICK_RATE);
    const special = (v: number[]): number =>
      (v[ZT_SPRINTER] as number) + (v[ZT_SCREAMER] as number) + (v[ZT_COLOSSUS] as number);
    expect(special(mature) / special(early)).toBeGreaterThan(1.8);
    expect(special(mature) / special(early)).toBeLessThan(2.2);
  });
});

describe('attack, infection, incubation, corpses', () => {
  it('a hit infects with the pathogen chance, otherwise deals damage; victims panic', () => {
    const w = emptyWorld();
    const s = w.s;
    placeCivilians(s, 500, 500, 1000, 1000);
    let infected = 0;
    for (let j = 0; j < s.civilians.highWater; j++) {
      if (!s.civilians.alive[j]) continue;
      hitCivilian(s, j, 15);
      if ((s.ct.turnTick[j] as number) >= 0) infected++;
      else expect(s.civilians.hp[j]).toBe(CIVILIAN_HP - 15);
      expect(s.ct.panic[j]).toBe(1);
    }
    expect(infected / 1000).toBeGreaterThan(VIRAL.infectChance - 0.05);
    expect(infected / 1000).toBeLessThan(VIRAL.infectChance + 0.05);
    expect(w.counters.incubating).toBe(infected);
    // A hit also makes noise.
    expect(s.noise.sample(500, 500)).toBeGreaterThan(NOISE.minLevel);
  });

  it('incubating civilians look normal in their state, are ignored by zombies and turn after incubation', () => {
    const w = emptyWorld();
    const s = w.s;
    placeCivilians(s, 500, 500, 1, 0xffff);
    const c = s.placed[0] as number;
    s.tick = 0;
    s.ct.turnTick[c] = -1;
    while ((s.ct.turnTick[c] as number) < 0) hitCivilian(s, c, 0);
    const turnAt = s.ct.turnTick[c] as number;
    expect(turnAt).toBeGreaterThanOrEqual(VIRAL.incubationMinS * TICK_RATE);
    expect(turnAt).toBeLessThan(VIRAL.incubationMaxS * TICK_RATE);
    const out: AgentSection = {
      count: 1,
      ids: new Uint32Array(1),
      pos: new Float32Array(2),
      kind: new Uint8Array(1),
    };
    w.writeCivilians(out);
    expect(out.kind[0]).toBe(CIVILIAN_STATES.indexOf('incubating'));
    const z = spawnZombie(s, s.civilians.posX[c] as number, s.civilians.posY[c] as number, ZT_WALKER);
    for (let t = 0; t < turnAt; t++) w.step(t);
    expect(s.zombies.target[z]).toBe(-1);
    expect(w.civilianCount).toBe(1);
    w.step(turnAt);
    expect(w.civilianCount).toBe(0);
    expect(w.zombieCount).toBe(2);
    expect(w.counters.incubating).toBe(0);
    expect(s.infection[s.zombies.cell[z] as number]).toBeGreaterThan(0);
  });

  it('zombies kill civilians that stay healthy; corpses rise with the chance after the delay', () => {
    const w = emptyWorld();
    const s = w.s;
    placeCivilians(s, 500, 500, 2000, 1000);
    s.tick = 0;
    for (let j = 0; j < s.civilians.highWater; j++) {
      if (!s.civilians.alive[j]) continue;
      // Already infected (counted), so every hit is damage: infected victims die before turning.
      s.ct.turnTick[j] = 1e9;
      s.counters.incubating++;
      hitCivilian(s, j, CIVILIAN_HP);
    }
    expect(w.civilianCount).toBe(0);
    expect(w.corpseCount).toBe(2000);
    expect(w.counters.civiliansDead).toBe(2000);
    expect(w.counters.incubating).toBe(0);
    const rise = VIRAL.corpseRiseDelayS * TICK_RATE;
    for (let t = 1; t < rise; t++) w.step(t);
    expect(w.zombieCount).toBe(0);
    w.step(rise);
    expect(w.zombieCount / 2000).toBeGreaterThan(VIRAL.corpseRiseChance - 0.05);
    expect(w.zombieCount / 2000).toBeLessThan(VIRAL.corpseRiseChance + 0.05);
    expect(w.corpseCount + w.zombieCount).toBe(2000);
  });

  it('a zombie next to a civilian attacks at its rate until the victim is infected or dead', () => {
    const w = emptyWorld();
    const s = w.s;
    placeCivilians(s, 500, 500, 1, 0xffff);
    const c = s.placed[0] as number;
    s.routine.timer[c] = 0xffff;
    // Stationary victim (sheltered without a zone): a hit victim would otherwise run away.
    s.civilians.kind[c] = CS_SHELTERED;
    spawnZombie(s, s.civilians.posX[c] as number, s.civilians.posY[c] as number, ZT_WALKER);
    let t = 0;
    while (w.civilianCount === 1 && (s.ct.turnTick[c] as number) < 0 && t < 200) w.step(t++);
    expect(t).toBeLessThan(200);
    expect((s.ct.turnTick[c] as number) >= 0 || w.counters.civiliansDead === 1).toBe(true);
  });
});

describe('noise and screamers', () => {
  it('noise decays once per second by keepPerS and walkers follow it', () => {
    const w = emptyWorld();
    const s = w.s;
    s.noise.emit(500, 500, 50, 150);
    const v0 = s.noise.sample(500, 500);
    s.noise.decay(1);
    expect(s.noise.sample(500, 500)).toBe(v0);
    s.noise.decay(TICK_RATE);
    expect(s.noise.sample(500, 500)).toBeCloseTo(v0 * NOISE.keepPerS, 3);
    const z = spawnZombie(s, 420, 500, ZT_SCREAMER);
    s.noise.level.fill(0);
    const d0 = Math.hypot((s.zombies.posX[z] as number) - 500, (s.zombies.posY[z] as number) - 500);
    for (let t = 1; t < 200; t++) {
      if (t % TICK_RATE === 1) s.noise.emit(500, 500, 50, 150);
      w.step(t);
    }
    const d1 = Math.hypot((s.zombies.posX[z] as number) - 500, (s.zombies.posY[z] as number) - 500);
    expect(d1).toBeLessThan(d0 - 5);
  });

  it('a screamer with a human in sight screams: noise, speed boost nearby, then cooldown', () => {
    const w = emptyWorld();
    const s = w.s;
    placeCivilians(s, 500, 500, 1, 0xffff);
    s.routine.timer[s.placed[0] as number] = 0xffff;
    const sc = spawnZombie(s, 510, 500, ZT_SCREAMER);
    const near = spawnZombie(s, 560, 500, ZT_WALKER);
    const far = spawnZombie(s, 300, 300, ZT_WALKER);
    let t = 0;
    while ((s.zt.screamAt[sc] as number) === 0 && t < 40) w.step(t++);
    expect(s.zt.screamAt[sc]).toBe(t - 1 + SCREAMER.cooldownS * TICK_RATE);
    expect(s.zt.boostUntil[near]).toBe(t - 1 + SCREAMER.durationS * TICK_RATE);
    expect(s.zt.boostUntil[far]).toBe(0);
    expect(s.noise.sample(510, 500)).toBeGreaterThan(SCREAMER.noise / 2);
  });
});

describe('outbreak runs deterministically', () => {
  it('same seed and commands give the same hash with an outbreak; the infection spreads', () => {
    const cmds = [outbreak(20)];
    const a = runHeadless(createWorld, SEED, SMALL, 2400, cmds);
    const b = runHeadless(createWorld, SEED, SMALL, 2400, cmds);
    expect(a.hash).toBe(b.hash);
    const w = new CityWorld(SEED, SMALL);
    w.applyCommand(outbreak(0));
    for (let t = 0; t < 2400; t++) w.step(t);
    expect(w.zombieCount + w.counters.incubating).toBeGreaterThan(5);
    let cells = 0;
    for (const v of w.s.infection) if (v > 0) cells++;
    expect(cells).toBeGreaterThan(5);
  }, 20_000);
});
