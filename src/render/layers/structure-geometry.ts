// Geometry helpers for structure drawing: polylines, deterministic noise, rotated rectangles.
import type { Graphics } from 'pixi.js';
import { BAR_CRITICAL, BAR_WARN } from '../../data/render-combat';
import { palette } from '../palette';

export function rand(a: number, b: number): number {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function hpColor(ratio: number): number {
  if (ratio <= BAR_CRITICAL) return palette.alert.color;
  if (ratio <= BAR_WARN) return palette.ui.focus;
  return palette.friendly.color;
}

export function pathLength(p: readonly number[]): number {
  let l = 0;
  for (let i = 0; i + 3 < p.length; i += 2)
    l += Math.hypot((p[i + 2] as number) - (p[i] as number), (p[i + 3] as number) - (p[i + 1] as number));
  return l;
}

/** Sub-polyline from the start covering `frac` of the length. */
export function subPath(p: readonly number[], frac: number): number[] {
  const target = pathLength(p) * frac;
  const out: number[] = [p[0] as number, p[1] as number];
  let acc = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const x0 = p[i] as number;
    const y0 = p[i + 1] as number;
    const x1 = p[i + 2] as number;
    const y1 = p[i + 3] as number;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (acc + seg >= target) {
      const f = seg === 0 ? 0 : (target - acc) / seg;
      out.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      return out;
    }
    out.push(x1, y1);
    acc += seg;
  }
  return out;
}

/** Point at distance d along the polyline plus its unit direction. */
export function pointAt(p: readonly number[], d: number): { x: number; y: number; ux: number; uy: number } {
  let acc = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const x0 = p[i] as number;
    const y0 = p[i + 1] as number;
    const dx = (p[i + 2] as number) - x0;
    const dy = (p[i + 3] as number) - y0;
    const seg = Math.hypot(dx, dy);
    if (seg > 0 && (acc + seg >= d || i + 4 >= p.length)) {
      const f = Math.min(1, (d - acc) / seg);
      return { x: x0 + dx * f, y: y0 + dy * f, ux: dx / seg, uy: dy / seg };
    }
    acc += seg;
  }
  return { x: p[0] as number, y: p[1] as number, ux: 1, uy: 0 };
}

export function polyline(g: Graphics, p: readonly number[]): void {
  g.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(p[i] as number, p[i + 1] as number);
}

export function zigzag(p: readonly number[], amp: number, period: number): number[] {
  const out: number[] = [p[0] as number, p[1] as number];
  const len = pathLength(p);
  let side = 1;
  for (let d = period / 2; d < len; d += period / 2) {
    const q = pointAt(p, d);
    out.push(q.x - q.uy * amp * side, q.y + q.ux * amp * side);
    side = -side;
  }
  out.push(p[p.length - 2] as number, p[p.length - 1] as number);
  return out;
}

export function rrect(g: Graphics, cx: number, cy: number, rot: number, hw: number, hh: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  g.poly([
    cx - hw * c + hh * s,
    cy - hw * s - hh * c,
    cx + hw * c + hh * s,
    cy + hw * s - hh * c,
    cx + hw * c - hh * s,
    cy + hw * s + hh * c,
    cx - hw * c - hh * s,
    cy - hw * s + hh * c,
  ]);
}
