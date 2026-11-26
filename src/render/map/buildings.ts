// Buildings of one tile: shadows, then per building side walls and roof, back to front.
import type { Graphics } from 'pixi.js';
import { type CityMapData, DISTRICTS, KEY_SITES, NONE_U8 } from '../../core/types/map';
import { ROOF_OFFSET_MAX_M, ROOF_OFFSET_PER_FLOOR_M } from '../../data/render';
import { palette } from '../palette';
import { jitter, scaleColor } from './color';
import { intersects, type Rect } from './rect';

const HOSPITAL = KEY_SITES.indexOf('hospital');
/** Roof shifts up by `offset` and right by this share of it. */
const SHEAR = 0.35;

interface Box {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Roof shift (ox right, oy up as negative). */
  ox: number;
  oy: number;
}

function box(map: CityMapData, i: number, three: boolean): Box {
  const b = map.buildings;
  const cs = map.cellSizeM;
  const off = three ? Math.min(ROOF_OFFSET_MAX_M, (b.floors[i] as number) * ROOF_OFFSET_PER_FLOOR_M) : 0;
  return {
    i,
    x: (b.x[i] as number) * cs,
    y: (b.y[i] as number) * cs,
    w: (b.w[i] as number) * cs,
    h: (b.h[i] as number) * cs,
    ox: off * SHEAR,
    oy: -off,
  };
}

function drawHospitalMark(g: Graphics, x: number, y: number, w: number, h: number): void {
  const size = Math.min(w, h);
  if (size < 10) return;
  const letter = size * 0.55;
  const t = Math.max(1.2, letter * 0.22);
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.rect(cx - letter / 2, cy - letter / 2, t, letter);
  g.rect(cx + letter / 2 - t, cy - letter / 2, t, letter);
  g.rect(cx - letter / 2, cy - t / 2, letter, t);
  g.fill(palette.map.hospitalMark);
}

/** `order` lists building indices sorted by bottom edge so nearer buildings overdraw farther ones. */
export function drawBuildings(
  g: Graphics,
  map: CityMapData,
  r: Rect,
  order: Int32Array,
  three: boolean,
): void {
  const roofs = palette.map.roofs;
  const visible: Box[] = [];
  for (let n = 0; n < order.length; n++) {
    const bx = box(map, order[n] as number, three);
    const area: Rect = {
      x0: bx.x - 2,
      y0: bx.y + bx.oy - 2,
      x1: bx.x + bx.w + bx.ox + 2 - bx.oy * 0.6,
      y1: bx.y + bx.h - bx.oy * 0.3 + 2,
    };
    if (intersects(area, r)) visible.push(bx);
  }
  if (three) {
    for (const b of visible) {
      const k = -b.oy;
      if (k < 1) continue;
      g.rect(b.x + k * 0.6, b.y + k * 0.3, b.w, b.h);
    }
    g.fill({ color: palette.map.shadow, alpha: 0.4 });
  }
  for (const b of visible) {
    const district = map.buildings.district[b.i] as number;
    const name = DISTRICTS[district] ?? 'residential';
    const roof = scaleColor(roofs[name], jitter(b.i));
    const wall = scaleColor(roof, palette.map.wallShade);
    if (three && b.oy < -0.5) {
      g.poly([
        b.x,
        b.y + b.h,
        b.x + b.w,
        b.y + b.h,
        b.x + b.w + b.ox,
        b.y + b.h + b.oy,
        b.x + b.ox,
        b.y + b.h + b.oy,
      ]);
      g.fill(wall);
      g.poly([b.x, b.y, b.x, b.y + b.h, b.x + b.ox, b.y + b.h + b.oy, b.x + b.ox, b.y + b.oy]);
      g.fill(scaleColor(wall, 0.85));
    }
    g.rect(b.x + b.ox, b.y + b.oy, b.w, b.h).fill(roof);
    g.rect(b.x + b.ox, b.y + b.oy, b.w, b.h).stroke({ width: 0.5, color: scaleColor(roof, 0.6) });
    const site = map.buildings.keySite[b.i] as number;
    if (site !== NONE_U8 && site === HOSPITAL) drawHospitalMark(g, b.x + b.ox, b.y + b.oy, b.w, b.h);
  }
}

/** Indices sorted by bottom edge (y + h), ties by x. */
export function sortBuildings(map: CityMapData): Int32Array {
  const b = map.buildings;
  const idx = Array.from({ length: b.count }, (_, i) => i);
  idx.sort(
    (p, q) =>
      (b.y[p] as number) + (b.h[p] as number) - ((b.y[q] as number) + (b.h[q] as number)) ||
      (b.x[p] as number) - (b.x[q] as number),
  );
  return Int32Array.from(idx);
}
