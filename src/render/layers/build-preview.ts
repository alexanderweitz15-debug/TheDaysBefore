// Cursor previews (GDD 14, Interaktion): build placement green or red with live cost, and the area-fire target
// with blast radius and the estimated number of civilians inside (before confirming).
import { Container, Graphics, Text } from 'pixi.js';
import type { StructureKind, UnitTypeId } from '../../core/commands';
import type { SimView } from '../../core/types/app';
import { type CityMapData, TERRAIN } from '../../core/types/map';
import { STRUCTURE_RULES, STRUCTURES } from '../../data/buildings/defense';
import { MIN_LINE_LENGTH_M } from '../../data/hud';
import {
  ATTACK_CROSS_PX,
  ATTACK_ESTIMATE_MS,
  ATTACK_PREVIEW_FILL_ALPHA,
  ATTACK_RING_ALPHA,
  PREVIEW_AIM_ALPHA,
  PREVIEW_AIM_DIM_ALPHA,
  PREVIEW_FILL_ALPHA,
  PREVIEW_LABEL_BG_ALPHA,
  PREVIEW_LABEL_OFFSET_PX,
  PREVIEW_LABEL_PX,
  PREVIEW_LINE_ALPHA,
  PREVIEW_LINE_BOOST,
  PREVIEW_MIN_RANGE_ALPHA,
  PREVIEW_MINES_FACTOR,
  PREVIEW_POINT_BOOST,
  PREVIEW_RANGE_ALPHA,
  PREVIEW_RING_ALPHA,
  PREVIEW_SAMPLE_M,
  STRUCTURE_MIN_PX,
  UNIT_PLACE_RADIUS_M,
} from '../../data/render-combat';
import { UNIT_TYPE_ORDER, UNITS } from '../../data/units/present';
import { numberLocale, t } from '../../ui/i18n';
import { palette } from '../palette';
import { activeTool, buildArm, buildState, toolDraft } from '../view-state';

/** True when a world point lies on map terrain that can carry a structure or unit (no water, no building). */
export function placeable(map: CityMapData | null, x: number, y: number): boolean {
  if (!map) return true;
  const cx = Math.floor(x / map.cellSizeM);
  const cy = Math.floor(y / map.cellSizeM);
  if (cx < 0 || cy < 0 || cx >= map.widthCells || cy >= map.heightCells) return false;
  const c = map.terrain[cy * map.widthCells + cx];
  return c !== TERRAIN.water && c !== TERRAIN.building;
}

const DEFAULT_AREA_RADIUS_M = UNIT_TYPE_ORDER.map((k) => UNITS[k].areaRadiusM).reduce(
  (a, b) => Math.max(a, b),
  0,
);

export class PreviewLayer {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly label = new Text({
    text: '',
    style: { fontFamily: 'ui-monospace, monospace', fontSize: PREVIEW_LABEL_PX, fill: palette.ui.text },
  });
  private readonly bg = new Graphics();
  private text = '';
  private est = { count: 0, x: Number.NaN, y: Number.NaN, at: -1e9 };
  private nf = new Intl.NumberFormat(numberLocale());
  private nfLocale = numberLocale();

  constructor() {
    this.label.visible = false;
    this.view.addChild(this.g, this.bg, this.label);
  }

  update(sim: SimView, zoom: number, nowMs: number): void {
    const g = this.g;
    g.clear();
    this.bg.clear();
    this.label.visible = false;
    const tool = activeTool.value;
    const d = toolDraft;
    if (Number.isNaN(d.cursorX) || (tool !== 'build' && tool !== 'attackArea')) return;
    if (tool === 'attackArea') this.attack(sim, zoom, nowMs);
    else {
      const arm = buildArm.value;
      if (!arm) return;
      this.structure(sim, arm.structure as StructureKind, zoom);
    }
  }

  private setLabel(text: string, zoom: number, x: number, y: number, color: number): void {
    const l = this.label;
    if (text !== this.text) {
      this.text = text;
      l.text = text;
    }
    l.style.fill = color;
    const px = 1 / zoom;
    l.scale.set(px);
    l.position.set(x + PREVIEW_LABEL_OFFSET_PX * px, y + PREVIEW_LABEL_OFFSET_PX * px);
    l.visible = true;
    this.bg
      .rect(l.x - 3 * px, l.y - 2 * px, l.width + 6 * px, l.height + 4 * px)
      .fill({ color: palette.ui.panel, alpha: PREVIEW_LABEL_BG_ALPHA });
  }

