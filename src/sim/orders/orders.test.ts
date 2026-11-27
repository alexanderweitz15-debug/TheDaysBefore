import { describe, expect, it } from 'vitest';
import type { CommandInput, SquadRequest, Stance } from '../../core/commands';
import { GARRISON, garrisonCapacity, ORDER_RULES } from '../../data/orders';
import { emptyWorld, pin, run, send, unitAt, zombieAt } from '../combat/test-fixtures';
import { damageUnit, removeUnit } from '../combat/unit-damage';
import { US_GARRISONED, US_IDLE, US_POSTED, US_RETURNING, UT_HP, UT_SIZE } from '../combat/units';
import { missionWorld } from '../economy/test-fixtures';
import type { CityWorld } from '../world';
import { buildingCapacity } from './garrison';

const order = (w: CityWorld, type: CommandInput['type'], payload: object): void =>
  send(w, { type, playerId: 0, payload } as CommandInput);
const line = (w: CityWorld, points: number[], squads: SquadRequest, stance: Stance = 'hold') =>
  order(w, 'DefendLine', { points, squads, stance });
const views = (w: CityWorld) => w.orders();
const first = (w: CityWorld) => views(w).orders[0];

/** Runs until ok() or maxTicks; returns the ticks used. */
function until(w: CityWorld, ok: () => boolean, maxTicks: number): number {
  let t = 0;
  while (t < maxTicks && !ok()) {
    run(w, 1);
    t++;
  }
  return t;
}

/** A building with at least `floors` floors and a 3 x 3 footprint; centre in meters. */
function building(w: CityWorld, floors: number): { b: number; x: number; y: number } {
  const B = w.s.map.buildings;
  const cm = w.s.cellM;
  for (let b = 0; b < B.count; b++) {
    if ((B.floors[b] as number) < floors || (B.w[b] as number) < 3 || (B.h[b] as number) < 3) continue;
    return {
      b,
      x: ((B.x[b] as number) + (B.w[b] as number) / 2) * cm,
      y: ((B.y[b] as number) + (B.h[b] as number) / 2) * cm,
    };
  }
  throw new Error('no building');
}

/** Walkable point next to (x, y). */
function near(w: CityWorld, x: number, y: number): [number, number] {
  const s = w.s;
  for (let r = 0; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx * s.cellM;
        const py = y + dy * s.cellM;
        if (s.inMap(px, py) && s.walkable[s.cellOf(px, py)]) return [px, py];
      }
  throw new Error('no walkable cell');
}

describe('orders: reserve', () => {
  it('PlaceUnit buys into the reserve at the HQ in missions, at the point in free mode', () => {
    const m = missionWorld({ startResources: { budget: 50_000, material: 400, food: 1500 } });
    const { hqX, hqY } = m.s.eco;
    send(m, { type: 'PlaceUnit', playerId: 0, payload: { unitType: 'infantry', x: 10, y: 10 } });
    send(m, { type: 'PlaceUnit', playerId: 0, payload: { unitType: 'infantry', x: 900, y: 900 } });
    const p = m.s.units.pool;
    const spots = new Set<number>();
    for (const u of [0, 1]) {
      expect(Math.hypot((p.posX[u] as number) - hqX, (p.posY[u] as number) - hqY)).toBeLessThan(30);
      spots.add(p.cell[u] as number);
    }
    expect(spots.size, 'two squads, two spots').toBe(2);
    expect(views(m).reserve.idle.infantry).toBe(2);
    expect(views(m).orders).toHaveLength(0);

    const w = emptyWorld();
    send(w, { type: 'PlaceUnit', playerId: 0, payload: { unitType: 'mgTeam', x: 50, y: 50 } });
    expect(w.s.units.pool.posX[0]).toBeCloseTo(50, 3);
    expect(w.s.units.ostate[0]).toBe(US_IDLE);
    expect(views(w).reserve.idle.mgTeam).toBe(1);
  });

  it('idle reserve squads at the HQ engage zombies near their spot and walk back', () => {
    const m = missionWorld({ startResources: { budget: 50_000, material: 400, food: 1500 } });
    send(m, { type: 'PlaceUnit', playerId: 0, payload: { unitType: 'infantry', x: 0, y: 0 } });
    const p = m.s.units.pool;
    const hx = p.posX[0] as number;
    const hy = p.posY[0] as number;
    // Zombies 60 m away: out of weapon range, inside the reserve's defence radius.
    let zx = 0;
    let zy = 0;
    for (const [dx, dy] of [
      [60, 0],
      [-60, 0],
      [0, 60],
      [0, -60],
    ] as const) {
      const c = m.s.cellOf(hx + dx, hy + dy);
      if (m.s.walkable[c]) {
        zx = hx + dx;
        zy = hy + dy;
        break;
      }
    }
    expect(zx + zy).toBeGreaterThan(0);
    const zs = [0, 1, 2].map(() => zombieAt(m, zx, zy));
    let moved = 0;
    run(m, 1000, () => {
      for (const z of zs) if (m.s.zombies.alive[z]) pin(m, z, zx, zy);
      moved = Math.max(moved, Math.hypot((p.posX[0] as number) - hx, (p.posY[0] as number) - hy));
    });
    expect(zs.every((z) => !m.s.zombies.alive[z])).toBe(true);
    expect(moved).toBeGreaterThan(10);
    run(m, 800);
    expect(Math.hypot((p.posX[0] as number) - hx, (p.posY[0] as number) - hy)).toBeLessThan(
      ORDER_RULES.returnM + 1,
    );
  });
});

