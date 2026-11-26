// Player zones (GDD 7): safe zones with capacity from building area, rally points, corridors. Fixed slots,
// typed arrays; cell lookups for sheltering, a corridor mask for the safety field and a coarse guidance mask.
import { CELL_SIZE_M, TERRAIN } from '../../core/types/map';
import type { ZoneKind, ZoneView } from '../../core/types/zones';
import { SAFETY_FIELD, ZONES } from '../../data/agents/civilians';
import type { SimState } from '../state';
import { CS_ALERTED, CS_PANIC, CS_SHELTERED } from './civilian-traits';
import { forCellsNearPolyline, rectDist2 } from './zone-geometry';

export const ZK_NONE = 0;
export const ZK_SAFE = 1;
export const ZK_CORRIDOR = 2;
export const ZK_RALLY = 3;
const KIND_NAMES: ZoneKind[] = ['safeZone', 'safeZone', 'corridor', 'rallyPoint'];
const MAX = ZONES.maxZones;
const STRIDE = 2 * ZONES.maxCorridorPoints;

export class Zones {
  readonly kind = new Uint8Array(MAX);
  readonly id = new Int32Array(MAX);
  readonly capacity = new Int32Array(MAX);
  readonly occupants = new Int32Array(MAX);
  readonly breached = new Uint8Array(MAX);
  /** Shape floats per slot (rect x0,y0,x1,y1 / rally x,y / corridor polyline). */
  readonly shape = new Float32Array(MAX * STRIDE);
  readonly shapeLen = new Uint16Array(MAX);
  /** Per map cell: shelter zone slot (safe zone or rally point), -1 none. */
  readonly zoneOfCell: Int8Array;
  /** Per map cell: 1 on a corridor. */
  readonly corridor: Uint8Array;
  /** Per coarse cell: 1 where civilians know the way (near an open zone or a corridor). */
  readonly guided: Uint8Array;
  nextId = 1;
  /** Bumped on every visible change (published to the host). */
  version = 0;
  /** Bumped when the set of open goals or the corridor mask changes (safety field restarts). */
  goalsVersion = 0;
  private occupantsDirty = false;

  hashValues(): number[] {
    return [this.nextId, this.version, this.goalsVersion, this.occupantsDirty ? 1 : 0];
  }

  hashArrays(): ArrayBufferView[] {
    return [this.kind, this.id, this.capacity, this.occupants, this.breached, this.shape, this.shapeLen];
  }

  constructor(
    private readonly n: number,
    private readonly coarseSide: number,
    private readonly coarseM: number,
  ) {
    this.zoneOfCell = new Int8Array(n * n).fill(-1);
    this.corridor = new Uint8Array(n * n);
    this.guided = new Uint8Array(coarseSide * coarseSide);
  }

  isOpen(z: number): boolean {
    const k = this.kind[z] as number;
    return (
      (k === ZK_SAFE || k === ZK_RALLY) &&
      !this.breached[z] &&
      (this.occupants[z] as number) < (this.capacity[z] as number)
    );
  }

