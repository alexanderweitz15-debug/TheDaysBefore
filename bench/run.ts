// Headless sim benchmark. `pnpm bench` compares against bench/reference.json (exit 1 on > 10 % worse avg).
// `pnpm bench --update` rewrites the reference. A missing reference (or scenario) is created.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Command, SquadRequest } from '../src/core/commands';
import { SimHost } from '../src/core/sim-host';
import type { CityMapData } from '../src/core/types/map';
import { TERRAIN } from '../src/core/types/map';
import type { SimWorld, WorldOptions } from '../src/core/types/sim';
import { CITY_SIZES } from '../src/data/city/generator';
import { createWorld } from '../src/sim/world';

/** GDD section 4: sim tick budget at full load. */
const TICK_TARGET_MS = 20;
/** GDD section 4 / plan M1: loading a 2 x 2 km city. */
const GEN_TARGET_MS = 5000;
/** Zombie attacks remove civilians (A3 spread is fast); a run may lose up to 5 % of them. Load check only. */
const CIVILIAN_LOSS_TOLERANCE = 0.95;
/** Infected civilians turn into zombies during the run; up to 3 % more zombies than spawned is fine. */
const ZOMBIE_GAIN_TOLERANCE = 1.03;
/** The outbreak scenario keeps its spawned horde (sanity of the setup). */
const OUTBREAK_MIN_ZOMBIES = 30_000;
/** Allowed avg regression against the reference. */
const MAX_REGRESSION = 0.1;
const REFERENCE_PATH = fileURLToPath(new URL('./reference.json', import.meta.url));

interface TickScenario {
  kind: 'tick';
  name: string;
  seed: number;
  options: WorldOptions;
  /** Ticks run before measuring, not counted. */
  warmupTicks: number;
  measureTicks: number;
  /** Pre-stamped commands applied during warm-up. */
  commands: Command[];
  /** Zombie count after the run (exact); omit for scenarios where it changes. */
  expectedZombies?: number;
  /** Civilians after the run: between this value times CIVILIAN_LOSS_TOLERANCE and this value (attacks remove some). */
  expectedCivilians?: number;
  /** Extra checks on the finished world; returns error messages. */
  verify?: (world: SimWorld) => string[];
}

/** Measures createWorld wall time. One discarded warm-up run, then `runs` measured runs. */
interface GenScenario {
  kind: 'gen';
  name: string;
  seed: number;
  options: WorldOptions;
  runs: number;
}

type Scenario = TickScenario | GenScenario;

interface Stats {
  avg: number;
  p95: number;
  max: number;
}

/** Spawn bursts of `burst` agents spread over a 5 x 5 grid of the 2 x 2 km world. */
function spawnBursts(total: number, burst: number, kind: 'zombie' | 'civilian', offset: number): Command[] {
  const cmds: Command[] = [];
  for (let i = 0; i * burst < total; i++) {
    const count = Math.min(burst, total - i * burst);
    const j = i + offset;
    const x = 200 + (j % 5) * 400;
    const y = 200 + (Math.floor(j / 5) % 5) * 400;
    cmds.push({ tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x, y, count, kind } });
  }
  return cmds;
}

const COMBAT_UNITS = 200;
const COMBAT_WALLS = 20;
const WALL_LENGTH_M = 40;
/** Lines are split into segments of this length (structures() lists segments). */
const SEGMENT_M = 8;
/** Pays for every squad and wall of the scenario. */
const COMBAT_BUDGET = 1_000_000;
/** Squads must exist after the run: all 200 are placed, ~10 % fall in the fight vs 30.000 zombies (177 left in seed 1). */
const COMBAT_MIN_UNITS = 0.8 * COMBAT_UNITS;
const UNIT_MIX = ['infantry', 'mgTeam', 'sniperTeam', 'mortar', 'engineers', 'riotPolice', 'medics'] as const;

