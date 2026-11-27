// M5b acceptance (decision 2026-11-27: no RTS, orders only): a street is held by order alone, garrisons lose
// integrity under pressure and are thrown out at 0, losses are replaced from the reserve, CancelOrder returns
// squads.
import { describe, expect, it } from 'vitest';
import type { Command, SquadRequest } from '../src/core/commands';
import { hashHex } from '../src/core/hash';
import { SimHost } from '../src/core/sim-host';
import type { WorldOptions } from '../src/core/types/sim';
import { createWorld } from '../src/sim/world';
import type { Point } from './m2-helpers';
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
const SEED = 11;
// Same layout as the M3 street hold (tests/m3-acceptance.test.ts), now commanded by orders only.
const MIN_STREET_M = 110;
const MAP_MARGIN_M = 60;
const WALL_HALF_M = 10;
const FRONT_S = -45;
const HORDE = 300;
const BEHIND_FROM_S = 6;
const BEHIND_HALF_L = 40;
const BUILD_MAX_TICKS = 6000;
const HOLD_TICKS = 2400;
const MAX_BREAKTHROUGH_SHARE = 0.03;
const MIN_CONTROL_SHARE = 0.5;
const MIN_SOLDIERS_ALIVE = 0.75;

const LINE_SQUADS: SquadRequest = { infantry: 2, mgTeam: 1, engineers: 1 };
const LINE_TOTAL = 4;
const CORNER_INSET_M = 30;
// Civilians behind the line draw the horde through the street (as in the M3 hold).
const BAIT_S = 40;
const BAIT_CIVILIANS = 40;

const cmd = (tick: number, type: Command['type'], payload: unknown): Command =>
  ({ tick, playerId: 0, type, payload }) as Command;

function newHost(seed = SEED): { host: SimHost; st: Street } {
  const st = findStreet(createWorld(seed, SMALL), MIN_STREET_M, MAP_MARGIN_M);
  const host = new SimHost(seed, SMALL, createWorld);
  clearResidents(host.world);
  return { host, st };
}

const run_ = (host: SimHost, ticks: number): void => {
  for (let t = 0; t < ticks; t++) host.runTick();
};

/** Buys the squads of `request` into the reserve (free mode: they idle where bought, so `at` should be far away). */
function buy(
  host: SimHost,
  st: Street,
  request: SquadRequest,
  extra: SquadRequest = {},
  where: Point = st.centre,
): void {
  const total: SquadRequest = { ...request };
  for (const [k, n] of Object.entries(extra))
    total[k as keyof SquadRequest] = (total[k as keyof SquadRequest] ?? 0) + (n ?? 0);
  for (const [type, n] of Object.entries(total))
    for (let i = 0; i < (n ?? 0); i++)
      host.enqueue({ ...placeUnit(type as 'infantry', where), tick: host.tick });
}

/** Wall across the street at s = 0 and a DefendLine just behind it. */
function holdStreet(host: SimHost, st: Street, request: SquadRequest = LINE_SQUADS): void {
  buy(host, st, request);
  host.enqueue({ ...placeWall('wall', at(st, 0, -WALL_HALF_M), at(st, 0, WALL_HALF_M)), tick: host.tick });
  const a = at(st, 12, -WALL_HALF_M / 2);
  const b = at(st, 12, WALL_HALF_M / 2);
  host.enqueue(
    cmd(host.tick, 'DefendLine', { points: [a.x, a.y, b.x, b.y], squads: request, stance: 'hold' }),
  );
}

