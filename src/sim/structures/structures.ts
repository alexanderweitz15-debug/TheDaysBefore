// Defensive structures (GDD 9 Bauwerke, GDD 8 rule 5). Fixed slots in typed arrays. Lines are split into segments
// of segmentM (each with its own id, so breaches stay local) and rasterized 4-connected, so no diagonal gaps.
// Footprint cells must be walkable terrain and free. Blocking takes effect when a structure is finished:
// walls, barricades, towers and depots block everyone; gates block zombies always and humans while closed;
// wire slows. Mines and charges occupy no cells.
import type { StructureKind } from '../../core/commands';
import type { StructureState, StructureView } from '../../core/types/combat';
import { STRUCTURE_RULES, STRUCTURES } from '../../data/buildings/defense';
import { cosU, sinU, unitsFromRad } from '../math/trig';
import type { SimState } from '../state';
import { claimCells, claimPointCells, rasterDisc, rasterLine } from './cells';
import {
  MAX_CELLS,
  MAX_RING,
  MAX_STRUCTURES,
  POINTLESS,
  SK,
  SK_ARMOR,
  SK_BLOCKS,
  SPEC,
  SS_BUILDING,
  SS_DESTROYED,
  SS_DONE,
  STATES,
  STRUCTURE_KINDS,
} from './kinds';

export class Structures {
  readonly alive = new Uint8Array(MAX_STRUCTURES);
  readonly id = new Int32Array(MAX_STRUCTURES);
  readonly kind = new Uint8Array(MAX_STRUCTURES);
  readonly state = new Uint8Array(MAX_STRUCTURES);
  readonly hp = new Float32Array(MAX_STRUCTURES);
  readonly maxHp = new Float32Array(MAX_STRUCTURES);
  readonly progress = new Float32Array(MAX_STRUCTURES);
  /** Build time in seconds for one engineer squad. */
  readonly buildS = new Float32Array(MAX_STRUCTURES);
  /** Gate open, charge armed. */
  readonly flag = new Uint8Array(MAX_STRUCTURES);
  /** Line: x0, y0, x1, y1; point: x, y, x, y. */
  readonly shape = new Float32Array(MAX_STRUCTURES * 4);
  readonly rotation = new Float32Array(MAX_STRUCTURES);
  readonly cx = new Float32Array(MAX_STRUCTURES);
  readonly cy = new Float32Array(MAX_STRUCTURES);
  readonly lengthM = new Float32Array(MAX_STRUCTURES);
  readonly cost = new Float32Array(MAX_STRUCTURES);
  /** Footprint cells (mines: remaining charge cells) and the ring of cells around (mines: the field disc). */
  readonly cells = new Int32Array(MAX_STRUCTURES * MAX_CELLS);
  readonly cellCount = new Uint8Array(MAX_STRUCTURES);
  readonly ring = new Int32Array(MAX_STRUCTURES * MAX_RING);
  readonly ringCount = new Uint8Array(MAX_STRUCTURES);
  /** Tick: mine cooldown end, destruction time. */
  readonly until = new Int32Array(MAX_STRUCTURES);
  /** Tick an engineer last worked on it. */
  readonly workedAt = new Int32Array(MAX_STRUCTURES).fill(-1);
  highWater = 0;
  nextId = 1;
  /** Bumped when structures are added, removed or change state/flag (host resends the views). */
  version = 0;
  /** Bumped when walkability changes; pathing refreshes after repathDebounceTicks. */
  pathVersion = 0;
  pathChangedAt = 0;
  pathHandled = 0;
  /** Set when agents may stand in newly blocked cells. */
  evictPending = false;
  readonly depotRadius = STRUCTURE_RULES.depotRadiusM;
  /** Scratch for rasterizing (cells.ts). */
  readonly tmp = new Int32Array(MAX_CELLS * 4);
  /** Raster of a whole line edge (placeBlockedEdge). */
  private lineTmp = new Int32Array(0);

  count(): number {
    let k = 0;
    for (let i = 0; i < this.highWater; i++) k += this.alive[i] as number;
    return k;
  }

  slotOfId(id: number): number {
    for (let i = 0; i < this.highWater; i++) if (this.alive[i] && this.id[i] === id) return i;
    return -1;
  }

