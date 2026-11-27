// Defensive structures from sim.structures (GDD 9, 5): lines (wall, barricade, wire) and points (gate, mines,
// charge, watchtower, depot). Own structures are friendly green. States: building (ghost + progress), done,
// damaged (cracks, bar, amber/red at 25/10 percent), destroyed (rubble). Static graphics, redrawn on change.
import { Container, Graphics } from 'pixi.js';
import type { StructureView } from '../../core/types/combat';
import { STRUCTURE_RULES, STRUCTURES } from '../../data/buildings/defense';
import {
  BAR_HEIGHT_PX,
  BAR_WARN,
  BAR_WIDTH_PX,
  DAMAGE_SHOW_BELOW,
  GATE_OPEN_GAP,
  MINE_DOTS,
  RADIUS_FILL_ALPHA,
  RADIUS_RING_ALPHA,
  RUBBLE_POINT_CHUNKS,
  RUBBLE_SPACING_M,
  STRUCTURE_BUILDING_ALPHA,
  STRUCTURE_FAMILY,
  STRUCTURE_FILL_ALPHA,
  STRUCTURE_MIN_PX,
  STRUCTURE_OUTLINE_PX,
  STRUCTURE_RUBBLE_ALPHA,
} from '../../data/render-combat';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { hpColor, pathLength, pointAt, polyline, rand, rrect, subPath, zigzag } from './structure-geometry';
import { dashed } from './zones';

const DARK = palette.structure.shade;

export class StructuresLayer {
  readonly view = new Container();
  private readonly gfx = new Graphics();
  private readonly dyn = new Graphics();
  private list: readonly StructureView[] = [];
  private dirty = true;
  private last = { zoom: Number.NaN, sel: -2, bars: '' };

  constructor() {
    this.view.addChild(this.gfx, this.dyn);
  }

  setStructures(list: readonly StructureView[]): void {
    this.list = list;
    this.dirty = true;
  }

  update(zoom: number, selected: number | null, nowMs: number): void {
    const bars = settings.unitBars.peek();
    const sel = selected ?? -1;
    if (this.dirty || zoom !== this.last.zoom || sel !== this.last.sel || bars !== this.last.bars) {
      this.dirty = false;
      this.last = { zoom, sel, bars };
      this.draw(zoom, sel, bars);
    }
    // Armed charges pulse (the only animated structure part).
    const g = this.dyn;
    g.clear();
    const still = settings.reducedMotion.peek();
    for (const st of this.list) {
      if (st.kind !== 'charge' || !st.flag || st.state !== 'done') continue;
      const ph = still ? 0.5 : (nowMs % 900) / 900;
      const r = (STRUCTURES.charge.sizeM / 2 + 1 + ph * 2) * Math.max(1, 6 / zoom / 2);
      g.circle(st.shape[0] as number, st.shape[1] as number, r).stroke({
        width: 2 / zoom,
        color: palette.alert.color,
        alpha: 1 - ph * 0.7,
      });
    }
  }

  private draw(zoom: number, selected: number, bars: string): void {
    const g = this.gfx;
    g.clear();
    const px = 1 / zoom;
    // Selection highlight and ranges first, below the bodies.
    for (const st of this.list) if (st.id === selected && st.state !== 'destroyed') this.highlight(g, st, px);
    for (const st of this.list) {
      const family = STRUCTURE_FAMILY[st.kind];
      if (st.state === 'destroyed') this.rubble(g, st, px);
      else if (STRUCTURES[st.kind].line) this.line(g, st, family, px);
      else this.point(g, st, family, px);
    }
    if (bars !== 'never') {
      for (const st of this.list) {
        if (st.state === 'destroyed') continue;
        const building = st.state === 'building';
        const ratio = building ? st.progress : st.maxHp > 0 ? st.hp / st.maxHp : 1;
        if (!building && bars === 'damaged' && ratio >= 1) continue;
        this.bar(g, st, ratio, building, px);
      }
    }
  }

