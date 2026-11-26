// Small color helpers for the map renderer.
export function scaleColor(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Deterministic per-building brightness jitter in [0.9, 1.1]. */
export function jitter(index: number): number {
  const h = Math.imul(index + 1, 2654435761) >>> 0;
  return 0.9 + ((h >>> 8) % 21) / 100;
}