describe('orders: DefendLine', () => {
  it('spreads squads evenly along the line and holds', () => {
    const w = emptyWorld();
    for (const x of [10, 14, 18]) unitAt(w, 'infantry', x, 10);
    line(w, [20, 60, 80, 60], { infantry: 3 });
    until(w, () => first(w)?.status === 'active', 2000);
    const o = first(w);
    expect(o?.status).toBe('active');
    expect(o?.inPosition).toBe(3);
    const p = w.s.units.pool;
    const xs = (o?.assigned ?? []).map((u) => p.posX[u] as number).sort((a, b) => a - b);
    // Posts at 1/6, 3/6, 5/6 of 60 m (cell-snapped), behind the line.
    expect(xs[0]).toBeCloseTo(30, -1);
    expect(xs[1]).toBeCloseTo(50, -1);
    expect(xs[2]).toBeCloseTo(70, -1);
    for (const u of o?.assigned ?? []) expect(Math.abs((p.posY[u] as number) - 60)).toBeLessThan(5);
    expect(views(w).reserve.idle.infantry ?? 0).toBe(0);
    run(w, 400);
    for (const u of o?.assigned ?? []) expect(w.s.units.ostate[u]).toBe(US_POSTED);
  });

  it('faces the side with more zombies: posts move behind the line when the horde shows up', () => {
    const w = emptyWorld();
    for (const x of [10, 14]) unitAt(w, 'infantry', x, 10);
    line(w, [30, 50, 70, 50], { infantry: 2 });
    until(w, () => first(w)?.status === 'active', 2000);
    const p = w.s.units.pool;
    const ids = first(w)?.assigned ?? [];
    const before = Math.sign((p.posY[ids[0] as number] as number) - 50);
    expect(before).not.toBe(0);
    // Horde on the side where the squads stand: that is the enemy side now.
    const zy = 50 + before * 40;
    const zs = Array.from({ length: 40 }, (_, k) => zombieAt(w, 40 + (k % 10) * 2, zy));
    send(w, { type: 'SetFireMode', playerId: 0, payload: { unitIds: ids, mode: 'onCommand' } });
    run(w, ORDER_RULES.sideCheckTicks + 200, () => {
      zs.forEach((z, k) => {
        pin(w, z, 40 + (k % 10) * 2, zy);
      });
    });
    for (const u of ids) expect(Math.sign((p.posY[u] as number) - 50)).toBe(-before);
  });

  it('replaces losses from the reserve (nearest first)', () => {
    const w = emptyWorld();
    const a = unitAt(w, 'infantry', 30, 20);
    const far = unitAt(w, 'infantry', 90, 90);
    const close = unitAt(w, 'infantry', 50, 30);
    line(w, [40, 50, 60, 50], { infantry: 1 });
    run(w, ORDER_RULES.assignIntervalTicks + 1);
    // `close` is nearest to the post at x = 50.
    expect(first(w)?.assigned).toEqual([close]);
    until(w, () => first(w)?.status === 'active', 2000);
    removeUnit(w.s, close);
    run(w, ORDER_RULES.assignIntervalTicks + 1);
    expect(first(w)?.assigned).toEqual([a]);
    expect(views(w).reserve.idle.infantry).toBe(1);
    expect(w.s.units.order[far]).toBe(-1);
    until(w, () => first(w)?.status === 'active', 2000);
    expect(first(w)?.inPosition).toBe(1);
  });

  it('stays pending while the reserve is short, fills up when squads are bought', () => {
    const w = emptyWorld();
    unitAt(w, 'infantry', 20, 20);
    line(w, [30, 50, 70, 50], { infantry: 2 });
    run(w, 600);
    expect(first(w)?.status).toBe('pending');
    expect(first(w)?.assigned).toHaveLength(1);
    send(w, { type: 'PlaceUnit', playerId: 0, payload: { unitType: 'infantry', x: 20, y: 24 } });
    until(w, () => first(w)?.status === 'active', 2000);
    expect(first(w)?.status).toBe('active');
    expect(first(w)?.assigned).toHaveLength(2);
  });

  it('holdUntilLosses: a squad at 50 % leaves the order and is replaced', () => {
    const w = emptyWorld();
    const a = unitAt(w, 'infantry', 50, 40);
    const b = unitAt(w, 'infantry', 20, 20);
    line(w, [40, 50, 60, 50], { infantry: 1 }, 'holdUntilLosses');
    until(w, () => first(w)?.status === 'active', 2000);
    expect(first(w)?.assigned).toEqual([a]);
    damageUnit(w.s, a, 0.6 * 8 * 100, false);
    run(w, ORDER_RULES.assignIntervalTicks + 2);
    expect(w.s.units.order[a]).toBe(-1);
    expect(first(w)?.assigned).toEqual([b]);
  });

  it('CancelOrder sends the squads back to the reserve', () => {
    const w = emptyWorld();
    const ids = [unitAt(w, 'infantry', 10, 10), unitAt(w, 'mgTeam', 14, 10)];
    line(w, [30, 60, 70, 60], { infantry: 1, mgTeam: 1 });
    until(w, () => first(w)?.status === 'active', 2000);
    send(w, { type: 'CancelOrder', playerId: 0, payload: { orderId: first(w)?.id as number } });
    run(w, 1);
    expect(views(w).orders).toHaveLength(0);
    expect(views(w).reserve.returning).toBe(2);
    for (const u of ids) expect(w.s.units.ostate[u]).toBe(US_RETURNING);
    until(w, () => views(w).reserve.returning === 0, 2000);
    expect(views(w).reserve.idle).toEqual({ infantry: 1, mgTeam: 1 });
    const p = w.s.units.pool;
    expect(
      Math.hypot((p.posX[ids[0] as number] as number) - 10, (p.posY[ids[0] as number] as number) - 10),
    ).toBeLessThan(2);
  });

  it('UpdateOrder changes strength and stance', () => {
    const w = emptyWorld();
    for (const x of [10, 14, 18]) unitAt(w, 'infantry', x, 10);
    line(w, [30, 60, 70, 60], { infantry: 3 });
    until(w, () => first(w)?.status === 'active', 2000);
    const id = first(w)?.id as number;
    order(w, 'UpdateOrder', { orderId: id, squads: { infantry: 1 }, stance: 'aggressive' });
    run(w, 1);
    expect(first(w)?.assigned).toHaveLength(1);
    expect(first(w)?.stance).toBe('aggressive');
    expect(views(w).reserve.returning).toBe(2);
    const u = first(w)?.assigned[0] as number;
    expect(w.units()[u]?.stance).toBe('aggressive');
  });
});

