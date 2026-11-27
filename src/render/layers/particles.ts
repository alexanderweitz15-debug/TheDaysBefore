// Pooled particle set: fixed capacity, struct-of-arrays state, no allocation per frame.
// All Particle objects are created once; dead ones get alpha 0. A full pool overwrites the oldest slot.
import { Particle, ParticleContainer, type Texture } from 'pixi.js';

export class ParticleSet {
  readonly view: ParticleContainer;
  private readonly parts: Particle[] = [];
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly a0: Float32Array;
  private readonly a1: Float32Array;
  private readonly drag: Float32Array;
  private readonly alive: Uint8Array;
  private next = 0;
  private live = 0;
  private readonly texW: number;

  constructor(
    texture: Texture,
    readonly capacity: number,
    additive = false,
  ) {
    this.texW = texture.width;
    this.view = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, vertex: true, color: true },
    });
    if (additive) this.view.blendMode = 'add';
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.age = f();
    this.life = f();
    this.s0 = f();
    this.s1 = f();
    this.a0 = f();
    this.a1 = f();
    this.drag = f();
    this.alive = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const p = new Particle({ texture, x: 0, y: 0, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
      this.parts.push(p);
      this.view.addParticle(p);
    }
  }

  get active(): number {
    return this.live;
  }

  /** Sizes are diameters in meters, velocity in m/s, life in ms, drag as fraction of speed lost per second. */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    lifeMs: number,
    size0: number,
    size1: number,
    alpha0: number,
    alpha1: number,
    tint: number,
    drag = 0,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (!this.alive[i]) this.live++;
    this.alive[i] = 1;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = lifeMs;
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.a0[i] = alpha0;
    this.a1[i] = alpha1;
    this.drag[i] = drag;
    (this.parts[i] as Particle).tint = tint;
  }

  /** Advances all live particles. minSizeM keeps them visible when zoomed out. */
  update(dtMs: number, minSizeM: number): void {
    if (this.live === 0) return;
    const dt = dtMs / 1000;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const p = this.parts[i] as Particle;
      const age = (this.age[i] as number) + dtMs;
      const life = this.life[i] as number;
      if (age >= life) {
        this.alive[i] = 0;
        this.live--;
        p.alpha = 0;
        continue;
      }
      this.age[i] = age;
      const k = 1 - Math.min(1, (this.drag[i] as number) * dt);
      const vx = (this.vx[i] as number) * k;
      const vy = (this.vy[i] as number) * k;
      this.vx[i] = vx;
      this.vy[i] = vy;
      const x = (this.x[i] as number) + vx * dt;
      const y = (this.y[i] as number) + vy * dt;
      this.x[i] = x;
      this.y[i] = y;
      const t = age / life;
      const size = Math.max(
        minSizeM,
        (this.s0[i] as number) + ((this.s1[i] as number) - (this.s0[i] as number)) * t,
      );
      const sc = size / this.texW;
      p.x = x;
      p.y = y;
      p.scaleX = sc;
      p.scaleY = sc;
      p.alpha = (this.a0[i] as number) + ((this.a1[i] as number) - (this.a0[i] as number)) * t;
    }
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.alive[i] = 0;
      (this.parts[i] as Particle).alpha = 0;
    }
    this.live = 0;
  }
}
