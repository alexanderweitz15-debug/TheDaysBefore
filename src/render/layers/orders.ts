// Orders on the map (decision 2026-11-27): defend lines with strength markers, held zones, garrisoned buildings with
// integrity bars, plus the preview of the order being drawn. Status is coded by line style as well as color.
import { Graphics } from 'pixi.js';
import type { CityMapData } from '../../core/types/map';
import type { GarrisonView, OrderView } from '../../core/types/orders';
import {
  INTEGRITY_WARN,
  MARKER_RADIUS_PX,
  MARKER_SPACING_M,
  ORDER_DASH_PX,
  ORDER_LINE_PX,
} from '../../data/hud-orders';
import { palette } from '../palette';
import { activeTool, orderHover, toolDraft } from '../view-state';
import { dashed } from './zones';

type Rect = [number, number, number, number];

export class OrdersLayer {
  readonly view = new Graphics();
  private map: CityMapData | null = null;

  setMap(map: CityMapData): void {
    this.map = map;
    this.view.clear();
  }

  /** Footprint of a city building in meters. */
  rect(b: number): Rect | null {
    const m = this.map;
    if (!m || b < 0 || b >= m.buildings.count) return null;
    const cs = m.cellSizeM;
    return [
      (m.buildings.x[b] as number) * cs,
      (m.buildings.y[b] as number) * cs,
      (m.buildings.w[b] as number) * cs,
      (m.buildings.h[b] as number) * cs,
    ];
  }

  update(orders: readonly OrderView[], garrisons: readonly GarrisonView[], zoom: number): void {
    const g = this.view;
    g.clear();
    if (!this.map) return;
    const px = 1 / zoom;
    const drawn = new Set<number>();
    for (const o of orders) {
      const color = colorOf(o.status);
      const assigned = o.assigned.length;
      const wanted = Object.values(o.requested).reduce((a, n) => a + (n ?? 0), 0);
      if (o.kind === 'defendLine') this.line(g, o, color, px, assigned, wanted);
      else if (o.kind === 'holdZone') this.zone(g, o, color, px, assigned, wanted);
      else {
        const gar = garrisons.find((x) => x.buildingId === o.buildingId);
        if (gar) drawn.add(gar.buildingId);
        this.building(g, o.buildingId, color, px, gar?.integrity ?? 1, o.status, !!gar);
      }
    }
    for (const gar of garrisons) {
      if (!drawn.has(gar.buildingId))
        this.building(g, gar.buildingId, palette.orders.active.color, px, gar.integrity, 'active', true);
    }
    this.preview(g, px);
  }

  private line(g: Graphics, o: OrderView, color: number, px: number, assigned: number, wanted: number): void {
    const pts = o.shape;
    stroke(g, pts, o.status, px, color);
    markers(g, pts, px, assigned, wanted, color);
  }

  private zone(g: Graphics, o: OrderView, color: number, px: number, assigned: number, wanted: number): void {
    const [x0, y0, x1, y1] = o.shape as [number, number, number, number];
    const l = Math.min(x0, x1);
    const r = Math.max(x0, x1);
    const t = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    g.rect(l, t, r - l, b - t).fill({ color, alpha: 0.07 });
    stroke(g, [l, t, r, t, r, b, l, b, l, t], o.status, px, color);
    const my = (t + b) / 2;
    markers(g, [l + 4, my, r - 4, my], px, assigned, wanted, color);
  }

  private building(
    g: Graphics,
    id: number,
    color: number,
    px: number,
    integrity: number,
    status: OrderView['status'],
    occupied: boolean,
  ): void {
    const r = this.rect(id);
    if (!r) return;
    const danger = integrity < INTEGRITY_WARN || status === 'failing';
    const c = danger ? palette.orders.failing.color : color;
    const pad = 1.5 * px;
    const w = ORDER_LINE_PX * px;
    if (occupied)
      g.rect(r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad).stroke({ width: w, color: c });
    else stroke(g, rectPts(r, pad), status, px, c);
    if (danger) {
      // Corner ticks, a second cue besides red.
      const k = Math.min(r[2], r[3]) * 0.3;
      for (const [cx, cy, sx, sy] of [
        [r[0], r[1], 1, 1],
        [r[0] + r[2], r[1], -1, 1],
        [r[0], r[1] + r[3], 1, -1],
        [r[0] + r[2], r[1] + r[3], -1, -1],
      ] as const)
        g.moveTo(cx, cy)
          .lineTo(cx + sx * k, cy + sy * k)
          .stroke({ width: w, color: c });
    }
    if (occupied) {
      // Integrity bar above the building.
      const bh = 4 * px;
      const by = r[1] - pad - bh - 2 * px;
      g.rect(r[0], by, r[2], bh).fill({ color: 0x0f161e, alpha: 0.8 });
      const f = Math.max(0, Math.min(1, integrity));
      g.rect(r[0], by, r[2] * f, bh).fill({
        color: danger ? palette.orders.failing.color : palette.orders.active.color,
      });
    }
  }

