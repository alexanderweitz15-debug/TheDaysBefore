// Safe zones, corridors, rally points (GDD 5 Farblogik: blue glow, corridors dashed with direction arrows,
// double lines in pattern mode, breached zones outlined in the danger color) and the tool preview.
import { Container, Graphics, Text } from 'pixi.js';
import type { ZoneView } from '../../core/types/zones';
import {
  CORRIDOR_ARROW_PX,
  CORRIDOR_ARROW_SPACING_PX,
  CORRIDOR_DASH_PX,
  CORRIDOR_GAP_PX,
  RALLY_RADIUS_M,
  ZONE_DOUBLE_LINE_GAP_PX,
  ZONE_FILL_ALPHA,
  ZONE_GLOW_ALPHA,
  ZONE_GLOW_PX,
  ZONE_LABEL_PX,
  ZONE_LINE_PX,
  ZONE_PREVIEW_ALPHA,
} from '../../data/render';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { activeTool, toolDraft } from '../view-state';

/** Strokes a polyline (flat x,y) as dashes of `dash` meters with `gap` meters between. */
export function dashed(g: Graphics, pts: readonly number[], dash: number, gap: number): void {
  let on = true;
  let left = dash;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    let x = pts[i] as number;
    let y = pts[i + 1] as number;
    const ex = pts[i + 2] as number;
    const ey = pts[i + 3] as number;
    let seg = Math.hypot(ex - x, ey - y);
    if (seg === 0) continue;
    const ux = (ex - x) / seg;
    const uy = (ey - y) / seg;
    while (seg > 0) {
      const step = Math.min(seg, left);
      const nx = x + ux * step;
      const ny = y + uy * step;
      if (on) g.moveTo(x, y).lineTo(nx, ny);
      x = nx;
      y = ny;
      seg -= step;
      left -= step;
      if (left <= 1e-6) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
}

/** Polyline shifted sideways by `d` meters (per-segment normal, adequate for a double line). */
function offsetLine(pts: readonly number[], d: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const dx = (pts[i + 2] as number) - (pts[i] as number);
    const dy = (pts[i + 3] as number) - (pts[i + 1] as number);
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * d;
    const ny = (dx / len) * d;
    out.push(
      (pts[i] as number) + nx,
      (pts[i + 1] as number) + ny,
      (pts[i + 2] as number) + nx,
      (pts[i + 3] as number) + ny,
    );
  }
  return out;
}

export class ZonesLayer {
  readonly view = new Container();
  private readonly gfx = new Graphics();
  private readonly preview = new Graphics();
  private readonly labels = new Container();
  private readonly labelPool: Text[] = [];
  private zones: ZoneView[] = [];
  private dirty = true;
  private lastZoom = Number.NaN;
  private lastPattern = false;

  constructor() {
    this.view.addChild(this.gfx, this.labels, this.preview);
  }

  setZones(zones: ZoneView[]): void {
    this.zones = zones;
    this.dirty = true;
  }

  update(zoom: number): void {
    const pattern = settings.patternMode.peek();
    if (this.dirty || zoom !== this.lastZoom || pattern !== this.lastPattern) {
      this.dirty = false;
      this.lastZoom = zoom;
      this.lastPattern = pattern;
      this.draw(zoom, pattern);
    }
    this.drawPreview(zoom);
  }

  private label(i: number): Text {
    let t = this.labelPool[i];
    if (!t) {
      t = new Text({
        text: '',
        style: { fontFamily: 'ui-monospace, monospace', fontSize: ZONE_LABEL_PX, fill: palette.ui.text },
      });
      t.anchor.set(0.5, 1);
      this.labelPool[i] = t;
      this.labels.addChild(t);
    }
    return t;
  }

