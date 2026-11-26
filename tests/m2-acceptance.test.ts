// M2 acceptance (GDD 17): an outbreak spreads street by street, and a corridor saves more civilians.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/commands';
import { SimHost } from '../src/core/sim-host';
import type { SimWorld, WorldOptions } from '../src/core/types/sim';
import { killZombie } from '../src/sim/horde/zombie-traits';
import { type CityWorld, createWorld } from '../src/sim/world';
import {
  buildingAtDistance,
  densestCivilianBlock,
  infectionCells,
  keySiteCenter,
  mostBuiltUpBlock,
  type Point,
  spreadStats,
  straightPolyline,
} from './m2-helpers';

const SMALL: WorldOptions = { size: 'small' };

// Corridor test (a). Only the city alarm acts: patient zero is removed right after the start, so no infected
// reach the zone and a breach cannot distort the count. The alarm is staggered over 30 to 210 s and people walk
// at 1.4 m/s, so the window must be long. The corridor starts in the densest residential block beyond the
// zone's own guidance range; the zone sits on the most built-up 100 m block (capacity is not the bottleneck).
const SEEDS = [11, 22, 33];
const RESCUE_TICKS = 12_000;
const ZONE_BLOCK_M = 100;
const ZONE_HALF_M = 50;
const RESIDENT_BLOCK_M = 64;
const RESIDENT_MIN_FROM_ZONE_M = 260;
const RESIDENT_MAX_FROM_ZONE_M = 360;
/** GDD 17 asks for a measurable gain: at least 20 % more sheltered civilians over all seeds. */
const MIN_TOTAL_GAIN = 1.2;

// Spread test (b): the infection field (cells with infection density > 0) accumulates over time.
const SPREAD_SEEDS = [11, 33];
const SPREAD_TICKS = 5400;
const SPREAD_SAMPLE_EVERY = 600;
/** Occupied 8 m cells count as one area when within this many cells (street gaps). */
const SPREAD_GAP_CELLS = 2;
const MIN_CELLS_FOR_SHARE = 30;
/** A lone zombie running ahead splits off a small cluster now and then. */
const MIN_LARGEST_SHARE = 0.45;
const MIN_FINAL_SHARE = 0.85;
const MIN_AREA_GROWTH = 10;
const MIN_RADIUS_GROWTH_M = 80;
/** DECISIONS: at least 1000 infected (zombies + incubating) after 5 min = 6000 ticks, medium city. */
const TARGET_TICKS = 6000;

const startOutbreak = (tick: number, at: Point): Command => ({
  tick,
  playerId: 0,
  type: 'StartOutbreak',
  payload: { x: at.x, y: at.y, family: 'viral' },
});

function hospital(world: SimWorld): Point {
  const h = keySiteCenter(world, 'hospital');
  if (!h) throw new Error('city has no hospital');
  return h;
}

/** Commands of one arm: outbreak in the far corner, a safe zone, optionally a corridor from the residents. */
function rescueCommands(world: SimWorld, withCorridor: boolean): Command[] {
  const zone = mostBuiltUpBlock(world, ZONE_BLOCK_M);
  const residents = densestCivilianBlock(
    world,
    RESIDENT_BLOCK_M,
    zone,
    RESIDENT_MIN_FROM_ZONE_M,
    RESIDENT_MAX_FROM_ZONE_M,
  );
  const cmds: Command[] = [
    startOutbreak(0, { x: world.widthM - 60, y: 60 }),
    {
      tick: 0,
      playerId: 0,
      type: 'PlaceSafeZone',
      payload: {
        x0: zone.x - ZONE_HALF_M,
        y0: zone.y - ZONE_HALF_M,
        x1: zone.x + ZONE_HALF_M,
        y1: zone.y + ZONE_HALF_M,
      },
    },
  ];
  if (withCorridor) {
    cmds.push({
      tick: 0,
      playerId: 0,
      type: 'DrawCorridor',
      payload: { points: [residents.x, residents.y, zone.x, zone.y] },
    });
  }
  return cmds;
}

interface RescueResult {
  sheltered: number;
  occupants: number;
  capacity: number;
}

function runRescue(seed: number, withCorridor: boolean): RescueResult {
  const probe = createWorld(seed, SMALL);
  const host = new SimHost(seed, SMALL, createWorld);
  for (const cmd of rescueCommands(probe, withCorridor)) host.enqueue(cmd);
  host.runTick();
  // Patient zero is removed after the first tick: the city alarm stays, the spread does not happen.
  const w = host.world as CityWorld;
  killZombie(w.s, w.s.outbreak.pzSlot);
  for (let t = 1; t < RESCUE_TICKS; t++) host.runTick();
  const zone = host.world.zones().find((z) => z.kind === 'safeZone');
  return {
    sheltered: host.world.counters.sheltered,
    occupants: zone?.occupants ?? 0,
    capacity: zone?.capacity ?? 0,
  };
}

