// Order system per tick (GDD 4 step 10, before unit movement): garrison pressure, squads walking to and holding
// their posts, holdUntilLosses releases, reserve assignment (nearest first), line facing, status. Commands
// DefendLine, HoldZone, OccupyBuilding, UpdateOrder, CancelOrder and the reserve purchase (PlaceUnit).
import type { Command, UnitTypeId } from '../../core/commands';
import type { GarrisonView, OrderKind, OrderView, ReserveView } from '../../core/types/orders';
import { ORDER_LIMITS, ORDER_RULES } from '../../data/orders';
import { UNIT_BEHAVIOUR, UNIT_TYPE_ORDER } from '../../data/units/present';
import { MV_NONE, MV_ORDER, MV_PURSUIT, setGoal } from '../combat/unit-move';
import {
  placeUnit,
  ST_AGGRESSIVE,
  ST_HOLD_UNTIL_LOSSES,
  ST_RETREAT,
  STANCES,
  US_EN_ROUTE,
  US_FREE,
  US_GARRISONED,
  US_IDLE,
  US_POSTED,
  US_RETURNING,
  UT_RANGE,
} from '../combat/units';
import { nearestCell } from '../map/grid';
import type { SimState } from '../state';
import { enterBuilding, garrisonPressure } from './garrison';
import {
  heldElsewhere,
  lineLength,
  OK_BUILDING,
  OK_LINE,
  OK_ZONE,
  OS_ACTIVE,
  OS_FAILING,
  OS_LOST,
  OS_PENDING,
  parseRequest,
  parseStance,
  plan,
} from './orders';

const NT = UNIT_TYPE_ORDER.length;
const PTS = ORDER_LIMITS.maxLinePoints;
const KINDS: readonly OrderKind[] = ['defendLine', 'holdZone', 'occupyBuilding'];
const STATUS: readonly OrderView['status'][] = ['pending', 'active', 'failing', 'lost'];

/**
 * PlaceUnit: buys a squad into the reserve. With an HQ it spawns on the nearest free walkable cell at the HQ,
 * without (free mode) at (x, y). Returns the slot or -1.
 */
export function buyUnit(s: SimState, type: UnitTypeId, x: number, y: number): number {
  const e = s.eco;
  if (e.hq < 0) return placeUnit(s, type, x, y);
  const n = s.n;
  const p = s.units.pool;
  const taken = new Set<number>();
  for (let u = 0; u < p.highWater; u++)
    if (p.alive[u]) taken.add(s.cellOf(s.units.homeX[u] as number, s.units.homeY[u] as number));
  const c0 = s.cellOf(e.hqX, e.hqY);
  const c = nearestCell(n, c0 % n, Math.floor(c0 / n), (i) => s.walkable[i] === 1 && !taken.has(i));
  if (c < 0) return -1;
  return placeUnit(s, type, ((c % n) + 0.5) * s.cellM, (Math.floor(c / n) + 0.5) * s.cellM);
}

const finite = (...v: unknown[]): boolean => v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Enemy side of a line: more zombies on one side, else away from the HQ (free mode: the map centre). */
function initialSide(s: SimState, o: number): void {
  const O = s.orders;
  const [mx, my, nx, ny] = lineFrame(s, o);
  const probe = ORDER_RULES.sideProbeM;
  const r = ORDER_RULES.sideProbeRadiusM;
  const plus = s.density.query(mx + nx * probe, my + ny * probe, r);
  const minus = s.density.query(mx - nx * probe, my - ny * probe, r);
  if (Math.abs(plus - minus) >= ORDER_RULES.sideFlipMin) {
    O.side[o] = plus > minus ? 1 : -1;
    return;
  }
  const hx = s.eco.hq >= 0 ? s.eco.hqX : s.sizeM / 2;
  const hy = s.eco.hq >= 0 ? s.eco.hqY : s.sizeM / 2;
  O.side[o] = (mx - hx) * nx + (my - hy) * ny >= 0 ? 1 : -1;
}

/** Midpoint of a line and the unit left normal of its first-to-last direction. */
function lineFrame(s: SimState, o: number): [number, number, number, number] {
  const O = s.orders;
  const base = o * PTS * 2;
  const m = O.shapeLen[o] as number;
  const ax = O.shape[base] as number;
  const ay = O.shape[base + 1] as number;
  const bx = O.shape[base + 2 * m - 2] as number;
  const by = O.shape[base + 2 * m - 1] as number;
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return [(ax + bx) / 2, (ay + by) / 2, -dy / d, dx / d];
}

