// Projectiles in flight (GDD 4 step 11): straight from (sx, sy) to (tx, ty) between ticks t0 and t1.
// Tracers are render-only (small-arms hits are instant); shells explode on landing.
import { PROJECTILE_TYPES } from '../../data/units/present';
import { AgentPool } from '../horde/pool';

export const PT_TRACER = PROJECTILE_TYPES.indexOf('tracer');
export const PT_SHELL = PROJECTILE_TYPES.indexOf('shell');

export class Projectiles {
  /** pos = current position, kind = projectile type, target = owner unit slot, hp = damage. */
  readonly pool: AgentPool;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly t0: Int32Array;
  readonly t1: Int32Array;
  readonly radius: Float32Array;

  constructor(capacity: number) {
    this.pool = new AgentPool(capacity);
    this.sx = new Float32Array(capacity);
    this.sy = new Float32Array(capacity);
    this.tx = new Float32Array(capacity);
    this.ty = new Float32Array(capacity);
    this.t0 = new Int32Array(capacity);
    this.t1 = new Int32Array(capacity);
    this.radius = new Float32Array(capacity);
  }

  /** Launches a projectile; returns the slot or -1 when full. */
  launch(
    kind: number,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    t0: number,
    t1: number,
    damage: number,
    radius: number,
    owner: number,
  ): number {
    const p = this.pool;
    const i = p.alloc();
    if (i < 0) return -1;
    p.kind[i] = kind;
    p.posX[i] = sx;
    p.posY[i] = sy;
    p.target[i] = owner;
    p.hp[i] = damage;
    this.sx[i] = sx;
    this.sy[i] = sy;
    this.tx[i] = tx;
    this.ty[i] = ty;
    this.t0[i] = t0;
    this.t1[i] = Math.max(t1, t0 + 1);
    this.radius[i] = radius;
    return i;
  }

  hashArrays(): ArrayBufferView[] {
    const hw = this.pool.highWater;
    const p = this.pool;
    return [
      p.alive,
      p.kind,
      p.posX,
      p.posY,
      p.target,
      p.hp,
      this.tx,
      this.ty,
      this.t0,
      this.t1,
      this.radius,
    ].map((a) => a.subarray(0, hw));
  }
}