/** `count` wall lines of WALL_LENGTH_M along the centre line of long streets, spread over the map (always valid ground). */
function streetWalls(count: number): [{ x: number; y: number }, { x: number; y: number }][] {
  const { roads } = createWorld(1, { size: 'medium' }).map;
  const streets: number[] = [];
  for (let e = 0; e < roads.edgeCount; e++) {
    if (roads.edgeKind[e] !== 0) continue;
    const a = roads.edgeA[e] as number;
    const b = roads.edgeB[e] as number;
    const len = Math.hypot(
      (roads.nodeX[b] as number) - (roads.nodeX[a] as number),
      (roads.nodeY[b] as number) - (roads.nodeY[a] as number),
    );
    if (len >= WALL_LENGTH_M + 20) streets.push(e);
  }
  const step = Math.max(1, Math.floor(streets.length / count));
  const out: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (let i = 0; i < count; i++) {
    const e = streets[i * step] as number;
    const a = roads.edgeA[e] as number;
    const b = roads.edgeB[e] as number;
    const ax = roads.nodeX[a] as number;
    const ay = roads.nodeY[a] as number;
    const bx = roads.nodeX[b] as number;
    const by = roads.nodeY[b] as number;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = ((bx - ax) / len) * (WALL_LENGTH_M / 2);
    const uy = ((by - ay) / len) * (WALL_LENGTH_M / 2);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    out.push([
      { x: cx - ux, y: cy - uy },
      { x: cx + ux, y: cy + uy },
    ]);
  }
  return out;
}

/** Centre of the nearest cell (ring search) that is neither water nor building; the sim refuses those. */
function nearestWalkable(map: CityMapData, x: number, y: number): { x: number; y: number } {
  const { terrain, widthCells: w, heightCells: h, cellSizeM: cs } = map;
  const cx = Math.min(w - 1, Math.max(0, Math.floor(x / cs)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(y / cs)));
  for (let r = 0; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const t = terrain[ny * w + nx];
        if (t === TERRAIN.water || t === TERRAIN.building) continue;
        return { x: (nx + 0.5) * cs, y: (ny + 0.5) * cs };
      }
    }
  }
  return { x, y };
}

/** 200 squads in a 10 x 20 grid around the city centre (12 m apart, snapped to walkable cells) and 20 walls of 40 m along streets. */
function combatCommands(): Command[] {
  const cmds: Command[] = [];
  const { map } = createWorld(1, { size: 'medium' });
  for (let i = 0; i < COMBAT_UNITS; i++) {
    const { x, y } = nearestWalkable(map, 1000 - 60 + (i % 10) * 12, 1000 - 120 + Math.floor(i / 10) * 12);
    cmds.push({
      tick: 0,
      playerId: 0,
      type: 'PlaceUnit',
      payload: { unitType: UNIT_MIX[i % UNIT_MIX.length] as (typeof UNIT_MIX)[number], x, y },
    });
  }
  // PlaceUnit only buys into the reserve (M5b): each wall gets a DefendLine that draws its share of the squads.
  const walls = streetWalls(COMBAT_WALLS);
  const requests: SquadRequest[] = walls.map(() => ({}));
  for (let i = 0; i < COMBAT_UNITS; i++) {
    const type = UNIT_MIX[i % UNIT_MIX.length] as (typeof UNIT_MIX)[number];
    const req = requests[i % walls.length] as SquadRequest;
    req[type] = (req[type] ?? 0) + 1;
  }
  walls.forEach(([a, b], i) => {
    cmds.push({
      tick: 0,
      playerId: 0,
      type: 'PlaceStructure',
      payload: { kind: 'wall', points: [a.x, a.y, b.x, b.y], rotation: 0 },
    });
    cmds.push({
      tick: 1,
      playerId: 0,
      type: 'DefendLine',
      payload: { points: [a.x, a.y, b.x, b.y], squads: requests[i] as SquadRequest, stance: 'hold' },
    });
  });
  return cmds;
}

