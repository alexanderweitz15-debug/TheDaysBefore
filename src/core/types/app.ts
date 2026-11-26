// Contracts between main.ts, render (src/render) and ui (src/ui).
import type { CommandInput } from '../commands';
import type { SimStats } from './messages';
import type { SnapshotView } from './snapshot';

/** Read-only view of the simulation for render and ui. */
export interface SimView {
  /** Previous and current snapshot; render interpolates between them. */
  readonly prev: SnapshotView | null;
  readonly curr: SnapshotView | null;
  /** Interpolation factor in [0, 1] between prev and curr for wall time `nowMs` (performance.now()). */
  alpha(nowMs: number): number;
  readonly stats: SimStats;
  /** Subscribes to new snapshots. Returns unsubscribe. */
  onSnapshot(cb: (s: SnapshotView) => void): () => void;
}

export interface CommandSink {
  submit(cmd: CommandInput): void;
}

export interface RendererHandle {
  /** Frames per second measured over the last second. */
  fps(): number;
  destroy(): void;
}

export type CreateRenderer = (host: HTMLElement, sim: SimView) => Promise<RendererHandle>;

export interface UiDeps {
  sim: SimView;
  commands: CommandSink;
  renderer: RendererHandle;
}

export type MountUi = (root: HTMLElement, deps: UiDeps) => void;