  private money(n: number): string {
    if (this.nfLocale !== numberLocale()) {
      this.nfLocale = numberLocale();
      this.nf = new Intl.NumberFormat(this.nfLocale);
    }
    return this.nf.format(Math.round(n));
  }

  /** X mark for invalid placement: a second cue besides the red hue. */
  private cross(x: number, y: number, r: number, px: number, color: number): void {
    this.g.moveTo(x - r, y - r).lineTo(x + r, y + r);
    this.g.moveTo(x + r, y - r).lineTo(x - r, y + r);
    this.g.stroke({ width: px * 2.5, color });
  }

  private costText(cost: number, length: number, budget: number, terrainOk: boolean): string {
    let s =
      length > 0
        ? t('tool.build.cost', { cost: this.money(cost), length: Math.round(length) })
        : t('tool.build.costPoint', { cost: this.money(cost) });
    if (!terrainOk) s += `\n${t('tool.build.blocked')}`;
    else if (budget < cost) s += `\n${t('tool.build.budget')}`;
    return s;
  }

  private structure(sim: SimView, kind: StructureKind, zoom: number): void {
    const g = this.g;
    const spec = STRUCTURES[kind];
    const px = 1 / zoom;
    const budget = sim.stats.counters.budget;
    const { cursorX: cx, cursorY: cy, startX, startY } = toolDraft;
    if (spec.line) {
      if (Number.isNaN(startX)) {
        g.circle(cx, cy, 4 * px).fill({ color: palette.preview.ok, alpha: PREVIEW_LINE_ALPHA });
        return;
      }
      const len = Math.hypot(cx - startX, cy - startY);
      const w = Math.max(spec.sizeM, STRUCTURE_MIN_PX * px);
      const n = Math.max(1, Math.ceil(len / PREVIEW_SAMPLE_M));
      let allOk = len >= MIN_LINE_LENGTH_M;
      let free = 0;
      // Runs of equal validity share one path so a blocked stretch shows red inside a green line.
      for (const pass of [true, false]) {
        let open = false;
        for (let i = 0; i <= n; i++) {
          const x = startX + ((cx - startX) * i) / n;
          const y = startY + ((cy - startY) * i) / n;
          const ok = placeable(sim.map, x, y);
          if (pass && ok) free++;
          if (ok === pass) {
            if (!open) {
              g.moveTo(x, y);
              open = true;
            } else g.lineTo(x, y);
          } else if (open) {
            // close the run at the boundary sample
            g.lineTo(x, y);
            open = false;
          }
        }
        g.stroke({
          width: w,
          color: pass ? palette.preview.ok : palette.preview.bad,
          alpha: PREVIEW_FILL_ALPHA + PREVIEW_LINE_BOOST,
        });
      }
      // The sim builds only the free stretches and charges only those.
      const cost = spec.cost * len * (free / (n + 1));
      allOk = allOk && free > 0;
      const ok = allOk && budget >= cost;
      const color = ok ? palette.preview.ok : palette.preview.bad;
      if (!ok) this.cross(cx, cy, 6 * px, px, color);
      this.setLabel(this.costText(cost, len, budget, free > 0), zoom, cx, cy, color);
      return;
    }
    const half = Math.max(spec.sizeM / 2, STRUCTURE_MIN_PX * 2 * px);
    const terrainOk =
      placeable(sim.map, cx, cy) &&
      placeable(sim.map, cx + half, cy) &&
      placeable(sim.map, cx - half, cy) &&
      placeable(sim.map, cx, cy + half) &&
      placeable(sim.map, cx, cy - half);
    const ok = terrainOk && budget >= spec.cost;
    const color = ok ? palette.preview.ok : palette.preview.bad;
    const rot = buildState.rotation;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hw = kind === 'gate' ? half : half;
    const hh = kind === 'gate' ? Math.max(0.6, STRUCTURE_MIN_PX * px) : half;
    if (kind === 'mines')
      g.circle(cx, cy, spec.sizeM)
        .fill({ color, alpha: PREVIEW_FILL_ALPHA * PREVIEW_MINES_FACTOR })
        .stroke({ width: px * 2, color, alpha: PREVIEW_LINE_ALPHA });
    else
      g.poly([
        cx - hw * c + hh * s,
        cy - hw * s - hh * c,
        cx + hw * c + hh * s,
        cy + hw * s - hh * c,
        cx + hw * c - hh * s,
        cy + hw * s + hh * c,
        cx - hw * c - hh * s,
        cy - hw * s + hh * c,
      ])
        .fill({ color, alpha: PREVIEW_FILL_ALPHA + PREVIEW_POINT_BOOST })
        .stroke({ width: px * 2, color, alpha: PREVIEW_LINE_ALPHA });
    const ring =
      kind === 'depot'
        ? STRUCTURE_RULES.depotRadiusM
        : kind === 'charge'
          ? STRUCTURE_RULES.charge.blastRadiusM
          : kind === 'watchtower'
            ? spec.sightBonusM
            : kind === 'mines'
              ? STRUCTURE_RULES.mines.blastRadiusM
              : 0;
    if (ring > 0) g.circle(cx, cy, ring).stroke({ width: px, color, alpha: PREVIEW_RING_ALPHA });
    if (!ok) this.cross(cx, cy, half * 0.6, px, color);
    // Rotation tick shows the facing of point structures.
    g.moveTo(cx, cy)
      .lineTo(cx + c * half * 1.3, cy + s * half * 1.3)
      .stroke({ width: px * 1.5, color, alpha: PREVIEW_LINE_ALPHA });
    this.setLabel(this.costText(spec.cost, 0, budget, terrainOk), zoom, cx, cy, color);
  }

