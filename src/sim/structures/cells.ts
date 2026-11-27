// Footprint geometry: 4-connected line and disc rasterization, footprint cells with the neighbor ring around
// them, mine charge cells. Writes into the fixed per-slot arrays of Structures.
import { STRUCTURE_RULES, STRUCTURES } from '../../data/buildings/defense';
import { cosU, sinU } from '../math/trig';
import type { SimState } from '../state';
import { MAX_CELLS, MAX_RING, SK } from './kinds';
import type { Structures } from './structures';

/** Takes tmp[0..m) as footprint cells and builds the neighbor ring. */
export function claimCells(s: SimState, S: Structures, i: number, m: number): void {
  const base = i * MAX_CELLS;
  for (let q = 0; q < m; q++) {
    const c = S.tmp[q] as number;
    S.cells[base + q] = c;
    s.structAt[c] = i;
  }
  S.cellCount[i] = m;
  const n = s.n;
  const rb = i * MAX_RING;
  let r = 0;
  for (let q = 0; q < m; q++) {
    const c = S.cells[base + q] as number;
    const x = c % n;
    const y = (c - x) / n;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (s.structAt[j] === i || !s.terrainWalk[j] || r >= MAX_RING) continue;
        let dup = false;
        for (let t = rb; t < rb + r; t++) if (S.ring[t] === j) dup = true;
        if (!dup) S.ring[rb + r++] = j;
      }
    }
  }
  S.ringCount[i] = r;
}

/** Mines: charge cells on a ring inside the field; ring = field disc. Charges: own cell only. */
export function claimPointCells(s: SimState, S: Structures, i: number, x: number, y: number): void {
  const base = i * MAX_CELLS;
  const c0 = s.cellOf(x, y);
  if (S.kind[i] === SK.mines) {
    const R = STRUCTURES.mines.sizeM;
    const charges = STRUCTURE_RULES.mines.charges;
    let m = 0;
    S.cells[base + m++] = c0;
    for (let q = 1; q < charges && m < MAX_CELLS; q++) {
      const a = Math.floor(((q - 1) * 4096) / (charges - 1));
      const c = s.cellOf(x + cosU(a) * R * 0.6, y + sinU(a) * R * 0.6);
      if (s.terrainWalk[c]) S.cells[base + m++] = c;
    }
    S.cellCount[i] = m;
    const disc = rasterDisc(s, x, y, R, S.tmp);
    const rb = i * MAX_RING;
    let r = 0;
    for (let q = 0; q < disc && r < MAX_RING; q++) {
      const c = S.tmp[q] as number;
      if (s.terrainWalk[c]) S.ring[rb + r++] = c;
    }
    S.ringCount[i] = r;
  } else {
    S.cells[base] = c0;
    S.cellCount[i] = 1;
    S.ringCount[i] = 0;
  }
}

/** 4-connected cells from (ax, ay) to (bx, by) in meters into out; returns the count (capped by out). */
export function rasterLine(
  s: SimState,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  out: Int32Array,
): number {
  const n = s.n;
  const cm = s.cellM;
  const clamp = (v: number): number => Math.min(Math.max(v, 0), s.sizeM - 1e-3);
  const x0 = clamp(ax) / cm;
  const y0 = clamp(ay) / cm;
  const x1 = clamp(bx) / cm;
  const y1 = clamp(by) / cm;
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? (cx + (dx > 0 ? 1 : 0) - x0) / dx : Number.POSITIVE_INFINITY;
  let tMaxY = dy !== 0 ? (cy + (dy > 0 ? 1 : 0) - y0) / dy : Number.POSITIVE_INFINITY;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
  let m = 0;
  out[m++] = cy * n + cx;
  // Each step moves along one axis only, so the line has no diagonal gaps.
  while ((cx !== ex || cy !== ey) && m < out.length) {
    if (tMaxX <= tMaxY) {
      cx += sx;
      tMaxX += tdx;
    } else {
      cy += sy;
      tMaxY += tdy;
    }
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) break;
    out[m++] = cy * n + cx;
  }
  return m;
}

/** Cells whose centers lie within r of (x, y), at least the cell of (x, y). */
export function rasterDisc(s: SimState, x: number, y: number, r: number, out: Int32Array): number {
  const n = s.n;
  const cm = s.cellM;
  const c0 = s.cellOf(x, y);
  let m = 0;
  out[m++] = c0;
  const x0 = Math.max(0, Math.floor((x - r) / cm));
  const x1 = Math.min(n - 1, Math.floor((x + r) / cm));
  const y0 = Math.max(0, Math.floor((y - r) / cm));
  const y1 = Math.min(n - 1, Math.floor((y + r) / cm));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * n + gx;
      if (c === c0 || m >= out.length) continue;
      const dx = (gx + 0.5) * cm - x;
      const dy = (gy + 0.5) * cm - y;
      if (dx * dx + dy * dy <= r * r) out[m++] = c;
    }
  }
  return m;
}
