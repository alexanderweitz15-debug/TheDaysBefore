// Geometry helpers for zones: point-segment distance, rasterizing rectangles, discs and polylines onto grids.

/** Squared distance from (px, py) to segment (ax, ay)-(bx, by). */
export function segmentDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.min(Math.max(t, 0), 1);
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Squared distance from (px, py) to the rectangle [x0, x1] x [y0, y1] (0 inside). */
export function rectDist2(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return dx * dx + dy * dy;
}

/**
 * Calls `visit(cell)` for every cell of a square grid (side cells of cellM meters) whose center lies within
 * `r` of the polyline `pts[0..len)` (flat x, y). Cells are visited once per segment (may repeat across segments).
 */
export function forCellsNearPolyline(
  pts: Float32Array,
  base: number,
  len: number,
  r: number,
  side: number,
  cellM: number,
  visit: (cell: number) => void,
): void {
  const r2 = r * r;
  const segs = len < 4 ? (len === 2 ? 1 : 0) : len / 2 - 1;
  for (let k = 0; k < segs; k++) {
    const ax = pts[base + 2 * k] as number;
    const ay = pts[base + 2 * k + 1] as number;
    const bx = len === 2 ? ax : (pts[base + 2 * k + 2] as number);
    const by = len === 2 ? ay : (pts[base + 2 * k + 3] as number);
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r) / cellM));
    const gx1 = Math.min(side - 1, Math.floor((Math.max(ax, bx) + r) / cellM));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - r) / cellM));
    const gy1 = Math.min(side - 1, Math.floor((Math.max(ay, by) + r) / cellM));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (segmentDist2((gx + 0.5) * cellM, (gy + 0.5) * cellM, ax, ay, bx, by) <= r2) visit(gy * side + gx);
      }
    }
  }
}
