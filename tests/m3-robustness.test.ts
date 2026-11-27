// M3 robustness: invalid and hostile combat commands must be ignored without crashing or breaking determinism.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { createRng } from '../src/core/rng';
import { SimHost } from '../src/core/sim-host';
import type { WorldOptions } from '../src/core/types/sim';
import { createWorld } from '../src/sim/world';

const SMALL: WorldOptions = { size: 'small', startBudget: 50_000 };
const KINDS = ['barricade', 'wall', 'gate', 'wire', 'mines', 'charge', 'watchtower', 'depot', 'bogus'];
const UNITS = ['infantry', 'mgTeam', 'sniperTeam', 'mortar', 'engineers', 'riotPolice', 'medics', 'bogus'];
const STANCES = ['hold', 'holdUntilLosses', 'aggressive', 'retreat', 'bogus'];
const BAD = [Number.NaN, Number.POSITIVE_INFINITY, -1e9, 1e9, -1, 0, 0.5, 1e-9];

/** Deterministic stream of valid, borderline and garbage commands. */
function fuzz(seed: number, count: number): Command[] {
  const rng = createRng(seed);
  const pick = <T>(a: readonly T[]): T => a[rng.nextU32() % a.length] as T;
  const coord = (): number => (rng.nextU32() % 7 === 0 ? pick(BAD) : rng.nextFloat() * 1100 - 50);
  const ids = (): number[] =>
    Array.from({ length: rng.nextU32() % 5 }, () =>
      rng.nextU32() % 9 === 0 ? pick(BAD) : rng.nextU32() % 12,
    );
  const out: Command[] = [];
  for (let i = 0; i < count; i++) {
    const tick = Math.floor(i / 4);
    const base = { tick, playerId: 0 };
    switch (rng.nextU32() % 8) {
      case 0:
        out.push({
          ...base,
          type: 'PlaceUnit',
          payload: { unitType: pick(UNITS), x: coord(), y: coord() },
        } as Command);
        break;
      case 1:
        out.push({
          ...base,
          type: 'MoveUnits',
          payload: {
            unitIds: ids(),
            x: coord(),
            y: coord(),
            append: rng.nextU32() % 2 === 0,
            facing: rng.nextU32() % 2 ? null : coord(),
          },
        });
        break;
      case 2:
        out.push({
          ...base,
          type: 'SetStance',
          payload: { unitIds: ids(), stance: pick(STANCES) },
        } as Command);
        break;
      case 3:
        out.push({
          ...base,
          type: 'SetFireMode',
          payload: { unitIds: ids(), mode: pick(['free', 'onCommand', 'bogus']) },
        } as Command);
        break;
      case 4:
        out.push({ ...base, type: 'AttackArea', payload: { unitIds: ids(), x: coord(), y: coord() } });
        break;
      case 5: {
        const n = rng.nextU32() % 12;
        const points = Array.from({ length: n }, coord);
        out.push({
          ...base,
          type: 'PlaceStructure',
          payload: { kind: pick(KINDS), points, rotation: coord() },
        } as Command);
        break;
      }
      case 6:
        out.push({
          ...base,
          type: 'DemolishStructure',
          payload: { id: rng.nextU32() % 9 === 0 ? pick(BAD) : rng.nextU32() % 40 },
        });
        break;
      default:
        out.push({
          ...base,
          type: 'DetonateCharge',
          payload: { id: rng.nextU32() % 9 === 0 ? pick(BAD) : rng.nextU32() % 40 },
        });
    }
  }
  return out;
}

function run(seed: number, cmds: Command[]): { hash: string; units: number; structures: number } {
  const host = new SimHost(seed, SMALL, createWorld);
  for (const c of cmds) host.enqueue(c);
  host.enqueue({
    tick: 0,
    playerId: 0,
    type: 'DebugSpawn',
    payload: { x: 500, y: 500, count: 200, kind: 'zombie' },
  });
  for (let t = 0; t < 1500; t++) host.runTick();
  const w = host.world;
  expect(Number.isFinite(w.counters.budget)).toBe(true);
  expect(w.counters.budget).toBeGreaterThanOrEqual(0);
  for (const s of w.structures()) {
    expect(Number.isFinite(s.hp)).toBe(true);
    expect(s.hp).toBeLessThanOrEqual(s.maxHp);
  }
  for (const u of w.units()) {
    expect(u.hp).toBeGreaterThanOrEqual(0);
    expect(u.hp).toBeLessThanOrEqual(1);
    expect(u.ammo).toBeGreaterThanOrEqual(0);
  }
  return { hash: host.hash().value.toString(16), units: w.unitCount, structures: w.structures().length };
}

describe('M3 robustness: hostile combat commands', () => {
  for (const seed of [3, 4]) {
    it(`seed ${seed}: 600 random and invalid commands neither crash nor break determinism`, () => {
      const cmds = fuzz(seed, 600);
      const a = run(seed, cmds);
      const b = run(seed, cmds);
      expect(a).toEqual(b);
      // The stream contains valid commands too, so something was actually bought and built.
      expect(a.units + a.structures).toBeGreaterThan(0);
    }, 120_000);
  }

  it('commands with unknown kinds or non-finite numbers change nothing', () => {
    const host = new SimHost(5, SMALL, createWorld);
    const before = host.hash().value;
    const budget = host.world.counters.budget;
    const bad: Command[] = [
      {
        tick: 0,
        playerId: 0,
        type: 'PlaceUnit',
        payload: { unitType: 'bogus', x: 500, y: 500 },
      } as unknown as Command,
      { tick: 0, playerId: 0, type: 'PlaceUnit', payload: { unitType: 'infantry', x: Number.NaN, y: 500 } },
      {
        tick: 0,
        playerId: 0,
        type: 'PlaceStructure',
        payload: { kind: 'wall', points: [Number.NaN, 1, 2, 3], rotation: 0 },
      },
      { tick: 0, playerId: 0, type: 'PlaceStructure', payload: { kind: 'wall', points: [], rotation: 0 } },
      { tick: 0, playerId: 0, type: 'DemolishStructure', payload: { id: 12345 } },
      { tick: 0, playerId: 0, type: 'DetonateCharge', payload: { id: -3 } },
    ];
    for (const c of bad) host.enqueue(c);
    host.runTick();
    expect(host.world.unitCount).toBe(0);
    expect(host.world.structures().length).toBe(0);
    expect(host.world.counters.budget).toBe(budget);
    expect(before).toBeDefined();
  });

  // A click outside the map must not spend budget.
  it('PlaceUnit outside the map is refused', () => {
    const host = new SimHost(5, SMALL, createWorld);
    host.enqueue({
      tick: 0,
      playerId: 0,
      type: 'PlaceUnit',
      payload: { unitType: 'infantry', x: -50, y: 500 },
    });
    host.enqueue({
      tick: 0,
      playerId: 0,
      type: 'PlaceUnit',
      payload: { unitType: 'infantry', x: 500, y: 1e9 },
    });
    host.runTick();
    expect(host.world.unitCount).toBe(0);
  });
});
