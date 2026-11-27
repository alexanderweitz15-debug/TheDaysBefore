// M5 acceptance (GDD 10, 4, 17): replay hash, save/load bit identity, victory and defeat conditions.
import { describe, expect, it } from 'vitest';
import type { Command, SquadRequest, Stance } from '../src/core/commands';
import { hashHex } from '../src/core/hash';
import { SimHost } from '../src/core/sim-host';
import { DISTRICTS, TERRAIN } from '../src/core/types/map';
import type { ScenarioDef } from '../src/core/types/mission';
import type { VictoryKind } from '../src/core/types/outcome';
import type { ReplayData } from '../src/core/types/save';
import type { RestoreWorld, SimWorld, WorldOptions } from '../src/core/types/sim';
import { ECONOMY_BUILDINGS } from '../src/data/economy/economy';
import * as sim from '../src/sim/world';

const restoreWorld = (sim as unknown as { restoreWorld: RestoreWorld }).restoreWorld;

const SEED = 31337;
const REPLAY_TICKS = 6500;
const SAVE_AT = 2000;
const SAVE_TAIL = 3000;

function scenario(over: Partial<ScenarioDef> = {}): ScenarioDef {
  return {
    id: 'm5-test',
    textKey: 'scenario.test',
    seed: SEED,
    size: 'small',
    era: 'present',
    faction: 'army',
    pathogen: 'viral',
    patientZeroSite: 'random',
    farmDurationS: 60,
    classicStart: false,
    startResources: { budget: 100_000, material: 1000, ammo: 1500, food: 1500 },
    difficulty: 'normal',
    victory: { kinds: ['hold'], all: false },
    ...over,
  };
}

const optionsOf = (def: ScenarioDef): WorldOptions => ({ size: def.size, scenario: def });
const newHost = (def: ScenarioDef): SimHost => new SimHost(def.seed, optionsOf(def), sim.createWorld);

/** A building id the scrapyard may occupy on this map (harbor or industry). */
function scrapyardSite(world: SimWorld): number {
  const B = world.map.buildings;
  const ok = ECONOMY_BUILDINGS.scrapyard.fromDistricts.map((d) => DISTRICTS.indexOf(d));
  for (let i = 0; i < B.count; i++) if (ok.includes(B.district[i] as number)) return i;
  throw new Error('no scrapyard site');
}