  private attack(sim: SimView, zoom: number, nowMs: number): void {
    const g = this.g;
    const px = 1 / zoom;
    const { cursorX: x, cursorY: y } = toolDraft;
    // Area fire is ordered for every area-fire unit (mortars), there is no selection.
    const types = new Map<number, UnitTypeId>();
    for (const u of sim.units) if (UNITS[u.type].areaRadiusM > 0) types.set(u.id, u.type);
    let radius = 0;
    let inRange = false;
    let tooClose = false;
    const us = sim.curr?.units;
    if (us) {
      for (let i = 0; i < us.count; i++) {
        const type = types.get(us.ids[i] as number);
        if (!type) continue;
        const spec = UNITS[type];
        radius = Math.max(radius, spec.areaRadiusM);
        const ux = us.pos[i * 2] as number;
        const uy = us.pos[i * 2 + 1] as number;
        const dist = Math.hypot(x - ux, y - uy);
        if (dist >= spec.minRangeM && dist <= spec.rangeM) inRange = true;
        else if (dist < spec.minRangeM) tooClose = true;
        g.circle(ux, uy, spec.rangeM).stroke({
          width: px,
          color: palette.ui.accent,
          alpha: PREVIEW_RANGE_ALPHA,
        });
        if (spec.minRangeM > 0)
          g.circle(ux, uy, spec.minRangeM).stroke({
            width: px,
            color: palette.ui.accent,
            alpha: PREVIEW_MIN_RANGE_ALPHA,
          });
        g.moveTo(ux, uy)
          .lineTo(x, y)
          .stroke({
            width: px,
            color: palette.ui.accent,
            alpha: inRange ? PREVIEW_AIM_ALPHA : PREVIEW_AIM_DIM_ALPHA,
          });
      }
    }
    if (radius === 0) radius = DEFAULT_AREA_RADIUS_M;
    const color = inRange ? palette.preview.attack : palette.ui.textDim;
    g.circle(x, y, radius)
      .fill({ color, alpha: ATTACK_PREVIEW_FILL_ALPHA })
      .stroke({ width: px * 2, color, alpha: ATTACK_RING_ALPHA });
    const c = ATTACK_CROSS_PX * px;
    g.moveTo(x - c, y).lineTo(x + c, y);
    g.moveTo(x, y - c).lineTo(x, y + c);
    g.stroke({ width: px * 1.5, color });
    if (inRange) {
      const e = this.est;
      if (nowMs - e.at > ATTACK_ESTIMATE_MS || e.x !== x || e.y !== y) {
        const cv = sim.curr?.civilians;
        let count = 0;
        if (cv) {
          const r2 = radius * radius;
          for (let i = 0; i < cv.count; i++) {
            const dx = (cv.pos[i * 2] as number) - x;
            const dy = (cv.pos[i * 2 + 1] as number) - y;
            if (dx * dx + dy * dy <= r2) count++;
          }
        }
        e.count = count;
        e.x = x;
        e.y = y;
        e.at = nowMs;
      }
      this.setLabel(
        e.count > 0 ? t('attack.estimate', { count: e.count }) : t('attack.estimate.none'),
        zoom,
        x,
        y,
        e.count > 0 ? palette.alert.color : palette.ui.text,
      );
    } else {
      this.setLabel(tooClose ? t('attack.tooClose') : t('attack.outOfRange'), zoom, x, y, palette.ui.textDim);
    }
  }
}
