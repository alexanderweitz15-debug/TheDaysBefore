// M3 acceptance (GDD 17): the player can hold a street, walls take pressure damage, collateral damage is counted.
// Thresholds calibrated against the sim at M3 close: defended 0 of 300 behind the line, control 239 to 302 (cap 300).
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { SimHost } from '../src/core/sim-host';
import type { WorldOptions } from '../src/core/types/sim';
import { createWorld } from '../src/sim/world';
import {
  at,
  clearResidents,
  findStreet,
  placeUnit,
  placeWall,
  type Street,
  spawn,
  zombiesInBox,
} from './m3-helpers';

const SMALL: WorldOptions = { size: 'small' };
const SEEDS = [11, 22];

// Layout in street coordinates (s along the street towards the defended side, l across), meters.
const MIN_STREET_M = 110;
const MAP_MARGIN_M = 60;
const WALL_HALF_M = 10;
const FRONT_S = -45;
const BAIT_S = 40;
const HORDE = 300;
const BAIT_CIVILIANS = 40;
/** Zombies in this box count as "behind the line". */
const BEHIND_FROM_S = 6;
const BEHIND_HALF_L = 40;
const BUILD_MAX_TICKS = 6000;
const HOLD_TICKS = 2400;
/** Defended: at most this share of the horde may get behind the line; the control arm must lose at least that much more. */
const MAX_BREAKTHROUGH_SHARE = 0.03;
const MIN_CONTROL_SHARE = 0.5;
/** At least this share of the soldiers survives. */
const MIN_SOLDIERS_ALIVE = 0.75;

const unitsOf = (host: SimHost): number => host.world.units().length;
const structuresDone = (host: SimHost): boolean => {
  const all = host.world.structures();
  return all.length > 0 && all.every((s) => s.state === 'done');
};

function newHost(seed: number): { host: SimHost; st: Street } {
  const st = findStreet(createWorld(seed, SMALL), MIN_STREET_M, MAP_MARGIN_M);
  const host = new SimHost(seed, SMALL, createWorld);
  clearResidents(host.world);
  return { host, st };
}

function defenceCommands(st: Street): Command[] {
  return [
    placeWall('wall', at(st, 0, -WALL_HALF_M), at(st, 0, WALL_HALF_M)),
    placeUnit('engineers', at(st, 8, 0)),
    placeUnit('infantry', at(st, 14, -5)),
    placeUnit('infantry', at(st, 14, 5)),
    placeUnit('mgTeam', at(st, 12, 0)),
  ];
}

const run = (host: SimHost, ticks: number): void => {
  for (let t = 0; t < ticks; t++) host.runTick();
};

/** Builds the defence, returns the ticks it took. Hold orders are the default stance. */
function buildDefence(host: SimHost, st: Street): number {
  for (const c of defenceCommands(st)) host.enqueue(c);
  let t = 0;
  for (; t < BUILD_MAX_TICKS && !(structuresDone(host) && t > 0); t++) host.runTick();
  return t;
}

interface HoldResult {
  behind: number;
  squadsPlaced: number;
  squadsAlive: number;
  soldiersLost: number;
  zombiesKilled: number;
  builtTicks: number;
}

function runHold(seed: number, defended: boolean, builtTicks?: number): HoldResult {
  const { host, st } = newHost(seed);
  host.enqueue(spawn(at(st, BAIT_S, 0), BAIT_CIVILIANS, 'civilian'));
  let ticks = builtTicks ?? 0;
  if (defended) ticks = buildDefence(host, st);
  else run(host, ticks);
  const squadsPlaced = unitsOf(host);
  host.enqueue(spawn(at(st, FRONT_S, 0), HORDE, 'zombie'));
  run(host, HOLD_TICKS);
  return {
    behind: zombiesInBox(host.world, st, BEHIND_FROM_S, st.lengthM / 2, BEHIND_HALF_L),
    squadsPlaced,
    squadsAlive: unitsOf(host),
    soldiersLost: host.world.counters.soldiersLost,
    zombiesKilled: host.world.counters.zombiesKilled,
    builtTicks: ticks,
  };
}

describe('M3 scenario helpers (no combat needed)', () => {
  it('finds a straight street of road cells with a defended side inside the map', () => {
    for (const seed of SEEDS) {
      const w = createWorld(seed, SMALL);
      const st = findStreet(w, MIN_STREET_M, MAP_MARGIN_M);
      expect(st.lengthM).toBeGreaterThanOrEqual(MIN_STREET_M);
      expect(Math.hypot(st.u.x, st.u.y)).toBeCloseTo(1);
      expect(st.u.x * st.n.x + st.u.y * st.n.y).toBeCloseTo(0);
      for (const s of [FRONT_S, 0, BAIT_S]) {
        const p = at(st, s, 0);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(w.widthM);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(w.heightM);
      }
      expect(Math.abs(FRONT_S)).toBeLessThan(st.lengthM / 2);
      expect(BAIT_S).toBeLessThan(st.lengthM / 2);
    }
  });

  it('the street choice is stable per seed', () => {
    const a = findStreet(createWorld(11, SMALL), MIN_STREET_M, MAP_MARGIN_M);
    const b = findStreet(createWorld(11, SMALL), MIN_STREET_M, MAP_MARGIN_M);
    expect(b).toEqual(a);
  });
});

