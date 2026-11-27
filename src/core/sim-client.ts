// Main-thread side of the worker: forwards commands, keeps the last two snapshots for interpolation.
import type { CommandInput } from './commands';
import { TICK_MS } from './loop';
import type { CommandSink, SimView } from './types/app';
import type { StructureView, UnitView } from './types/combat';
import type { CityMapData, CitySize } from './types/map';
import type { FromWorker, SimStats, ToWorker } from './types/messages';
import type { MissionView, ScenarioDef } from './types/mission';
import type { GarrisonView, OrderView, ReserveView } from './types/orders';
import type { DebriefData } from './types/outcome';
import type { ReplayData, SaveGame } from './types/save';
import type { DebugField, DebugFieldKind } from './types/sim';
import { readSnapshot, type SnapshotView } from './types/snapshot';
import type { ZoneView } from './types/zones';

export class SimClient implements SimView, CommandSink {
  prev: SnapshotView | null = null;
  curr: SnapshotView | null = null;
  map: CityMapData | null = null;
  debugField: DebugField | null = null;
  zones: ZoneView[] = [];
  units: UnitView[] = [];
  mission: MissionView | null = null;
  debrief: DebriefData | null = null;
  orders: OrderView[] = [];
  reserve: ReserveView = { idle: {}, returning: 0 };
  garrisons: GarrisonView[] = [];
  private debriefListeners: ((d: DebriefData) => void)[] = [];
  private nextRequestId = 1;
  private pending = new Map<number, (value: unknown) => void>();
  structures: StructureView[] = [];
  private structureListeners: ((s: StructureView[]) => void)[] = [];
  private zoneListeners: ((z: ZoneView[]) => void)[] = [];
  stats: SimStats = {
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
  private prevBuffer: ArrayBuffer | null = null;
  private currAt = 0;
  private snapshotListeners: ((s: SnapshotView) => void)[] = [];
  private mapListeners: ((m: CityMapData) => void)[] = [];
  private worker: Worker;

  constructor(
    seed: number,
    size: CitySize,
    private readonly onError: (msg: Extract<FromWorker, { type: 'error' }>) => void,
    scenario?: ScenarioDef,
  ) {
    this.worker = this.spawn(seed, size, scenario);
  }

  /**
   * Starts a new world (briefing -> mission, restart). Listeners stay subscribed; all state is reset and
   * onMap listeners fire again with the new map.
   */
  restart(seed: number, size: CitySize, scenario?: ScenarioDef): void {
    this.worker.terminate();
    this.prev = null;
    this.curr = null;
    this.prevBuffer = null;
    this.map = null;
    this.debugField = null;
    this.zones = [];
    this.units = [];
    this.structures = [];
    this.mission = null;
    this.debrief = null;
    this.worker = this.spawn(seed, size, scenario);
  }

  /** Requests the full state; the UI adds meta (label, savedAt) and stores it. */
  save(): Promise<Omit<SaveGame, 'meta'> & { tick: number }> {
    return this.request('save', {}) as Promise<Omit<SaveGame, 'meta'> & { tick: number }>;
  }

  /** Replaces the running world with a saved one (same worker, listeners stay). */
  load(save: SaveGame): void {
    this.resetState();
    this.send({ type: 'load', save });
  }

  replay(): Promise<ReplayData> {
    return this.request('replay', {}) as Promise<ReplayData>;
  }

  /** Re-simulates a replay in the worker and resolves with the end hash. */
  verifyReplay(replay: ReplayData): Promise<{ hash: string; tick: number }> {
    return this.request('verifyReplay', { replay }) as Promise<{ hash: string; tick: number }>;
  }

  onDebrief(cb: (d: DebriefData) => void): () => void {
    this.debriefListeners.push(cb);
    if (this.debrief) cb(this.debrief);
    return () => {
      this.debriefListeners = this.debriefListeners.filter((l) => l !== cb);
    };
  }

  private request(type: 'save' | 'replay' | 'verifyReplay', extra: object): Promise<unknown> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      this.send({ type, requestId, ...extra } as ToWorker);
    });
  }

  private resolve(requestId: number, value: unknown): void {
    const done = this.pending.get(requestId);
    this.pending.delete(requestId);
    done?.(value);
  }

  private resetState(): void {
    this.prev = null;
    this.curr = null;
    this.prevBuffer = null;
    this.map = null;
    this.debugField = null;
    this.zones = [];
    this.units = [];
    this.structures = [];
    this.mission = null;
    this.debrief = null;
    this.orders = [];
    this.reserve = { idle: {}, returning: 0 };
    this.garrisons = [];
  }

  private spawn(seed: number, size: CitySize, scenario?: ScenarioDef): Worker {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    worker.postMessage({ type: 'init', seed, size, ...(scenario ? { scenario } : {}) } satisfies ToWorker);
    return worker;
  }

  submit(cmd: CommandInput): void {
    this.send({ type: 'command', cmd });
  }

  requestDebugField(kind: DebugFieldKind | null): void {
    if (!kind) this.debugField = null;
    this.send({ type: 'debugField', kind });
  }

  alpha(nowMs: number): number {
    if (!this.prev || !this.curr || this.stats.speed <= 0) return 1;
    const ticksBetween = Math.max(1, this.curr.tick - this.prev.tick);
    const spanMs = (ticksBetween * TICK_MS) / this.stats.speed;
    return Math.min(1, Math.max(0, (nowMs - this.currAt) / spanMs));
  }

  onSnapshot(cb: (s: SnapshotView) => void): () => void {
    this.snapshotListeners.push(cb);
    return () => {
      this.snapshotListeners = this.snapshotListeners.filter((l) => l !== cb);
    };
  }

  /** Fires now if a map exists and again for every new map (restart). */
  onMap(cb: (m: CityMapData) => void): () => void {
    if (this.map) cb(this.map);
    this.mapListeners.push(cb);
    return () => {
      this.mapListeners = this.mapListeners.filter((l) => l !== cb);
    };
  }

  onZones(cb: (z: ZoneView[]) => void): () => void {
    this.zoneListeners.push(cb);
    cb(this.zones);
    return () => {
      this.zoneListeners = this.zoneListeners.filter((l) => l !== cb);
    };
  }

  onStructures(cb: (s: StructureView[]) => void): () => void {
    this.structureListeners.push(cb);
    cb(this.structures);
    return () => {
      this.structureListeners = this.structureListeners.filter((l) => l !== cb);
    };
  }

  destroy(): void {
    this.worker.terminate();
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  private receive(msg: FromWorker): void {
    switch (msg.type) {
      case 'error':
        this.onError(msg);
        return;
      case 'map':
        this.map = msg.map;
        for (const l of this.mapListeners) l(msg.map);
        return;
      case 'debugField':
        this.debugField = msg.field;
        return;
      case 'mission':
        this.mission = msg.mission;
        return;
      case 'orders':
        this.orders = msg.orders;
        this.reserve = msg.reserve;
        this.garrisons = msg.garrisons;
        return;
      case 'debrief':
        this.debrief = msg.debrief;
        for (const l of this.debriefListeners) l(msg.debrief);
        return;
      case 'save':
        this.resolve(msg.requestId, msg.save);
        return;
      case 'replay':
        this.resolve(msg.requestId, msg.replay);
        return;
      case 'verifyReplay':
        this.resolve(msg.requestId, { hash: msg.hash, tick: msg.tick });
        return;
      case 'units':
        this.units = msg.units;
        return;
      case 'structures':
        this.structures = msg.structures;
        for (const l of this.structureListeners) l(msg.structures);
        return;
      case 'zones':
        this.zones = msg.zones;
        for (const l of this.zoneListeners) l(msg.zones);
        return;
      case 'snapshot': {
        // The snapshot two steps back is no longer referenced: hand its buffer back to the worker.
        if (this.prevBuffer) this.send({ type: 'returnBuffer', buffer: this.prevBuffer }, [this.prevBuffer]);
        this.prevBuffer = this.curr ? (this.curr.zombies.ids.buffer as ArrayBuffer) : null;
        this.prev = this.curr;
        this.curr = readSnapshot(msg.buffer);
        this.currAt = performance.now();
        this.stats = msg.stats;
        for (const l of this.snapshotListeners) l(this.curr);
        return;
      }
    }
  }
}