describe('orders: buildings', () => {
  it('capacity by floors and footprint (data function)', () => {
    expect(garrisonCapacity(1, 3)).toBe(1);
    expect(garrisonCapacity(2, 28)).toBe(4);
    expect(garrisonCapacity(20, 100)).toBe(GARRISON.maxSquads);
  });

  it('a squad occupies the building: inside, cover and sight bonus by floors, not attackable', () => {
    const w = emptyWorld();
    const { b, x, y } = building(w, 4);
    const [px, py] = near(w, x, y);
    const u = unitAt(w, 'infantry', px, py);
    order(w, 'OccupyBuilding', { buildingId: b, squads: { infantry: 1 }, stance: 'hold' });
    until(w, () => views(w).garrisons.length > 0, 3000);
    const g = views(w).garrisons[0];
    expect(g).toEqual({ buildingId: b, unitIds: [u], integrity: 1 });
    expect(first(w)?.status).toBe('active');
    const s = w.s;
    expect(s.units.ostate[u]).toBe(US_GARRISONED);
    expect(s.map.buildingId[s.units.pool.cell[u] as number]).toBe(b);
    run(w, 20);
    const floors = s.map.buildings.floors[b] as number;
    expect(s.units.rangeBonus[u]).toBeCloseTo(
      Math.min(GARRISON.maxSightBonusM, (floors - 1) * GARRISON.sightPerFloorM),
      5,
    );
    // Cover: half damage inside.
    const hp = s.units.pool.hp[u] as number;
    damageUnit(s, u, 100, false);
    expect(hp - (s.units.pool.hp[u] as number)).toBeCloseTo(100 * (1 - GARRISON.coverDamageReduction), 4);
    // Zombies at the walls cannot bite the garrison.
    const hp2 = s.units.pool.hp[u] as number;
    send(w, { type: 'SetFireMode', playerId: 0, payload: { unitIds: [u], mode: 'onCommand' } });
    const [zx, zy] = near(w, x, y);
    for (let k = 0; k < 20; k++) zombieAt(w, zx, zy);
    run(w, 200);
    expect(s.units.pool.hp[u]).toBe(hp2);
    expect(s.units.infCount[u]).toBe(0);
  });

  it('zombies wear down integrity; at 0 the garrison is forced out, hurt, and the order is lost', () => {
    const w = emptyWorld();
    const { b, x, y } = building(w, 4);
    const [px, py] = near(w, x, y);
    const u = unitAt(w, 'infantry', px, py);
    order(w, 'OccupyBuilding', { buildingId: b, squads: { infantry: 1 }, stance: 'hold' });
    until(w, () => views(w).garrisons.length > 0, 3000);
    send(w, { type: 'SetFireMode', playerId: 0, payload: { unitIds: [u], mode: 'onCommand' } });
    const s = w.s;
    const full = (UT_SIZE[0] as number) * (UT_HP[0] as number);
    expect(s.units.pool.hp[u]).toBe(full);
    const [zx, zy] = near(w, x, y);
    for (let k = 0; k < 60; k++) zombieAt(w, zx, zy);
    let last = 1;
    const t = until(
      w,
      () => {
        const g = views(w).garrisons[0];
        if (g) {
          expect(g.integrity).toBeLessThanOrEqual(last);
          last = g.integrity;
        }
        return !g;
      },
      8000,
    );
    expect(t).toBeLessThan(8000);
    expect(last).toBeLessThan(1);
    expect(s.orders.integrity[b]).toBe(0);
    expect(first(w)?.status).toBe('lost');
    if (s.units.pool.alive[u]) {
      expect(s.units.garrison[u]).toBe(-1);
      expect(s.walkable[s.units.pool.cell[u] as number]).toBe(1);
      expect(s.units.pool.hp[u] as number).toBeLessThan(full);
    }
    // A fallen building cannot be occupied again.
    const before = views(w).orders.length;
    order(w, 'OccupyBuilding', { buildingId: b, squads: { infantry: 1 }, stance: 'hold' });
    expect(views(w).orders.length).toBe(before);
  });

  it('a garrison fires from the building', () => {
    const w = emptyWorld();
    const { b, x, y } = building(w, 4);
    const [px, py] = near(w, x, y);
    const u = unitAt(w, 'infantry', px, py);
    order(w, 'OccupyBuilding', { buildingId: b, squads: { infantry: 1 }, stance: 'hold' });
    until(w, () => views(w).garrisons.length > 0, 3000);
    const [zx, zy] = near(w, x + 20, y);
    for (let k = 0; k < 10; k++) zombieAt(w, zx, zy);
    run(w, 400);
    expect(w.s.counters.zombiesKilled).toBeGreaterThanOrEqual(8);
    expect(w.s.units.garrison[u]).toBe(b);
  });

  it('capacity: extra squads and non-garrison types take posts next to the building', () => {
    const w = emptyWorld();
    const { b, x, y } = building(w, 4);
    const cap = buildingCapacity(w.s, b);
    const [px, py] = near(w, x, y);
    for (let k = 0; k < cap + 1; k++) unitAt(w, 'infantry', px, py);
    unitAt(w, 'mortar', px, py);
    order(w, 'OccupyBuilding', { buildingId: b, squads: { infantry: cap + 1, mortar: 1 }, stance: 'hold' });
    until(w, () => first(w)?.status === 'active', 4000);
    expect(first(w)?.status).toBe('active');
    expect(views(w).garrisons[0]?.unitIds).toHaveLength(cap);
    expect(first(w)?.inPosition).toBe(cap + 2);
  });
});

