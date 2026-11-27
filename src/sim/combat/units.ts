// Player squads (GDD 9) as Structure of Arrays. One slot = one squad; squad HP is the sum of its members' HP,
// members = ceil(hp / hpPerMember). Slot indices are the unit ids (snapshot ids == UnitView.id).
import type { FireMode, Stance, UnitTypeId } from '../../core/commands';
import type { UnitView } from '../../core/types/combat';
import { TERRAIN } from '../../core/types/map';
import type { AgentSection } from '../../core/types/snapshot';
import { UNIT_ENGINE, UNIT_TYPE_ORDER, UNITS, type UnitSpec } from '../../data/units/present';
import { AgentPool } from '../horde/pool';
import type { SimState } from '../state';

export const STANCES: readonly Stance[] = ['hold', 'holdUntilLosses', 'aggressive', 'retreat'];
export const ST_HOLD = 0;
export const ST_HOLD_UNTIL_LOSSES = 1;
export const ST_AGGRESSIVE = 2;
export const ST_RETREAT = 3;
export const FIRE_MODES: readonly FireMode[] = ['free', 'onCommand'];
export const FM_FREE = 0;
export const FM_ON_COMMAND = 1;

/** Path state per unit. */
export const PATH_NONE = 0;
export const PATH_PENDING = 1;
export const PATH_READY = 2;

const specs: UnitSpec[] = UNIT_TYPE_ORDER.map((t) => UNITS[t]);
const table = (f: (s: UnitSpec) => number): Float32Array => Float32Array.from(specs, f);
export const UT_SIZE = table((s) => s.size);
export const UT_HP = table((s) => s.hpPerMember);
export const UT_RANGE = table((s) => s.rangeM);
export const UT_MIN_RANGE = table((s) => s.minRangeM);
export const UT_DAMAGE = table((s) => s.hitDamage);
export const UT_AREA = table((s) => s.areaRadiusM);
/** Shots per second at full strength. */
export const UT_RATE = table((s) => (s.hitDamage > 0 ? s.dps / s.hitDamage : 0));
export const UT_SPEED = table((s) => s.speedMps);
export const UT_AMMO = table((s) => s.ammo);
export const UT_NOISE = table((s) => s.shotNoise);
export const UT_SUPPRESSION = table((s) => s.suppression);
export const UT_SPECIALS = table((s) => (s.prefersSpecials ? 1 : 0));
export const UT_BUILD = table((s) => (s.canBuild ? 1 : 0));
export const UT_HEAL = table((s) => (s.canHeal ? 1 : 0));
export const UT_MORALE_LOSS = table((s) => s.moraleLossFactor);
export const UT_INDIRECT = table((s) => (s.areaRadiusM > 0 && s.minRangeM > 0 ? 1 : 0));
export const UT_DAMAGE_TYPE: readonly string[] = specs.map((s) => s.damageType);
export const UT_SNIPER = UNIT_TYPE_ORDER.indexOf('sniperTeam');
const MAX_SIZE = Math.max(...specs.map((s) => s.size));

export class Units {
  /** pos, vel, kind = type index, cell, target = zombie slot (-1 none), hp = squad HP. */
  readonly pool: AgentPool;
  readonly members: Uint8Array;
  readonly ammo: Float32Array;
  readonly stance: Uint8Array;
  readonly fireMode: Uint8Array;
  readonly morale: Float32Array;
  readonly kills: Int32Array;
  readonly rank: Uint8Array;
  /** Fractional shots carried over between ticks. */
  readonly fireAcc: Float32Array;
  /** 1 while retreating because morale broke. */
  readonly broken: Uint8Array;
  /** 1 next to buildings or blocking structures (cover). */
  readonly cover: Uint8Array;
  /** Tick of the last shot, last noise emission, last suppression mark. */
  readonly lastShot: Int32Array;
  readonly noiseAt: Int32Array;
  readonly suppressAt: Int32Array;
  /** Next tick a target search is due. */
  readonly nextScan: Int32Array;
  /** Range bonus from a watchtower (m), refreshed with the target search. */
  readonly rangeBonus: Float32Array;
  /** Indirect fire aim point (aimOn 1 = valid, aimSpotted 1 = seen by own units). */
  readonly aimOn: Uint8Array;
  readonly aimSpotted: Uint8Array;
  readonly aimX: Float32Array;
  readonly aimY: Float32Array;
  /** Movement goal: active flag, point; 2 = self-chosen (aggressive pursuit, retreat). */
  readonly moving: Uint8Array;
  readonly goalX: Float32Array;
  readonly goalY: Float32Array;
  readonly pathState: Uint8Array;
  /** Smoothed path corners (maxCorners per unit), pathIdx = next corner; partial = re-plan at the end. */
  readonly pathX: Float32Array;
  readonly pathY: Float32Array;
  readonly pathLen: Uint8Array;
  readonly pathIdx: Uint8Array;
  readonly pathPartial: Uint8Array;
  /** Queued waypoints (FIFO, maxWaypoints per unit). */
  readonly wpX: Float32Array;
  readonly wpY: Float32Array;
  readonly wpCount: Uint8Array;
  /** AttackArea order. */
  readonly attackOn: Uint8Array;
  readonly attackX: Float32Array;
  readonly attackY: Float32Array;
  /** Placement point, retreat fallback without rally points. */
  readonly homeX: Float32Array;
  readonly homeY: Float32Array;
  /** Turn ticks of infected members (MAX_SIZE per unit), first infCount used. */
  readonly infTurn: Int32Array;
  readonly infCount: Uint8Array;
  readonly maxCorners = UNIT_ENGINE.pathMaxCorners;
  readonly maxWaypoints = UNIT_ENGINE.maxWaypoints;
  readonly maxSize = MAX_SIZE;