describe('M3 acceptance (a): hold a street', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: wall, infantry and an MG team stop the horde; without defence it breaks through`, () => {
      const defended = runHold(seed, true);
      const control = runHold(seed, false, defended.builtTicks);
      expect(defended.squadsPlaced).toBe(3 + 1);
      expect(defended.behind).toBeLessThanOrEqual(HORDE * MAX_BREAKTHROUGH_SHARE);
      expect(control.behind).toBeGreaterThanOrEqual(HORDE * MIN_CONTROL_SHARE);
      expect(defended.squadsAlive).toBe(defended.squadsPlaced);
      expect(defended.zombiesKilled).toBeGreaterThan(0);
      const soldiers = 8 + 8 + 3 + 6;
      expect(defended.soldiersLost).toBeLessThanOrEqual(soldiers * (1 - MIN_SOLDIERS_ALIVE));
    }, 300_000);
  }
});

describe('M3 acceptance (b): walls take pressure damage', () => {
  const PUSH_ZOMBIES = 60;
  const PRESS_TICKS = 600;

  function wallHp(pressure: boolean): { before: number; after: number; max: number } {
    const { host, st } = newHost(SEEDS[0] as number);
    for (const c of [
      placeWall('wall', at(st, 0, -WALL_HALF_M), at(st, 0, WALL_HALF_M)),
      placeUnit('engineers', at(st, 10, 0)),
    ])
      host.enqueue(c);
    let t = 0;
    for (; t < BUILD_MAX_TICKS && !(structuresDone(host) && t > 0); t++) host.runTick();
    const wall = (): { hp: number; maxHp: number } => {
      const w = host.world.structures().find((s) => s.kind === 'wall');
      if (!w) throw new Error('wall missing');
      return w;
    };
    const before = wall().hp;
    // Bait on the far side so the zombies push against the wall.
    host.enqueue(spawn(at(st, BAIT_S, 0), BAIT_CIVILIANS, 'civilian'));
    if (pressure) host.enqueue(spawn(at(st, -4, 0), PUSH_ZOMBIES, 'zombie'));
    run(host, PRESS_TICKS);
    return { before, after: wall().hp, max: wall().maxHp };
  }

  it('hp drops while zombies press against the wall and stays put without them', () => {
    const calm = wallHp(false);
    expect(calm.after).toBe(calm.before);
    expect(calm.before).toBe(calm.max);
    const pressed = wallHp(true);
    expect(pressed.before).toBe(pressed.max);
    expect(pressed.after).toBeLessThan(pressed.before);
  }, 300_000);
});

describe('M3 acceptance (c): collateral damage is counted', () => {
  const MIX = 60;
  const OBSERVE_TICKS = 600;

  type Arm = 'free+attack' | 'free, no order' | 'onCommand, no order' | 'onCommand+attack';
  function collateral(arm: Arm): { collateral: number; civiliansDead: number } {
    const { host, st } = newHost(SEEDS[0] as number);
    host.enqueue(placeUnit('mortar', at(st, -50, 0)));
    // A rifle squad 45 m from the target: it spots the group (spot radius 60 m, danger close 20 m), which a mortar in free mode needs to fire on its own.
    host.enqueue(placeUnit('infantry', at(st, 5, 0)));
    host.runTick();
    const ids = host.world
      .units()
      .filter((u) => u.type === 'mortar')
      .map((u) => u.id);
    expect(ids.length).toBe(1);
    const target = at(st, 50, 0);
    host.enqueue({
      tick: 0,
      playerId: 0,
      type: 'SetFireMode',
      payload: { unitIds: ids, mode: arm.startsWith('free') ? 'free' : 'onCommand' },
    });
    host.enqueue(spawn(target, MIX, 'zombie'));
    host.enqueue(spawn(target, MIX, 'civilian'));
    if (arm === 'free+attack' || arm === 'onCommand+attack')
      host.enqueue({
        tick: 0,
        playerId: 0,
        type: 'AttackArea',
        payload: { unitIds: ids, x: target.x, y: target.y },
      });
    run(host, OBSERVE_TICKS);
    return {
      collateral: host.world.counters.collateralKills,
      civiliansDead: host.world.counters.civiliansDead,
    };
  }

  it('a mortar barrage on zombies mixed with civilians kills civilians, counted as collateral', () => {
    expect(collateral('free+attack').collateral).toBeGreaterThan(0);
    expect(collateral('onCommand+attack').collateral).toBeGreaterThan(0);
  }, 300_000);

  it('fire mode on command without an order never fires on its own: no collateral', () => {
    // Control: the same mortar in free mode does engage the group by itself, so the 0 is not an idle mortar.
    expect(collateral('free, no order').collateral).toBeGreaterThan(0);
    expect(collateral('onCommand, no order').collateral).toBe(0);
  }, 300_000);
});

describe('M3 determinism with combat', () => {
  it('same seed and commands (walls, squads, area fire) give the same hash', () => {
    const once = (): string => {
      const { host, st } = newHost(SEEDS[0] as number);
      for (const c of defenceCommands(st)) host.enqueue(c);
      host.enqueue(spawn(at(st, FRONT_S, 0), HORDE, 'zombie'));
      host.enqueue({ ...placeUnit('mortar', at(st, 20, 0)), tick: 100 });
      run(host, 1500);
      expect(host.world.structures().length).toBeGreaterThan(0);
      return host.hash().value.toString(16);
    };
    expect(once()).toBe(once());
  }, 300_000);
});