/** Both arms for every seed, computed once (about 100 s) and shared by the tests below. */
let rescueCache: { seed: number; zone: RescueResult; corridor: RescueResult }[] | undefined;
function rescueRuns(): { seed: number; zone: RescueResult; corridor: RescueResult }[] {
  rescueCache ??= SEEDS.map((seed) => ({
    seed,
    zone: runRescue(seed, false),
    corridor: runRescue(seed, true),
  }));
  return rescueCache;
}

describe('metric helpers', () => {
  it('spreadStats finds one connected area and the p90 radius', () => {
    // A line of positions every 4 m from x = 100 to 396, y = 100: one area, radius grows with its length.
    const line: number[] = [];
    for (let x = 100; x < 400; x += 4) line.push(x, 100);
    const s = spreadStats(new Float32Array(line), { x: 100, y: 100 }, 1000, 8, 1);
    expect(s.largestShare).toBe(1);
    expect(s.cells).toBeGreaterThan(30);
    expect(s.radiusP90).toBeGreaterThan(250);
    expect(s.radiusP90).toBeLessThan(300);
  });

  it('spreadStats splits distant clusters and respects the gap', () => {
    const pos = new Float32Array([100, 100, 108, 100, 800, 800]);
    const near = spreadStats(pos, { x: 100, y: 100 }, 1000, 8, 1);
    expect(near.cells).toBe(3);
    expect(near.largestShare).toBeCloseTo(2 / 3);
    const gap = spreadStats(new Float32Array([100, 100, 124, 100]), { x: 100, y: 100 }, 1000, 8, 1);
    expect(gap.largestShare).toBe(0.5);
    const wide = spreadStats(new Float32Array([100, 100, 124, 100]), { x: 100, y: 100 }, 1000, 8, 3);
    expect(wide.largestShare).toBe(1);
    expect(spreadStats(new Float32Array(0), { x: 0, y: 0 }, 1000, 8, 1).cells).toBe(0);
  });

  it('the scenario setup finds a hospital and a building at the requested distance', () => {
    const ZONE_DISTANCE_M = 450;
    for (const seed of SEEDS) {
      const w = createWorld(seed, SMALL);
      const h = hospital(w);
      const zone = buildingAtDistance(w, h, ZONE_DISTANCE_M);
      const d = Math.hypot(zone.center.x - h.x, zone.center.y - h.y);
      expect(Math.abs(d - ZONE_DISTANCE_M)).toBeLessThan(60);
      expect(zone.x1).toBeGreaterThan(zone.x0);
      const pts = straightPolyline(h, zone.center, 0.15, 6);
      expect(pts.length).toBe(12);
      expect(pts[10]).toBeCloseTo(zone.center.x);
      expect(pts[11]).toBeCloseTo(zone.center.y);
    }
  });
});

describe('M2 acceptance: scenario helpers', () => {
  it('the residents block lies in range of the built-up zone block and holds civilians', () => {
    for (const seed of SEEDS) {
      const w = createWorld(seed, SMALL);
      const zone = mostBuiltUpBlock(w, ZONE_BLOCK_M);
      const q = densestCivilianBlock(
        w,
        RESIDENT_BLOCK_M,
        zone,
        RESIDENT_MIN_FROM_ZONE_M,
        RESIDENT_MAX_FROM_ZONE_M,
      );
      const d = Math.hypot(q.x - zone.x, q.y - zone.y);
      expect(d).toBeGreaterThanOrEqual(RESIDENT_MIN_FROM_ZONE_M);
      expect(d).toBeLessThanOrEqual(RESIDENT_MAX_FROM_ZONE_M);
      expect(zone.x - ZONE_HALF_M).toBeGreaterThan(0);
      expect(zone.x + ZONE_HALF_M).toBeLessThan(w.widthM);
    }
  });
});