/** Walkable ground cell centres spread over the map (for units, structures, zones). */
function spots(world: SimWorld, n: number): { x: number; y: number }[] {
  const { terrain, widthCells: w, heightCells: h, cellSizeM: cs } = world.map;
  const out: { x: number; y: number }[] = [];
  for (let cy = 10; cy < h - 10; cy += 9) {
    for (let cx = 10; cx < w - 10; cx += 9) {
      const t = terrain[cy * w + cx];
      if (t === 0 || t === 4) out.push({ x: (cx + 0.5) * cs, y: (cy + 0.5) * cs });
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** The i-th spread-out ground spot. */
function spot(world: SimWorld, i = 0): { x: number; y: number } {
  const p = spots(world, i + 1)[i];
  if (!p) throw new Error('no ground spot');
  return p;
}

/** A fixed mix of commands over time (ticks relative to the mission start). Deterministic for a seed. */
function script(world: SimWorld): Command[] {
  const [a, b, c, d] = spots(world, 4) as { x: number; y: number }[];
  const at = (tick: number, type: Command['type'], payload: unknown): Command =>
    ({ tick, playerId: 0, type, payload }) as Command;
  return [
    at(5, 'RepurposeBuilding', { buildingId: scrapyardSite(world), kind: 'scrapyard' }),
    at(10, 'AssignWorkers', { workers: 55, conscripts: 5, helpers: 10 }),
    at(40, 'SetDecree', { decree: 'rationing', active: true }),
    at(100, 'PlaceSafeZone', {
      x0: (a as { x: number }).x - 20,
      y0: (a as { y: number }).y - 20,
      x1: (a as { x: number }).x + 20,
      y1: (a as { y: number }).y + 20,
    }),
    // PlaceUnit buys into the reserve; the orders send the squads out (zone, line), so the replay covers them.
    at(200, 'PlaceUnit', { unitType: 'infantry', x: (b as { x: number }).x, y: (b as { y: number }).y }),
    at(210, 'PlaceUnit', { unitType: 'mgTeam', x: (c as { x: number }).x, y: (c as { y: number }).y }),
    at(215, 'PlaceUnit', { unitType: 'infantry', x: (c as { x: number }).x, y: (c as { y: number }).y }),
    at(220, 'HoldZone', {
      x0: (b as { x: number }).x - 25,
      y0: (b as { y: number }).y - 25,
      x1: (b as { x: number }).x + 25,
      y1: (b as { y: number }).y + 25,
      squads: { infantry: 1, mgTeam: 1 },
      stance: 'hold',
    }),
    at(230, 'DefendLine', {
      points: [
        (c as { x: number }).x - 15,
        (c as { y: number }).y,
        (c as { x: number }).x + 15,
        (c as { y: number }).y,
      ],
      squads: { infantry: 1 },
      stance: 'holdUntilLosses',
    }),
    at(300, 'PlaceStructure', {
      kind: 'watchtower',
      points: [(d as { x: number }).x, (d as { y: number }).y],
      rotation: 0,
    }),
    at(900, 'DebugSpawn', {
      x: (a as { x: number }).x + 60,
      y: (a as { y: number }).y,
      count: 120,
      kind: 'zombie',
    }),
    at(1500, 'SetDecree', { decree: 'curfew', active: true }),
    at(2200, 'DebugSpawn', {
      x: (c as { x: number }).x,
      y: (c as { y: number }).y + 40,
      count: 200,
      kind: 'zombie',
    }),
    at(3000, 'SetDecree', { decree: 'rationing', active: false }),
    at(4200, 'AssignWorkers', { workers: 40, conscripts: 10, helpers: 20 }),
  ];
}

function playAll(host: SimHost, cmds: Command[], untilTick: number): void {
  for (const c of cmds) if (c.tick >= host.tick && c.tick < untilTick) host.enqueue(c);
  while (host.tick < untilTick) host.runTick();
}

describe('M5 replay and save', { timeout: 120_000 }, () => {
  it('replay: seed + setup + log re-simulate to the same end hash', () => {
    const def = scenario();
    const host = newHost(def);
    const cmds = script(host.world);
    playAll(host, cmds, REPLAY_TICKS);
    expect(new Set(host.queue.log.map((c) => c.type)).size).toBeGreaterThanOrEqual(6);
    const replay: ReplayData = {
      formatVersion: 1,
      seed: def.seed,
      size: def.size,
      scenario: def,
      commands: host.queue.log.slice(),
      endTick: host.tick,
      endHash: hashHex(host.hash()),
    };
    // Same path as the worker's verifyReplay.
    const check = new SimHost(
      replay.seed,
      { size: replay.size, scenario: replay.scenario as ScenarioDef },
      sim.createWorld,
    );
    for (const c of replay.commands) check.enqueue(c);
    while (check.tick < replay.endTick) check.runTick();
    expect(hashHex(check.hash())).toBe(replay.endHash);
  });

  it('save/load: restore at tick N continues with the same hashes as the uninterrupted run; reports the size', () => {
    const def = scenario();
    const a = newHost(def);
    const cmds = script(a.world);
    playAll(a, cmds, SAVE_AT);
    expect(a.world.orders().orders.length, 'orders are part of the saved state').toBe(2);
    const t0 = performance.now();
    const state = a.world.serialize();
    const saveMs = performance.now() - t0;
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(view.getUint32(0, true)).toBe(a.tick);
    console.info(
      `M5 save size at tick ${a.tick}: ${state.byteLength} bytes (${(state.byteLength / 1024).toFixed(0)} KiB)`,
    );

    const t1 = performance.now();
    const world = restoreWorld(def.seed, optionsOf(def), state);
    console.info(`M5 serialize ${saveMs.toFixed(0)} ms, restore ${(performance.now() - t1).toFixed(0)} ms`);
    const b = new SimHost(def.seed, optionsOf(def), sim.createWorld, undefined, undefined, {
      world,
      tick: a.tick,
      log: a.queue.log.slice(),
    });
    expect(hashHex(b.hash())).toBe(hashHex(a.hash()));
    // Same further commands; compare in steps so a divergence is located.
    for (const c of cmds)
      if (c.tick >= SAVE_AT && c.tick < SAVE_AT + SAVE_TAIL) {
        a.enqueue(c);
        b.enqueue(c);
      }
    for (let k = 0; k < 6; k++) {
      const until = SAVE_AT + ((k + 1) * SAVE_TAIL) / 6;
      while (a.tick < until) a.runTick();
      while (b.tick < until) b.runTick();
      expect(hashHex(b.hash()), `hash diverged before tick ${until}`).toBe(hashHex(a.hash()));
    }
    expect(b.world.mission().phase).toBe(a.world.mission().phase);
  });

  it('save/load: a state of the wrong version is refused with a clear error', () => {
    const def = scenario();
    const state = newHost(def).world.serialize().slice();
    new DataView(state.buffer).setUint32(4, 9999, true);
    expect(() => restoreWorld(def.seed, optionsOf(def), state)).toThrow(/version/i);
  });
});

/** Nearest road cell centre to (x, y): open ground for squads and the zone. */
function roadNear(world: SimWorld, x: number, y: number): { x: number; y: number } {
  const { terrain, widthCells: w, cellSizeM: cs } = world.map;
  for (let r = 0; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = Math.floor(x / cs) + dx;
        const cy = Math.floor(y / cs) + dy;
        if (terrain[cy * w + cx] === TERRAIN.road) return { x: (cx + 0.5) * cs, y: (cy + 0.5) * cs };
      }
  return { x, y };
}

/** Zone around patient zero held by the ring defence. */
const ZONE_HALF_M = 60;
const ZONE_STANCE: Stance = 'hold';

const cmd = (tick: number, type: Command['type'], payload: unknown): Command =>
  ({ tick, playerId: 0, type, payload }) as Command;

/**
 * Patient zero in the middle of the city, ringed by `squads` squads. PlaceUnit only buys into the reserve at the
 * HQ (M5b), so one HoldZone order over the centre sends them out. With `horde` extra zombies are dropped 10 m from
 * patient zero, inside the zone. Calibrated on seed 31337 small: see M5.md for the eradication reach limits.
 */
function ringDefence(world: SimWorld, squads: number, horde: number): Command[] {
  const c = roadNear(world, world.widthM / 2, world.heightM / 2);
  const types = ['infantry', 'mgTeam', 'sniperTeam', 'infantry'] as const;
  const out: Command[] = [];
  const request: SquadRequest = {};
  for (let i = 0; i < squads; i++) {
    const type = types[i % 4] as (typeof types)[number];
    out.push(cmd(5, 'PlaceUnit', { unitType: type, x: c.x, y: c.y }));
    request[type] = (request[type] ?? 0) + 1;
  }
  if (squads > 0)
    out.push(
      cmd(6, 'HoldZone', {
        x0: c.x - ZONE_HALF_M,
        y0: c.y - ZONE_HALF_M,
        x1: c.x + ZONE_HALF_M,
        y1: c.y + ZONE_HALF_M,
        squads: request,
        stance: ZONE_STANCE,
      }),
    );
  out.push(cmd(30, 'StartOutbreak', { x: c.x, y: c.y, family: 'viral' }));
  if (horde > 0) out.push(cmd(40, 'DebugSpawn', { x: c.x + 10, y: c.y, count: horde, kind: 'zombie' }));
  return out;
}

/** Victory recipes: a small scenario per condition and the commands that satisfy it. */
const RECIPES: Record<
  VictoryKind,
  { over: Partial<ScenarioDef>; cmds: (w: SimWorld) => Command[]; maxTicks: number }
> = {
  hold: { over: { holdUntilS: 120 }, cmds: () => [], maxTicks: 6000 },
  evacuation: {
    // Safe zone over the centre: sheltered civilians count as evacuated until M8.
    over: { evacuationShare: 0.02, classicStart: true },
    cmds: (w) => {
      const c = roadNear(w, w.widthM / 2, w.heightM / 2);
      return [
        cmd(10, 'PlaceSafeZone', { x0: c.x - 120, y0: c.y - 120, x1: c.x + 120, y1: c.y + 120 }),
        cmd(30, 'TriggerOutbreak', {}),
      ];
    },
    maxTicks: 6000,
  },
  eradication: { over: { classicStart: true }, cmds: (w) => ringDefence(w, 16, 30), maxTicks: 3000 },
  // A contained outbreak: infected area below 1 % for the hold time (VICTORY.containmentHoldS).
  containment: { over: { classicStart: true }, cmds: (w) => ringDefence(w, 16, 0), maxTicks: 8000 },
};

function runUntilOutcome(host: SimHost, cmds: Command[], maxTicks: number): void {
  for (const c of cmds) host.enqueue(c);
  while (host.tick < maxTicks && host.world.mission().outcome === null) host.runTick();
}

describe('M5 victory and defeat', { timeout: 120_000 }, () => {
  for (const kind of Object.keys(RECIPES) as VictoryKind[]) {
    it(`victory by ${kind}: objective reaches progress 1 and the outcome is a victory with that reason`, () => {
      const r = RECIPES[kind];
      const def = scenario({ ...r.over, victory: { kinds: [kind], all: false } });
      const host = newHost(def);
      runUntilOutcome(host, r.cmds(host.world), r.maxTicks);
      const m = host.world.mission();
      expect(m.outcome).not.toBeNull();
      expect(m.outcome?.result).toBe('victory');
      expect(m.outcome?.reason).toBe(kind);
      expect(m.objectives.find((o) => o.kind === kind)?.met).toBe(true);
      expect(m.score.total).toBeGreaterThan(0);
      expect(host.world.debrief()?.outcome.reason).toBe(kind);
    });
  }

  it('control: the same horde without squads is no victory', () => {
    const def = scenario({ classicStart: true, victory: { kinds: ['eradication'], all: false } });
    const host = newHost(def);
    runUntilOutcome(host, ringDefence(host.world, 0, 30), 6000);
    expect(host.world.mission().outcome?.result).not.toBe('victory');
    expect(host.world.mission().objectives[0]?.met).toBe(false);
  });

  it('objectives are listed per condition and progress stays within 0..1 while the mission runs', () => {
    const def = scenario({ victory: { kinds: ['hold', 'evacuation'], all: true } });
    const host = newHost(def);
    for (let i = 0; i < 400; i++) host.runTick();
    const m = host.world.mission();
    expect(m.outcome).toBeNull();
    expect(m.objectives.map((o) => o.kind).sort()).toEqual(['evacuation', 'hold']);
    for (const o of m.objectives) {
      expect(o.progress).toBeGreaterThanOrEqual(0);
      expect(o.progress).toBeLessThanOrEqual(1);
    }
  });

  it('defeat by surrender ends the mission at once and the outcome stays', () => {
    const host = newHost(scenario());
    for (let i = 0; i < 100; i++) host.runTick();
    host.enqueue({ tick: host.tick, playerId: 0, type: 'Surrender', payload: {} });
    host.runTick();
    host.runTick();
    const o = host.world.mission().outcome;
    expect(o?.result).toBe('defeat');
    expect(o?.reason).toBe('surrender');
    const tick = o?.tick;
    for (let i = 0; i < 200; i++) host.runTick();
    expect(host.world.mission().outcome?.tick).toBe(tick);
    expect(host.world.mission().outcome?.reason).toBe('surrender');
  });

  it('defeat when the population falls below the threshold', () => {
    const def = scenario({ victory: { kinds: ['eradication'], all: false } });
    const host = newHost(def);
    const p = spot(host.world);
    // A horde far larger than the 5.000 residents; no defence.
    host.enqueue({
      tick: 20,
      playerId: 0,
      type: 'DebugSpawn',
      payload: { x: p.x, y: p.y, count: 6000, kind: 'zombie' },
    });
    host.enqueue({ tick: 21, playerId: 0, type: 'TriggerOutbreak', payload: {} });
    while (host.tick < 15_000 && host.world.mission().outcome === null) host.runTick();
    const o = host.world.mission().outcome;
    expect(o?.result).toBe('defeat');
    expect(['populationLost', 'hqLost']).toContain(o?.reason);
    expect(host.world.debrief()?.causes.length).toBeGreaterThan(0);
  });
});
