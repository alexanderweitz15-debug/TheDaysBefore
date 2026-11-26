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

export type ToolName = 'none' | 'corridor' | 'safeZone' | 'rallyPoint';

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
