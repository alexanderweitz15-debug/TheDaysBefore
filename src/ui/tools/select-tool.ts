// Click on the map while no tool is armed (decision 2026-11-27: troops are never selected, only orders are given):
// a click picks a structure (context panel), or a city building for repurposing while the economy window is open.
import type { SimView } from '../../core/types/app';
import { PICK_RADIUS_PX } from '../../data/hud';
import {
  activeTool,
  cameraView,
  repurposeTarget,
  screenToWorld,
  selectedStructure,
} from '../../render/view-state';
import { menuVisible, sidePanel } from '../ui-state';
import { distToSegment } from './zone-tools';

function pickStructure(sim: SimView, x: number, y: number): number {
  const tol = PICK_RADIUS_PX / cameraView.zoom;
  for (const st of sim.structures) {
    if (st.state === 'destroyed') continue;
    const p = st.shape;
    if (p.length >= 4) {
      for (let i = 0; i + 3 < p.length; i += 2)
        if (
          distToSegment(x, y, p[i] as number, p[i + 1] as number, p[i + 2] as number, p[i + 3] as number) <=
          tol
        )
          return st.id;
    } else if (p.length >= 2 && Math.hypot(x - (p[0] as number), y - (p[1] as number)) <= tol * 1.5)
      return st.id;
  }
  return -1;
}

/** Map building index at a world point, or -1. */
export function buildingAt(sim: SimView, x: number, y: number): number {
  const m = sim.map;
  if (!m) return -1;
  const cx = Math.floor(x / m.cellSizeM);
  const cy = Math.floor(y / m.cellSizeM);
  return cx >= 0 && cy >= 0 && cx < m.widthCells && cy < m.heightCells
    ? (m.buildingId[cy * m.widthCells + cx] as number)
    : -1;
}

export function installSelectTool(sim: SimView): () => void {
  const onUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
    if (activeTool.value !== 'none' || menuVisible.value) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const st = pickStructure(sim, p.x, p.y);
    if (st >= 0) {
      selectedStructure.value = st;
      return;
    }
    if (sidePanel.value === 'economy') {
      // Economy window open: a click on a city building picks it for repurposing.
      const b = buildingAt(sim, p.x, p.y);
      repurposeTarget.value = b >= 0 ? b : null;
      if (b >= 0) return;
    }
    selectedStructure.value = null;
  };
  window.addEventListener('pointerup', onUp);
  return () => window.removeEventListener('pointerup', onUp);
}
