// Own units (GDD 5): tactical symbols (military map style, generic frames, no official emblems) at strategic and
// tactical zoom, top-down silhouettes (head and shoulders per soldier) at close zoom. Always friendly green, filled.
import { Container, Graphics } from 'pixi.js';
import type { UnitTypeId } from '../../core/commands';
import type { UnitView } from '../../core/types/combat';
import type { SnapshotView } from '../../core/types/snapshot';
import {
  BAR_CRITICAL,
  BAR_GAP_PX,
  BAR_HEIGHT_PX,
  BAR_OFFSET_PX,
  BAR_PULSE_MS,
  BAR_WARN,
  BAR_WIDTH_PX,
  SOLDIER,
  UNIT_CULL_MARGIN_M,
  UNIT_GEAR,
  UNIT_MAX_STEP_M,
  UNIT_SYMBOL_MIN_SCALE,
  UNIT_SYMBOL_PX,
  UNIT_SYMBOL_PX_STRATEGIC,
  ZOOM_CLOSE,
} from '../../data/render-combat';
import { UNIT_TYPE_ORDER, UNITS } from '../../data/units/present';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { cameraView } from '../view-state';
import { Tracked } from './tracked';

const DARK = palette.structure.shade;
const NO_DETAIL: UnitView | undefined = undefined;

export class UnitsLayer {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly tracked = new Tracked(256, UNIT_MAX_STEP_M);
  private details = new Map<number, UnitView>();
  private source: readonly UnitView[] | null = null;

  constructor() {
    this.view.addChild(this.g);
  }

  ingest(s: SnapshotView): void {
    this.tracked.ingest(s.units);
  }

  private refresh(units: readonly UnitView[]): void {
    if (units === this.source) return;
    this.source = units;
    this.details.clear();
    for (const u of units) this.details.set(u.id, u);
  }

  update(units: readonly UnitView[], alpha: number, zoom: number, nowMs: number): void {
    this.refresh(units);
    const g = this.g;
    g.clear();
    const tr = this.tracked;
    if (tr.count === 0) return;
    const hw = cameraView.width / 2 / zoom + UNIT_CULL_MARGIN_M;
    const hh = cameraView.height / 2 / zoom + UNIT_CULL_MARGIN_M;
    const close = zoom >= ZOOM_CLOSE;
    const barMode = settings.unitBars.peek();
    const px = 1 / zoom;
    const symPx = zoom < 0.25 ? UNIT_SYMBOL_PX_STRATEGIC : UNIT_SYMBOL_PX;
    const detail = zoom >= 0.25;

    // Pass 1: frames or silhouettes (one fill path each).
    let any = false;
    for (let n = 0; n < tr.count; n++) {
      const id = tr.list[n] as number;
      const x = tr.x(id, alpha);
      const y = tr.y(id, alpha);
      if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
      const d = this.details.get(id) ?? NO_DETAIL;
      const type = UNIT_TYPE_ORDER[tr.kind[id] as number] as UnitTypeId;
      if (close) this.silhouette(g, x, y, type, d, false);
      else {
        const spec = UNITS[type];
        const strength = d ? Math.min(1, d.members / spec.size) : 1;
        const s = symPx * px * (UNIT_SYMBOL_MIN_SCALE + (1 - UNIT_SYMBOL_MIN_SCALE) * strength);
        const w = s * 1.3;
        g.rect(x - w / 2, y - s / 2, w, s);
        if (d && d.rank > 0) {
          for (let r = 0; r < d.rank; r++)
            g.circle(x - w / 2 + (r * 2 + 1) * px * 2.2, y - s / 2 - px * 3, px * 1.4);
        }
      }
      any = true;
    }
    if (!any) return;
    if (close) {
      g.fill(palette.friendly.color).stroke({ width: 0.06, color: DARK, alpha: 0.7 });
      for (let n = 0; n < tr.count; n++) {
        const id = tr.list[n] as number;
        const x = tr.x(id, alpha);
        const y = tr.y(id, alpha);
        if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
        this.silhouette(
          g,
          x,
          y,
          UNIT_TYPE_ORDER[tr.kind[id] as number] as UnitTypeId,
          this.details.get(id),
          true,
        );
      }
      g.fill(DARK);
    } else {
      g.fill({ color: palette.friendly.color, alpha: 0.92 }).stroke({ width: px * 1.2, color: DARK });
    }

    // Pass 2: glyphs (tactical zoom) or gear (close zoom).
    if (detail && !close) {
      for (let n = 0; n < tr.count; n++) {
        const id = tr.list[n] as number;
        const x = tr.x(id, alpha);
        const y = tr.y(id, alpha);
        if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
        const d = this.details.get(id);
        const type = UNIT_TYPE_ORDER[tr.kind[id] as number] as UnitTypeId;
        const strength = d ? Math.min(1, d.members / UNITS[type].size) : 1;
        const s = symPx * px * (UNIT_SYMBOL_MIN_SCALE + (1 - UNIT_SYMBOL_MIN_SCALE) * strength);
        glyph(g, type, x, y, s * 1.3, s);
      }
      g.stroke({ width: px * 1.5, color: DARK });
    }

    // Pass 3: status bars.
    if (barMode !== 'never') this.bars(g, alpha, nowMs, zoom, hw, hh, barMode === 'always', close);
  }

