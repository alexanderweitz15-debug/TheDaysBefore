// Contracts between main.ts, render (src/render) and ui (src/ui).
import type { CommandInput } from '../commands';
import type { StructureView, UnitView } from './combat';
import type { CityMapData, CitySize } from './map';
import type { SimStats } from './messages';
import type { MissionView, ScenarioDef } from './mission';
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
  /** Called when the map is available (immediately if it already is) and again after every restart. */
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
  /** Mission state, null until the worker sent it (free mode sends it too). */
  readonly mission: MissionView | null;
}

export interface CommandSink {
  submit(cmd: CommandInput): void;
}

/** Starts a new mission or restarts; render and ui keep their subscriptions. */
export interface SessionControl {
  restart(seed: number, size: CitySize, scenario?: ScenarioDef): void;
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
  session: SessionControl;
  renderer: RendererHandle;
}

export type MountUi = (root: HTMLElement, deps: UiDeps) => void;
