// Selection and unit orders (GDD 14, Interaktion): click, box, double click, Shift adds; right click moves.
// Active only while no placement or zone tool is armed.
import type { CommandSink, SimView } from '../../core/types/app';
import { DOUBLE_CLICK_MS, DRAG_THRESHOLD_PX, PICK_RADIUS_PX } from '../../data/hud';
import {
  activeTool,
  cameraView,
  screenToWorld,
  selectedStructure,
  selectedUnits,
  selectionBox,
} from '../../render/view-state';
import { menuVisible } from '../ui-state';
import { distToSegment } from './zone-tools';

const LOCAL_PLAYER = 0;

interface Press {
  sx: number;
  sy: number;
  shift: boolean;
}

/** Nearest unit id within the pick radius of a world point, or -1. */
function pickUnit(sim: SimView, x: number, y: number): number {
  const s = sim.curr?.units;
  if (!s) return -1;
  const tol = PICK_RADIUS_PX / cameraView.zoom;
  let best = -1;
  let bestD = tol;
  for (let i = 0; i < s.count; i++) {
    const d = Math.hypot((s.pos[i * 2] as number) - x, (s.pos[i * 2 + 1] as number) - y);
    if (d <= bestD) {
      bestD = d;
      best = s.ids[i] as number;
    }
  }
  return best;
}

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

function setUnits(ids: number[], add: boolean): void {
  selectedStructure.value = null;
  if (!add) {
    selectedUnits.value = ids;
    return;
  }
  const merged = new Set(selectedUnits.value);
  for (const id of ids) merged.add(id);
  selectedUnits.value = [...merged];
}

/** Unit ids whose position lies inside a world rectangle, optionally limited to one type. */
function unitsInRect(sim: SimView, x0: number, y0: number, x1: number, y1: number, kind: number): number[] {
  const s = sim.curr?.units;
  const out: number[] = [];
  if (!s) return out;
  for (let i = 0; i < s.count; i++) {
    const x = s.pos[i * 2] as number;
    const y = s.pos[i * 2 + 1] as number;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && (kind < 0 || s.kind[i] === kind))
      out.push(s.ids[i] as number);
  }
  return out;
}

export function installSelectTool(sim: SimView, commands: CommandSink): () => void {
  let left: Press | null = null;
  let right: Press | null = null;
  let dragging = false;
  let lastClick = { t: 0, x: 0, y: 0 };
  const onCanvas = (e: Event): boolean => e.target instanceof HTMLCanvasElement;
  const idle = (): boolean => activeTool.value === 'none' && !menuVisible.value;

  const onDown = (e: PointerEvent): void => {
    if (!onCanvas(e) || !idle()) return;
    if (e.button === 0) left = { sx: e.clientX, sy: e.clientY, shift: e.shiftKey };
    else if (e.button === 2 && selectedUnits.value.length > 0)
      right = { sx: e.clientX, sy: e.clientY, shift: e.shiftKey };
  };
  const onMove = (e: PointerEvent): void => {
    if (!left) return;
    if (!dragging && Math.hypot(e.clientX - left.sx, e.clientY - left.sy) > DRAG_THRESHOLD_PX)
      dragging = true;
    if (dragging) selectionBox.value = { x0: left.sx, y0: left.sy, x1: e.clientX, y1: e.clientY };
  };
  const onUp = (e: PointerEvent): void => {
    if (e.button === 0 && left) {
      const press = left;
      left = null;
      selectionBox.value = null;
      if (dragging) {
        dragging = false;
        const a = screenToWorld(press.sx, press.sy);
        const b = screenToWorld(e.clientX, e.clientY);
        const ids = unitsInRect(
          sim,
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.max(a.x, b.x),
          Math.max(a.y, b.y),
          -1,
        );
        if (ids.length > 0 || !press.shift) setUnits(ids, press.shift);
        return;
      }
      click(e, press);
    } else if (e.button === 2 && right) {
      const press = right;
      right = null;
      order(e, press);
    }
  };

  const click = (e: PointerEvent, press: Press): void => {
    const p = screenToWorld(e.clientX, e.clientY);
    const now = performance.now();
    const double =
      now - lastClick.t < DOUBLE_CLICK_MS &&
      Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < DRAG_THRESHOLD_PX * 2;
    lastClick = { t: now, x: e.clientX, y: e.clientY };
    const unit = pickUnit(sim, p.x, p.y);
    if (unit >= 0) {
      if (double) {
        const s = sim.curr?.units;
        const idx = s ? Array.from(s.ids.subarray(0, s.count)).indexOf(unit) : -1;
        const kind = idx >= 0 && s ? (s.kind[idx] as number) : -1;
        const hw = cameraView.width / 2 / cameraView.zoom;
        const hh = cameraView.height / 2 / cameraView.zoom;
        setUnits(
          unitsInRect(
            sim,
            cameraView.cx - hw,
            cameraView.cy - hh,
            cameraView.cx + hw,
            cameraView.cy + hh,
            kind,
          ),
          press.shift,
        );
      } else setUnits([unit], press.shift);
      return;
    }
    const st = pickStructure(sim, p.x, p.y);
    if (st >= 0) {
      selectedUnits.value = [];
      selectedStructure.value = st;
      return;
    }
    if (!press.shift) {
      selectedUnits.value = [];
      selectedStructure.value = null;
    }
  };

  const order = (e: PointerEvent, press: Press): void => {
    const from = screenToWorld(press.sx, press.sy);
    let facing: number | null = null;
    if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > DRAG_THRESHOLD_PX * 2) {
      const to = screenToWorld(e.clientX, e.clientY);
      facing = Math.atan2(to.y - from.y, to.x - from.x);
    }
    commands.submit({
      playerId: LOCAL_PLAYER,
      type: 'MoveUnits',
      payload: { unitIds: [...selectedUnits.value], x: from.x, y: from.y, append: press.shift, facing },
    });
  };

  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  return () => {
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
}