/** The map corner (inset) farthest from the street: idle squads bought there cannot interfere with the horde. */
function farCorner(host: SimHost, st: Street): Point {
  const { widthM, heightM } = host.world;
  let best: Point = { x: CORNER_INSET_M, y: CORNER_INSET_M };
  let bestD = -1;
  for (const x of [CORNER_INSET_M, widthM - CORNER_INSET_M])
    for (const y of [CORNER_INSET_M, heightM - CORNER_INSET_M]) {
      const d = Math.hypot(x - st.centre.x, y - st.centre.y);
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

const orderList = (host: SimHost) => host.world.orders().orders;

function waitUntil(host: SimHost, ok: () => boolean, maxTicks: number): number {
  let t = 0;
  while (t < maxTicks && !ok()) {
    host.runTick();
    t++;
  }
  return t;
}

const inPosition = (host: SimHost): boolean => {
  const o = orderList(host)[0];
  const done = host.world.structures().every((s) => s.state === 'done');
  return !!o && o.status === 'active' && o.inPosition >= LINE_TOTAL && done;
};

describe('M5b street hold by order', () => {
  it('the order holds the street; the same horde without an order breaks through', () => {
    const behindShares: { held: number; control: number } = { held: 0, control: 0 };
    for (const defended of [true, false]) {
      const { host, st } = newHost();
      if (defended) {
        holdStreet(host, st);
        const built = waitUntil(host, () => inPosition(host), BUILD_MAX_TICKS);
        expect(built, 'order in position and wall built in time').toBeLessThan(BUILD_MAX_TICKS);
      } else {
        // Control (as in M3: no wall): squads are bought but get no order and idle where bought, far away.
        buy(host, st, LINE_SQUADS, {}, farCorner(host, st));
        run_(host, 1500);
      }
      host.enqueue({ ...spawn(at(st, BAIT_S, 0), BAIT_CIVILIANS, 'civilian'), tick: host.tick });
      host.enqueue({ ...spawn(at(st, FRONT_S, 0), HORDE, 'zombie'), tick: host.tick });
      run_(host, HOLD_TICKS);
      const behind = zombiesInBox(host.world, st, BEHIND_FROM_S, st.lengthM / 2, BEHIND_HALF_L);
      if (defended) {
        behindShares.held = behind / HORDE;
        expect(host.world.counters.soldiersLost).toBeLessThanOrEqual(
          LINE_TOTAL * (1 - MIN_SOLDIERS_ALIVE) * 4,
        );
        expect(orderList(host)[0]?.status).not.toBe('lost');
      } else {
        behindShares.control = behind / HORDE;
        expect(host.world.counters.soldiersLost, 'control squads stayed out of the fight').toBe(0);
      }
    }
    expect(behindShares.held).toBeLessThanOrEqual(MAX_BREAKTHROUGH_SHARE);
    expect(behindShares.control).toBeGreaterThanOrEqual(MIN_CONTROL_SHARE);
  });

  it('PlaceUnit buys into the reserve: no squad stands on the street without an order', () => {
    const { host, st } = newHost();
    buy(host, st, { infantry: 3 });
    run_(host, 200);
    const { reserve } = host.world.orders();
    expect(reserve.idle.infantry).toBe(3);
    expect(orderList(host)).toHaveLength(0);
  });

  it('same orders, same hash', () => {
    const hashOf = (): string => {
      const { host, st } = newHost();
      holdStreet(host, st);
      run_(host, 1500);
      return hashHex(host.hash());
    };
    expect(hashOf()).toBe(hashOf());
  });
});

/** The tallest building within reach of the street centre (floors give cover and sight). */
function tallBuildingNear(host: SimHost, st: Street): { id: number; x: number; y: number } {
  const { buildings, cellSizeM } = host.world.map;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < buildings.count; i++) {
    const x = ((buildings.x[i] as number) + (buildings.w[i] as number) / 2) * cellSizeM;
    const y = ((buildings.y[i] as number) + (buildings.h[i] as number) / 2) * cellSizeM;
    const d = Math.hypot(x - st.centre.x, y - st.centre.y);
    const floors = buildings.floors[i] as number;
    if (floors < 2 || d > 150) continue;
    const score = floors * 1000 - d;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) throw new Error('no multi-storey building near the street');
  return {
    id: best,
    x: ((buildings.x[best] as number) + (buildings.w[best] as number) / 2) * cellSizeM,
    y: ((buildings.y[best] as number) + (buildings.h[best] as number) / 2) * cellSizeM,
  };
}

describe('M5b garrison', () => {
  it('a squad enters the building, integrity falls under pressure, at 0 the garrison is thrown out', () => {
    const { host, st } = newHost();
    const b = tallBuildingNear(host, st);
    buy(host, st, { infantry: 1 });
    host.enqueue(
      cmd(host.tick, 'OccupyBuilding', { buildingId: b.id, squads: { infantry: 1 }, stance: 'hold' }),
    );
    const garrison = () => host.world.orders().garrisons.find((g) => g.buildingId === b.id);
    waitUntil(host, () => (garrison()?.unitIds.length ?? 0) === 1, 4000);
    expect(garrison()?.unitIds).toHaveLength(1);
    expect(garrison()?.integrity).toBeCloseTo(1, 5);
    expect(orderList(host)[0]?.status).toBe('active');

    host.enqueue({ ...spawn({ x: b.x + 20, y: b.y }, 1500, 'zombie'), tick: host.tick });
    let last = 1;
    let minIntegrity = 1;
    for (let t = 0; t < 6000 && garrison(); t++) {
      host.runTick();
      const g = garrison();
      if (!g) break;
      expect(g.integrity, 'integrity never recovers while under pressure').toBeLessThanOrEqual(last + 1e-6);
      last = g.integrity;
      minIntegrity = Math.min(minIntegrity, g.integrity);
    }
    expect(minIntegrity).toBeLessThan(1);
    expect(garrison(), 'garrison thrown out at integrity 0').toBeUndefined();
    expect(['failing', 'lost', 'pending']).toContain(orderList(host)[0]?.status);
  });

  it('a garrisoned squad shoots from the building (zombies in range die)', () => {
    const { host, st } = newHost();
    const b = tallBuildingNear(host, st);
    buy(host, st, { infantry: 1, mgTeam: 1 });
    host.enqueue(
      cmd(host.tick, 'OccupyBuilding', {
        buildingId: b.id,
        squads: { infantry: 1, mgTeam: 1 },
        stance: 'hold',
      }),
    );
    waitUntil(
      host,
      () => (host.world.orders().garrisons.find((g) => g.buildingId === b.id)?.unitIds.length ?? 0) === 2,
      4000,
    );
    host.enqueue({ ...spawn({ x: b.x + 25, y: b.y }, 40, 'zombie'), tick: host.tick });
    run_(host, 1200);
    expect(host.world.counters.zombiesKilled).toBeGreaterThan(10);
  });
});

describe('M5b replacement and cancel', () => {
  it('losses are replaced from the reserve', () => {
    const { host, st } = newHost();
    // Two squads on the line, four more idle in the reserve.
    holdStreet(host, st, { infantry: 2 });
    buy(host, st, { infantry: 4 });
    waitUntil(host, () => (orderList(host)[0]?.inPosition ?? 0) >= 2, BUILD_MAX_TICKS);
    const idleBefore = host.world.orders().reserve.idle.infantry ?? 0;
    expect(idleBefore).toBeGreaterThanOrEqual(4);
    // A horde that costs at least one squad.
    host.enqueue({ ...spawn(at(st, FRONT_S, 0), 600, 'zombie'), tick: host.tick });
    waitUntil(host, () => host.world.counters.soldiersLost > 0, 4000);
    expect(host.world.counters.soldiersLost).toBeGreaterThan(0);
    run_(host, 600);
    const idleAfter = host.world.orders().reserve.idle.infantry ?? 0;
    expect(idleAfter, 'a reserve squad was sent to the line').toBeLessThan(idleBefore);
    expect(orderList(host)[0]?.assigned.length).toBeGreaterThanOrEqual(1);
  });

  it('CancelOrder removes the order and the squads walk back to the reserve', () => {
    const { host, st } = newHost();
    buy(host, st, { infantry: 2 });
    const a = at(st, 40, -10);
    const b = at(st, 40, 10);
    host.enqueue(
      cmd(host.tick, 'DefendLine', { points: [a.x, a.y, b.x, b.y], squads: { infantry: 2 }, stance: 'hold' }),
    );
    waitUntil(host, () => (orderList(host)[0]?.inPosition ?? 0) >= 2, 4000);
    expect(host.world.orders().reserve.idle.infantry ?? 0).toBe(0);
    const id = orderList(host)[0]?.id as number;
    host.enqueue(cmd(host.tick, 'CancelOrder', { orderId: id }));
    run_(host, 2);
    expect(orderList(host)).toHaveLength(0);
    expect(host.world.orders().reserve.returning).toBe(2);
    waitUntil(host, () => (host.world.orders().reserve.idle.infantry ?? 0) === 2, 4000);
    expect(host.world.orders().reserve.idle.infantry).toBe(2);
    expect(host.world.orders().reserve.returning).toBe(0);
  });

  it('an order larger than the reserve stays pending and fills up when squads are bought', () => {
    const { host, st } = newHost();
    buy(host, st, { infantry: 1 });
    const a = at(st, 30, -10);
    const b = at(st, 30, 10);
    host.enqueue(
      cmd(host.tick, 'DefendLine', { points: [a.x, a.y, b.x, b.y], squads: { infantry: 2 }, stance: 'hold' }),
    );
    run_(host, 600);
    expect(orderList(host)[0]?.status).toBe('pending');
    buy(host, st, { infantry: 1 });
    waitUntil(host, () => orderList(host)[0]?.status === 'active', 4000);
    expect(orderList(host)[0]?.status).toBe('active');
    expect(orderList(host)[0]?.assigned).toHaveLength(2);
  });
});