/** DefendLine, HoldZone, OccupyBuilding, UpdateOrder, CancelOrder. Returns false for other commands. */
export function applyOrderCommand(s: SimState, cmd: Command): boolean {
  const O = s.orders;
  switch (cmd.type) {
    case 'DefendLine': {
      const pts = cmd.payload.points;
      if (!Array.isArray(pts)) return true;
      const xy: number[] = [];
      for (let i = 0; i + 1 < pts.length && xy.length < PTS * 2; i += 2) {
        if (!finite(pts[i], pts[i + 1])) return true;
        const x = Math.min(Math.max(pts[i] as number, 0), s.sizeM - 1e-3);
        const y = Math.min(Math.max(pts[i + 1] as number, 0), s.sizeM - 1e-3);
        const k = xy.length;
        if (k >= 2 && xy[k - 2] === x && xy[k - 1] === y) continue;
        xy.push(x, y);
      }
      if (xy.length < 4) return true;
      const o = O.open(OK_LINE, parseRequest(cmd.payload.squads), parseStance(cmd.payload.stance));
      if (o < 0) return true;
      O.shape.set(xy, o * PTS * 2);
      O.shapeLen[o] = xy.length / 2;
      if (lineLength(O, o) <= 0) {
        O.close(s, o);
        return true;
      }
      initialSide(s, o);
      plan(s, o);
      return true;
    }
    case 'HoldZone': {
      const { x0, y0, x1, y1 } = cmd.payload;
      if (!finite(x0, y0, x1, y1)) return true;
      const ax = Math.max(0, Math.min(x0, x1));
      const ay = Math.max(0, Math.min(y0, y1));
      const bx = Math.min(s.sizeM - 1e-3, Math.max(x0, x1));
      const by = Math.min(s.sizeM - 1e-3, Math.max(y0, y1));
      if (bx - ax < s.cellM || by - ay < s.cellM) return true;
      const o = O.open(OK_ZONE, parseRequest(cmd.payload.squads), parseStance(cmd.payload.stance));
      if (o < 0) return true;
      O.shape.set([ax, ay, bx, by], o * PTS * 2);
      O.shapeLen[o] = 2;
      plan(s, o);
      return true;
    }
    case 'OccupyBuilding': {
      const b = cmd.payload.buildingId;
      const B = s.map.buildings;
      if (!Number.isInteger(b) || b < 0 || b >= B.count) return true;
      if ((O.integrity[b] as number) <= 0 || heldElsewhere(O, -1, b)) return true;
      const o = O.open(OK_BUILDING, parseRequest(cmd.payload.squads), parseStance(cmd.payload.stance));
      if (o < 0) return true;
      O.building[o] = b;
      const cm = s.cellM;
      O.shape[o * PTS * 2] = ((B.x[b] as number) + (B.w[b] as number) / 2) * cm;
      O.shape[o * PTS * 2 + 1] = ((B.y[b] as number) + (B.h[b] as number) / 2) * cm;
      O.shapeLen[o] = 1;
      plan(s, o);
      return true;
    }
    case 'UpdateOrder': {
      const o = O.find(cmd.payload.orderId);
      if (o < 0) return true;
      O.request.set(parseRequest(cmd.payload.squads), o * NT);
      O.stance[o] = parseStance(cmd.payload.stance);
      plan(s, o);
      const U = s.units;
      // Stance retreat: the order stays, its squads fall back to the reserve until it is resumed.
      const retreat = O.stance[o] === ST_RETREAT;
      for (let k = 0; k < O.slots; k++) {
        const u = O.slotUnit[o * O.slots + k] as number;
        if (u < 0) continue;
        if (retreat) O.release(s, u);
        else U.stance[u] = O.stance[o] as number;
      }
      return true;
    }
    case 'CancelOrder': {
      const o = O.find(cmd.payload.orderId);
      if (o >= 0) O.close(s, o);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Zombies within r of (cx, cy) whose centroid lies in the box: squad u closes in to engageRangeShare of its range
 * (MV_PURSUIT, stops as soon as it has a target). Returns true while there are zombies to fight.
 */
function engage(
  s: SimState,
  u: number,
  cx: number,
  cy: number,
  r: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  if (s.density.query(cx, cy, r) === 0) return false;
  const zx = s.density.cx;
  const zy = s.density.cy;
  if (zx < x0 || zx > x1 || zy < y0 || zy > y1) return false;
  const p = s.units.pool;
  if ((p.target[u] as number) >= 0) return true;
  const x = p.posX[u] as number;
  const y = p.posY[u] as number;
  const dx = zx - x;
  const dy = zy - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const keep = ORDER_RULES.engageRangeShare * (UT_RANGE[p.kind[u] as number] as number);
  if (d > keep && d > 0) setGoal(s, u, x + (dx * (d - keep)) / d, y + (dy * (d - keep)) / d, MV_PURSUIT);
  return true;
}

/** holdZone squad u engages zombies inside the zone (aggressive: zone plus weapon range). */
function engageZone(s: SimState, u: number, o: number): boolean {
  const O = s.orders;
  const base = o * PTS * 2;
  const reach =
    s.units.stance[u] === ST_AGGRESSIVE ? (UT_RANGE[s.units.pool.kind[u] as number] as number) : 0;
  const x0 = (O.shape[base] as number) - reach;
  const y0 = (O.shape[base + 1] as number) - reach;
  const x1 = (O.shape[base + 2] as number) + reach;
  const y1 = (O.shape[base + 3] as number) + reach;
  const hx = (x1 - x0) / 2;
  const hy = (y1 - y0) / 2;
  return engage(s, u, x0 + hx, y0 + hy, Math.sqrt(hx * hx + hy * hy), x0, y0, x1, y1);
}

/** Idle reserve squad u (missions) defends the HQ: engages zombies near its spot, then walks back. */
function defendReserve(s: SimState, u: number, tick: number): void {
  const U = s.units;
  const p = U.pool;
  if (U.moving[u] !== MV_NONE || U.broken[u] || (u + tick) % ORDER_RULES.engageCheckTicks !== 0) return;
  const hx = U.homeX[u] as number;
  const hy = U.homeY[u] as number;
  const r = ORDER_RULES.reserveDefendM;
  if (engage(s, u, hx, hy, r, hx - r, hy - r, hx + r, hy + r)) return;
  const dx = hx - (p.posX[u] as number);
  const dy = hy - (p.posY[u] as number);
  const back = ORDER_RULES.returnM;
  if (dx * dx + dy * dy > back * back) setGoal(s, u, hx, hy, MV_ORDER);
}

/** Squad u reached its goal or stopped: arrive at its post (enter the building) or try again later. */
function atRest(s: SimState, u: number, tick: number): void {
  const U = s.units;
  const O = s.orders;
  const p = U.pool;
  const k = (U.order[u] as number) * O.slots + (U.post[u] as number);
  const x = p.posX[u] as number;
  const y = p.posY[u] as number;
  const st = U.ostate[u] as number;
  const arrive = ORDER_RULES.arriveM;
  if (st === US_EN_ROUTE) {
    const dx = (O.slotAX[k] as number) - x;
    const dy = (O.slotAY[k] as number) - y;
    if (dx * dx + dy * dy <= arrive * arrive) {
      const b = O.slotBld[k] as number;
      if (b >= 0 && (O.integrity[b] as number) > 0)
        enterBuilding(s, u, b, O.slotX[k] as number, O.slotY[k] as number);
      else U.ostate[u] = US_POSTED;
      updateStatus(s, U.order[u] as number);
      O.version++;
    } else if (tick >= (U.retryAt[u] as number)) O.send(s, u);
    return;
  }
  // Posted: walk back when pushed off the post (aggressive squads pursue nearby zombies within the leash).
  const dx = (O.slotX[k] as number) - x;
  const dy = (O.slotY[k] as number) - y;
  const d2 = dx * dx + dy * dy;
  const back = ORDER_RULES.returnM;
  const o = U.order[u] as number;
  if (O.kind[o] === OK_ZONE) {
    // Zone squads clear the zone, then walk back to their post.
    if ((u + tick) % ORDER_RULES.engageCheckTicks !== 0 || engageZone(s, u, o)) return;
    if (d2 > back * back) setGoal(s, u, O.slotX[k] as number, O.slotY[k] as number, MV_ORDER);
    return;
  }
  if (d2 <= back * back || tick < (U.retryAt[u] as number)) return;
  const leash = ORDER_RULES.aggressiveLeashM;
  if (
    U.stance[u] === ST_AGGRESSIVE &&
    d2 <= leash * leash &&
    s.density.query(x, y, UNIT_BEHAVIOUR.aggressiveSeekM) > 0
  )
    return;
  U.retryAt[u] = tick + ORDER_RULES.retryTicks;
  setGoal(s, u, O.slotX[k] as number, O.slotY[k] as number, MV_ORDER);
}

function maintainUnits(s: SimState, tick: number): void {
  const U = s.units;
  const O = s.orders;
  const p = U.pool;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const st = U.ostate[u] as number;
    if (st === US_FREE) continue;
    if (st === US_IDLE) {
      if (s.eco.hq >= 0) defendReserve(s, u, tick);
      continue;
    }
    const mv = U.moving[u] as number;
    if (st === US_RETURNING) {
      if ((U.order[u] as number) < 0 && mv === MV_NONE) {
        U.ostate[u] = US_IDLE;
        O.version++;
      }
      continue;
    }
    if ((U.order[u] as number) < 0 || st === US_GARRISONED) continue;
    // holdUntilLosses fell back: the squad leaves the order, the reserve replaces it.
    if (U.stance[u] === ST_RETREAT && O.stance[U.order[u] as number] !== ST_RETREAT) {
      O.release(s, u);
      continue;
    }
    if (U.broken[u]) continue;
    if (mv === MV_NONE) atRest(s, u, tick);
    else if (mv === MV_PURSUIT && st === US_POSTED && O.kind[U.order[u] as number] !== OK_ZONE) {
      const k = (U.order[u] as number) * O.slots + (U.post[u] as number);
      const dx = (O.slotX[k] as number) - (p.posX[u] as number);
      const dy = (O.slotY[k] as number) - (p.posY[u] as number);
      const leash = ORDER_RULES.aggressiveLeashM;
      if (dx * dx + dy * dy > leash * leash) {
        U.retryAt[u] = tick + ORDER_RULES.retryTicks;
        setGoal(s, u, O.slotX[k] as number, O.slotY[k] as number, MV_ORDER);
      }
    }
  }
}

/** Free posts take the nearest fitting reserve squad (idle or returning, not broken). */
function fill(s: SimState, o: number, avail: Int32Array): void {
  const O = s.orders;
  const U = s.units;
  const p = U.pool;
  const strict = O.stance[o] === ST_HOLD_UNTIL_LOSSES;
  for (let k = 0; k < (O.slotCount[o] as number); k++) {
    const i = o * O.slots + k;
    const t = O.slotType[i] as number;
    if ((O.slotUnit[i] as number) >= 0 || t < 0 || (avail[t] as number) <= 0) continue;
    const ax = O.slotAX[i] as number;
    const ay = O.slotAY[i] as number;
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let u = 0; u < p.highWater; u++) {
      if (!p.alive[u] || p.kind[u] !== t || (U.order[u] as number) >= 0 || U.broken[u]) continue;
      if (U.ostate[u] !== US_IDLE && U.ostate[u] !== US_RETURNING) continue;
      if (strict && U.strength(u) <= UNIT_BEHAVIOUR.lossRetreatThreshold) continue;
      const dx = (p.posX[u] as number) - ax;
      const dy = (p.posY[u] as number) - ay;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best < 0) {
      avail[t] = 0;
      continue;
    }
    avail[t] = (avail[t] as number) - 1;
    O.assign(s, o, k, best);
  }
}

/** Re-evaluates the enemy side of line o; a flip moves the posts to the other side. */
function checkSide(s: SimState, o: number): void {
  const O = s.orders;
  const [mx, my, nx, ny] = lineFrame(s, o);
  const probe = ORDER_RULES.sideProbeM;
  const r = ORDER_RULES.sideProbeRadiusM;
  const plus = s.density.query(mx + nx * probe, my + ny * probe, r);
  const minus = s.density.query(mx - nx * probe, my - ny * probe, r);
  const cur = O.side[o] === 1 ? plus : minus;
  const other = O.side[o] === 1 ? minus : plus;
  if (other <= cur * ORDER_RULES.sideFlipFactor + ORDER_RULES.sideFlipMin) return;
  O.side[o] = -(O.side[o] as number);
  plan(s, o);
}

function updateStatus(s: SimState, o: number): void {
  const O = s.orders;
  const U = s.units;
  let req = 0;
  for (let t = 0; t < NT; t++) req += O.request[o * NT + t] as number;
  let assigned = 0;
  let inPos = 0;
  let weak = false;
  for (let k = 0; k < (O.slotCount[o] as number); k++) {
    const i = o * O.slots + k;
    const b = O.slotBld[i] as number;
    if (b >= 0 && (O.integrity[b] as number) < ORDER_RULES.failingIntegrity) weak = true;
    const u = O.slotUnit[i] as number;
    if (u < 0) continue;
    assigned++;
    const st = U.ostate[u];
    if (st === US_POSTED || st === US_GARRISONED) inPos++;
  }
  let status = OS_PENDING;
  if (O.lost[o]) status = OS_LOST;
  else if (req === 0 || O.stance[o] === ST_RETREAT) status = OS_PENDING;
  else if (!O.wasActive[o]) {
    if (inPos >= req) {
      O.wasActive[o] = 1;
      status = weak ? OS_FAILING : OS_ACTIVE;
    }
  } else if (assigned === 0) status = OS_LOST;
  else status = inPos < req || weak ? OS_FAILING : OS_ACTIVE;
  if (status !== O.status[o] || assigned !== O.assignedN[o] || inPos !== O.inPosN[o]) O.version++;
  O.status[o] = status;
  O.assignedN[o] = assigned;
  O.inPosN[o] = inPos;
}

/** Reserve squads per type that may be assigned, written into `avail`. */
function countAvailable(s: SimState, avail: Int32Array): number {
  const U = s.units;
  const p = U.pool;
  avail.fill(0);
  let total = 0;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u] || (U.order[u] as number) >= 0 || U.broken[u]) continue;
    if (U.ostate[u] !== US_IDLE && U.ostate[u] !== US_RETURNING) continue;
    const t = p.kind[u] as number;
    avail[t] = (avail[t] as number) + 1;
    total++;
  }
  return total;
}

