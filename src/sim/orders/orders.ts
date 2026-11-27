// Orders (decision 2026-11-27: no RTS). Squads are bought into a reserve; an order requests squads per type and
// owns a fixed list of posts ("slots"), each with a unit type, a post point and, for garrisons, a building. The
// reserve fills free slots (order-system.ts), losses free their slot again. Fixed-size SoA, no Maps.
import type { SquadRequest, Stance, UnitTypeId } from '../../core/commands';
import { TERRAIN } from '../../core/types/map';
import { GARRISON, ORDER_LIMITS, ORDER_RULES } from '../../data/orders';
import { UNIT_TYPE_ORDER } from '../../data/units/present';
import { MV_ORDER, setGoal } from '../combat/unit-move';
import { ST_HOLD, STANCES, US_EN_ROUTE, US_FREE, US_IDLE, US_RETURNING } from '../combat/units';
import { nearestCell } from '../map/grid';
import { cosU, sinU } from '../math/trig';
import type { SimState } from '../state';
import { buildingCapacity, leaveBuilding } from './garrison';

export const OK_LINE = 0;
export const OK_ZONE = 1;
export const OK_BUILDING = 2;
export const OS_PENDING = 0;
export const OS_ACTIVE = 1;
export const OS_FAILING = 2;
export const OS_LOST = 3;

const NT = UNIT_TYPE_ORDER.length;
const MAX = ORDER_LIMITS.maxOrders;
const SLOTS = ORDER_LIMITS.maxSquadsPerOrder;
const PTS = ORDER_LIMITS.maxLinePoints;
const GARRISON_TYPE = Uint8Array.from(UNIT_TYPE_ORDER, (t) => (GARRISON.types.includes(t) ? 1 : 0));
/** Angle units per full turn (math/trig). */
const TURN = 4096;

/** Request per type index from a command payload: integers >= 0, total clamped to the slot limit. */
export function parseRequest(req: unknown): Uint8Array {
  const out = new Uint8Array(NT);
  if (!req || typeof req !== 'object') return out;
  let total = 0;
  for (let t = 0; t < NT; t++) {
    const v = (req as SquadRequest)[UNIT_TYPE_ORDER[t] as UnitTypeId];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    const k = Math.min(Math.floor(v), SLOTS - total);
    out[t] = k;
    total += k;
  }
  return out;
}

export function parseStance(st: unknown): number {
  const k = STANCES.indexOf(st as Stance);
  return k < 0 ? ST_HOLD : k;
}

export class Orders {
  readonly alive = new Uint8Array(MAX);
  readonly id = new Int32Array(MAX);
  readonly kind = new Uint8Array(MAX);
  readonly stance = new Uint8Array(MAX);
  readonly status = new Uint8Array(MAX);
  /** 1 once every requested squad stood in position. */
  readonly wasActive = new Uint8Array(MAX);
  /** occupyBuilding: 1 after the building fell. */
  readonly lost = new Uint8Array(MAX);
  readonly building = new Int32Array(MAX).fill(-1);
  /** defendLine: points (x, y) flat; holdZone: x0, y0, x1, y1; occupyBuilding: building centre. */
  readonly shape = new Float32Array(MAX * PTS * 2);
  readonly shapeLen = new Uint8Array(MAX);
  readonly request = new Uint8Array(MAX * NT);
  /** defendLine: +1 enemy on the left normal of the first-to-last direction, -1 on the right. */
  readonly side = new Int8Array(MAX);
  /** Cached counts for status and views. */
  readonly assignedN = new Uint8Array(MAX);
  readonly inPosN = new Uint8Array(MAX);
  /** Posts: type index (-1 none), building (-1 open ground), post point, approach point, unit (-1 free). */
  readonly slotCount = new Uint8Array(MAX);
  readonly slotType = new Int8Array(MAX * SLOTS).fill(-1);
  readonly slotBld = new Int32Array(MAX * SLOTS).fill(-1);
  readonly slotX = new Float32Array(MAX * SLOTS);
  readonly slotY = new Float32Array(MAX * SLOTS);
  readonly slotAX = new Float32Array(MAX * SLOTS);
  readonly slotAY = new Float32Array(MAX * SLOTS);
  readonly slotUnit = new Int32Array(MAX * SLOTS).fill(-1);
  /** Per city building: integrity 0..1, squads inside, last pressure tick. */
  readonly integrity: Float32Array;
  readonly garrisonCount: Uint8Array;
  readonly pressedAt: Int32Array;
  highWater = 0;
  nextId = 1;
  /** Bumped on every change visible in orders(). */
  version = 0;
  readonly slots = SLOTS;
  /** Scratch: assignable reserve squads per type in the current pass. */
  readonly avail = new Int32Array(NT);

