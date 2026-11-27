// Economy pass (GDD 4 step 4, every passTicks; GDD 6): HQ at mission start, repurposing, workers in slot order,
// power balance, two-stage chains with inputs, storage limits, bottleneck reason, taxes and food. Buildings with
// zombies at their walls stop producing. Allocation-free in the pass.
import type { EconomyBuildingKind, ResourceId } from '../../core/commands';
import { TICK_RATE } from '../../core/loop';
import { DISTRICTS } from '../../core/types/map';
import {
  ECONOMY_BUILDINGS,
  ECONOMY_RULES,
  MORALE,
  POPULATION,
  START_RESOURCES,
} from '../../data/economy/economy';
import type { SimState } from '../state';
import {
  BN_INPUT,
  BN_NONE,
  BN_POWER,
  BN_STORAGE,
  BN_WORKERS,
  EB,
  EB_KINDS,
  type Economy,
  NR,
  R,
  RESOURCES,
} from './economy';

/** Minutes per pass. */
export const PASS_MIN = ECONOMY_RULES.passTicks / TICK_RATE / 60;
const SPECS = EB_KINDS.map((k) => ECONOMY_BUILDINGS[k]);
const perRes = (f: (s: (typeof SPECS)[number]) => Partial<Record<ResourceId, number>>): Float32Array => {
  const out = new Float32Array(SPECS.length * NR);
  SPECS.forEach((s, k) => {
    for (const r of RESOURCES) out[k * NR + (R[r] as number)] = f(s)[r] ?? 0;
  });
  return out;
};
export const EB_IN = perRes((s) => s.inputsPerMin);
export const EB_OUT = perRes((s) => s.outputsPerMin);
const EB_STORE = perRes((s) => s.storage);
export const EB_WORKERS = Float32Array.from(SPECS, (s) => s.workers);
export const EB_POWER = Float32Array.from(SPECS, (s) => s.power);
const EB_REPURPOSE_S = Float32Array.from(SPECS, (s) => s.repurposeS);
/** Resources some building stores; the others are unlimited. */
const HAS_STORE = Uint8Array.from(RESOURCES, (_, r) =>
  SPECS.some((_s, k) => (EB_STORE[k * NR + r] as number) > 0) ? 1 : 0,
);

function addBuilding(e: Economy, building: number, kind: number): number {
  const i = e.allocSlot();
  if (i < 0) return -1;
  e.alive[i] = 1;
  e.id[i] = e.nextId++;
  e.kind[i] = kind;
  e.building[i] = building;
  e.progress[i] = 0;
  e.workers[i] = 0;
  e.bottleneck[i] = BN_NONE;
  e.overrun[i] = 0;
  e.output.fill(0, i * NR, (i + 1) * NR);
  e.slotOf[building] = i;
  return i;
}

/** Building centre in meters. */
export function buildingCentre(s: SimState, b: number): { x: number; y: number } {
  const B = s.map.buildings;
  const cm = s.cellM;
  return {
    x: ((B.x[b] as number) + (B.w[b] as number) / 2) * cm,
    y: ((B.y[b] as number) + (B.h[b] as number) / 2) * cm,
  };
}

/** Mission start: stocks from the scenario, HQ in the building nearest the city centre. */
export function setupEconomy(s: SimState, start: Partial<Record<ResourceId, number>>): void {
  const e = s.eco;
  e.active = true;
  for (const r of RESOURCES) e.amount[R[r] as number] = start[r] ?? START_RESOURCES[r];
  s.counters.budget = Math.floor(e.amount[R.budget] as number);
  e.amount[R.budget] = 0;
  e.amount[R.power] = 0;
  const n = s.n;
  const c = s.goals.centerCell;
  const cx = ((c % n) + 0.5) * s.cellM;
  const cy = (Math.floor(c / n) + 0.5) * s.cellM;
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let b = 0; b < s.map.buildings.count; b++) {
    const p = buildingCentre(s, b);
    const d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best >= 0) {
    const i = addBuilding(e, best, EB.hq);
    e.progress[i] = 1;
    e.hq = i;
    const p = buildingCentre(s, best);
    e.hqX = p.x;
    e.hqY = p.y;
  }
  updateCapacity(e);
  for (let r = 0; r < NR; r++) e.amount[r] = Math.min(e.amount[r] as number, e.capacity[r] as number);
}