  private anchor(st: StructureView): { x: number; y: number; r: number } {
    const s = st.shape;
    if (s.length >= 4) {
      const q = pointAt(s, pathLength(s) / 2);
      return { x: q.x, y: q.y, r: STRUCTURES[st.kind].sizeM / 2 };
    }
    return { x: s[0] as number, y: s[1] as number, r: STRUCTURES[st.kind].sizeM / 2 };
  }

  private bar(g: Graphics, st: StructureView, ratio: number, building: boolean, px: number): void {
    const a = this.anchor(st);
    const w = BAR_WIDTH_PX * px;
    const h = BAR_HEIGHT_PX * px;
    const x = a.x - w / 2;
    const y = a.y - a.r - h * 2 - 5 * px;
    g.rect(x - px, y - px, w + px * 2, h + px * 2).fill({ color: palette.ui.panel, alpha: 0.8 });
    g.rect(x, y, w * Math.max(0.04, ratio), h).fill(building ? palette.ui.accent : hpColor(ratio));
  }

  private highlight(g: Graphics, st: StructureView, px: number): void {
    const spec = STRUCTURES[st.kind];
    const s = st.shape;
    if (spec.line) {
      polyline(g, s);
      g.stroke({
        width: Math.max(spec.sizeM, STRUCTURE_MIN_PX * px) + px * 6,
        color: palette.ui.focus,
        alpha: 0.9,
      });
      return;
    }
    const cx = s[0] as number;
    const cy = s[1] as number;
    const half = Math.max(spec.sizeM / 2, STRUCTURE_MIN_PX * 2 * px);
    g.circle(cx, cy, half * 1.5 + px * 3).stroke({ width: px * 2, color: palette.ui.focus });
    const ring = (r: number, color: number): void => {
      g.circle(cx, cy, r).fill({ color, alpha: RADIUS_FILL_ALPHA });
      g.circle(cx, cy, r).stroke({ width: px * 1.5, color, alpha: RADIUS_RING_ALPHA });
    };
    if (st.kind === 'depot') ring(STRUCTURE_RULES.depotRadiusM, palette.friendly.color);
    else if (st.kind === 'charge') ring(STRUCTURE_RULES.charge.blastRadiusM, palette.alert.color);
    else if (st.kind === 'watchtower') ring(spec.sightBonusM, palette.friendly.color);
    else if (st.kind === 'mines') {
      ring(STRUCTURE_RULES.mines.blastRadiusM, palette.alert.color);
      ring(STRUCTURE_RULES.mines.triggerRadiusM, palette.friendly.color);
    }
  }

  /** Body of a line structure along `p` with the given alpha. */
  private lineBody(
    g: Graphics,
    family: string,
    p: readonly number[],
    t: number,
    alpha: number,
    color: number,
    px: number,
  ): void {
    if (family === 'wire') {
      polyline(g, zigzag(p, t / 2, 1.4));
      g.stroke({ width: Math.max(px * 1.5, 0.12), color, alpha, join: 'round' });
    } else if (family === 'barricade') {
      dashed(g, p, 1.6, 0.5);
      g.stroke({ width: t, color, alpha });
    } else {
      polyline(g, p);
      g.stroke({ width: t, color, alpha, join: 'round' });
    }
  }