  constructor(buildings: number) {
    this.integrity = new Float32Array(buildings).fill(1);
    this.garrisonCount = new Uint8Array(buildings);
    this.pressedAt = new Int32Array(buildings).fill(-1);
  }

  /** Order slot with this id, or -1. */
  find(id: unknown): number {
    if (!Number.isInteger(id)) return -1;
    for (let o = 0; o < this.highWater; o++) if (this.alive[o] && this.id[o] === id) return o;
    return -1;
  }

  /** Opens an order; the caller writes the shape and plans the posts. Returns the slot or -1 (full). */
  open(kind: number, request: Uint8Array, stance: number): number {
    let o = 0;
    while (o < MAX && this.alive[o]) o++;
    if (o >= MAX) return -1;
    this.alive[o] = 1;
    this.id[o] = this.nextId++;
    this.kind[o] = kind;
    this.stance[o] = stance;
    this.status[o] = OS_PENDING;
    this.wasActive[o] = 0;
    this.lost[o] = 0;
    this.building[o] = -1;
    this.shapeLen[o] = 0;
    this.side[o] = 1;
    this.assignedN[o] = 0;
    this.inPosN[o] = 0;
    this.request.set(request, o * NT);
    this.slotCount[o] = 0;
    this.slotUnit.fill(-1, o * SLOTS, (o + 1) * SLOTS);
    this.slotType.fill(-1, o * SLOTS, (o + 1) * SLOTS);
    this.slotBld.fill(-1, o * SLOTS, (o + 1) * SLOTS);
    this.highWater = Math.max(this.highWater, o + 1);
    this.version++;
    return o;
  }

  close(s: SimState, o: number): void {
    for (let k = 0; k < SLOTS; k++) {
      const u = this.slotUnit[o * SLOTS + k] as number;
      if (u >= 0) this.release(s, u);
    }
    this.alive[o] = 0;
    while (this.highWater > 0 && !this.alive[this.highWater - 1]) this.highWater--;
    this.version++;
  }

  /** Squad u leaves its order and walks back to the reserve (its placement point). */
  release(s: SimState, u: number): void {
    const U = s.units;
    this.unslot(s, u);
    if ((U.garrison[u] as number) >= 0) leaveBuilding(s, u);
    U.ostate[u] = US_RETURNING;
    U.stance[u] = ST_HOLD;
    U.wpCount[u] = 0;
    setGoal(s, u, U.homeX[u] as number, U.homeY[u] as number, MV_ORDER);
    this.version++;
  }

  /** Direct move (MoveUnits): squad u is taken off its order and stays where it is sent. */
  detach(s: SimState, u: number): void {
    const U = s.units;
    if ((U.order[u] as number) < 0 && U.ostate[u] !== US_RETURNING && U.ostate[u] !== US_IDLE) return;
    this.unslot(s, u);
    U.ostate[u] = US_FREE;
    this.version++;
  }

  /** Bookkeeping when squad u dies or is removed. */
  unitGone(s: SimState, u: number): void {
    const U = s.units;
    this.unslot(s, u);
    const b = U.garrison[u] as number;
    if (b >= 0) {
      this.garrisonCount[b] = Math.max(0, (this.garrisonCount[b] as number) - 1);
      U.garrison[u] = -1;
    }
    U.ostate[u] = US_IDLE;
    this.version++;
  }

  private unslot(s: SimState, u: number): void {
    const U = s.units;
    const o = U.order[u] as number;
    if (o < 0) return;
    const k = o * SLOTS + (U.post[u] as number);
    if (this.slotUnit[k] === u) this.slotUnit[k] = -1;
    U.order[u] = -1;
  }

  /** Puts squad u on post k of order o and sends it there. */
  assign(s: SimState, o: number, k: number, u: number): void {
    const U = s.units;
    this.slotUnit[o * SLOTS + k] = u;
    U.order[u] = o;
    U.post[u] = k;
    U.stance[u] = this.stance[o] as number;
    U.wpCount[u] = 0;
    this.send(s, u);
    this.version++;
  }

  /** Sends assigned squad u to the approach point of its post. */
  send(s: SimState, u: number): void {
    const U = s.units;
    const k = (U.order[u] as number) * SLOTS + (U.post[u] as number);
    U.ostate[u] = US_EN_ROUTE;
    U.retryAt[u] = s.tick + ORDER_RULES.retryTicks;
    setGoal(s, u, this.slotAX[k] as number, this.slotAY[k] as number, MV_ORDER);
  }