/** Add scenarios here (M2 and later). */
const SCENARIOS: Scenario[] = [
  {
    kind: 'tick',
    name: 'medium-30k-10k',
    seed: 1,
    options: { size: 'medium' },
    warmupTicks: 100,
    measureTicks: 600,
    // The medium city already holds its residents (20.000 >= the 10.000 of GDD 4), so only zombies are spawned.
    commands: spawnBursts(30_000, 1000, 'zombie', 0),
    expectedZombies: 30_000,
    expectedCivilians: CITY_SIZES.medium.population,
  },
  {
    // Outbreak at the city center with a full horde: after the 30 s city alarm the civilians flee, zombies attack
    // and infect, so flight, perception, attacks, incubation and the safety field are all under load.
    kind: 'tick',
    name: 'outbreak-medium',
    seed: 1,
    options: { size: 'medium' },
    warmupTicks: 700,
    measureTicks: 600,
    commands: [
      { tick: 0, playerId: 0, type: 'StartOutbreak', payload: { x: 1000, y: 1000, family: 'viral' } },
      ...spawnBursts(30_000, 1000, 'zombie', 0),
    ],
    expectedCivilians: CITY_SIZES.medium.population,
    verify: (w) => {
      const errors: string[] = [];
      if (w.counters.outbreakTick < 0) errors.push('outbreak did not start');
      if (w.zombieCount < OUTBREAK_MIN_ZOMBIES)
        errors.push(`expected at least ${OUTBREAK_MIN_ZOMBIES} zombies, got ${w.zombieCount}`);
      return errors;
    },
  },
  {
    // Outbreak in the centre, 30.000 zombies, 200 squads and 20 walls: targeting, projectiles, pressure
    // damage and blocking structures on top of the horde and the civilians.
    kind: 'tick',
    name: 'combat-medium',
    seed: 1,
    options: { size: 'medium', startBudget: COMBAT_BUDGET },
    warmupTicks: 700,
    measureTicks: 600,
    commands: [
      { tick: 0, playerId: 0, type: 'StartOutbreak', payload: { x: 1000, y: 1000, family: 'viral' } },
      ...spawnBursts(30_000, 1000, 'zombie', 0),
      ...combatCommands(),
    ],
    expectedCivilians: CITY_SIZES.medium.population,
    verify: (w) => {
      const errors: string[] = [];
      if (w.counters.outbreakTick < 0) errors.push('outbreak did not start');
      if (w.unitCount < COMBAT_MIN_UNITS)
        errors.push(
          `expected at least ${COMBAT_MIN_UNITS} squads, got ${w.unitCount} (budget ${w.counters.budget})`,
        );
      const orders = w.orders().orders;
      const posted = orders.reduce((n, o) => n + o.assigned.length, 0);
      if (orders.length < COMBAT_WALLS)
        errors.push(`expected ${COMBAT_WALLS} line orders, got ${orders.length}`);
      if (posted < COMBAT_MIN_UNITS)
        errors.push(`expected at least ${COMBAT_MIN_UNITS} squads on orders, got ${posted}`);
      if (w.structures().length < COMBAT_WALLS * (WALL_LENGTH_M / SEGMENT_M))
        errors.push(
          `expected ${COMBAT_WALLS * (WALL_LENGTH_M / SEGMENT_M)} wall segments, got ${w.structures().length}`,
        );
      if (w.zombieCount + w.counters.zombiesKilled < OUTBREAK_MIN_ZOMBIES)
        errors.push(`expected at least ${OUTBREAK_MIN_ZOMBIES} zombies spawned, got ${w.zombieCount} alive`);
      return errors;
    },
  },
  { kind: 'gen', name: 'gen-medium', seed: 1, options: { size: 'medium' }, runs: 8 },
];