  constructor(readonly capacity: number) {
    this.pool = new AgentPool(capacity);
    this.members = new Uint8Array(capacity);
    this.ammo = new Float32Array(capacity);
    this.stance = new Uint8Array(capacity);
    this.fireMode = new Uint8Array(capacity);
    this.morale = new Float32Array(capacity);
    this.kills = new Int32Array(capacity);
    this.rank = new Uint8Array(capacity);
    this.fireAcc = new Float32Array(capacity);
    this.broken = new Uint8Array(capacity);
    this.cover = new Uint8Array(capacity);
    this.lastShot = new Int32Array(capacity).fill(-1);
    this.noiseAt = new Int32Array(capacity).fill(-1);
    this.suppressAt = new Int32Array(capacity).fill(-1);
    this.nextScan = new Int32Array(capacity);
    this.rangeBonus = new Float32Array(capacity);
    this.aimOn = new Uint8Array(capacity);
    this.aimSpotted = new Uint8Array(capacity);
    this.aimX = new Float32Array(capacity);
    this.aimY = new Float32Array(capacity);
    this.moving = new Uint8Array(capacity);
    this.goalX = new Float32Array(capacity);
    this.goalY = new Float32Array(capacity);
    this.pathState = new Uint8Array(capacity);
    this.pathX = new Float32Array(capacity * this.maxCorners);
    this.pathY = new Float32Array(capacity * this.maxCorners);
    this.pathLen = new Uint8Array(capacity);
    this.pathIdx = new Uint8Array(capacity);
    this.pathPartial = new Uint8Array(capacity);
    this.wpX = new Float32Array(capacity * this.maxWaypoints);
    this.wpY = new Float32Array(capacity * this.maxWaypoints);
    this.wpCount = new Uint8Array(capacity);
    this.attackOn = new Uint8Array(capacity);
    this.attackX = new Float32Array(capacity);
    this.attackY = new Float32Array(capacity);
    this.homeX = new Float32Array(capacity);
    this.homeY = new Float32Array(capacity);
    this.infTurn = new Int32Array(capacity * MAX_SIZE);
    this.infCount = new Uint8Array(capacity);
  }

  get count(): number {
    return this.pool.count;
  }

  /** Squad strength 0..1 (members alive / size). */
  strength(u: number): number {
    return (this.members[u] as number) / (UT_SIZE[this.pool.kind[u] as number] as number);
  }

  hashArrays(): ArrayBufferView[] {
    const hw = this.pool.highWater;
    const p = this.pool;
    const per = (a: Float32Array | Int32Array, k: number) => a.subarray(0, hw * k);
    return [
      p.alive.subarray(0, hw),
      p.kind.subarray(0, hw),
      p.posX.subarray(0, hw),
      p.posY.subarray(0, hw),
      p.velX.subarray(0, hw),
      p.velY.subarray(0, hw),
      p.cell.subarray(0, hw),
      p.target.subarray(0, hw),
      p.hp.subarray(0, hw),
      p.freeSlots(),
      ...[
        this.members,
        this.ammo,
        this.stance,
        this.fireMode,
        this.morale,
        this.kills,
        this.rank,
        this.fireAcc,
        this.broken,
        this.cover,
        this.lastShot,
        this.noiseAt,
        this.suppressAt,
        this.nextScan,
        this.rangeBonus,
        this.aimOn,
        this.aimSpotted,
        this.aimX,
        this.aimY,
        this.moving,
        this.goalX,
        this.goalY,
        this.pathState,
        this.pathLen,
        this.pathIdx,
        this.pathPartial,
        this.wpCount,
        this.attackOn,
        this.attackX,
        this.attackY,
        this.infCount,
      ].map((a) => a.subarray(0, hw)),
      per(this.pathX, this.maxCorners),
      per(this.pathY, this.maxCorners),
      per(this.wpX, this.maxWaypoints),
      per(this.wpY, this.maxWaypoints),
      per(this.infTurn, MAX_SIZE),
    ];
  }

