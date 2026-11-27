// Order tools (decision 2026-11-27): defend line (drag), hold zone (drag area), occupy building (click).
// Strength per type and stance come from the dialog (orderDraft); the sim assigns squads from the reserve.

import type { UnitTypeId } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import {
  DEFAULT_ORDER_STANCE,
  GARRISON_PREVIEW,
  ORDER_DEFAULT_SHARE,
  ORDER_MIN_LINE_M,
  ORDER_MIN_ZONE_M,
  type OrderTool,
} from '../../data/hud-orders';
import { UNIT_TYPE_ORDER } from '../../data/units/present';
import { activeTool, orderHover, screenToWorld, toolDraft } from '../../render/view-state';
import { menuVisible, orderDraft, settingsOpen } from '../ui-state';
import { buildingAt } from './select-tool';
import { cancelTool, notify } from './zone-tools';

const LOCAL_PLAYER = 0;

/** Unit types a squad request may contain. */
export const ORDERABLE: readonly UnitTypeId[] = UNIT_TYPE_ORDER.filter((u) => u !== 'militia');

export function reserveTotal(sim: SimView): number {
  return Object.values(sim.reserve.idle).reduce((a, n) => a + (n ?? 0), 0);
}

/** Position of the headquarters (depot), or the map center. Purchases go to the reserve there. */
export function hqPosition(sim: SimView): { x: number; y: number } {
  const depot = sim.structures.find((s) => s.kind === 'depot');
  if (depot) return { x: depot.shape[0] as number, y: depot.shape[1] as number };
  return { x: (sim.curr?.widthM ?? 0) / 2, y: (sim.curr?.heightM ?? 0) / 2 };
}

/** Starts an order: opens the dialog with half the reserve (rounded up) of every type it holds. */
export function armOrder(sim: SimView, kind: OrderTool): void {
  cancelTool();
  const squads: Partial<Record<UnitTypeId, number>> = {};
  for (const u of ORDERABLE) {
    const idle = sim.reserve.idle[u] ?? 0;
    if (idle > 0) squads[u] = Math.ceil(idle * ORDER_DEFAULT_SHARE);
  }
  const first = Object.keys(squads).length > 0;
  orderDraft.value = {
    kind,
    squads,
    stance: DEFAULT_ORDER_STANCE,
  };
  activeTool.value = kind;
  if (!first) notify('orders.noReserve');
}

/** Garrison estimate for the building preview (floors and rough capacity). */
export function buildingInfo(sim: SimView, id: number): { floors: number; squads: number } | null {
  const m = sim.map;
  if (!m || id < 0 || id >= m.buildings.count) return null;
  const floors = m.buildings.floors[id] as number;
  const cells = (m.buildings.w[id] as number) * (m.buildings.h[id] as number);
  const squads = Math.max(
    1,
    Math.min(GARRISON_PREVIEW.maxSquads, Math.round((cells * floors) / GARRISON_PREVIEW.floorCellsPerSquad)),
  );
  return { floors, squads };
}

export function installOrderTool(sim: SimView, commands: CommandSink): () => void {
  const onCanvas = (e: Event): boolean => e.target instanceof HTMLCanvasElement;
  const isOrder = (): OrderTool | null => {
    const t = activeTool.value;
    return t === 'defendLine' || t === 'holdZone' || t === 'occupyBuilding' ? t : null;
  };
  /** Chosen strength without zero entries, or null (with a notice) when empty. */
  const squads = (): {
    squads: Partial<Record<UnitTypeId, number>>;
    stance: NonNullable<typeof orderDraft.value>['stance'];
  } | null => {
    const d = orderDraft.peek();
    if (!d) return null;
    const out: Partial<Record<UnitTypeId, number>> = {};
    for (const u of ORDERABLE) if ((d.squads[u] ?? 0) > 0) out[u] = d.squads[u];
    if (Object.keys(out).length === 0) {
      notify(reserveTotal(sim) === 0 ? 'orders.noReserve' : 'orders.noSquads');
      return null;
    }
    return { squads: out, stance: d.stance };
  };

  const onMove = (e: PointerEvent): void => {
    if (isOrder() !== 'occupyBuilding') return;
    if (!onCanvas(e)) {
      orderHover.buildingId = -1;
      return;
    }
    const p = screenToWorld(e.clientX, e.clientY);
    orderHover.buildingId = buildingAt(sim, p.x, p.y);
  };
  const onDown = (e: PointerEvent): void => {
    const tool = isOrder();
    if (!tool || e.button !== 0 || !onCanvas(e) || menuVisible.value || settingsOpen.value) return;
    const p = screenToWorld(e.clientX, e.clientY);
    if (tool === 'occupyBuilding') {
      const b = buildingAt(sim, p.x, p.y);
      if (b < 0) return;
      const s = squads();
      if (!s) return;
      commands.submit({ playerId: LOCAL_PLAYER, type: 'OccupyBuilding', payload: { buildingId: b, ...s } });
      orderHover.buildingId = -1;
      cancelTool();
      return;
    }
    toolDraft.startX = p.x;
    toolDraft.startY = p.y;
  };
  const onUp = (e: PointerEvent): void => {
    const tool = isOrder();
    if (!tool || tool === 'occupyBuilding' || e.button !== 0 || Number.isNaN(toolDraft.startX)) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const { startX: x0, startY: y0 } = toolDraft;
    toolDraft.startX = Number.NaN;
    toolDraft.startY = Number.NaN;
    const s = squads();
    if (!s) return;
    if (tool === 'defendLine') {
      if (Math.hypot(p.x - x0, p.y - y0) < ORDER_MIN_LINE_M) return;
      commands.submit({
        playerId: LOCAL_PLAYER,
        type: 'DefendLine',
        payload: { points: [x0, y0, p.x, p.y], ...s },
      });
    } else {
      if (Math.abs(p.x - x0) < ORDER_MIN_ZONE_M || Math.abs(p.y - y0) < ORDER_MIN_ZONE_M) return;
      commands.submit({
        playerId: LOCAL_PLAYER,
        type: 'HoldZone',
        payload: { x0, y0, x1: p.x, y1: p.y, ...s },
      });
    }
    cancelTool();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
  };
}