describe('M2 acceptance: corridor saves civilians', () => {
  it('the zone alone shelters civilians and its capacity is not the limit', () => {
    const runs = rescueRuns();
    for (const r of runs) {
      expect(r.zone.sheltered).toBeGreaterThan(0);
      expect(r.zone.occupants).toBeLessThan(r.zone.capacity);
      expect(r.corridor.occupants).toBeLessThan(r.corridor.capacity);
    }
    expect(runs.reduce((a, r) => a + r.zone.sheltered, 0)).toBeGreaterThan(500);
  }, 300_000);

  it('zone plus corridor shelters more civilians than the zone alone in every seed', () => {
    for (const r of rescueRuns()) expect(r.corridor.sheltered).toBeGreaterThan(r.zone.sheltered);
  }, 300_000);

  it(`the corridor raises the sheltered total by at least ${Math.round((MIN_TOTAL_GAIN - 1) * 100)} %`, () => {
    const runs = rescueRuns();
    const zone = runs.reduce((a, r) => a + r.zone.sheltered, 0);
    const corridor = runs.reduce((a, r) => a + r.corridor.sheltered, 0);
    expect(corridor).toBeGreaterThanOrEqual(zone * MIN_TOTAL_GAIN);
  }, 300_000);
});

describe('M2 acceptance: the outbreak spreads street by street', () => {
  for (const seed of SPREAD_SEEDS) {
    it(`seed ${seed}: the infected area grows connected from the start point`, () => {
      const probe = createWorld(seed, SMALL);
      const origin = hospital(probe);
      const host = new SimHost(seed, SMALL, createWorld);
      host.enqueue(startOutbreak(0, origin));
      const cells: number[] = [];
      const reach: number[] = [];
      let last = { largestShare: 0, cells: 0 };
      for (let t = 1; t <= SPREAD_TICKS; t++) {
        host.runTick();
        if (t % SPREAD_SAMPLE_EVERY !== 0) continue;
        const s = spreadStats(infectionCells(host.world), origin, host.world.widthM, 8, SPREAD_GAP_CELLS);
        if (s.cells >= MIN_CELLS_FOR_SHARE) expect(s.largestShare).toBeGreaterThanOrEqual(MIN_LARGEST_SHARE);
        cells.push(s.cells);
        reach.push(s.radiusMax);
        last = s;
      }
      expect(host.world.counters.outbreakTick).toBe(0);
      // The area never shrinks and keeps growing; the reach from the start grows too.
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i] as number).toBeGreaterThan(cells[i - 1] as number);
        expect(reach[i] as number).toBeGreaterThanOrEqual(reach[i - 1] as number);
      }
      expect(cells[cells.length - 1] as number).toBeGreaterThanOrEqual(
        (cells[0] as number) * MIN_AREA_GROWTH,
      );
      expect((reach[reach.length - 1] as number) - (reach[0] as number)).toBeGreaterThanOrEqual(
        MIN_RADIUS_GROWTH_M,
      );
      expect(last.largestShare).toBeGreaterThanOrEqual(MIN_FINAL_SHARE);
    }, 120_000);
  }
});

describe('M2 acceptance: outbreak target (DECISIONS 2026-11-26)', () => {
  it('medium city, one seed: at least 1000 infected after 5 min, the infected area grows connected', () => {
    const seed = 1;
    const opts: WorldOptions = { size: 'medium' };
    const origin = hospital(createWorld(seed, opts));
    const host = new SimHost(seed, opts, createWorld);
    host.enqueue(startOutbreak(0, origin));
    const reach: number[] = [];
    for (let t = 1; t <= TARGET_TICKS; t++) {
      host.runTick();
      if (t % 1500 !== 0) continue;
      const s = spreadStats(infectionCells(host.world), origin, host.world.widthM, 8, SPREAD_GAP_CELLS);
      if (s.cells >= MIN_CELLS_FOR_SHARE) expect(s.largestShare).toBeGreaterThanOrEqual(0.8);
      reach.push(s.radiusMax);
    }
    for (let i = 1; i < reach.length; i++)
      expect(reach[i] as number).toBeGreaterThanOrEqual(reach[i - 1] as number);
    expect((reach[reach.length - 1] as number) - (reach[0] as number)).toBeGreaterThan(100);
    expect(host.world.zombieCount + host.world.counters.incubating).toBeGreaterThanOrEqual(1000);
  }, 300_000);
});

describe('M2 determinism with outbreak', () => {
  it('same seed and commands (outbreak, zone, corridor, rally point, removal) give the same hash', () => {
    const probe = createWorld(SEEDS[0] as number, SMALL);
    const cmds: Command[] = [
      ...rescueCommands(probe, true),
      { tick: 50, playerId: 0, type: 'SetRallyPoint', payload: { x: 500, y: 500 } },
      { tick: 2000, playerId: 0, type: 'RemoveZone', payload: { id: 0 } },
    ];
    const run = (): string => {
      const host = new SimHost(SEEDS[0] as number, SMALL, createWorld);
      for (const c of cmds) host.enqueue(c);
      for (let t = 0; t < 3000; t++) host.runTick();
      expect(host.world.counters.outbreakTick).toBe(0);
      return host.hash().value.toString(16);
    };
    expect(run()).toBe(run());
  }, 120_000);
});