  private alloc(): number {
    for (let i = 0; i < this.highWater; i++) if (!this.alive[i]) return this.init(i);
    if (this.highWater >= MAX_STRUCTURES) return -1;
    return this.init(this.highWater++);
  }

  private init(i: number): number {
    this.alive[i] = 1;
    this.id[i] = this.nextId++;
    this.state[i] = SS_BUILDING;
    this.progress[i] = 0;
    this.flag[i] = 0;
    this.cellCount[i] = 0;
    this.ringCount[i] = 0;
    this.until[i] = 0;
    this.workedAt[i] = -1;
    return i;
  }

  /** PlaceStructure (refused if any point is off the map; lines build only their free stretches). Returns the number of structures created (lines: segments). */
  place(s: SimState, kind: StructureKind, pts: readonly number[], rotation: number): number {
    const k = SK[kind];
    if (k === undefined || !Array.isArray(pts) || pts.length < 2) return 0;
    for (const v of pts) if (!Number.isFinite(v)) return 0;
    // Off-map points are refused, not clamped to the border.
    for (let p = 0; p + 1 < pts.length; p += 2)
      if (!s.inMap(pts[p] as number, pts[p + 1] as number)) return 0;
    const spec = STRUCTURES[kind];
    if (spec.line) {
      let made = 0;
      const seg = STRUCTURE_RULES.segmentM;
      const firstId = this.nextId;
      for (let p = 0; p + 3 < pts.length; p += 2) {
        const ax = pts[p] as number;
        const ay = pts[p + 1] as number;
        const bx = pts[p + 2] as number;
        const by = pts[p + 3] as number;
        if (!this.edgeClear(s, ax, ay, bx, by, firstId)) {
          const r = this.placeBlockedEdge(s, k, ax, ay, bx, by);
          if (r < 0) return made - r - 1;
          made += r;
          continue;
        }
        const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        const parts = Math.max(1, Math.ceil(len / seg));
        for (let q = 0; q < parts; q++) {
          const r = this.placeSegment(
            s,
            k,
            ax + ((bx - ax) * q) / parts,
            ay + ((by - ay) * q) / parts,
            ax + ((bx - ax) * (q + 1)) / parts,
            ay + ((by - ay) * (q + 1)) / parts,
          );
          if (r < 0) return made;
          made += r;
        }
      }
      return made;
    }
    return this.placePoint(s, k, pts[0] as number, pts[1] as number, Number.isFinite(rotation) ? rotation : 0)
      ? 1
      : 0;
  }

  private canClaim(s: SimState, c: number): boolean {
    return s.terrainWalk[c] === 1 && s.structAt[c] === -1;
  }