  private line(g: Graphics, st: StructureView, family: string, px: number): void {
    const spec = STRUCTURES[st.kind];
    const p = st.shape;
    if (p.length < 4) return;
    const t = Math.max(spec.sizeM, STRUCTURE_MIN_PX * px);
    const solid = family !== 'wire';
    const ratio = st.maxHp > 0 ? st.hp / st.maxHp : 1;
    if (st.state === 'building') {
      if (solid) this.lineBody(g, family, p, t + STRUCTURE_OUTLINE_PX * px * 2, 0.25, DARK, px);
      this.lineBody(g, family, p, t, STRUCTURE_BUILDING_ALPHA, palette.friendly.color, px);
      if (st.progress > 0.01)
        this.lineBody(
          g,
          family,
          subPath(p, Math.min(1, st.progress)),
          t,
          STRUCTURE_FILL_ALPHA,
          palette.friendly.color,
          px,
        );
      return;
    }
    const edge = ratio < 1 ? hpColor(ratio) : DARK;
    if (solid)
      this.lineBody(
        g,
        family,
        p,
        t + STRUCTURE_OUTLINE_PX * px * 2,
        0.9,
        ratio <= BAR_WARN ? edge : DARK,
        px,
      );
    this.lineBody(g, family, p, t, STRUCTURE_FILL_ALPHA, palette.friendly.color, px);
    if (family === 'wall') {
      polyline(g, p);
      g.stroke({ width: Math.max(px, t * 0.1), color: DARK, alpha: 0.5 });
    }
    if (ratio < DAMAGE_SHOW_BELOW) {
      const len = pathLength(p);
      const step = 14 - 11.5 * (1 - Math.max(0, ratio));
      let n = 0;
      for (let d = step / 2; d < len; d += step) {
        const q = pointAt(p, d + (rand(st.id, n++) - 0.5) * step * 0.4);
        const j = (rand(st.id, n) - 0.5) * 0.8;
        g.moveTo(q.x - q.uy * t * 0.6, q.y + q.ux * t * 0.6);
        g.lineTo(q.x + q.ux * j, q.y + q.uy * j);
        g.lineTo(q.x + q.uy * t * 0.6, q.y - q.ux * t * 0.6);
      }
      g.stroke({ width: Math.max(px * 1.5, 0.15), color: DARK });
    }
  }