  /** Building b fell: occupyBuilding orders on it are lost, holdZone orders re-plan without it. */
  garrisonLost(s: SimState, b: number): void {
    for (let o = 0; o < this.highWater; o++) {
      if (!this.alive[o]) continue;
      let uses = false;
      for (let k = 0; k < (this.slotCount[o] as number); k++)
        if (this.slotBld[o * SLOTS + k] === b) uses = true;
      if (!uses) continue;
      if (this.kind[o] === OK_BUILDING) {
        this.lost[o] = 1;
        for (let k = 0; k < SLOTS; k++) {
          const u = this.slotUnit[o * SLOTS + k] as number;
          if (u >= 0) this.release(s, u);
        }
      } else plan(s, o);
      this.version++;
    }
  }

  hashArrays(): ArrayBufferView[] {
    return [
      this.alive,
      this.id,
      this.kind,
      this.stance,
      this.status,
      this.wasActive,
      this.lost,
      this.building,
      this.shape,
      this.shapeLen,
      this.request,
      this.side,
      this.assignedN,
      this.inPosN,
      this.slotCount,
      this.slotType,
      this.slotBld,
      this.slotX,
      this.slotY,
      this.slotAX,
      this.slotAY,
      this.slotUnit,
      this.integrity,
      this.garrisonCount,
    ];
  }

  hashValues(): number[] {
    return [this.highWater, this.nextId];
  }
}

/** Slot types for a request, interleaved so that every type spreads over the posts. */
function slotTypes(req: Uint8Array, base: number): number[] {
  const keys: { t: number; f: number }[] = [];
  for (let t = 0; t < NT; t++) {
    const c = req[base + t] as number;
    for (let k = 0; k < c; k++) keys.push({ t, f: (k + 0.5) / c });
  }
  keys.sort((a, b) => a.f - b.f || a.t - b.t);
  return keys.map((k) => k.t);
}

/** Centre of the nearest walkable cell (unit pathing) to (x, y); (x, y) itself if none. */
function snap(s: SimState, x: number, y: number): [number, number] {
  const n = s.n;
  const c0 = s.cellOf(x, y);
  const c = nearestCell(n, c0 % n, Math.floor(c0 / n), (i) => s.walkable[i] === 1);
  if (c < 0) return [x, y];
  return [((c % n) + 0.5) * s.cellM, (Math.floor(c / n) + 0.5) * s.cellM];
}

function setSlot(
  O: Orders,
  k: number,
  t: number,
  b: number,
  x: number,
  y: number,
  ax: number,
  ay: number,
): void {
  O.slotType[k] = t;
  O.slotBld[k] = b;
  O.slotX[k] = Math.fround(x);
  O.slotY[k] = Math.fround(y);
  O.slotAX[k] = Math.fround(ax);
  O.slotAY[k] = Math.fround(ay);
}

/** Line length and the point at arc length `at`, offset by `off` along the segment's left normal. */
function linePoint(O: Orders, o: number, at: number, off: number): [number, number] {
  const base = o * PTS * 2;
  const m = O.shapeLen[o] as number;
  let left = at;
  for (let i = 0; i + 1 < m; i++) {
    const ax = O.shape[base + 2 * i] as number;
    const ay = O.shape[base + 2 * i + 1] as number;
    const dx = (O.shape[base + 2 * i + 2] as number) - ax;
    const dy = (O.shape[base + 2 * i + 3] as number) - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= 0) continue;
    if (left <= len || i + 2 === m) {
      const f = Math.min(left, len) / len;
      return [ax + dx * f - (dy / len) * off, ay + dy * f + (dx / len) * off];
    }
    left -= len;
  }
  return [O.shape[base] as number, O.shape[base + 1] as number];
}