/** RepurposeBuilding: district must match, costs (x costFactor) are paid up front. */
export function repurpose(s: SimState, building: number, kind: EconomyBuildingKind): boolean {
  const e = s.eco;
  const k = EB[kind];
  const B = s.map.buildings;
  if (!e.active || k === undefined || kind === 'hq' || !Number.isInteger(building)) return false;
  if (building < 0 || building >= B.count || (e.slotOf[building] as number) >= 0) return false;
  const spec = ECONOMY_BUILDINGS[kind];
  if (!spec.fromDistricts.includes(DISTRICTS[B.district[building] as number] as never)) return false;
  const f = e.costFactor;
  for (const r of RESOURCES) {
    const need = Math.ceil((spec.repurposeCost[r] ?? 0) * f);
    const have = r === 'budget' ? s.counters.budget : (e.amount[R[r] as number] as number);
    if (have < need) return false;
  }
  const i = addBuilding(e, building, k);
  if (i < 0) return false;
  for (const r of RESOURCES) {
    const need = Math.ceil((spec.repurposeCost[r] ?? 0) * f);
    if (r === 'budget') s.counters.budget -= need;
    else e.amount[R[r] as number] = (e.amount[R[r] as number] as number) - need;
  }
  if (spec.repurposeS <= 0) e.progress[i] = 1;
  return true;
}

function updateCapacity(e: Economy): void {
  e.capacity.fill(0);
  for (let i = 0; i < e.highWater; i++) {
    if (!e.alive[i] || (e.progress[i] as number) < 1) continue;
    const k = e.kind[i] as number;
    for (let r = 0; r < NR; r++) e.capacity[r] = (e.capacity[r] as number) + (EB_STORE[k * NR + r] as number);
  }
  for (let r = 0; r < NR; r++) if (!HAS_STORE[r]) e.capacity[r] = ECONOMY_RULES.unlimited;
}

/** Zombies in the coarse cells touching the building (one 4 m cell around it). */
function markOverrun(s: SimState): void {
  const e = s.eco;
  const B = s.map.buildings;
  const d = s.density;
  const cm = s.cellM;
  for (let i = 0; i < e.highWater; i++) {
    if (!e.alive[i]) continue;
    const b = e.building[i] as number;
    const x0 = d.coord(((B.x[b] as number) - 1) * cm);
    const x1 = d.coord(((B.x[b] as number) + (B.w[b] as number) + 1) * cm);
    const y0 = d.coord(((B.y[b] as number) - 1) * cm);
    const y1 = d.coord(((B.y[b] as number) + (B.h[b] as number) + 1) * cm);
    let z = 0;
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++) z += d.count[gy * d.side + gx] as number;
    e.overrun[i] = z >= ECONOMY_RULES.overrunZombies ? 1 : 0;
  }
}

/** Strike, high-morale bonus and decrees. */
export function productionFactor(e: Economy): number {
  let f = e.decreeFactor('productionFactor');
  if (e.morale < MORALE.strikeBelow) f *= MORALE.strikeProductionFactor;
  else if (e.morale > MORALE.volunteersAbove) f *= 1 + MORALE.productionBonusAbove80;
  return f;
}

const operating = (e: Economy, i: number): boolean => e.alive[i] === 1 && (e.progress[i] as number) >= 1;
const staffShare = (e: Economy, i: number): number => {
  const need = EB_WORKERS[e.kind[i] as number] as number;
  if (e.overrun[i]) return 0;
  return need > 0 ? (e.workers[i] as number) / need : 1;
};

