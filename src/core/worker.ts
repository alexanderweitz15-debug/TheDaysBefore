// Web Worker entry: runs the SimHost on a timer and posts snapshots back.
import { createWorld } from '../sim/world';
import { SimHost } from './sim-host';
import type { FromWorker, SimStats, ToWorker } from './types/messages';
import { allocSnapshot, SNAPSHOT_MAGIC } from './types/snapshot';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const POLL_MS = 4;

let host: SimHost | null = null;
let lastTime = 0;
let windowStart = 0;
let windowTicks = 0;
let windowMsSum = 0;
let windowMsMax = 0;
const stats: SimStats = { tick: 0, speed: 1, ticksPerSecond: 0, tickMsAvg: 0, tickMsMax: 0, agentCount: 0 };

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

function onTickTimed(ms: number): void {
  windowTicks++;
  windowMsSum += ms;
  if (ms > windowMsMax) windowMsMax = ms;
}

function sendSnapshot(h: SimHost): void {
  const n = h.world.agentCount;
  const snap = allocSnapshot(n);
  snap.header.set([SNAPSHOT_MAGIC, h.tick, n, h.world.widthM, h.world.heightM, 0]);
  h.world.writePositions(snap.positions);
  stats.tick = h.tick;
  stats.speed = h.loop.speed;
  stats.agentCount = n;
  post({ type: 'snapshot', buffer: snap.buffer, stats: { ...stats } }, [snap.buffer]);
}

function pump(): void {
  if (!host) return;
  const now = performance.now();
  try {
    const ran = host.loop.advance(now - lastTime);
    lastTime = now;
    if (now - windowStart >= 1000) {
      stats.ticksPerSecond = Math.round((windowTicks * 1000) / (now - windowStart));
      stats.tickMsAvg = windowTicks > 0 ? windowMsSum / windowTicks : 0;
      stats.tickMsMax = windowMsMax;
      windowStart = now;
      windowTicks = 0;
      windowMsSum = 0;
      windowMsMax = 0;
    }
    if (ran > 0) sendSnapshot(host);
  } catch (err) {
    post({ type: 'error', message: String(err), seed: host.seed, commandLog: host.queue.log });
    host = null;
    return;
  }
  setTimeout(pump, POLL_MS);
}

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    host = new SimHost(msg.seed, createWorld, onTickTimed, () => performance.now());
    lastTime = performance.now();
    windowStart = lastTime;
    sendSnapshot(host);
    pump();
  } else if (msg.type === 'command' && host) {
    host.submit(msg.cmd);
  }
};
