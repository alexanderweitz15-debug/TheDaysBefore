// View state shared between renderer and UI: debug overlay mode and camera transform for screen-to-world mapping.
import { signal } from '@preact/signals';

export const OVERLAY_MODES = [
  'off',
  'flow',
  'density',
  'infection',
  'noise',
  'safety',
  'sectors',
  'grid',
] as const;
export type OverlayMode = (typeof OVERLAY_MODES)[number];

export const overlayMode = signal<OverlayMode>('off');

/** Written by the camera every time it moves. Plain object so it can be read without reactivity. */
export const cameraView = { cx: 0, cy: 0, zoom: 1, width: 1, height: 1 };

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: cameraView.cx + (sx - cameraView.width / 2) / cameraView.zoom,
    y: cameraView.cy + (sy - cameraView.height / 2) / cameraView.zoom,
  };
}

export type ToolName = 'none' | 'corridor' | 'safeZone' | 'rallyPoint' | 'build' | 'attackArea';

/** Active civil tool (keys K, Z, V). Set by the UI, drawn as a preview by the renderer. */
export const activeTool = signal<ToolName>('none');

/** Draft of the shape being drawn, in meters. Plain object, mutated by the UI, read by the renderer each frame. */
export const toolDraft = {
  /** Corridor points, flat x,y. */
  points: [] as number[],
  /** Safe zone drag start; NaN when not dragging. */
  startX: Number.NaN,
  startY: Number.NaN,
  /** Pointer position in world meters; NaN while the pointer is off the map. */
  cursorX: Number.NaN,
  cursorY: Number.NaN,
};

/** Unit ids selected by the player. Replaced (never mutated) so effects and layers can compare identity. */
export const selectedUnits = signal<readonly number[]>([]);
/** Structure selected by the player, or null. */
export const selectedStructure = signal<number | null>(null);

/** What the build tool (tool 'build') places. */
export type BuildArm = { kind: 'unit'; unit: string } | { kind: 'structure'; structure: string };
export const buildArm = signal<BuildArm | null>(null);
/** Rotation for point structures, radians. */
export const buildState = { rotation: 0 };

/** Screen-space selection box while dragging, or null. */
export const selectionBox = signal<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

/** One-shot camera request: the camera moves to (x, y) on its next update. */
export const cameraRequest = { pending: false, x: 0, y: 0, zoom: 0 };
/** zoom 0 keeps the current zoom. */
export function jumpCamera(x: number, y: number, zoom = 0): void {
  cameraRequest.x = x;
  cameraRequest.y = y;
  cameraRequest.zoom = zoom;
  cameraRequest.pending = true;
}

/** Screen shake offset in px, written by the effects layer, added by the camera. */
export const cameraShake = { x: 0, y: 0 };

/** City building (map.buildings index) picked for repurposing in the economy window, or null. */
export const repurposeTarget = signal<number | null>(null);

/** Baking progress of the current map, written by the renderer; the loading screen polls it. */
export const mapBake: { map: object | null; progress: number } = { map: null, progress: 0 };