/** Runs building i for one pass at factor prod x power ratio pr; returns the factor actually achieved. */
function run(s: SimState, i: number, prod: number, pr: number): number {
  const e = s.eco;
  const k = e.kind[i] as number;
  const staff = staffShare(e, i);
  let f = staff * prod * pr;
  let bn = staff < 1 ? BN_WORKERS : pr < 1 ? BN_POWER : BN_NONE;
  let inR = 1;
  for (let r = 0; r < NR; r++) {
    const need = (EB_IN[k * NR + r] as number) * f * PASS_MIN;
    if (need > 0) inR = Math.min(inR, (e.amount[r] as number) / need);
  }
  if (inR < 1 && bn === BN_NONE) bn = BN_INPUT;
  f *= inR;
  for (let r = 0; r < NR; r++) {
    const use = (EB_IN[k * NR + r] as number) * f * PASS_MIN;
    if (use > 0) e.amount[r] = Math.max(0, (e.amount[r] as number) - use);
  }
  for (let r = 0; r < NR; r++) {
    const v = (EB_OUT[k * NR + r] as number) * f * PASS_MIN;
    let got = v;
    if (v > 0) {
      if (r === R.budget) addBudget(s, v);
      else got = e.store(r, v);
      if (got < v - 1e-9 && bn === BN_NONE) bn = BN_STORAGE;
    }
    e.output[i * NR + r] = got / PASS_MIN;
  }
  e.bottleneck[i] = bn;
  return f;
}

/** Budget income: whole units go to counters.budget, the fraction stays in amount[budget]. */
export function addBudget(s: SimState, v: number): void {
  const e = s.eco;
  const a = (e.amount[R.budget] as number) + v;
  const whole = Math.floor(a);
  s.counters.budget += whole;
  e.amount[R.budget] = a - whole;
}

export function economyPass(s: SimState): void {
  const e = s.eco;
  e.passes++;
  e.population = s.civilians.count;
  const bonus = e.helperBonus();
  for (let i = 0; i < e.highWater; i++) {
    if (!e.alive[i] || (e.progress[i] as number) >= 1) continue;
    const t = EB_REPURPOSE_S[e.kind[i] as number] as number;
    e.progress[i] = Math.min(1, (e.progress[i] as number) + ((PASS_MIN * 60) / t) * bonus);
  }
  updateCapacity(e);
  markOverrun(s);
  // Workers in slot order, power producers first (they keep the rest running).
  let pool = Math.floor((e.population * e.workersPct) / 100);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < e.highWater; i++) {
      if (!operating(e, i) || (EB_POWER[e.kind[i] as number] as number) < 0 !== (pass === 0)) continue;
      const w = Math.min(pool, EB_WORKERS[e.kind[i] as number] as number);
      e.workers[i] = e.overrun[i] ? 0 : w;
      pool -= e.workers[i] as number;
    }
  }
  const prod = productionFactor(e);
  e.powerSupply = 0;
  e.powerDemand = 0;
  for (let i = 0; i < e.highWater; i++) {
    if (!operating(e, i)) continue;
    const p = EB_POWER[e.kind[i] as number] as number;
    if (p < 0) e.powerSupply += -p * run(s, i, prod, 1);
    else if (p > 0) e.powerDemand += p * staffShare(e, i);
  }
  const ratio = e.powerDemand > 0 ? Math.min(1, e.powerSupply / e.powerDemand) : 1;
  for (let i = 0; i < e.highWater; i++) {
    if (!operating(e, i)) continue;
    const p = EB_POWER[e.kind[i] as number] as number;
    if (p >= 0) run(s, i, prod, p > 0 ? ratio : 1);
  }
  e.amount[R.power] = e.powerSupply - e.powerDemand;
  // Taxes (population x morale; conscripts pay none) and food.
  const taxShare = 1 - (e.conscriptsPct / 100) * POPULATION.conscriptTaxPenalty;
  addBudget(
    s,
    e.population *
      POPULATION.taxPerResidentPerMin *
      (e.morale / 100) *
      taxShare *
      e.decreeFactor('taxFactor') *
      PASS_MIN,
  );
  const food = e.population * POPULATION.foodPerResidentPerMin * e.decreeFactor('foodFactor') * PASS_MIN;
  e.hungry = (e.amount[R.food] as number) < food;
  e.amount[R.food] = Math.max(0, (e.amount[R.food] as number) - food);
  // Trend ring: stock (budget incl. counter) per pass.
  const h = (e.passes % ECONOMY_RULES.trendPasses) * NR;
  for (let r = 0; r < NR; r++)
    e.history[h + r] = r === R.budget ? s.counters.budget + (e.amount[r] as number) : (e.amount[r] as number);
}