export function lineLength(O: Orders, o: number): number {
  const base = o * PTS * 2;
  let sum = 0;
  for (let i = 0; i + 1 < (O.shapeLen[o] as number); i++) {
    const dx = (O.shape[base + 2 * i + 2] as number) - (O.shape[base + 2 * i] as number);
    const dy = (O.shape[base + 2 * i + 3] as number) - (O.shape[base + 2 * i + 1] as number);
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum;
}

/** Garrison post k of cap in building b: interior point on an ellipse inside the footprint, door outside. */
function garrisonPost(s: SimState, b: number, k: number, cap: number): [number, number, number, number] {
  const B = s.map.buildings;
  const cm = s.cellM;
  const w = B.w[b] as number;
  const h = B.h[b] as number;
  const cx = ((B.x[b] as number) + w / 2) * cm;
  const cy = ((B.y[b] as number) + h / 2) * cm;
  const a = Math.floor((TURN * (2 * k + 1)) / (2 * cap));
  const x = cx + cosU(a) * Math.max(0, (w - 1) / 2) * cm;
  const y = cy + sinU(a) * Math.max(0, (h - 1) / 2) * cm;
  const [ax, ay] = snap(s, x, y);
  return [x, y, ax, ay];
}

/** Open-ground post k of m around building b, one cell outside its footprint. */
function aroundPost(s: SimState, b: number, k: number, m: number): [number, number] {
  const B = s.map.buildings;
  const cm = s.cellM;
  const w = B.w[b] as number;
  const h = B.h[b] as number;
  const a = Math.floor((TURN * (2 * k + 1)) / (2 * m)) + TURN / 8;
  const x = ((B.x[b] as number) + w / 2) * cm + cosU(a) * (w / 2 + 1.5) * cm;
  const y = ((B.y[b] as number) + h / 2) * cm + sinU(a) * (h / 2 + 1.5) * cm;
  return snap(s, x, y);
}

/** Buildings already held by garrison posts of other orders. */
export function heldElsewhere(O: Orders, o: number, b: number): boolean {
  for (let q = 0; q < O.highWater; q++) {
    if (q === o || !O.alive[q]) continue;
    for (let k = 0; k < (O.slotCount[q] as number); k++) if (O.slotBld[q * SLOTS + k] === b) return true;
  }
  return false;
}

/** holdZone: suitable buildings with centre in the zone, highest first (then larger, then by index). */
function zoneBuildings(s: SimState, o: number): number[] {
  const O = s.orders;
  const B = s.map.buildings;
  const cm = s.cellM;
  const base = o * PTS * 2;
  const x0 = O.shape[base] as number;
  const y0 = O.shape[base + 1] as number;
  const x1 = O.shape[base + 2] as number;
  const y1 = O.shape[base + 3] as number;
  const out: number[] = [];
  for (let b = 0; b < B.count; b++) {
    const cx = ((B.x[b] as number) + (B.w[b] as number) / 2) * cm;
    const cy = ((B.y[b] as number) + (B.h[b] as number) / 2) * cm;
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
    if ((O.integrity[b] as number) <= 0 || heldElsewhere(O, o, b)) continue;
    out.push(b);
  }
  const cells = (b: number) => (B.w[b] as number) * (B.h[b] as number);
  out.sort((a, b) => (B.floors[b] as number) - (B.floors[a] as number) || cells(b) - cells(a) || a - b);
  return out;
}

/** holdZone: m open posts spread over road cells in the zone (farthest-point sampling from the centre). */
function zonePosts(s: SimState, o: number, m: number): [number, number][] {
  if (m === 0) return [];
  const O = s.orders;
  const n = s.n;
  const cm = s.cellM;
  const base = o * PTS * 2;
  const gx0 = Math.max(0, Math.floor((O.shape[base] as number) / cm));
  const gy0 = Math.max(0, Math.floor((O.shape[base + 1] as number) / cm));
  const gx1 = Math.min(n - 1, Math.floor((O.shape[base + 2] as number) / cm));
  const gy1 = Math.min(n - 1, Math.floor((O.shape[base + 3] as number) / cm));
  const step = ORDER_RULES.zoneSampleCells;
  const roads: number[] = [];
  const open: number[] = [];
  for (let y = gy0; y <= gy1; y += step)
    for (let x = gx0; x <= gx1; x += step) {
      const c = y * n + x;
      if (!s.walkable[c]) continue;
      const t = s.map.terrain[c];
      (t === TERRAIN.road || t === TERRAIN.bridge ? roads : open).push(c);
    }
  const cand = roads.length > 0 ? roads : open;
  const mx = ((gx0 + gx1 + 1) / 2) * cm;
  const my = ((gy0 + gy1 + 1) / 2) * cm;
  if (cand.length === 0) {
    const p = snap(s, mx, my);
    return Array.from({ length: m }, () => p);
  }
  const px = cand.map((c) => ((c % n) + 0.5) * cm);
  const py = cand.map((c) => (Math.floor(c / n) + 0.5) * cm);
  const dist = new Float64Array(cand.length).fill(Number.POSITIVE_INFINITY);
  const out: [number, number][] = [];
  // First post: candidate nearest the centre.
  let pick = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cand.length; i++) {
    const d =
      ((px[i] as number) - mx) * ((px[i] as number) - mx) +
      ((py[i] as number) - my) * ((py[i] as number) - my);
    if (d < best) {
      best = d;
      pick = i;
    }
  }
  while (out.length < m) {
    out.push([px[pick] as number, py[pick] as number]);
    let next = pick;
    let far = -1;
    for (let i = 0; i < cand.length; i++) {
      const dx = (px[i] as number) - (px[pick] as number);
      const dy = (py[i] as number) - (py[pick] as number);
      dist[i] = Math.min(dist[i] as number, dx * dx + dy * dy);
      if ((dist[i] as number) > far) {
        far = dist[i] as number;
        next = i;
      }
    }
    pick = next;
  }
  return out;
}