function summarize(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((s, v) => s + v, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
  return { avg: sum / samples.length, p95, max: sorted[sorted.length - 1] as number };
}

interface Outcome {
  stats: Stats;
  /** Metric that is checked against the absolute target (p95 for ticks, max for generation). */
  gated: number;
  targetMs: number;
  detail: string;
  errors: string[];
}

function runTick(sc: TickScenario): Outcome {
  const timings: number[] = [];
  let measuring = false;
  const host = new SimHost(
    sc.seed,
    sc.options,
    createWorld,
    (ms) => {
      if (measuring) timings.push(ms);
    },
    () => performance.now(),
  );
  for (const cmd of sc.commands) host.enqueue(cmd);
  for (let i = 0; i < sc.warmupTicks; i++) host.runTick();
  measuring = true;
  for (let i = 0; i < sc.measureTicks; i++) host.runTick();
  const { zombieCount: z, civilianCount: c } = host.world;
  const errors: string[] = [];
  if (
    sc.expectedZombies !== undefined &&
    (z < sc.expectedZombies || z > sc.expectedZombies * ZOMBIE_GAIN_TOLERANCE)
  )
    errors.push(
      `expected ${sc.expectedZombies} to ${sc.expectedZombies * ZOMBIE_GAIN_TOLERANCE} zombies, got ${z}`,
    );
  if (
    sc.expectedCivilians !== undefined &&
    (c > sc.expectedCivilians || c < sc.expectedCivilians * CIVILIAN_LOSS_TOLERANCE)
  )
    errors.push(
      `expected ${sc.expectedCivilians * CIVILIAN_LOSS_TOLERANCE} to ${sc.expectedCivilians} civilians, got ${c}`,
    );
  if (sc.verify) errors.push(...sc.verify(host.world));
  const stats = summarize(timings);
  return {
    stats,
    gated: stats.p95,
    targetMs: TICK_TARGET_MS,
    detail: `zombies=${z} civilians=${c} units=${host.world.unitCount ?? 0}`,
    errors,
  };
}

function runGen(sc: GenScenario): Outcome {
  createWorld(sc.seed, sc.options); // warm-up, JIT and allocator
  const timings: number[] = [];
  for (let i = 0; i < sc.runs; i++) {
    const t0 = performance.now();
    createWorld(sc.seed, sc.options);
    timings.push(performance.now() - t0);
  }
  const stats = summarize(timings);
  return { stats, gated: stats.max, targetMs: GEN_TARGET_MS, detail: `runs=${sc.runs}`, errors: [] };
}

const fmt = (n: number): string => n.toFixed(3);

function main(): number {
  const update = process.argv.includes('--update');
  const hasRef = existsSync(REFERENCE_PATH);
  const reference: Record<string, Stats> = hasRef ? JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) : {};
  const next: Record<string, Stats> = update ? {} : { ...reference };
  let failed = false;
  let wrote = !hasRef || update;

  for (const sc of SCENARIOS) {
    const out = sc.kind === 'tick' ? runTick(sc) : runGen(sc);
    const { stats } = out;
    const unit = sc.kind === 'tick' ? 'ms/tick' : 'ms';
    const gatedLabel = sc.kind === 'tick' ? 'p95' : 'max';
    console.log(
      `${sc.name}: ${out.detail} avg=${fmt(stats.avg)} p95=${fmt(stats.p95)} max=${fmt(stats.max)} ${unit}` +
        ` (target ${out.targetMs} ms: ${out.gated <= out.targetMs ? 'ok' : 'MISSED'} on ${gatedLabel})`,
    );
    for (const e of out.errors) {
      console.error(`  FAIL: ${e}`);
      failed = true;
    }
    if (out.gated > out.targetMs) failed = true;
    const ref = reference[sc.name];
    if (update || !ref) {
      next[sc.name] = stats;
      wrote = true;
      console.log(`  reference ${ref ? 'updated' : 'created'}`);
      continue;
    }
    const change = stats.avg / ref.avg - 1;
    const pct = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)} %`;
    if (change > MAX_REGRESSION) {
      console.error(`  FAIL: avg ${fmt(stats.avg)} vs reference ${fmt(ref.avg)} (${pct}, limit +10 %)`);
      failed = true;
    } else {
      console.log(`  vs reference avg ${fmt(ref.avg)}: ${pct}`);
    }
  }

  const known = new Set(SCENARIOS.map((s) => s.name));
  for (const name of Object.keys(reference)) {
    if (!known.has(name))
      console.log(`note: reference has unknown scenario "${name}" (run --update to drop it)`);
  }

  if (wrote) writeFileSync(REFERENCE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return failed ? 1 : 0;
}

process.exit(main());
