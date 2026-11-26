// View state shared between renderer and UI: debug overlay mode and camera transform for screen-to-world mapping.
import { signal } from '@preact/signals';

export const OVERLAY_MODES = ['off', 'flow', 'density', 'sectors', 'grid'] as const;
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
