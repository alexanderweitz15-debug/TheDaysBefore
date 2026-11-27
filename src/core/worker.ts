// Web Worker entry: generates the world, runs the SimHost on a timer and posts snapshots back.
import { createWorld, restoreWorld } from '../sim/world';
import { hashHex } from './hash';
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
let missionSentAt = -1000;
let debriefSent = false;
let sentOrdersVersion = -1;
let ordersSentAt = 0;
let pumping = false;

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
  if (w.ordersVersion !== sentOrdersVersion || h.tick - ordersSentAt >= ZONES_RESEND_TICKS) {
    sentOrdersVersion = w.ordersVersion;
    ordersSentAt = h.tick;
    post({ type: 'orders', ...w.orders() });
  }
  const structuresDue = h.tick - structuresSentAt >= ZONES_RESEND_TICKS;
  if (w.structuresVersion !== sentStructuresVersion || structuresDue) {
    sentStructuresVersion = w.structuresVersion;
    structuresSentAt = h.tick;
    post({ type: 'structures', structures: w.structures() });
  }
  if (h.tick - missionSentAt >= ZONES_RESEND_TICKS) {
    missionSentAt = h.tick;
    const mission = w.mission();
    post({ type: 'mission', mission });
    if (mission.outcome && !debriefSent) {
      const debrief = w.debrief();
      if (debrief) {
        debriefSent = true;
        post({ type: 'debrief', debrief });
      }
    }
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
  if (!host) {
    pumping = false;
    return;
  }
  pumping = true;
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

/** The serialized state starts with a Uint32 tick (contract with sim/world.ts serialize()). */
function readTick(state: Uint8Array): number {
  return state.byteLength >= 4 ? new DataView(state.buffer, state.byteOffset, 4).getUint32(0, true) : 0;
}

function startRunning(h: SimHost): void {
  debriefSent = false;
  sentZonesVersion = -1;
  sentStructuresVersion = -1;
  sentOrdersVersion = -1;
  lastTime = performance.now();
  windowStart = lastTime;
  sendSnapshot(h);
  if (!pumping) pump();
}

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      const t0 = performance.now();
      try {
        host = new SimHost(
          msg.seed,
          { size: msg.size, ...(msg.scenario ? { scenario: msg.scenario } : {}) },
          createWorld,
          onTickTimed,
          () => performance.now(),
        );
      } catch (err) {
        post({ type: 'error', message: String(err), seed: msg.seed, commandLog: [] });
        return;
      }
      stats.worldGenMs = performance.now() - t0;
      // Structured clone copies the map; the worker keeps its own for the simulation.
      post({ type: 'map', map: host.world.map, worldGenMs: stats.worldGenMs });
      startRunning(host);
      break;
    }
    case 'load': {
      const { save } = msg;
      const options = { size: save.size, ...(save.scenario ? { scenario: save.scenario } : {}) };
      try {
        const world = restoreWorld(save.seed, options, save.state);
        const tick = save.commands.length > 0 ? Math.max(...save.commands.map((c) => c.tick)) + 1 : 0;
        host = new SimHost(save.seed, options, createWorld, onTickTimed, () => performance.now(), {
          world,
          tick: Math.max(tick, readTick(save.state)),
          log: save.commands,
        });
      } catch (err) {
        post({ type: 'error', message: `load failed: ${String(err)}`, seed: save.seed, commandLog: [] });
        return;
      }
      post({ type: 'map', map: host.world.map, worldGenMs: 0 });
      startRunning(host);
      break;
    }
    case 'save': {
      if (!host) return;
      post({
        type: 'save',
        requestId: msg.requestId,
        save: {
          seed: host.seed,
          size: host.options.size,
          scenario: host.options.scenario ?? null,
          state: host.world.serialize(),
          commands: host.queue.log.slice(),
          tick: host.tick,
        },
      });
      break;
    }
    case 'replay': {
      if (!host) return;
      post({
        type: 'replay',
        requestId: msg.requestId,
        replay: {
          formatVersion: 1,
          seed: host.seed,
          size: host.options.size,
          scenario: host.options.scenario ?? null,
          commands: host.queue.log.slice(),
          endTick: host.tick,
          endHash: hashHex(host.hash()),
        },
      });
      break;
    }
    case 'verifyReplay': {
      const r = msg.replay;
      const options = { size: r.size, ...(r.scenario ? { scenario: r.scenario } : {}) };
      const check = new SimHost(r.seed, options, createWorld);
      for (const cmd of r.commands) check.enqueue(cmd);
      while (check.tick < r.endTick) check.runTick();
      post({ type: 'verifyReplay', requestId: msg.requestId, hash: hashHex(check.hash()), tick: check.tick });
      break;
    }
    case 'command':
      if (!host) break;
      host.submit(msg.cmd);
      // While paused no tick runs and pump sends nothing: publish speed changes (and a surrender tick) now.
      if (msg.cmd.type === 'SetGameSpeed' || host.loop.speed <= 0) sendSnapshot(host);
      break;
    case 'returnBuffer':
      if (pool.length < POOL_MAX) pool.push(msg.buffer);
      break;
    case 'debugField':
      debugKind = msg.kind;
      break;
  }
};
