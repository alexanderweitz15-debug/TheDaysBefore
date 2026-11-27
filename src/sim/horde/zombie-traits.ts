// Per-zombie combat state and per-type tables (GDD 8, viral types 1-4 plus patient zero). Type = pool.kind.
import { TICK_RATE } from '../../core/loop';
import { ZOMBIE_TYPES } from '../../core/types/zones';
import { ZOMBIE_MOVEMENT } from '../../data/agents/horde';
import { NOISE } from '../../data/agents/noise';
import { PATIENT_ZERO } from '../../data/pathogens/viral';
import { ZOMBIE_TYPE_SPECS, type ZombieTypeSpec } from '../../data/zombies/viral-types';
import type { SimState } from '../state';

export const ZT_WALKER = ZOMBIE_TYPES.indexOf('walker');
export const ZT_SPRINTER = ZOMBIE_TYPES.indexOf('sprinter');
export const ZT_SCREAMER = ZOMBIE_TYPES.indexOf('screamer');
export const ZT_COLOSSUS = ZOMBIE_TYPES.indexOf('colossus');
export const ZT_PATIENT_ZERO = ZOMBIE_TYPES.indexOf('patientZero');

const specOf = (t: number): ZombieTypeSpec =>
  t === ZT_PATIENT_ZERO
    ? ZOMBIE_TYPE_SPECS.walker
    : ZOMBIE_TYPE_SPECS[ZOMBIE_TYPES[t] as keyof typeof ZOMBIE_TYPE_SPECS];

const table = (f: (s: ZombieTypeSpec, t: number) => number): Float32Array =>
  Float32Array.from(ZOMBIE_TYPES, (_, t) => f(specOf(t), t));

/** Per type: speed m/s, max HP, damage per hit, ticks between hits, noise share 0..1, separation diameter. */
export const TYPE_SPEED = table((s, t) => (t === ZT_PATIENT_ZERO ? PATIENT_ZERO.speedMps : s.speedMps));
export const TYPE_HP = table((s, t) => (t === ZT_PATIENT_ZERO ? s.hp * PATIENT_ZERO.hpFactor : s.hp));
export const TYPE_DAMAGE = table((s) => s.attackDamage);
export const TYPE_ATTACK_TICKS = table((s) => Math.max(1, Math.round(TICK_RATE / s.attacksPerS)));
export const TYPE_NOISE_SHARE = table((s) => Math.min(1, NOISE.attraction * s.noiseWeight));
export const TYPE_DIAMETER = table((s) => 2 * s.radiusM);

export class ZombieTraits {
  /** Ticks until the next attack is possible. */
  readonly cooldown: Uint16Array;
  /** Scream speed boost lasts until this tick (exclusive). */
  readonly boostUntil: Int32Array;
  /** Screamers: next tick a scream is possible. */
  readonly screamAt: Int32Array;
  /** Squad slot chased (pool.target holds civilians), -1 none. */
  readonly unitTarget: Int32Array;

  constructor(capacity: number) {
    this.cooldown = new Uint16Array(capacity);
    this.boostUntil = new Int32Array(capacity);
    this.screamAt = new Int32Array(capacity);
    this.unitTarget = new Int32Array(capacity).fill(-1);
  }
}

/** Spawns one zombie of `type` on the nearest cell with room around (x, y). Returns the slot or -1. */
export function spawnZombie(s: SimState, x: number, y: number, type: number): number {
  if (s.placeAround(s.zombies, s.zombieCells, ZOMBIE_MOVEMENT.maxPerCell, x, y, 1, s.zombieWalk) !== 1)
    return -1;
  const i = s.placed[0] as number;
  initZombie(s, i, type);
  return i;
}

export function initZombie(s: SimState, i: number, type: number): void {
  s.zombies.kind[i] = type;
  s.zombies.hp[i] = TYPE_HP[type] as number;
  s.zt.cooldown[i] = 0;
  s.zt.boostUntil[i] = 0;
  s.zt.screamAt[i] = 0;
  s.zt.unitTarget[i] = -1;
  if (type === ZT_COLOSSUS)
    s.stats.moment('firstColossus', s.tick, s.zombies.posX[i] as number, s.zombies.posY[i] as number);
}

/** Removes a zombie (combat from M3 on, tests now). Leaves a corpse that does not rise. */
export function killZombie(s: SimState, i: number): void {
  const z = s.zombies;
  if (!z.alive[i]) return;
  const c = z.cell[i] as number;
  s.zombieCells[c] = (s.zombieCells[c] as number) - 1;
  s.corpses.add(z.posX[i] as number, z.posY[i] as number, s.outbreak.familyIndex, -1);
  s.outbreak.onZombieKilled(i, s.tick);
  z.release(i);
  s.counters.zombiesKilled++;
}
