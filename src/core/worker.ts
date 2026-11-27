// Web Worker entry: generates the world, runs the SimHost on a timer and posts snapshots back.
import { createWorld } from '../sim/world';
import { SimHost } from './sim-host';
import type { FromWorker, SimStats, ToWorker } from './types/messages';
import type { DebugFieldKind } from './types/sim';
import { snapshotByteLength, writeSnapshotHeader } from './types/snapshot';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const POLL_MS = 4;
const POOL_MAX = 4;

let host: SimHost | null = null;
let debugKind: DebugFieldKind | null = null;
const pool: ArrayBuffer[] = [];
let lastTime = 0;
let windowStart = 0;
let windowTicks = 0;
let windowMsSum = 0;
let windowMsMax = 0;
const stats: SimStats = {
  tick: 0,
  speed: 1,
  ticksPerSecond: 0,
  tickMsAvg: 0,
  tickMsMax: 0,
  zombies: 0,
  civilians: 0,
  corpses: 0,
  counters: {
    sheltered: 0,
    incubating: 0,
    civiliansDead: 0,
    zombiesKilled: 0,
    outbreakTick: -1,
    collateralKills: 0,
    soldiersLost: 0,
    budget: 0,
  },
  worldGenMs: 0,
};
let sentZonesVersion = -1;
let zonesSentAt = 0;
const ZONES_RESEND_TICKS = 20;
const UNITS_RESEND_TICKS = 5;
let sentStructuresVersion = -1;
let structuresSentAt = 0;
let unitsSentAt = 0;
let unitsSentCount = -1;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

function onTickTimed(ms: number): void {
  windowTicks++;
  windowMsSum += ms;
  if (ms > windowMsMax) windowMsMax = ms;
}

function takeBuffer(bytes: number): ArrayBuffer {
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i] as ArrayBuffer;
    if (b.byteLength >= bytes) {
      pool.splice(i, 1);
      return b;
    }
  }
  // Grow with headroom so a growing horde does not reallocate every snapshot.
  return new ArrayBuffer(Math.ceil(bytes * 1.25));
}

function sendSnapshot(h: SimHost): void {
  const w = h.world;
  const counts = {
    zombies: w.zombieCount,
    civilians: w.civilianCount,
    corpses: w.corpseCount,
    units: w.unitCount,
    projectiles: w.projectileCount,
  };
  const fxCount = w.fxCount;
  const buffer = takeBuffer(snapshotByteLength(counts, fxCount));
  const view = writeSnapshotHeader(buffer, h.tick, w.widthM, w.heightM, counts, fxCount);
  w.writeZombies(view.zombies);
  w.writeCivilians(view.civilians);
  w.writeCorpses(view.corpses);
  w.writeUnits(view.units);
  w.writeProjectiles(view.projectiles);
  w.writeFx(view.fx);
  // Occupancy and hp change every tick; resend on structural change or periodically.
  const occupancyDue = h.tick - zonesSentAt >= ZONES_RESEND_TICKS && w.zones().length > 0;
  if (w.zonesVersion !== sentZonesVersion || occupancyDue) {
    sentZonesVersion = w.zonesVersion;
    zonesSentAt = h.tick;
    post({ type: 'zones', zones: w.zones() });
  }
  const structuresDue = h.tick - structuresSentAt >= ZONES_RESEND_TICKS;
  if (w.structuresVersion !== sentStructuresVersion || structuresDue) {
    sentStructuresVersion = w.structuresVersion;
    structuresSentAt = h.tick;
    post({ type: 'structures', structures: w.structures() });
  }
  if (h.tick - unitsSentAt >= UNITS_RESEND_TICKS || w.unitCount !== unitsSentCount) {
    unitsSentAt = h.tick;
    unitsSentCount = w.unitCount;
    post({ type: 'units', units: w.units() });
  }
  stats.tick = h.tick;
  stats.speed = h.loop.speed;
  stats.zombies = counts.zombies;
  stats.civilians = counts.civilians;
  stats.corpses = counts.corpses;
  stats.counters = { ...w.counters };
  post({ type: 'snapshot', buffer, stats: { ...stats } }, [buffer]);
  if (debugKind) {
    const field = w.debugField(debugKind);
    if (field) post({ type: 'debugField', field }, [field.data.buffer]);
  }
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
  switch (msg.type) {
    case 'init': {
      const t0 = performance.now();
      try {
        host = new SimHost(msg.seed, { size: msg.size }, createWorld, onTickTimed, () => performance.now());
      } catch (err) {
        post({ type: 'error', message: String(err), seed: msg.seed, commandLog: [] });
        return;
      }
      stats.worldGenMs = performance.now() - t0;
      // Structured clone copies the map; the worker keeps its own for the simulation.
      post({ type: 'map', map: host.world.map, worldGenMs: stats.worldGenMs });
      lastTime = performance.now();
      windowStart = lastTime;
      sendSnapshot(host);
      pump();
      break;
    }
    case 'command':
      host?.submit(msg.cmd);
      break;
    case 'returnBuffer':
      if (pool.length < POOL_MAX) pool.push(msg.buffer);
      break;
    case 'debugField':
      debugKind = msg.kind;
      break;
  }
};
