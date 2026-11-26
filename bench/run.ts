// Headless sim benchmark. `pnpm bench` compares against bench/reference.json (exit 1 on > 10 % worse avg).
// `pnpm bench --update` rewrites the reference. A missing reference (or scenario) is created.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Command } from '../src/core/commands';
import { SimHost } from '../src/core/sim-host';
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
  return { stats, gated: stats.p95, targetMs: TICK_TARGET_MS, detail: `zombies=${z} civilians=${c}`, errors };
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
