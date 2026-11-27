// Grid line test (Amanatides-Woo) in cell units: true if every cell the segment touches is clear. At exact corner
// crossings both side cells must be clear (no squeezing through diagonal gaps).

/**
 * @param clear 1 = passable/transparent per cell, row-major n x n.
 * Coordinates in cells (meters / cell size).
 */
export function lineClear(
  n: number,
  clear: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  let cx = Math.floor(ax);
  let cy = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  if (cx < 0 || cy < 0 || cx >= n || cy >= n || ex < 0 || ey < 0 || ex >= n || ey >= n) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? (cx + (dx > 0 ? 1 : 0) - ax) / dx : Number.POSITIVE_INFINITY;
  let tMaxY = dy !== 0 ? (cy + (dy > 0 ? 1 : 0) - ay) / dy : Number.POSITIVE_INFINITY;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
  const steps = Math.abs(ex - cx) + Math.abs(ey - cy) + 2;
  for (let k = 0; k <= steps; k++) {
    if (!clear[cy * n + cx]) return false;
    if (cx === ex && cy === ey) return true;
    if (tMaxX < tMaxY) {
      cx += sx;
      tMaxX += tdx;
    } else if (tMaxY < tMaxX) {
      cy += sy;
      tMaxY += tdy;
    } else {
      if (!clear[cy * n + cx + sx] || !clear[(cy + sy) * n + cx]) return false;
      cx += sx;
      cy += sy;
      tMaxX += tdx;
      tMaxY += tdy;
    }
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return false;
  }
  return false;
}
