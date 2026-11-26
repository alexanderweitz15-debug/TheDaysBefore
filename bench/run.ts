// Headless sim benchmark. `pnpm bench` compares against bench/reference.json (exit 1 on > 10 % worse avg).
// `pnpm bench --update` rewrites the reference. A missing reference (or scenario) is created.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Command } from '../src/core/commands';
import { SimHost } from '../src/core/sim-host';
import { createWorld } from '../src/sim/world';

/** GDD section 4: sim tick budget at full load. */
const TARGET_MS = 20;
/** Allowed avg regression against the reference. */
const MAX_REGRESSION = 0.1;
const REFERENCE_PATH = fileURLToPath(new URL('./reference.json', import.meta.url));

interface Scenario {
  name: string;
  seed: number;
  /** Ticks run before measuring, not counted. */
  warmupTicks: number;
  measureTicks: number;
  /** Pre-stamped commands applied during warm-up. */
  commands: Command[];
  /** Agent count expected before measuring (sanity check). */
  expectedAgents: number;
}

interface Stats {
  avg: number;
  p95: number;
  max: number;
}

function spawnBursts(total: number, burst: number): Command[] {
  const cmds: Command[] = [];
  for (let i = 0; i * burst < total; i++) {
    const count = Math.min(burst, total - i * burst);
    // Spread bursts over a 5 x 5 grid of the 2 x 2 km world.
    const x = 200 + (i % 5) * 400;
    const y = 200 + (Math.floor(i / 5) % 5) * 400;
    cmds.push({ tick: 0, playerId: 0, type: 'DebugSpawn', payload: { x, y, count } });
  }
  return cmds;
}

/** Add scenarios here (M1 and later). */
const SCENARIOS: Scenario[] = [
  {
    name: 'dummy-30k',
    seed: 1,
    warmupTicks: 100,
    measureTicks: 600,
    // The dummy world starts with 2,000 agents, so 28,000 more reach 30,000.
    commands: spawnBursts(28_000, 1000),
    expectedAgents: 30_000,
  },
];

function summarize(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((s, v) => s + v, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
  return { avg: sum / samples.length, p95, max: sorted[sorted.length - 1] as number };
}

function runScenario(sc: Scenario): { stats: Stats; agents: number } {
  const timings: number[] = [];
  let measuring = false;
  const host = new SimHost(
    sc.seed,
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
  return { stats: summarize(timings), agents: host.world.agentCount };
}

const fmt = (n: number): string => n.toFixed(3);

function main(): number {
  const update = process.argv.includes('--update');
  const hasRef = existsSync(REFERENCE_PATH);
  const reference: Record<string, Stats> = hasRef ? JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) : {};
  const next: Record<string, Stats> = { ...reference };
  let failed = false;
  let wrote = !hasRef || update;

  for (const sc of SCENARIOS) {
    const { stats, agents } = runScenario(sc);
    console.log(
      `${sc.name}: agents=${agents} avg=${fmt(stats.avg)} ms p95=${fmt(stats.p95)} ms max=${fmt(stats.max)} ms` +
        ` (target ${TARGET_MS} ms: ${stats.p95 <= TARGET_MS ? 'ok' : 'MISSED'} on p95)`,
    );
    if (agents !== sc.expectedAgents) {
      console.error(`  FAIL: expected ${sc.expectedAgents} agents, got ${agents}`);
      failed = true;
    }
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
      console.error(`  FAIL: avg ${fmt(stats.avg)} ms vs reference ${fmt(ref.avg)} ms (${pct}, limit +10 %)`);
      failed = true;
    } else {
      console.log(`  vs reference avg ${fmt(ref.avg)} ms: ${pct}`);
    }
  }

  if (wrote) writeFileSync(REFERENCE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return failed ? 1 : 0;
}

process.exit(main());
