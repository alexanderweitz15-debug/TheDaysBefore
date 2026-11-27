// Civil tools (GDD 14): K corridor, Z safe zone, V rally point; right click or Del removes a zone.
// Esc is handled by app.tsx through cancelTool(), so it is handled exactly once.

import type { CommandSink, SimView } from '../../core/types/app';
import type { ZoneView } from '../../core/types/zones';
import { ZONES } from '../../data/agents/civilians';
import type { MessageKey } from '../../data/i18n/de';
import {
  MIN_ZONE_SIZE_M,
  RALLY_RADIUS_M,
  TOOL_NOTICE_MS,
  ZONE_PICK_TOLERANCE_PX,
  ZONE_REMOVE_UNDO_MS,
} from '../../data/render';
import {
  activeTool,
  buildArm,
  cameraView,
  screenToWorld,
  selectedStructure,
  selectedUnits,
  type ToolName,
  toolDraft,
} from '../../render/view-state';
import { keyOf, settings } from '../settings/store';
import { menuVisible, pendingRemoval, settingsOpen, toolNotice } from '../ui-state';

const LOCAL_PLAYER = 0;
const toolOf = (code: string): ToolName | undefined =>
  code === keyOf('toolCorridor')
    ? 'corridor'
    : code === keyOf('toolSafeZone')
      ? 'safeZone'
      : code === keyOf('toolRally')
        ? 'rallyPoint'
        : undefined;

let pendingTimer = 0;

/** Takes back a delayed zone removal. */
export function undoRemoval(): void {
  window.clearTimeout(pendingTimer);
  pendingRemoval.value = null;
}

let noticeTimer = 0;
function notify(key: MessageKey): void {
  toolNotice.value = key;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (toolNotice.value = null), TOOL_NOTICE_MS);
}

function resetDraft(): void {
  toolDraft.points = [];
  toolDraft.startX = Number.NaN;
  toolDraft.startY = Number.NaN;
}

/** Aborts the active tool. Returns true if there was one (the Esc press is consumed). */
export function cancelTool(): boolean {
  if (pendingRemoval.value !== null) {
    undoRemoval();
    return true;
  }
  if (activeTool.value === 'none') return false;
  activeTool.value = 'none';
  buildArm.value = null;
  resetDraft();
  return true;
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Id of the zone under a world point, or -1. Rally points and corridors win over zones they overlap. */
export function pickZone(zones: readonly ZoneView[], x: number, y: number, zoom: number): number {
  const tol = ZONE_PICK_TOLERANCE_PX / zoom;
  let rect = -1;
  for (const z of zones) {
    const s = z.shape;
    if (
      z.kind === 'rallyPoint' &&
      Math.hypot(x - (s[0] as number), y - (s[1] as number)) <= RALLY_RADIUS_M + tol
    )
      return z.id;
    if (z.kind === 'corridor') {
      for (let i = 0; i + 3 < s.length; i += 2) {
        if (
          distToSegment(x, y, s[i] as number, s[i + 1] as number, s[i + 2] as number, s[i + 3] as number) <=
          tol
        )
          return z.id;
      }
    } else if (z.kind === 'safeZone') {
      const inX =
        x >= Math.min(s[0] as number, s[2] as number) - tol &&
        x <= Math.max(s[0] as number, s[2] as number) + tol;
      const inY =
        y >= Math.min(s[1] as number, s[3] as number) - tol &&
        y <= Math.max(s[1] as number, s[3] as number) + tol;
      if (inX && inY) rect = z.id;
    }
  }
  return rect;
}

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}

export function installZoneTools(sim: SimView, commands: CommandSink): () => void {
  let zones: ZoneView[] = [];
  const unsub = sim.onZones((z) => (zones = z));
  const submit = (
    type: 'DrawCorridor' | 'PlaceSafeZone' | 'SetRallyPoint' | 'RemoveZone',
    payload: object,
  ): void => {
    commands.submit({ playerId: LOCAL_PLAYER, type, payload } as Parameters<CommandSink['submit']>[0]);
  };
  const onCanvas = (e: Event): boolean => e.target instanceof HTMLCanvasElement;
  const cursor = (e: PointerEvent): void => {
    const p = screenToWorld(e.clientX, e.clientY);
    toolDraft.cursorX = p.x;
    toolDraft.cursorY = p.y;
  };

  const finishCorridor = (): void => {
    if (toolDraft.points.length >= 4) submit('DrawCorridor', { points: [...toolDraft.points] });
    cancelTool();
  };
  const removeAt = (x: number, y: number): void => {
    const id = pickZone(zones, x, y, cameraView.zoom);
    if (id < 0) return;
    const commit = (zoneId: number): void => {
      window.clearTimeout(pendingTimer);
      pendingRemoval.value = null;
      submit('RemoveZone', { id: zoneId });
    };
    // A second removal commits the first one right away.
    if (pendingRemoval.value !== null) commit(pendingRemoval.value);
    if (!settings.confirmRemoval.peek()) {
      commit(id);
      return;
    }
    pendingRemoval.value = id;
    pendingTimer = window.setTimeout(() => commit(id), ZONE_REMOVE_UNDO_MS);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      isTyping() ||
      settingsOpen.value ||
      menuVisible.value
    )
      return;
    const tool = toolOf(e.code);
    if (tool) {
      cancelTool();
      activeTool.value = tool;
    } else if (e.key === 'Enter' && activeTool.value === 'corridor') {
      finishCorridor();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && Number.isFinite(toolDraft.cursorX)) {
      removeAt(toolDraft.cursorX, toolDraft.cursorY);
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (onCanvas(e)) cursor(e);
    else {
      toolDraft.cursorX = Number.NaN;
      toolDraft.cursorY = Number.NaN;
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (!onCanvas(e) || e.button !== 0) return;
    const tool = activeTool.value;
    cursor(e);
    if (tool === 'corridor') {
      if (toolDraft.points.length / 2 >= ZONES.maxCorridorPoints) notify('tool.corridor.max');
      else toolDraft.points.push(toolDraft.cursorX, toolDraft.cursorY);
    } else if (tool === 'safeZone') {
      toolDraft.startX = toolDraft.cursorX;
      toolDraft.startY = toolDraft.cursorY;
    } else if (tool === 'rallyPoint') {
      submit('SetRallyPoint', { x: toolDraft.cursorX, y: toolDraft.cursorY });
      cancelTool();
    }
  };
  const onUp = (e: PointerEvent): void => {
    if (activeTool.value !== 'safeZone' || e.button !== 0 || Number.isNaN(toolDraft.startX)) return;
    cursor(e);
    const { startX: x0, startY: y0, cursorX: x1, cursorY: y1 } = toolDraft;
    if (Math.abs(x1 - x0) >= MIN_ZONE_SIZE_M && Math.abs(y1 - y0) >= MIN_ZONE_SIZE_M)
      submit('PlaceSafeZone', { x0, y0, x1, y1 });
    cancelTool();
  };
  const onContext = (e: MouseEvent): void => {
    if (!onCanvas(e)) return;
    e.preventDefault();
    if (cancelTool()) return;
    // With units or a structure selected, right click is an order, not a removal.
    if (selectedUnits.value.length > 0 || selectedStructure.value !== null) return;
    const p = screenToWorld(e.clientX, e.clientY);
    removeAt(p.x, p.y);
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('contextmenu', onContext);
  return () => {
    unsub();
    undoRemoval();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('contextmenu', onContext);
  };
}
