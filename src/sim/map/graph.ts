// Road graph from road pieces: pieces are split at every crossing and T-junction.
import type { CityMapData } from '../../core/types/map';
import { pointX, pointY, type Segment } from './segments';

const BUCKET_M = 64;
const EPS = 1e-7;

/** Intersection parameters of two segments, or null. Touching endpoints count. */
function intersect(p: Segment, q: Segment): [number, number] | null {
  const rx = p.bx - p.ax;
  const ry = p.by - p.ay;
  const sx = q.bx - q.ax;
  const sy = q.by - q.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = q.ax - p.ax;
  const qpy = q.ay - p.ay;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [Math.min(Math.max(t, 0), 1), Math.min(Math.max(u, 0), 1)];
}

export function buildRoadGraph(pieces: Segment[], sizeM: number): CityMapData['roads'] {
  const nb = Math.ceil(sizeM / BUCKET_M) + 1;
  const buckets: number[][] = [];
  for (let i = 0; i < nb * nb; i++) buckets.push([]);
  const bucketOf = (x: number, y: number): number => {
    const bx = Math.min(Math.max(Math.floor(x / BUCKET_M), 0), nb - 1);
    const by = Math.min(Math.max(Math.floor(y / BUCKET_M), 0), nb - 1);
    return by * nb + bx;
  };
  pieces.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / BUCKET_M);
    const x1 = Math.floor(Math.max(s.ax, s.bx) / BUCKET_M);
    const y0 = Math.floor(Math.min(s.ay, s.by) / BUCKET_M);
    const y1 = Math.floor(Math.max(s.ay, s.by) / BUCKET_M);
    for (let y = Math.max(0, y0); y <= Math.min(nb - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(nb - 1, x1); x++) (buckets[y * nb + x] as number[]).push(i);
    }
  });

  const cuts: number[][] = pieces.map(() => [0, 1]);
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b] as number[];
    for (let i = 0; i < list.length; i++) {
      const pi = list[i] as number;
      const p = pieces[pi] as Segment;
      for (let j = i + 1; j < list.length; j++) {
        const qi = list[j] as number;
        const q = pieces[qi] as Segment;
        const hit = intersect(p, q);
        // Count each pair once: only in the bucket that contains the crossing point.
        if (!hit || bucketOf(pointX(p, hit[0]), pointY(p, hit[0])) !== b) continue;
        (cuts[pi] as number[]).push(hit[0]);
        (cuts[qi] as number[]).push(hit[1]);
      }
    }
  }

  // Nodes are merged by position, quantized to 1 cm. The Map is used for lookup only.
  const nodeIndex = new Map<number, number>();
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const keyScale = Math.ceil(sizeM * 100) + 2;
  const node = (x: number, y: number): number => {
    const key = Math.round(y * 100) * keyScale + Math.round(x * 100);
    const found = nodeIndex.get(key);
    if (found !== undefined) return found;
    const id = nodeX.length;
    nodeIndex.set(key, id);
    nodeX.push(x);
    nodeY.push(y);
    return id;
  };
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeWidth: number[] = [];
  const edgeKind: number[] = [];
  pieces.forEach((s, i) => {
    const ts = (cuts[i] as number[]).sort((a, b) => a - b);
    let prev = node(pointX(s, ts[0] as number), pointY(s, ts[0] as number));
    for (let k = 1; k < ts.length; k++) {
      const t = ts[k] as number;
      const cur = node(pointX(s, t), pointY(s, t));
      if (cur === prev) continue;
      edgeA.push(prev);
      edgeB.push(cur);
      edgeWidth.push(s.widthM);
      edgeKind.push(s.kind);
      prev = cur;
    }
  });

  return {
    nodeCount: nodeX.length,
    nodeX: Float32Array.from(nodeX),
    nodeY: Float32Array.from(nodeY),
    edgeCount: edgeA.length,
    edgeA: Uint32Array.from(edgeA),
    edgeB: Uint32Array.from(edgeB),
    edgeWidth: Uint8Array.from(edgeWidth),
    edgeKind: Uint8Array.from(edgeKind),
  };
}
