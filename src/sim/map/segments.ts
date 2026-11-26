// Road segments in meters, used during generation before rasterizing and building the road graph.

/** Index into ROAD_KINDS. */
export const KIND_STREET = 0;
export const KIND_MAIN = 1;
export const KIND_BRIDGE = 2;
export const KIND_RAIL = 3;

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  widthM: number;
  kind: number;
  /** Crosses water (road or rail bridge). */
  bridge: boolean;
}

export const seg = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  widthM: number,
  kind: number,
): Segment => ({
  ax,
  ay,
  bx,
  by,
  widthM,
  kind,
  bridge: false,
});

export function segLength(s: Segment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Point at parameter t in [0, 1]. Same inputs always give bit-identical outputs. */
export const pointX = (s: Segment, t: number): number => s.ax + (s.bx - s.ax) * t;
export const pointY = (s: Segment, t: number): number => s.ay + (s.by - s.ay) * t;