  /** Adds a zone; returns its id or -1 (no free slot or degenerate shape). */
  add(s: SimState, kind: number, pts: readonly number[]): number {
    const z = this.kind.indexOf(ZK_NONE);
    if (z < 0 || !pts.every(Number.isFinite)) return -1;
    const lim = s.sizeM;
    const clamp = (v: number): number => Math.min(Math.max(v, 0), lim);
    const base = z * STRIDE;
    let len = 0;
    if (kind === ZK_SAFE) {
      const [a = 0, b = 0, c = 0, d = 0] = pts;
      const x0 = clamp(Math.min(a, c));
      const x1 = clamp(Math.max(a, c));
      const y0 = clamp(Math.min(b, d));
      const y1 = clamp(Math.max(b, d));
      if (x1 - x0 < CELL_SIZE_M || y1 - y0 < CELL_SIZE_M) return -1;
      this.shape.set([x0, y0, x1, y1], base);
      len = 4;
    } else if (kind === ZK_RALLY) {
      this.shape.set([clamp(pts[0] ?? 0), clamp(pts[1] ?? 0)], base);
      len = 2;
    } else {
      const all = Math.floor(pts.length / 2);
      const k = Math.min(all, ZONES.maxCorridorPoints);
      if (k < 2) return -1;
      // Too many points: keep the first k - 1 and the end point (the goal of the corridor).
      for (let i = 0; i < 2 * (k - 1); i++) this.shape[base + i] = clamp(pts[i] as number);
      this.shape[base + 2 * k - 2] = clamp(pts[2 * all - 2] as number);
      this.shape[base + 2 * k - 1] = clamp(pts[2 * all - 1] as number);
      len = 2 * k;
    }
    this.kind[z] = kind;
    this.shapeLen[z] = len;
    this.id[z] = this.nextId++;
    this.breached[z] = 0;
    this.occupants[z] = 0;
    this.capacity[z] =
      kind === ZK_SAFE ? this.safeCapacity(s, z) : kind === ZK_RALLY ? ZONES.rallyPointCapacity : 0;
    this.rebuild();
    return this.id[z] as number;
  }

  /** Removes a zone by id; sheltered civilians in it become alerted again. */
  remove(s: SimState, id: number): boolean {
    const z = this.id.indexOf(id);
    if (z < 0 || this.kind[z] === ZK_NONE) return false;
    this.releaseOccupants(s, z, -1);
    this.kind[z] = ZK_NONE;
    this.id[z] = 0;
    this.rebuild();
    return true;
  }

  /** Shelters civilian i if its cell lies in an open zone. */
  tryShelter(s: SimState, i: number, cell: number): boolean {
    const z = this.zoneOfCell[cell] as number;
    if (z < 0 || !this.isOpen(z)) return false;
    s.civilians.kind[i] = CS_SHELTERED;
    s.ct.zone[i] = z;
    this.occupants[z] = (this.occupants[z] as number) + 1;
    s.counters.sheltered++;
    this.occupantsDirty = true;
    if (!this.isOpen(z)) this.rebuild();
    return true;
  }

  /** A sheltered civilian leaves zone z (killed or turned). */
  leave(s: SimState, z: number): void {
    const wasOpen = this.isOpen(z);
    this.occupants[z] = (this.occupants[z] as number) - 1;
    s.counters.sheltered--;
    this.occupantsDirty = true;
    if (!wasOpen && this.isOpen(z)) this.rebuild();
  }

  /** An infected civilian turned inside zone z: the outbreak breaks out inside, everyone there panics. */
  breach(s: SimState, z: number): void {
    if (this.breached[z]) return;
    this.breached[z] = 1;
    this.releaseOccupants(s, z, CS_PANIC);
    this.rebuild();
  }

  /** Walkable cells of open zones into `out`; returns the count. */
  goalCells(s: SimState, out: Int32Array): number {
    let k = 0;
    const zc = this.zoneOfCell;
    for (let c = 0; c < zc.length; c++) {
      const z = zc[c] as number;
      if (z >= 0 && s.walkable[c] && this.isOpen(z)) out[k++] = c;
    }
    return k;
  }

  /** Publishes occupant changes at most every occupantsPublishTicks. */
  publish(tick: number): void {
    if (this.occupantsDirty && tick % ZONES.occupantsPublishTicks === 0) {
      this.occupantsDirty = false;
      this.version++;
    }
  }

  views(): ZoneView[] {
    const out: ZoneView[] = [];
    for (let z = 0; z < MAX; z++) {
      const k = this.kind[z] as number;
      if (k === ZK_NONE) continue;
      const base = z * STRIDE;
      out.push({
        id: this.id[z] as number,
        kind: KIND_NAMES[k] as ZoneKind,
        shape: Array.from(this.shape.subarray(base, base + (this.shapeLen[z] as number))),
        capacity: this.capacity[z] as number,
        occupants: this.occupants[z] as number,
        breached: this.breached[z] === 1,
      });
    }
    return out;
  }