  /** One squad as soldiers in a small formation facing the target. gearPass draws weapons and kit instead of bodies. */
  private silhouette(
    g: Graphics,
    x: number,
    y: number,
    type: UnitTypeId,
    d: UnitView | undefined,
    gearPass: boolean,
  ): void {
    const members = d?.members ?? UNITS[type].size;
    const ang = d?.target ? Math.atan2(d.target[1] - y, d.target[0] - x) : -Math.PI / 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const cols = Math.max(1, Math.ceil(Math.sqrt(members * 1.3)));
    const rows = Math.ceil(members / cols);
    const gear = UNIT_GEAR[type];
    // Local axes: u forward (facing), v lateral. Pushes a rotated rect u0..u1 x v0..v1 around (cx, cy).
    const box = (cx: number, cy: number, u0: number, u1: number, v0: number, v1: number): void => {
      g.moveTo(cx + u0 * ca - v0 * sa, cy + u0 * sa + v0 * ca);
      g.lineTo(cx + u1 * ca - v0 * sa, cy + u1 * sa + v0 * ca);
      g.lineTo(cx + u1 * ca - v1 * sa, cy + u1 * sa + v1 * ca);
      g.lineTo(cx + u0 * ca - v1 * sa, cy + u0 * sa + v1 * ca);
      g.closePath();
    };
    for (let m = 0; m < members; m++) {
      const col = m % cols;
      const row = Math.floor(m / cols);
      const lu = (row - (rows - 1) / 2) * SOLDIER.spacing;
      const lv = (col - (cols - 1) / 2) * SOLDIER.spacing;
      const cx = x + lu * ca - lv * sa;
      const cy = y + lu * sa + lv * ca;
      if (!gearPass) {
        g.moveTo(cx + SOLDIER.shoulderD * ca, cy + SOLDIER.shoulderD * sa);
        for (let k = 1; k < 8; k++) {
          const a = (Math.PI * 2 * k) / 8;
          const eu = Math.cos(a) * SOLDIER.shoulderD;
          const ev = Math.sin(a) * SOLDIER.shoulderW;
          g.lineTo(cx + eu * ca - ev * sa, cy + eu * sa + ev * ca);
        }
        g.closePath();
        g.circle(cx + ca * 0.05, cy + sa * 0.05, SOLDIER.headR);
        continue;
      }
      box(cx, cy, 0.1, 0.1 + gear.weaponM, 0.18 - gear.weaponW / 2, 0.18 + gear.weaponW / 2);
      switch (gear.gear) {
        case 'tripod':
          box(cx, cy, 0.1 + gear.weaponM * 0.6, 0.1 + gear.weaponM * 0.6 + 0.08, -0.25, 0.5);
          break;
        case 'pack':
          box(cx, cy, -0.4, -0.12, -0.2, 0.2);
          break;
        case 'shield':
          box(cx, cy, 0.3, 0.38, -0.5, 0.5);
          break;
        case 'bag':
          box(cx, cy, -0.3, -0.08, -0.4, -0.1);
          break;
        case 'scope':
          box(cx, cy, 0.3, 0.55, 0.12, 0.24);
          break;
        default:
          break;
      }
    }
  }

