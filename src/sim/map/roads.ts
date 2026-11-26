// Roads: clip segments at water, pick bridges (all land connected, count from data), rasterize.
import type { Rng } from '../../core/rng';
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import { LAYOUT, ROAD_GEN, TERRAIN_GEN } from '../../data/city/generator';
import { type CityGrid, floodFill } from './grid';
import { KIND_BRIDGE, KIND_MAIN, KIND_RAIL, pointX, pointY, type Segment, seg, segLength } from './segments';

const SAMPLE_M = 2;
/** Bridges reach this far onto land so the deck always meets the road. */
const BRIDGE_OVERHANG_M = 4;

interface Crossing {
  segment: number;
  t0: number;
  t1: number;
  compA: number;
  compB: number;
  lengthM: number;
}

/** Labels connected land (non-water) regions. */
function landComponents(g: CityGrid): Int32Array {
  const label = new Int32Array(g.cells).fill(-1);
  const queue = new Int32Array(g.cells);
  const pass = (i: number): boolean => g.terrain[i] !== TERRAIN.water;
  let next = 0;
  for (let i = 0; i < g.cells; i++) {
    if (label[i] === -1 && pass(i)) floodFill(g.n, i, pass, label, next++, queue);
  }
  return label;
}

/** Splits `s` into land intervals and water runs. Runs touching a segment end are dropped. */
function scan(g: CityGrid, s: Segment, land: [number, number][], water: [number, number][]): void {
  const steps = Math.max(1, Math.ceil(segLength(s) / SAMPLE_M));
  const emit = (isWater: boolean, a: number, b: number): void => {
    if (!isWater) {
      if (b > a) land.push([a, b]);
    } else if (a > 0 && b < 1) water.push([a, b]);
  };
  let state = g.isWater(g.cellAt(s.ax, s.ay));
  let start = 0;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const w = g.isWater(g.cellAt(pointX(s, t), pointY(s, t)));
    if (w === state) continue;
    emit(state, start, t);
    state = w;
    start = t;
  }
  emit(state, start, 1);
}

class UnionFind {
  private readonly parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(a: number): number {
    let r = a;
    while ((this.parent[r] as number) !== r) r = this.parent[r] as number;
    let c = a;
    while ((this.parent[c] as number) !== r) {
      const next = this.parent[c] as number;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (ra < rb) this.parent[rb] = ra;
    else this.parent[ra] = rb;
    return true;
  }
}

function shuffle(rng: Rng, a: number[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i + 1);
    const tmp = a[i] as number;
    a[i] = a[j] as number;
    a[j] = tmp;
  }
}

/**
 * Returns the final road pieces: land parts of all segments plus chosen water crossings as bridges.
 * Rail crossings always become (rail) bridges.
 */
