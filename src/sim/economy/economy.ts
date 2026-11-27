// Economy state (GDD 6 Ressourcen, Wirtschaft aufbauen, Bevölkerung): resources with storage, economy buildings
// on repurposed city buildings, population assignment, morale and decrees. Fixed slots in typed arrays.
// Inactive without a scenario (free mode): costs, ammo and build rates then behave as in M3.
import type { EconomyBuildingKind, ResourceId } from '../../core/commands';
import {
  DECREES,
  ECONOMY_BUILDINGS,
  ECONOMY_RULES,
  MORALE,
  PHASES,
  POPULATION,
  STRUCTURE_MATERIAL,
} from '../../data/economy/economy';
import { STRUCTURE_KINDS } from '../structures/kinds';

export const RESOURCES: readonly ResourceId[] = [
  'budget',
  'material',
  'fuel',
  'ammo',
  'medicine',
  'food',
  'power',
  'research',
];
export const R = Object.fromEntries(RESOURCES.map((r, i) => [r, i])) as Record<ResourceId, number>;
export const NR = RESOURCES.length;
export const EB_KINDS = Object.keys(ECONOMY_BUILDINGS) as EconomyBuildingKind[];
export const EB = Object.fromEntries(EB_KINDS.map((k, i) => [k, i])) as Record<EconomyBuildingKind, number>;
export const DECREE_IDS = Object.keys(DECREES);
export const MORALE_FACTORS = [
  'base',
  'food',
  'safety',
  'losses',
  'collateral',
  'conscription',
  'success',
  'decrees',
];
export const BOTTLENECKS = [null, 'workers', 'power', 'input', 'storage'] as const;
export const BN_NONE = 0;
export const BN_WORKERS = 1;
export const BN_POWER = 2;
export const BN_INPUT = 3;
export const BN_STORAGE = 4;
const MAX = ECONOMY_RULES.maxBuildings;
const TREND = ECONOMY_RULES.trendPasses;

export class Economy {
  active = false;
  /** Stock per resource; budget lives in counters.budget, amount[budget] keeps its fraction. */
  readonly amount = new Float64Array(NR);
  readonly capacity = new Float64Array(NR);
  /** Ring of stock samples, one per pass (trend). */
  readonly history = new Float64Array(TREND * NR);
  passes = 0;
  readonly alive = new Uint8Array(MAX);
  readonly id = new Int32Array(MAX);
  readonly kind = new Uint8Array(MAX);
  /** City building index (map.buildings). */
  readonly building = new Int32Array(MAX);
  readonly progress = new Float32Array(MAX);
  readonly workers = new Int32Array(MAX);
  readonly bottleneck = new Uint8Array(MAX);
  /** Last actual output per minute (MAX x NR). */
  readonly output = new Float32Array(MAX * NR);
  readonly overrun = new Uint8Array(MAX);
  highWater = 0;
  nextId = 1;
  /** Per city building: economy slot, -1 none. */
  readonly slotOf: Int32Array;
  hq = -1;
  hqX = 0;
  hqY = 0;
  powerSupply = 0;
  powerDemand = 0;
  /** Assignment in percent. */
  workersPct: number = POPULATION.defaultAssignment.workers;
  conscriptsPct: number = POPULATION.defaultAssignment.conscripts;
  helpersPct: number = POPULATION.defaultAssignment.helpers;
  /** Residents counted at the last pass and volunteers among them. */
  population = 0;
  volunteers = 0;
  morale: number = MORALE.start;
  readonly factors = new Float64Array(MORALE_FACTORS.length);
  readonly decrees = new Uint8Array(DECREE_IDS.length);
  /** Civilians saved by early evacuation. */
  evacuated = 0;
  evacUsed = false;
  militia = 0;
  militiaAt = -1;
  hungry = false;
  /** Set after the outbreak (GDD 6: building costs +25 %). */
  postOutbreak = false;
  quoteBudget = 0;
  quoteMaterial = 0;

  constructor(buildings: number) {
    this.slotOf = new Int32Array(buildings).fill(-1);
  }

  /** Cost factor for structures and repurposing. */
  get costFactor(): number {
    return this.active && this.postOutbreak ? PHASES.postOutbreakCostFactor : 1;
  }

  decree(name: string): boolean {
    const k = DECREE_IDS.indexOf(name);
    return k >= 0 && this.decrees[k] === 1;
  }