describe('orders: HoldZone', () => {
  it('occupies the highest buildings in the zone first and covers open streets', () => {
    const w = emptyWorld();
    const { x, y } = building(w, 4);
    const x0 = x - 60;
    const y0 = y - 60;
    const x1 = x + 60;
    const y1 = y + 60;
    const B = w.s.map.buildings;
    const cm = w.s.cellM;
    let top = 0;
    for (let b = 0; b < B.count; b++) {
      const cx = ((B.x[b] as number) + (B.w[b] as number) / 2) * cm;
      const cy = ((B.y[b] as number) + (B.h[b] as number) / 2) * cm;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) top = Math.max(top, B.floors[b] as number);
    }
    const [px, py] = near(w, x, y);
    unitAt(w, 'infantry', px, py);
    const mortar = unitAt(w, 'mortar', px, py);
    order(w, 'HoldZone', { x0, y0, x1, y1, squads: { infantry: 1, mortar: 1 }, stance: 'hold' });
    until(w, () => first(w)?.status === 'active', 4000);
    expect(first(w)?.status).toBe('active');
    const g = views(w).garrisons[0];
    expect(B.floors[g?.buildingId as number]).toBe(top);
    const c = w.s.units.pool.cell[mortar] as number;
    expect(w.s.map.terrain[c]).toBe(2);
  });

  it('clears zombies inside the zone (squads close in beyond weapon range)', () => {
    const w = emptyWorld();
    unitAt(w, 'infantry', 10, 10);
    order(w, 'HoldZone', { x0: 0, y0: 0, x1: 100, y1: 100, squads: { infantry: 1 }, stance: 'hold' });
    until(w, () => first(w)?.status === 'active', 2000);
    const u = first(w)?.assigned[0] as number;
    const p = w.s.units.pool;
    const post = [p.posX[u] as number, p.posY[u] as number] as const;
    // Five zombies 60+ m from the post, inside the zone, held in place.
    const zx = post[0] > 50 ? 5 : 95;
    const zy = post[1] > 50 ? 5 : 95;
    const zs = Array.from({ length: 5 }, () => zombieAt(w, zx, zy));
    run(w, 1200, () => {
      for (const z of zs) pin(w, z, zx, zy);
    });
    expect(zs.every((z) => !w.s.zombies.alive[z])).toBe(true);
    run(w, 1200);
    expect(Math.hypot((p.posX[u] as number) - post[0], (p.posY[u] as number) - post[1])).toBeLessThan(
      ORDER_RULES.returnM + 1,
    );
  });
});