export function clipAndBridge(g: CityGrid, rng: Rng, segments: Segment[], rivers: number): Segment[] {
  const comp = landComponents(g);
  const pieces: Segment[] = [];
  const crossings: Crossing[] = [];
  for (let si = 0; si < segments.length; si++) {
    const s = segments[si] as Segment;
    const land: [number, number][] = [];
    const water: [number, number][] = [];
    scan(g, s, land, water);
    for (const [a, b] of land) {
      pieces.push(seg(pointX(s, a), pointY(s, a), pointX(s, b), pointY(s, b), s.widthM, s.kind));
    }
    for (const [a, b] of water) {
      const lengthM = segLength(s) * (b - a);
      if (lengthM > LAYOUT.maxBridgeLengthM) continue;
      const back = Math.max(0, a - SAMPLE_M / Math.max(segLength(s), 1));
      const fwd = Math.min(1, b + SAMPLE_M / Math.max(segLength(s), 1));
      const compA = comp[g.cellAt(pointX(s, back), pointY(s, back))] as number;
      const compB = comp[g.cellAt(pointX(s, fwd), pointY(s, fwd))] as number;
      if (compA < 0 || compB < 0) continue;
      crossings.push({ segment: si, t0: a, t1: b, compA, compB, lengthM });
    }
  }

  const uf = new UnionFind(g.cells);
  const chosen: Crossing[] = [];
  const rail: number[] = [];
  const main: number[] = [];
  const minor: number[] = [];
  crossings.forEach((c, i) => {
    const kind = (segments[c.segment] as Segment).kind;
    (kind === KIND_RAIL ? rail : kind === KIND_MAIN ? main : minor).push(i);
  });
  shuffle(rng, main);
  shuffle(rng, minor);
  for (const i of rail) {
    const c = crossings[i] as Crossing;
    uf.union(c.compA, c.compB);
    chosen.push(c);
  }
  const target = rivers > 0 ? rng.nextInt(TERRAIN_GEN.bridgesMin, TERRAIN_GEN.bridgesMax + 1) : 0;
  let roadBridges = 0;
  const used = new Uint8Array(crossings.length);
  // Spanning pass: connect every land region, preferring main roads.
  for (const i of [...main, ...minor]) {
    const c = crossings[i] as Crossing;
    if (uf.union(c.compA, c.compB)) {
      chosen.push(c);
      used[i] = 1;
      roadBridges++;
    }
  }
  for (const i of main) {
    if (roadBridges >= target) break;
    if (used[i]) continue;
    chosen.push(crossings[i] as Crossing);
    roadBridges++;
  }

  for (const c of chosen) {
    const s = segments[c.segment] as Segment;
    const isRail = s.kind === KIND_RAIL;
    const w = isRail ? s.widthM : ROAD_GEN.bridgeWidthM;
    const p = seg(
      pointX(s, c.t0),
      pointY(s, c.t0),
      pointX(s, c.t1),
      pointY(s, c.t1),
      w,
      isRail ? KIND_RAIL : KIND_BRIDGE,
    );
    p.bridge = true;
    pieces.push(p);
  }
  return pieces;
}

/** Paints a thick segment. Land cells get `landCode`, water cells `waterCode`; -1 leaves them as they are. */
export function paintSegment(g: CityGrid, s: Segment, landCode: number, waterCode: number): void {
  const n = g.n;
  const half = s.widthM / 2 - 1e-6;
  const minX = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - half) / CELL_SIZE_M));
  const maxX = Math.min(n - 1, Math.floor((Math.max(s.ax, s.bx) + half) / CELL_SIZE_M));
  const minY = Math.max(0, Math.floor((Math.min(s.ay, s.by) - half) / CELL_SIZE_M));
  const maxY = Math.min(n - 1, Math.floor((Math.max(s.ay, s.by) + half) / CELL_SIZE_M));
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const half2 = half * half;
  for (let y = minY; y <= maxY; y++) {
    const py = (y + 0.5) * CELL_SIZE_M;
    for (let x = minX; x <= maxX; x++) {
      const px = (x + 0.5) * CELL_SIZE_M;
      let t = len2 > 0 ? ((px - s.ax) * dx + (py - s.ay) * dy) / len2 : 0;
      t = Math.min(Math.max(t, 0), 1);
      const ex = s.ax + dx * t - px;
      const ey = s.ay + dy * t - py;
      if (ex * ex + ey * ey > half2) continue;
      const i = y * n + x;
      if (g.terrain[i] === TERRAIN.water) {
        if (waterCode >= 0) g.terrain[i] = waterCode;
      } else if (landCode >= 0 && g.terrain[i] !== TERRAIN.bridge) g.terrain[i] = landCode;
    }
  }
}

/** Rasterizes pieces: rail first, then streets and main roads (crossings become road), bridge decks last. */
export function paintRoads(g: CityGrid, pieces: Segment[]): void {
  for (const s of pieces) if (s.kind === KIND_RAIL) paintSegment(g, s, TERRAIN.rail, -1);
  for (const s of pieces)
    if (s.kind !== KIND_RAIL) paintSegment(g, s.bridge ? overhang(s) : s, TERRAIN.road, -1);
  for (const s of pieces) if (s.bridge) paintSegment(g, overhang(s), -1, TERRAIN.bridge);
}

/** Bridge extended onto land at both ends, for painting only (the graph keeps exact shore points). */
function overhang(s: Segment): Segment {
  const len = Math.max(segLength(s), 1);
  const ex = ((s.bx - s.ax) / len) * BRIDGE_OVERHANG_M;
  const ey = ((s.by - s.ay) / len) * BRIDGE_OVERHANG_M;
  return seg(s.ax - ex, s.ay - ey, s.bx + ex, s.by + ey, s.widthM, s.kind);
}
