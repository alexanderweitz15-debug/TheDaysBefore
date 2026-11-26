export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