/** Writes post positions of a line from its slot count and enemy side. */
function placeLine(s: SimState, o: number): void {
  const O = s.orders;
  const m = O.slotCount[o] as number;
  const len = lineLength(O, o);
  // Posts stand behind the line: away from the enemy side.
  const off = -(O.side[o] as number) * ORDER_RULES.lineBackoffM;
  for (let k = 0; k < m; k++) {
    const [x, y] = linePoint(O, o, (len * (k + 0.5)) / m, off);
    const [ax, ay] = snap(s, x, y);
    const i = o * SLOTS + k;
    setSlot(O, i, O.slotType[i] as number, -1, ax, ay, ax, ay);
  }
}

/**
 * (Re)plans the posts of order o from its request and re-slots the squads already assigned (same type, in post
 * order); squads without a post go back to the reserve, moved posts are walked to again.
 */
export function plan(s: SimState, o: number): void {
  const O = s.orders;
  const U = s.units;
  const base = o * SLOTS;
  const prevUnits: number[] = [];
  const prevBld: number[] = [];
  const prevX: number[] = [];
  const prevY: number[] = [];
  for (let k = 0; k < (O.slotCount[o] as number); k++) {
    const u = O.slotUnit[base + k] as number;
    if (u < 0) continue;
    prevUnits.push(u);
    prevBld.push(O.slotBld[base + k] as number);
    prevX.push(O.slotX[base + k] as number);
    prevY.push(O.slotY[base + k] as number);
  }
  const types = slotTypes(O.request, o * NT);
  O.slotType.fill(-1, base, base + SLOTS);
  O.slotBld.fill(-1, base, base + SLOTS);
  O.slotUnit.fill(-1, base, base + SLOTS);
  O.slotCount[o] = types.length;
  const kind = O.kind[o] as number;
  if (kind === OK_LINE) {
    for (let k = 0; k < types.length; k++) O.slotType[base + k] = types[k] as number;
    placeLine(s, o);
  } else {
    // Garrison posts first (types that fire from buildings), then open ground.
    const blds = kind === OK_BUILDING ? [O.building[o] as number] : zoneBuildings(s, o);
    let bi = 0;
    let used = 0;
    const openK: number[] = [];
    for (let k = 0; k < types.length; k++) {
      const t = types[k] as number;
      while (bi < blds.length && used >= buildingCapacity(s, blds[bi] as number)) {
        bi++;
        used = 0;
      }
      const b = blds[bi];
      if (GARRISON_TYPE[t] && b !== undefined && !O.lost[o] && (O.integrity[b] as number) > 0) {
        const [x, y, ax, ay] = garrisonPost(s, b, used, buildingCapacity(s, b));
        setSlot(O, base + k, t, b, x, y, ax, ay);
        used++;
      } else openK.push(k);
    }
    if (kind === OK_BUILDING) {
      const b = O.building[o] as number;
      openK.forEach((k, j) => {
        const [x, y] = aroundPost(s, b, j, openK.length);
        setSlot(O, base + k, types[k] as number, -1, x, y, x, y);
      });
    } else {
      const posts = zonePosts(s, o, openK.length);
      openK.forEach((k, j) => {
        const p = posts[j] as [number, number];
        setSlot(O, base + k, types[k] as number, -1, p[0], p[1], p[0], p[1]);
      });
    }
  }
  // Re-slot: same type, first free post; keep squads inside if their post is in the same building.
  for (let j = 0; j < prevUnits.length; j++) {
    const u = prevUnits[j] as number;
    const t = U.pool.kind[u] as number;
    let k = -1;
    for (let q = 0; q < types.length && k < 0; q++)
      if (O.slotType[base + q] === t && (O.slotUnit[base + q] as number) < 0) k = q;
    if (k < 0) {
      U.order[u] = -1;
      O.release(s, u);
      continue;
    }
    O.slotUnit[base + k] = u;
    U.post[u] = k;
    const same =
      O.slotBld[base + k] === prevBld[j] && O.slotX[base + k] === prevX[j] && O.slotY[base + k] === prevY[j];
    if (same) continue;
    if ((U.garrison[u] as number) >= 0) leaveBuilding(s, u);
    O.send(s, u);
  }
  O.version++;
}
