// Main-thread side of the worker: forwards commands, keeps the last two snapshots for interpolation.
import type { CommandInput } from './commands';
import { TICK_MS } from './loop';
import type { CommandSink, SimView } from './types/app';
import type { FromWorker, SimStats, ToWorker } from './types/messages';
import { readSnapshot, type SnapshotView } from './types/snapshot';

export class SimClient implements SimView, CommandSink {
  prev: SnapshotView | null = null;
  curr: SnapshotView | null = null;
  stats: SimStats = { tick: 0, speed: 1, ticksPerSecond: 0, tickMsAvg: 0, tickMsMax: 0, agentCount: 0 };
  private currAt = 0;
  private listeners: ((s: SnapshotView) => void)[] = [];
  private readonly worker: Worker;

  constructor(
    seed: number,
    private readonly onError: (msg: Extract<FromWorker, { type: 'error' }>) => void,
  ) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.send({ type: 'init', seed });
  }

  submit(cmd: CommandInput): void {
    this.send({ type: 'command', cmd });
  }

  alpha(nowMs: number): number {
    if (!this.prev || !this.curr || this.stats.speed <= 0) return 1;
    const ticksBetween = Math.max(1, this.curr.tick - this.prev.tick);
    const spanMs = (ticksBetween * TICK_MS) / this.stats.speed;
    return Math.min(1, Math.max(0, (nowMs - this.currAt) / spanMs));
  }

  onSnapshot(cb: (s: SnapshotView) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  destroy(): void {
    this.worker.terminate();
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  private receive(msg: FromWorker): void {
    if (msg.type === 'error') {
      this.onError(msg);
      return;
    }
    this.prev = this.curr;
    this.curr = readSnapshot(msg.buffer);
    this.currAt = performance.now();
    this.stats = msg.stats;
    for (const l of this.listeners) l(this.curr);
  }
}