  /** Product of a decree field over active decrees (1 without). */
  decreeFactor(
    field: 'taxFactor' | 'productionFactor' | 'foodFactor' | 'panicFactor' | 'outbreakPressureFactor',
  ): number {
    let f = 1;
    for (let k = 0; k < DECREE_IDS.length; k++) {
      if (!this.decrees[k]) continue;
      const v = DECREES[DECREE_IDS[k] as string]?.[field];
      if (v !== undefined) f *= v;
    }
    return f;
  }

  /** Civilian panic rise factor (missions): panic decrees (curfew, martial law) and low morale (GDD 6). */
  panicRiseFactor(): number {
    if (!this.active) return 1;
    return (
      this.decreeFactor('panicFactor') * (this.morale < MORALE.strikeBelow ? MORALE.lowMoralePanicFactor : 1)
    );
  }

  helperBonus(): number {
    return 1 + (POPULATION.helperBuildBonusPer10Pct * this.helperShare() * 100) / 10;
  }

  /** Helpers incl. volunteers as share of the population. */
  helperShare(): number {
    const p = this.population;
    return p > 0 ? Math.min(1, (Math.floor((p * this.helpersPct) / 100) + this.volunteers) / p) : 0;
  }

  /** Whether the stock covers budget b and material m (free mode: budget only). */
  afford(budget: number, b: number, m: number): boolean {
    return budget >= b && (!this.active || (this.amount[R.material] as number) >= m);
  }

  /** Price of `units` meters or pieces of structure kind k: returns the budget part, keeps the material part. */
  quote(k: number, unitCost: number, units: number): number {
    const f = this.costFactor;
    const kind = STRUCTURE_KINDS[k];
    this.quoteMaterial = this.active && kind ? STRUCTURE_MATERIAL[kind] * units * f : 0;
    this.quoteBudget = Math.ceil(unitCost * units * f);
    return this.quoteBudget;
  }

  canPayQuote(budget: number): boolean {
    return this.afford(budget, this.quoteBudget, this.quoteMaterial);
  }

  /** Pays the last quote; returns the budget part (the caller deducts it from counters.budget). */
  payQuote(): number {
    this.amount[R.material] = (this.amount[R.material] as number) - this.quoteMaterial;
    return this.quoteBudget;
  }

  /** Takes up to n ammo from the global stock (free mode: unlimited). */
  drawAmmo(n: number): number {
    if (!this.active) return n;
    const a = Math.min(n, this.amount[R.ammo] as number);
    this.amount[R.ammo] = (this.amount[R.ammo] as number) - a;
    return a;
  }

  /** Within resupply range of the HQ. */
  nearHq(x: number, y: number, r: number): boolean {
    if (this.hq < 0) return false;
    const dx = x - this.hqX;
    const dy = y - this.hqY;
    return dx * dx + dy * dy <= r * r;
  }

  /** Adds to a stock up to capacity; returns what was stored. */
  store(r: number, v: number): number {
    const a = this.amount[r] as number;
    const add = Math.max(0, Math.min(v, (this.capacity[r] as number) - a));
    this.amount[r] = a + add;
    return add;
  }

  allocSlot(): number {
    for (let i = 0; i < this.highWater; i++) if (!this.alive[i]) return i;
    return this.highWater < MAX ? this.highWater++ : -1;
  }

  hashArrays(): ArrayBufferView[] {
    const hw = this.highWater;
    return [
      this.amount,
      this.capacity,
      this.history,
      this.alive.subarray(0, hw),
      this.id.subarray(0, hw),
      this.kind.subarray(0, hw),
      this.building.subarray(0, hw),
      this.progress.subarray(0, hw),
      this.workers.subarray(0, hw),
      this.bottleneck.subarray(0, hw),
      this.overrun.subarray(0, hw),
      this.factors,
      this.decrees,
      Float64Array.of(
        this.workersPct,
        this.conscriptsPct,
        this.helpersPct,
        this.morale,
        this.powerSupply,
        this.powerDemand,
      ),
    ];
  }

  hashValues(): number[] {
    return [
      this.active ? 1 : 0,
      this.passes,
      this.highWater,
      this.nextId,
      this.hq,
      this.population,
      this.volunteers,
      this.evacuated,
      this.evacUsed ? 1 : 0,
      this.militia,
      this.militiaAt,
      this.hungry ? 1 : 0,
      this.postOutbreak ? 1 : 0,
    ];
  }
}