  private bars(
    g: Graphics,
    alpha: number,
    nowMs: number,
    zoom: number,
    hw: number,
    hh: number,
    always: boolean,
    close: boolean,
  ): void {
    const px = 1 / zoom;
    const w = BAR_WIDTH_PX * px;
    const h = BAR_HEIGHT_PX * px;
    const tr = this.tracked;
    const symH = UNIT_SYMBOL_PX * px;
    const pulse = !settings.reducedMotion.peek() && nowMs % BAR_PULSE_MS > BAR_PULSE_MS / 2;
    const rowsOf = (m: number): number => Math.ceil(m / Math.max(1, Math.ceil(Math.sqrt(m * 1.3))));
    // Collect per color bucket: track, ok, warn, critical, ammo.
    for (let pass = 0; pass < 5; pass++) {
      let drawn = false;
      for (let n = 0; n < tr.count; n++) {
        const id = tr.list[n] as number;
        const d = this.details.get(id);
        if (!d) continue;
        if (!always && d.hp >= 1 && d.ammo >= 1) continue;
        const x = tr.x(id, alpha);
        const y = tr.y(id, alpha);
        if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
        const above = close ? (rowsOf(d.members) * SOLDIER.spacing) / 2 + 0.8 : symH / 2 + BAR_OFFSET_PX * px;
        const bx = x - w / 2;
        const by = y - above - h * 2 - BAR_GAP_PX * px;
        const hpBucket = d.hp <= BAR_CRITICAL ? 3 : d.hp <= BAR_WARN ? 2 : 1;
        if (pass === 0) g.rect(bx - px, by - px, w + px * 2, h * 2 + BAR_GAP_PX * px + px * 2);
        else if (pass === hpBucket) g.rect(bx, by, w * Math.max(0.04, d.hp), h);
        else if (pass === 4) g.rect(bx, by + h + BAR_GAP_PX * px, w * Math.max(0.0, d.ammo), h);
        else continue;
        drawn = true;
      }
      if (!drawn) continue;
      if (pass === 0) g.fill({ color: palette.ui.panel, alpha: 0.8 });
      else if (pass === 1) g.fill(palette.friendly.color);
      else if (pass === 2) g.fill(palette.ui.focus);
      else if (pass === 3) g.fill({ color: palette.alert.color, alpha: pulse ? 0.45 : 1 });
      else g.fill(palette.ui.accent);
    }
  }
}

/** Generic glyph per type inside a w x h frame, drawn with the caller's stroke. No official emblems. */
function glyph(g: Graphics, type: UnitTypeId, x: number, y: number, w: number, h: number): void {
  const l = x - w / 2;
  const r = x + w / 2;
  const t = y - h / 2;
  const b = y + h / 2;
  const i = 0.12;
  switch (type) {
    case 'infantry':
      g.moveTo(l + w * i, t + h * i).lineTo(r - w * i, b - h * i);
      g.moveTo(r - w * i, t + h * i).lineTo(l + w * i, b - h * i);
      break;
    case 'militia':
      // Single diagonal stroke: light, no heavy gear.
      g.moveTo(l + w * i, b - h * i).lineTo(r - w * i, t + h * i);
      break;
    case 'mgTeam':
      g.moveTo(l + w * i, t + h * i).lineTo(r - w * i, b - h * i);
      g.moveTo(r - w * i, t + h * i).lineTo(l + w * i, b - h * i);
      g.moveTo(x, t + h * i).lineTo(x, b - h * i);
      break;
    case 'sniperTeam':
      g.circle(x, y, h * 0.28);
      g.moveTo(x, t + h * 0.08).lineTo(x, y - h * 0.28);
      g.moveTo(x, b - h * 0.08).lineTo(x, y + h * 0.28);
      g.moveTo(l + w * 0.12, y).lineTo(x - h * 0.28, y);
      g.moveTo(r - w * 0.12, y).lineTo(x + h * 0.28, y);
      break;
    case 'mortar':
      g.circle(x, y, h * 0.3);
      g.circle(x, y, h * 0.07);
      break;
    case 'engineers':
      g.moveTo(l + w * 0.15, b - h * 0.15)
        .lineTo(l + w * 0.15, t + h * 0.25)
        .lineTo(r - w * 0.15, t + h * 0.25)
        .lineTo(r - w * 0.15, b - h * 0.15);
      g.moveTo(x, t + h * 0.25).lineTo(x, b - h * 0.15);
      break;
    case 'riotPolice':
      g.moveTo(l + w * 0.15, y - h * 0.18).lineTo(r - w * 0.15, y - h * 0.18);
      g.moveTo(l + w * 0.15, y + h * 0.18).lineTo(r - w * 0.15, y + h * 0.18);
      break;
    case 'medics':
      g.circle(x, y, h * 0.3);
      g.moveTo(l + w * 0.15, y).lineTo(r - w * 0.15, y);
      break;
  }
}
