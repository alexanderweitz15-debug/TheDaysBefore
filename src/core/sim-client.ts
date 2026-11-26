// Main-thread side of the worker: forwards commands, keeps the last two snapshots for interpolation.
import type { CommandInput } from './commands';
import { TICK_MS } from './loop';
import type { CommandSink, SimView } from './types/app';
import type { CityMapData, CitySize } from './types/map';
import type { FromWorker, SimStats, ToWorker } from './types/messages';
import type { DebugField, DebugFieldKind } from './types/sim';
import { readSnapshot, type SnapshotView } from './types/snapshot';

export class SimClient implements SimView, CommandSink {
  prev: SnapshotView | null = null;
  curr: SnapshotView | null = null;
  map: CityMapData | null = null;
  debugField: DebugField | null = null;
  stats: SimStats = {
    tick: 0,
    speed: 1,
    ticksPerSecond: 0,
    tickMsAvg: 0,
    tickMsMax: 0,
    zombies: 0,
    civilians: 0,
    worldGenMs: 0,
  };
  private prevBuffer: ArrayBuffer | null = null;
  private currAt = 0;
  private snapshotListeners: ((s: SnapshotView) => void)[] = [];
  private mapListeners: ((m: CityMapData) => void)[] = [];
  private readonly worker: Worker;

  constructor(
    seed: number,
    size: CitySize,
    private readonly onError: (msg: Extract<FromWorker, { type: 'error' }>) => void,
  ) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.send({ type: 'init', seed, size });
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

  onMap(cb: (m: CityMapData) => void): () => void {
    if (this.map) cb(this.map);
    else this.mapListeners.push(cb);
    return () => {
      this.mapListeners = this.mapListeners.filter((l) => l !== cb);
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
        this.mapListeners = [];
        return;
      case 'debugField':
        this.debugField = msg.field;
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
