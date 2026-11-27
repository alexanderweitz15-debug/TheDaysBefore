// Contracts between main.ts, render (src/render) and ui (src/ui).
import type { CommandInput } from '../commands';
import type { StructureView, UnitView } from './combat';
import type { CityMapData } from './map';
import type { SimStats } from './messages';
import type { DebugField, DebugFieldKind } from './sim';
import type { SnapshotView } from './snapshot';
import type { ZoneView } from './zones';

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
  /** City map, null until the worker has generated it. */
  readonly map: CityMapData | null;
  /** Called once when the map is available (immediately if it already is). */
  onMap(cb: (map: CityMapData) => void): () => void;
  /** Latest requested debug field, or null. */
  readonly debugField: DebugField | null;
  /** Requests a debug overlay field with every snapshot; null switches it off. */
  requestDebugField(kind: DebugFieldKind | null): void;
  /** Current safe zones, corridors and rally points. */
  readonly zones: ZoneView[];
  /** Subscribes to zone changes (called immediately with the current list). */
  onZones(cb: (zones: ZoneView[]) => void): () => void;
  /** Unit details, refreshed 4x per second (positions come from the snapshot). */
  readonly units: UnitView[];
  readonly structures: StructureView[];
  onStructures(cb: (structures: StructureView[]) => void): () => void;
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