  /** One line segment; returns 1 placed, 0 skipped (no free cell), -1 out of budget or slots. */
  private placeSegment(s: SimState, k: number, ax: number, ay: number, bx: number, by: number): number {
    const lenM = Math.max(s.cellM, Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)));
    s.eco.quote(k, (SPEC[k] as (typeof SPEC)[number]).cost, lenM);
    if (!s.eco.canPayQuote(s.counters.budget)) return -1;
    const m = rasterLine(s, ax, ay, bx, by, this.tmp);
    let free = 0;
    for (let q = 0; q < m; q++) {
      const c = this.tmp[q] as number;
      if (this.canClaim(s, c) && free < MAX_CELLS) this.tmp[free++] = c;
    }
    if (free === 0) return 0;
    return this.placeRun(s, k, ax, ay, bx, by, free);
  }

  /**
   * Line edge crossing buildings, water or other structures: rasterized as a whole, each run of free cells is
   * built in pieces of at most segmentM, paid by its own length only; the obstacles close the gaps.
   * Returns structures placed, or -(placed + 1) when out of budget or slots.
   */
  private placeBlockedEdge(s: SimState, k: number, ax: number, ay: number, bx: number, by: number): number {
    const raster = this.edgeRaster(s);
    const m = rasterLine(s, ax, ay, bx, by, raster);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const pad = len > 0 ? s.cellM / 2 / len : 0;
    const chunk = Math.max(
      1,
      Math.min(MAX_CELLS, Math.floor((STRUCTURE_RULES.segmentM * m) / Math.max(len, s.cellM))),
    );
    let made = 0;
    let q = 0;
    while (q < m) {
      if (!this.canClaim(s, raster[q] as number)) {
        q++;
        continue;
      }
      let r = 0;
      while (q < m && r < chunk && this.canClaim(s, raster[q] as number))
        this.tmp[r++] = raster[q++] as number;
      // Piece ends: projections of its first and last cell centers onto the edge, widened by half a cell.
      let t0 = 0;
      let t1 = 1;
      if (len2 > 0) {
        t0 = Math.max(0, this.along(s, this.tmp[0] as number, ax, ay, dx, dy, len2) - pad);
        t1 = Math.min(1, this.along(s, this.tmp[r - 1] as number, ax, ay, dx, dy, len2) + pad);
      }
      if (this.placeRun(s, k, ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1, r) < 0)
        return -(made + 1);
      made++;
    }
    return made;
  }

  /** Projection parameter of cell c's center onto the edge (ax, ay) + t (dx, dy). */
  private along(
    s: SimState,
    c: number,
    ax: number,
    ay: number,
    dx: number,
    dy: number,
    len2: number,
  ): number {
    const n = s.n;
    const cx = ((c % n) + 0.5) * s.cellM;
    const cy = (Math.floor(c / n) + 0.5) * s.cellM;
    return ((cx - ax) * dx + (cy - ay) * dy) / len2;
  }

  /** True if every raster cell of the edge is walkable terrain and not taken by an older structure. */
  private edgeClear(s: SimState, ax: number, ay: number, bx: number, by: number, firstId: number): boolean {
    const raster = this.edgeRaster(s);
    const m = rasterLine(s, ax, ay, bx, by, raster);
    for (let q = 0; q < m; q++) {
      const c = raster[q] as number;
      if (!s.terrainWalk[c]) return false;
      const o = s.structAt[c] as number;
      if (o >= 0 && (this.id[o] as number) < firstId) return false;
    }
    return true;
  }

  /** Scratch for whole line edges (up to 2n cells), sized on first use. */
  private edgeRaster(s: SimState): Int32Array {
    if (this.lineTmp.length < 2 * s.n + 2) this.lineTmp = new Int32Array(2 * s.n + 2);
    return this.lineTmp;
  }

  /** One structure from the free cells tmp[0..m) spanning (ax, ay)-(bx, by); 1 placed, -1 out of budget or slots. */
  private placeRun(
    s: SimState,
    k: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    m: number,
  ): number {
    const spec = SPEC[k] as (typeof SPEC)[number];
    const lenM = Math.max(s.cellM, Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)));
    const cost = s.eco.quote(k, spec.cost, lenM);
    if (!s.eco.canPayQuote(s.counters.budget)) return -1;
    const i = this.alloc();
    if (i < 0) return -1;
    s.counters.budget -= s.eco.payQuote();
    this.kind[i] = k;
    this.setShape(i, ax, ay, bx, by, 0);
    this.lengthM[i] = lenM;
    this.cost[i] = cost;
    this.maxHp[i] = spec.hp * lenM;
    this.hp[i] = this.maxHp[i] as number;
    this.buildS[i] = spec.buildS * lenM;
    claimCells(s, this, i, Math.min(m, MAX_CELLS));
    this.version++;
    return 1;
  }

  private placePoint(s: SimState, k: number, x: number, y: number, rot: number): boolean {
    const spec = SPEC[k] as (typeof SPEC)[number];
    const cost = s.eco.quote(k, spec.cost, 1);
    if (!s.eco.canPayQuote(s.counters.budget)) return false;
    const c0 = s.cellOf(x, y);
    if (!s.terrainWalk[c0]) return false;
    let m = 0;
    if (k === SK.gate) {
      const a = unitsFromRad(rot);
      const hx = (cosU(a) * spec.sizeM) / 2;
      const hy = (sinU(a) * spec.sizeM) / 2;
      m = rasterLine(s, x - hx, y - hy, x + hx, y + hy, this.tmp);
    } else if (!POINTLESS(k)) m = rasterDisc(s, x, y, spec.sizeM, this.tmp);
    for (let q = 0; q < m; q++) if (!this.canClaim(s, this.tmp[q] as number)) return false;
    if (m > MAX_CELLS) return false;
    const i = this.alloc();
    if (i < 0) return false;
    s.counters.budget -= s.eco.payQuote();
    this.kind[i] = k;
    this.setShape(i, x, y, x, y, rot);
    this.lengthM[i] = k === SK.gate ? spec.sizeM : 2 * spec.sizeM;
    this.cost[i] = cost;
    this.maxHp[i] = spec.hp;
    this.hp[i] = spec.hp;
    this.buildS[i] = spec.buildS;
    if (POINTLESS(k)) claimPointCells(s, this, i, x, y);
    else claimCells(s, this, i, m);
    this.version++;
    return true;
  }

  private setShape(i: number, ax: number, ay: number, bx: number, by: number, rot: number): void {
    const b = i * 4;
    this.shape[b] = ax;
    this.shape[b + 1] = ay;
    this.shape[b + 2] = bx;
    this.shape[b + 3] = by;
    this.rotation[i] = rot;
    this.cx[i] = (ax + bx) / 2;
    this.cy[i] = (ay + by) / 2;
  }

  /** Applies (on) or lifts (off) the blocking/slowing effect of a finished structure. */
  applyFootprint(s: SimState, i: number, on: boolean, tick: number): void {
    const k = this.kind[i] as number;
    if (POINTLESS(k)) return;
    const base = i * MAX_CELLS;
    const m = this.cellCount[i] as number;
    let changed = false;
    for (let q = 0; q < m; q++) {
      const c = this.cells[base + q] as number;
      const t = s.terrainWalk[c] as number;
      if (k === SK.wire) s.slowAt[c] = on ? STRUCTURES.wire.slow : 0;
      else if (k === SK.gate) {
        s.zombieWalk[c] = on ? 0 : t;
        s.civWalk[c] = on && !this.flag[i] ? 0 : t;
        changed = true;
      } else if (SK_BLOCKS[k]) {
        s.walkable[c] = on ? 0 : t;
        s.civWalk[c] = on ? 0 : t;
        s.zombieWalk[c] = on ? 0 : t;
        changed = true;
      }
    }
    if (changed) {
      this.pathVersion++;
      this.pathChangedAt = tick;
      if (on) this.evictPending = true;
    }
  }

  /** Gate opened or closed: humans pass only while open. */
  setGate(s: SimState, i: number, open: boolean): void {
    if ((this.flag[i] === 1) === open) return;
    this.flag[i] = open ? 1 : 0;
    const base = i * MAX_CELLS;
    for (let q = 0; q < (this.cellCount[i] as number); q++) {
      const c = this.cells[base + q] as number;
      s.civWalk[c] = open ? (s.terrainWalk[c] as number) : 0;
    }
    this.version++;
  }

  /** Marks i destroyed (rubble until rubbleS passes). */
  destroy(s: SimState, i: number, tick: number): void {
    if (!this.alive[i] || this.state[i] === SS_DESTROYED) return;
    if (this.state[i] === SS_DONE) this.applyFootprint(s, i, false, tick);
    this.state[i] = SS_DESTROYED;
    this.until[i] = tick;
    this.hp[i] = 0;
    this.flag[i] = 0;
    this.version++;
  }

  /** Frees slot i and its cells. */
  remove(s: SimState, i: number, tick: number): void {
    if (!this.alive[i]) return;
    if (this.state[i] === SS_DONE) this.applyFootprint(s, i, false, tick);
    if (!POINTLESS(this.kind[i] as number)) {
      const base = i * MAX_CELLS;
      for (let q = 0; q < (this.cellCount[i] as number); q++) {
        const c = this.cells[base + q] as number;
        if (s.structAt[c] === i) s.structAt[c] = -1;
      }
    }
    this.alive[i] = 0;
    this.cellCount[i] = 0;
    this.ringCount[i] = 0;
    this.version++;
  }

  /** DemolishStructure: partial refund unless destroyed. */
  demolish(s: SimState, id: number, tick: number): boolean {
    const i = this.slotOfId(id);
    if (i < 0) return false;
    if (this.state[i] !== SS_DESTROYED)
      s.counters.budget += Math.floor((this.cost[i] as number) * STRUCTURE_RULES.demolishRefund);
    this.remove(s, i, tick);
    return true;
  }

  /** Damage with armor; destroys at 0 HP. */
  damage(s: SimState, i: number, amount: number, tick: number): void {
    if (!this.alive[i] || this.state[i] === SS_DESTROYED) return;
    const hp = (this.hp[i] as number) - amount * (1 - (SK_ARMOR[this.kind[i] as number] as number));
    this.hp[i] = hp;
    if (hp > 0) return;
    // Destroyed by damage (not by own charges): the debrief's first wall lost.
    if (SK_BLOCKS[this.kind[i] as number] || this.kind[i] === SK.gate)
      s.stats.wallLost(s, this.cx[i] as number, this.cy[i] as number, tick);
    this.destroy(s, i, tick);
  }

  /** Charges (destroysStructures): structures whose center is within r (+ half their length) are destroyed. */
  blast(s: SimState, x: number, y: number, r: number, source: number): void {
    for (let i = 0; i < this.highWater; i++) {
      if (!this.alive[i] || i === source || this.state[i] === SS_DESTROYED) continue;
      const dx = (this.cx[i] as number) - x;
      const dy = (this.cy[i] as number) - y;
      const reach = r + (this.lengthM[i] as number) / 2;
      if (dx * dx + dy * dy <= reach * reach) this.destroy(s, i, s.tick);
    }
  }

  /** Nearest finished structure of `kind` within r, or -1. */
  nearestDone(_s: SimState, kind: StructureKind, x: number, y: number, r: number): number {
    const k = SK[kind];
    let best = -1;
    let bestD = r * r;
    for (let i = 0; i < this.highWater; i++) {
      if (!this.alive[i] || this.kind[i] !== k || this.state[i] !== SS_DONE) continue;
      const dx = (this.cx[i] as number) - x;
      const dy = (this.cy[i] as number) - y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  cellsOf(i: number): Int32Array {
    return this.cells.subarray(i * MAX_CELLS, i * MAX_CELLS + (this.cellCount[i] as number));
  }

  ringOf(i: number): Int32Array {
    return this.ring.subarray(i * MAX_RING, i * MAX_RING + (this.ringCount[i] as number));
  }

  /** Removes mine charge q (swap with last). */
  dropCell(i: number, q: number): void {
    const base = i * MAX_CELLS;
    const last = (this.cellCount[i] as number) - 1;
    this.cells[base + q] = this.cells[base + last] as number;
    this.cellCount[i] = last;
  }

  views(): StructureView[] {
    const out: StructureView[] = [];
    for (let i = 0; i < this.highWater; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i] as number;
      const b = i * 4;
      const spec = SPEC[k] as (typeof SPEC)[number];
      out.push({
        id: this.id[i] as number,
        kind: STRUCTURE_KINDS[k] as StructureKind,
        shape: spec.line
          ? [
              this.shape[b] as number,
              this.shape[b + 1] as number,
              this.shape[b + 2] as number,
              this.shape[b + 3] as number,
            ]
          : [this.shape[b] as number, this.shape[b + 1] as number],
        rotation: this.rotation[i] as number,
        hp: Math.max(0, this.hp[i] as number),
        maxHp: this.maxHp[i] as number,
        state: STATES[this.state[i] as number] as StructureState,
        progress: this.progress[i] as number,
        flag: this.flag[i] === 1,
      });
    }
    return out;
  }

  hashArrays(): ArrayBufferView[] {
    const hw = this.highWater;
    return [
      this.alive.subarray(0, hw),
      this.id.subarray(0, hw),
      this.kind.subarray(0, hw),
      this.state.subarray(0, hw),
      this.hp.subarray(0, hw),
      this.progress.subarray(0, hw),
      this.flag.subarray(0, hw),
      this.cellCount.subarray(0, hw),
      this.until.subarray(0, hw),
      this.cells.subarray(0, hw * MAX_CELLS),
    ];
  }

  hashValues(): number[] {
    return [this.highWater, this.nextId, this.pathVersion, this.pathChangedAt, this.pathHandled];
  }
}