  private preview(g: Graphics, px: number): void {
    const tool = activeTool.value;
    const col = palette.orders.draft.color;
    const { startX: sx, startY: sy, cursorX: cx, cursorY: cy } = toolDraft;
    if (tool === 'defendLine' && Number.isFinite(sx) && Number.isFinite(cx)) {
      dashed(g, [sx, sy, cx, cy], ORDER_DASH_PX * px, ORDER_DASH_PX * 0.6 * px);
      g.stroke({ width: ORDER_LINE_PX * px, color: col });
    } else if (tool === 'holdZone' && Number.isFinite(sx) && Number.isFinite(cx)) {
      g.rect(Math.min(sx, cx), Math.min(sy, cy), Math.abs(cx - sx), Math.abs(cy - sy))
        .fill({ color: col, alpha: 0.1 })
        .stroke({ width: ORDER_LINE_PX * px, color: col });
    } else if (tool === 'occupyBuilding') {
      const r = this.rect(orderHover.buildingId);
      if (r)
        g.rect(r[0], r[1], r[2], r[3])
          .fill({ color: col, alpha: 0.18 })
          .stroke({ width: ORDER_LINE_PX * px, color: col });
    }
  }
}

function colorOf(status: OrderView['status']): number {
  return status === 'pending'
    ? palette.orders.pending.color
    : status === 'failing'
      ? palette.orders.failing.color
      : status === 'lost'
        ? palette.orders.lost.color
        : palette.orders.active.color;
}

const rectPts = (r: Rect, pad: number): number[] => [
  r[0] - pad,
  r[1] - pad,
  r[0] + r[2] + pad,
  r[1] - pad,
  r[0] + r[2] + pad,
  r[1] + r[3] + pad,
  r[0] - pad,
  r[1] + r[3] + pad,
  r[0] - pad,
  r[1] - pad,
];

/** Line style by status: pending dotted, active solid, failing long dashes, lost thin. */
function stroke(
  g: Graphics,
  pts: readonly number[],
  status: OrderView['status'],
  px: number,
  color: number,
): void {
  const w = ORDER_LINE_PX * px;
  if (status === 'active') {
    g.moveTo(pts[0] as number, pts[1] as number);
    for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i] as number, pts[i + 1] as number);
    g.stroke({ width: w, color });
    return;
  }
  const dash = status === 'pending' ? 2 * px : status === 'failing' ? ORDER_DASH_PX * px : 4 * px;
  const gap = status === 'pending' ? 5 * px : status === 'failing' ? 6 * px : 8 * px;
  dashed(g, pts, dash, gap);
  g.stroke({ width: status === 'lost' ? w / 2 : w, color });
}

/** Strength markers along a polyline: filled = squad in position or assigned, hollow = still missing. */
function markers(
  g: Graphics,
  pts: readonly number[],
  px: number,
  assigned: number,
  wanted: number,
  color: number,
): void {
  const n = Math.max(wanted, assigned);
  if (n === 0) return;
  let total = 0;
  for (let i = 0; i + 3 < pts.length; i += 2)
    total += Math.hypot(
      (pts[i + 2] as number) - (pts[i] as number),
      (pts[i + 3] as number) - (pts[i + 1] as number),
    );
  const r = MARKER_RADIUS_PX * px;
  const spacing = Math.min(MARKER_SPACING_M, total / n);
  const start = total / 2 - (spacing * (n - 1)) / 2;
  for (let k = 0; k < n; k++) {
    let d = start + k * spacing;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i] as number;
      const ay = pts[i + 1] as number;
      const len = Math.hypot((pts[i + 2] as number) - ax, (pts[i + 3] as number) - ay);
      if (d <= len || i + 4 >= pts.length) {
        const f = len === 0 ? 0 : Math.min(1, d / len);
        const x = ax + ((pts[i + 2] as number) - ax) * f;
        const y = ay + ((pts[i + 3] as number) - ay) * f;
        g.circle(x, y, r);
        if (k < assigned) g.fill({ color });
        else
          g.fill({ color: 0x0f161e, alpha: 0.7 })
            .circle(x, y, r)
            .stroke({ width: px * 1.5, color });
        break;
      }
      d -= len;
    }
  }
}