  private releaseOccupants(s: SimState, z: number, mood: number): void {
    const c = s.civilians;
    for (let i = 0; i < c.highWater; i++) {
      if (!c.alive[i] || s.ct.zone[i] !== z) continue;
      s.ct.zone[i] = -1;
      c.kind[i] = mood >= 0 ? mood : CS_ALERTED;
      if (mood === CS_PANIC) s.ct.panic[i] = 1;
      s.counters.sheltered--;
    }
    this.occupants[z] = 0;
  }

  private safeCapacity(s: SimState, z: number): number {
    const b = z * STRIDE;
    let buildingCells = 0;
    this.forRectCells(b, (c) => {
      if (s.map.terrain[c] === TERRAIN.building) buildingCells++;
    });
    const m2 = buildingCells * CELL_SIZE_M * CELL_SIZE_M;
    return Math.max(ZONES.safeZoneMinCapacity, Math.floor(m2 * ZONES.safeZoneCapacityPerM2));
  }

  private forRectCells(base: number, visit: (c: number) => void): void {
    const n = this.n;
    const sh = this.shape;
    const x0 = Math.floor((sh[base] as number) / CELL_SIZE_M);
    const y0 = Math.floor((sh[base + 1] as number) / CELL_SIZE_M);
    const x1 = Math.min(n - 1, Math.ceil((sh[base + 2] as number) / CELL_SIZE_M) - 1);
    const y1 = Math.min(n - 1, Math.ceil((sh[base + 3] as number) / CELL_SIZE_M) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit(y * n + x);
  }

  /** Rebuilds cell lookups, corridor mask and guidance mask after any zone change. */
  private rebuild(): void {
    const { n, zoneOfCell, corridor, guided, coarseSide: cs, coarseM: cm } = this;
    zoneOfCell.fill(-1);
    corridor.fill(0);
    guided.fill(0);
    const zoneR = SAFETY_FIELD.zoneGuidanceRangeM;
    for (let z = 0; z < MAX; z++) {
      const k = this.kind[z] as number;
      const base = z * STRIDE;
      const sh = this.shape;
      if (k === ZK_SAFE) {
        this.forRectCells(base, (c) => {
          if (zoneOfCell[c] === -1) zoneOfCell[c] = z;
        });
      } else if (k === ZK_RALLY) {
        forCellsNearPolyline(sh, base, 2, ZONES.rallyPointRadiusM, n, CELL_SIZE_M, (c) => {
          if (zoneOfCell[c] === -1) zoneOfCell[c] = z;
        });
      } else if (k === ZK_CORRIDOR) {
        const len = this.shapeLen[z] as number;
        forCellsNearPolyline(sh, base, len, SAFETY_FIELD.corridorWidthM / 2, n, CELL_SIZE_M, (c) => {
          corridor[c] = 1;
        });
        forCellsNearPolyline(sh, base, len, SAFETY_FIELD.corridorGuidanceRangeM, cs, cm, (c) => {
          guided[c] = 1;
        });
      }
      if (!this.isOpen(z)) continue;
      // Guidance around open shelters.
      const r2 = zoneR * zoneR;
      const x0 = sh[base] as number;
      const y0 = sh[base + 1] as number;
      const x1 = k === ZK_SAFE ? (sh[base + 2] as number) : x0;
      const y1 = k === ZK_SAFE ? (sh[base + 3] as number) : y0;
      for (let gy = 0; gy < cs; gy++)
        for (let gx = 0; gx < cs; gx++)
          if (rectDist2((gx + 0.5) * cm, (gy + 0.5) * cm, x0, y0, x1, y1) <= r2) guided[gy * cs + gx] = 1;
    }
    this.goalsVersion++;
    this.version++;
  }
}