  private draw(zoom: number, pattern: boolean): void {
    const px = 1 / zoom;
    const g = this.gfx;
    g.clear();
    let labelCount = 0;
    const blue = palette.zone.color;
    for (const z of this.zones) {
      const edge = z.breached ? palette.alert.color : blue;
      const s = z.shape;
      let lx = 0;
      let ly = 0;
      if (z.kind === 'safeZone' && s.length >= 4) {
        const x0 = Math.min(s[0] as number, s[2] as number);
        const y0 = Math.min(s[1] as number, s[3] as number);
        const w = Math.abs((s[2] as number) - (s[0] as number));
        const h = Math.abs((s[3] as number) - (s[1] as number));
        g.rect(x0, y0, w, h).fill({ color: blue, alpha: ZONE_FILL_ALPHA });
        g.rect(x0, y0, w, h).stroke({ width: ZONE_GLOW_PX * px, color: edge, alpha: ZONE_GLOW_ALPHA });
        g.rect(x0, y0, w, h).stroke({ width: ZONE_LINE_PX * px, color: edge });
        if (pattern) {
          const i = ZONE_DOUBLE_LINE_GAP_PX * px;
          if (w > i * 3 && h > i * 3)
            g.rect(x0 + i, y0 + i, w - i * 2, h - i * 2).stroke({ width: ZONE_LINE_PX * px, color: edge });
        }
        lx = x0 + w / 2;
        ly = y0;
      } else if (z.kind === 'corridor' && s.length >= 4) {
        const dash = CORRIDOR_DASH_PX * px;
        const gap = CORRIDOR_GAP_PX * px;
        const lines = pattern
          ? [offsetLine(s, -ZONE_DOUBLE_LINE_GAP_PX * px), offsetLine(s, ZONE_DOUBLE_LINE_GAP_PX * px)]
          : [s];
        for (const l of lines) {
          if (pattern) {
            for (let i = 0; i + 3 < l.length; i += 4)
              g.moveTo(l[i] as number, l[i + 1] as number).lineTo(l[i + 2] as number, l[i + 3] as number);
          } else dashed(g, l, dash, gap);
        }
        g.stroke({ width: ZONE_LINE_PX * px, color: edge });
        this.arrows(g, s, px, edge);
        lx = s[0] as number;
        ly = s[1] as number;
      } else if (z.kind === 'rallyPoint' && s.length >= 2) {
        const [x, y] = [s[0] as number, s[1] as number];
        g.circle(x, y, RALLY_RADIUS_M).fill({ color: blue, alpha: ZONE_FILL_ALPHA });
        g.circle(x, y, RALLY_RADIUS_M).stroke({
          width: ZONE_GLOW_PX * px,
          color: edge,
          alpha: ZONE_GLOW_ALPHA,
        });
        g.circle(x, y, RALLY_RADIUS_M).stroke({ width: ZONE_LINE_PX * px, color: edge });
        if (pattern)
          g.circle(x, y, RALLY_RADIUS_M - ZONE_DOUBLE_LINE_GAP_PX * px).stroke({
            width: ZONE_LINE_PX * px,
            color: edge,
          });
        g.circle(x, y, 2 * px).fill(edge);
        lx = x;
        ly = y - RALLY_RADIUS_M;
      }
      if (z.kind !== 'corridor') {
        const t = this.label(labelCount++);
        t.visible = true;
        t.text = `${z.occupants}/${z.capacity}`;
        t.position.set(lx, ly - 2 * px);
        t.scale.set(px);
        t.style.fill = z.breached ? palette.alert.color : palette.ui.text;
      }
    }
    for (let i = labelCount; i < this.labelPool.length; i++) (this.labelPool[i] as Text).visible = false;
  }

  /** Chevrons along the path pointing in walking direction (towards the last point). */
  private arrows(g: Graphics, pts: readonly number[], px: number, color: number): void {
    const spacing = CORRIDOR_ARROW_SPACING_PX * px;
    const size = CORRIDOR_ARROW_PX * px;
    let next = spacing / 2;
    let base = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x = pts[i] as number;
      const y = pts[i + 1] as number;
      const dx = (pts[i + 2] as number) - x;
      const dy = (pts[i + 3] as number) - y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const ux = dx / len;
      const uy = dy / len;
      while (next - base < len) {
        const d = next - base;
        const cx = x + ux * d;
        const cy = y + uy * d;
        g.moveTo(cx - ux * size - uy * size * 0.7, cy - uy * size + ux * size * 0.7)
          .lineTo(cx, cy)
          .lineTo(cx - ux * size + uy * size * 0.7, cy - uy * size - ux * size * 0.7);
        next += spacing;
      }
      base += len;
    }
    g.stroke({ width: ZONE_LINE_PX * px, color });
  }

  private drawPreview(zoom: number): void {
    const g = this.preview;
    g.clear();
    const tool = activeTool.value;
    const d = toolDraft;
    if (tool === 'none' || Number.isNaN(d.cursorX)) return;
    const px = 1 / zoom;
    const color = palette.zone.color;
    const style = { width: ZONE_LINE_PX * px, color, alpha: ZONE_PREVIEW_ALPHA };
    if (tool === 'corridor') {
      const pts = [...d.points, d.cursorX, d.cursorY];
      for (let i = 0; i + 1 < d.points.length; i += 2)
        g.circle(d.points[i] as number, d.points[i + 1] as number, 3 * px).fill(color);
      if (pts.length >= 4) {
        dashed(g, pts, CORRIDOR_DASH_PX * px, CORRIDOR_GAP_PX * px);
        g.stroke(style);
        this.arrows(g, pts, px, color);
      }
    } else if (tool === 'safeZone' && !Number.isNaN(d.startX)) {
      const x = Math.min(d.startX, d.cursorX);
      const y = Math.min(d.startY, d.cursorY);
      const w = Math.abs(d.cursorX - d.startX);
      const h = Math.abs(d.cursorY - d.startY);
      g.rect(x, y, w, h).fill({ color, alpha: ZONE_FILL_ALPHA }).stroke(style);
    } else if (tool === 'rallyPoint') {
      g.circle(d.cursorX, d.cursorY, RALLY_RADIUS_M).fill({ color, alpha: ZONE_FILL_ALPHA }).stroke(style);
    }
  }
}