  views(): UnitView[] {
    const p = this.pool;
    const out: UnitView[] = [];
    for (let u = 0; u < p.highWater; u++) {
      if (!p.alive[u]) continue;
      const t = p.kind[u] as number;
      const maxAmmo = UT_AMMO[t] as number;
      let target: [number, number] | null = null;
      if (this.moving[u]) target = [this.goalX[u] as number, this.goalY[u] as number];
      else if (this.attackOn[u]) target = [this.attackX[u] as number, this.attackY[u] as number];
      out.push({
        id: u,
        type: UNIT_TYPE_ORDER[t] as UnitTypeId,
        members: this.members[u] as number,
        hp: (p.hp[u] as number) / ((UT_SIZE[t] as number) * (UT_HP[t] as number)),
        ammo: maxAmmo > 0 ? (this.ammo[u] as number) / maxAmmo : 0,
        stance: STANCES[this.stance[u] as number] as Stance,
        fireMode: FIRE_MODES[this.fireMode[u] as number] as FireMode,
        target,
        morale: Math.min(1, Math.max(0, this.morale[u] as number)),
        rank: this.rank[u] as number as 0 | 1 | 2,
      });
    }
    return out;
  }

  write(out: AgentSection): void {
    const p = this.pool;
    let k = 0;
    for (let u = 0; u < p.highWater && k < out.count; u++) {
      if (!p.alive[u]) continue;
      out.ids[k] = u;
      out.pos[2 * k] = p.posX[u] as number;
      out.pos[2 * k + 1] = p.posY[u] as number;
      out.kind[k] = p.kind[u] as number;
      k++;
    }
  }
}

/**
 * PlaceUnit: buys a squad at (x, y) (cost from data). Refused off the map or on a cell that is not walkable
 * (buildings, water, blocking structures). `price` overrides the cost (militia). Returns the slot or -1.
 */
export function placeUnit(s: SimState, type: UnitTypeId, x: number, y: number, price?: number): number {
  const t = UNIT_TYPE_ORDER.indexOf(type);
  if (t < 0 || !Number.isFinite(x) || !Number.isFinite(y) || !s.inMap(x, y)) return -1;
  const spec = UNITS[type];
  const cost = price ?? spec.cost;
  if (s.counters.budget < cost) return -1;
  const c = s.cellOf(x, y);
  if (!s.walkable[c]) return -1;
  const U = s.units;
  const p = U.pool;
  const u = p.alloc();
  if (u < 0) return -1;
  s.counters.budget -= cost;
  const px = Math.fround(x);
  const py = Math.fround(y);
  p.posX[u] = px;
  p.posY[u] = py;
  p.kind[u] = t;
  p.cell[u] = c;
  p.hp[u] = spec.size * spec.hpPerMember;
  U.members[u] = spec.size;
  // Missions: the squad's ammo comes from the global stock (free mode: full).
  U.ammo[u] = s.eco.drawAmmo(spec.ammo);
  U.stance[u] = ST_HOLD;
  U.fireMode[u] = FM_FREE;
  U.morale[u] = 1;
  U.kills[u] = 0;
  U.rank[u] = 0;
  U.fireAcc[u] = 0;
  U.broken[u] = 0;
  U.lastShot[u] = -1;
  U.noiseAt[u] = -1;
  U.suppressAt[u] = -1;
  U.nextScan[u] = s.tick;
  U.rangeBonus[u] = 0;
  U.aimOn[u] = 0;
  U.moving[u] = 0;
  U.pathState[u] = PATH_NONE;
  U.pathLen[u] = 0;
  U.pathIdx[u] = 0;
  U.pathPartial[u] = 0;
  U.wpCount[u] = 0;
  U.attackOn[u] = 0;
  U.homeX[u] = px;
  U.homeY[u] = py;
  U.infCount[u] = 0;
  U.cover[u] = coverAt(s, c);
  s.unitsDirty = true;
  return u;
}

/** 1 if a building or blocking structure is next to cell c (8-neighborhood). */
export function coverAt(s: SimState, c: number): number {
  const n = s.n;
  const x = c % n;
  const y = (c - x) / n;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= n) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= n || (dx === 0 && dy === 0)) continue;
      const j = yy * n + xx;
      if (s.map.terrain[j] === TERRAIN.building) return 1;
      if (s.terrainWalk[j] && !s.walkable[j]) return 1;
    }
  }
  return 0;
}