  private point(g: Graphics, st: StructureView, family: string, px: number): void {
    const spec = STRUCTURES[st.kind];
    const cx = st.shape[0] as number;
    const cy = st.shape[1] as number;
    const rot = st.rotation;
    const half = Math.max(spec.sizeM / 2, STRUCTURE_MIN_PX * 2 * px);
    const building = st.state === 'building';
    const alpha = building ? STRUCTURE_BUILDING_ALPHA : STRUCTURE_FILL_ALPHA;
    const ratio = st.maxHp > 0 ? st.hp / st.maxHp : 1;
    const outline = {
      width: STRUCTURE_OUTLINE_PX * px,
      color: !building && ratio <= BAR_WARN ? hpColor(ratio) : DARK,
    };
    const green = palette.friendly.color;
    switch (family) {
      case 'gate': {
        const hd = Math.max(0.6, STRUCTURE_MIN_PX * px);
        if (st.flag && !building) {
          const leaf = (half * (1 - GATE_OPEN_GAP)) / 1;
          for (const side of [-1, 1]) {
            const c = Math.cos(rot);
            const s = Math.sin(rot);
            const off = side * (half - leaf / 2);
            rrect(g, cx + c * off, cy + s * off, rot, leaf / 2, hd);
            g.fill({ color: green, alpha }).stroke(outline);
          }
        } else {
          rrect(g, cx, cy, rot, half, hd);
          g.fill({ color: green, alpha }).stroke(outline);
          g.moveTo(cx - Math.sin(rot) * hd, cy + Math.cos(rot) * hd).lineTo(
            cx + Math.sin(rot) * hd,
            cy - Math.cos(rot) * hd,
          );
          g.stroke({ width: px * 1.5, color: DARK });
        }
        break;
      }
      case 'mines': {
        const r = spec.sizeM;
        g.circle(cx, cy, r).fill({ color: green, alpha: building ? 0.04 : 0.08 });
        g.circle(cx, cy, r).stroke({ width: px * 1.5, color: green, alpha: 0.55 });
        const n = building ? Math.floor(MINE_DOTS * st.progress) : MINE_DOTS;
        const dot = Math.max(0.5, 2 * px);
        for (let k = 0; k < n; k++) {
          const a = k * 2.399963;
          const rr = r * 0.8 * Math.sqrt((k + 0.5) / MINE_DOTS);
          g.circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, dot);
        }
        g.fill({ color: green, alpha: building ? 0.6 : 1 }).stroke({ width: px, color: DARK });
        break;
      }
      case 'charge': {
        rrect(g, cx, cy, rot, half, half);
        g.fill({ color: green, alpha }).stroke(outline);
        const q = half * 0.55;
        g.moveTo(cx + q * 0.3, cy - q)
          .lineTo(cx - q * 0.4, cy + q * 0.1)
          .lineTo(cx + q * 0.4, cy - q * 0.1)
          .lineTo(cx - q * 0.3, cy + q);
        g.stroke({ width: px * 1.6, color: DARK });
        break;
      }
      case 'tower': {
        rrect(g, cx, cy, rot, half, half);
        g.fill({ color: green, alpha }).stroke(outline);
        rrect(g, cx, cy, rot, half * 0.45, half * 0.45);
        g.fill({ color: DARK, alpha: 0.85 });
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ] as const) {
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          const ax = sx * half * 0.45 * c - sy * half * 0.45 * s;
          const ay = sx * half * 0.45 * s + sy * half * 0.45 * c;
          const bx = sx * half * c - sy * half * s;
          const by = sx * half * s + sy * half * c;
          g.moveTo(cx + ax, cy + ay).lineTo(cx + bx, cy + by);
        }
        g.stroke({ width: px * 1.5, color: DARK });
        break;
      }
      default: {
        // depot: crate block with plank lines
        rrect(g, cx, cy, rot, half, half);
        g.fill({ color: green, alpha }).stroke(outline);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        for (const k of [-0.45, 0, 0.45]) {
          g.moveTo(cx + c * -half * 0.8 - s * half * k, cy + s * -half * 0.8 + c * half * k);
          g.lineTo(cx + c * half * 0.8 - s * half * k, cy + s * half * 0.8 + c * half * k);
        }
        g.stroke({ width: px * 1.5, color: DARK, alpha: 0.7 });
      }
    }
  }

  private rubble(g: Graphics, st: StructureView, px: number): void {
    const spec = STRUCTURES[st.kind];
    const chunks: { x: number; y: number; r: number; k: number }[] = [];
    const t = Math.max(spec.sizeM, STRUCTURE_MIN_PX * px);
    if (spec.line && st.shape.length >= 4) {
      const len = pathLength(st.shape);
      let n = 0;
      for (let d = RUBBLE_SPACING_M / 2; d < len; d += RUBBLE_SPACING_M) {
        const q = pointAt(st.shape, d);
        const lat = (rand(st.id, n) - 0.5) * t;
        chunks.push({
          x: q.x - q.uy * lat,
          y: q.y + q.ux * lat,
          r: 0.55 + rand(st.id, n + 1000) * 0.9,
          k: n,
        });
        n++;
      }
    } else {
      const cx = st.shape[0] as number;
      const cy = st.shape[1] as number;
      const half = Math.max(spec.sizeM / 2, STRUCTURE_MIN_PX * 2 * px);
      for (let n = 0; n < RUBBLE_POINT_CHUNKS; n++) {
        const a = rand(st.id, n) * Math.PI * 2;
        const d = Math.sqrt(rand(st.id, n + 77)) * half;
        chunks.push({
          x: cx + Math.cos(a) * d,
          y: cy + Math.sin(a) * d,
          r: 0.6 + rand(st.id, n + 1000) * 0.9,
          k: n,
        });
      }
    }
    for (const pass of [0, 1]) {
      for (const c of chunks) {
        if (c.k % 2 !== pass) continue;
        const r = Math.max(c.r, px * 1.5);
        const a = rand(st.id, c.k + 5000) * Math.PI;
        g.poly([
          c.x + Math.cos(a) * r,
          c.y + Math.sin(a) * r,
          c.x + Math.cos(a + 2.2) * r * 0.8,
          c.y + Math.sin(a + 2.2) * r * 0.8,
          c.x + Math.cos(a + 4.1) * r * 0.9,
          c.y + Math.sin(a + 4.1) * r * 0.9,
        ]);
      }
      g.fill({
        color: pass === 0 ? palette.structure.rubble : palette.structure.rubbleDark,
        alpha: STRUCTURE_RUBBLE_ALPHA,
      });
    }
  }
}
