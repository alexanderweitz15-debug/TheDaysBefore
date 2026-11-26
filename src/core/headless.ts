// Runs a simulation without browser or worker. Used by tests, bench and later the bot runner.
import type { Command } from './commands';
import { hashHex } from './hash';
import { SimHost } from './sim-host';
import type { CreateWorld, WorldOptions } from './types/sim';

export interface HeadlessResult {
  hash: string;
  ticks: number;
  tickMs: number[];
}

export function runHeadless(
  createWorld: CreateWorld,
  seed: number,
  options: WorldOptions,
  ticks: number,
  commands: readonly Command[] = [],
  now: () => number = () => 0,
): HeadlessResult {
  const tickMs: number[] = [];
  const host = new SimHost(seed, options, createWorld, (ms) => tickMs.push(ms), now);
  for (const cmd of commands) host.enqueue(cmd);
  for (let i = 0; i < ticks; i++) host.runTick();
  return { hash: hashHex(host.hash()), ticks: host.tick, tickMs };
}