export function updateOrders(s: SimState, tick: number): void {
  const O = s.orders;
  if (s.units.count === 0 && O.highWater === 0) return;
  garrisonPressure(s, tick);
  maintainUnits(s, tick);
  if (O.highWater === 0) return;
  for (let o = 0; o < O.highWater; o++)
    if (O.alive[o] && O.kind[o] === OK_LINE && (tick + o) % ORDER_RULES.sideCheckTicks === 0) checkSide(s, o);
  if (tick % ORDER_RULES.assignIntervalTicks !== 0) return;
  const avail = O.avail;
  const any = countAvailable(s, avail) > 0;
  for (let o = 0; o < O.highWater; o++) {
    if (!O.alive[o]) continue;
    if (any && !O.lost[o] && O.stance[o] !== ST_RETREAT) fill(s, o, avail);
    updateStatus(s, o);
  }
}

/** Orders, reserve and garrisons for the UI (allocates; polled on version change or once per second). */
export function orderViews(s: SimState): {
  orders: OrderView[];
  reserve: ReserveView;
  garrisons: GarrisonView[];
} {
  const O = s.orders;
  const U = s.units;
  const p = U.pool;
  const orders: OrderView[] = [];
  for (let o = 0; o < O.highWater; o++) {
    if (!O.alive[o]) continue;
    const requested: OrderView['requested'] = {};
    for (let t = 0; t < NT; t++) {
      const c = O.request[o * NT + t] as number;
      if (c > 0) requested[UNIT_TYPE_ORDER[t] as UnitTypeId] = c;
    }
    const assigned: number[] = [];
    for (let k = 0; k < (O.slotCount[o] as number); k++) {
      const u = O.slotUnit[o * O.slots + k] as number;
      if (u >= 0) assigned.push(u);
    }
    assigned.sort((a, b) => a - b);
    const kind = O.kind[o] as number;
    const len = kind === OK_LINE ? (O.shapeLen[o] as number) * 2 : kind === OK_ZONE ? 4 : 2;
    orders.push({
      id: O.id[o] as number,
      kind: KINDS[kind] as OrderKind,
      shape: Array.from(O.shape.subarray(o * PTS * 2, o * PTS * 2 + len)),
      buildingId: kind === OK_BUILDING ? (O.building[o] as number) : -1,
      requested,
      assigned,
      inPosition: O.inPosN[o] as number,
      stance: STANCES[O.stance[o] as number] as OrderView['stance'],
      status: STATUS[O.status[o] as number] as OrderView['status'],
    });
  }
  const idle: ReserveView['idle'] = {};
  let returning = 0;
  const garrisons: GarrisonView[] = [];
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const st = U.ostate[u] as number;
    if ((U.order[u] as number) < 0) {
      if (st === US_RETURNING) returning++;
      else if (st === US_IDLE) {
        const type = UNIT_TYPE_ORDER[p.kind[u] as number] as UnitTypeId;
        idle[type] = (idle[type] ?? 0) + 1;
      }
    }
    const b = U.garrison[u] as number;
    if (b < 0) continue;
    let g = garrisons.find((v) => v.buildingId === b);
    if (!g) {
      g = { buildingId: b, unitIds: [], integrity: O.integrity[b] as number };
      garrisons.push(g);
    }
    g.unitIds.push(u);
  }
  garrisons.sort((a, b) => a.buildingId - b.buildingId);
  return { orders, reserve: { idle, returning }, garrisons };
}
