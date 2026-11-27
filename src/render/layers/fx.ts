// Combat effects from the snapshot FX list (GDD 5, Atmosphäre: explosions with pressure ring, crater decal, debris).
// Event params: shot = direction in radians, explosion and mineBlast = blast radius in meters, others unused.
// Particle amount follows the setting; flashes and shake can be switched off. Pooled, no allocation per frame.
import { Container, Graphics, type Renderer } from 'pixi.js';
import { FX_TYPES, type FxType } from '../../core/types/combat';
import type { SnapshotView } from '../../core/types/snapshot';
import {
  CRATER_CAPACITY,
  EXPLOSION_DEFAULT_RADIUS_M,
  FX,
  PARTICLE_CAPACITY,
  PARTICLE_REDUCED_FACTOR,
  PARTICLE_SCALE,
  PARTICLE_TEX_PX,
  SHAKE_MAX_DISTANCE_PX,
  SHAKE_MAX_PX,
  SHAKE_MIN_RADIUS_M,
  SHAKE_MS,
  SHAKE_PX_PER_M,
  SPRITE_FX_CAPACITY,
} from '../../data/render-combat';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { cameraShake, cameraView } from '../view-state';
import { ParticleSet } from './particles';
import { shapeTexture } from './shapes';

/** Events farther than this outside the camera rectangle spawn nothing (meters). */
const CULL_M = 40;

let seed = 0x9e3779b9;
/** Render-only random numbers (never feeds the simulation). */
function rnd(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

interface Crater {
  x: number;
  y: number;
  r: number;
  born: number;
}

export class FxLayer {
  /** Craters, drawn below units and structures. */
  readonly ground = new Container();
  /** Particles, rings and flashes, drawn above. */
  readonly view = new Container();
  private readonly craterGfx = new Graphics();
  private readonly dots: ParticleSet;
  private readonly rings: ParticleSet;
  private readonly stars: ParticleSet;
  private readonly discs: ParticleSet;
  private readonly craters: Crater[] = [];
  private craterNext = 0;
  private craterDirty = false;
  private craterRedrawAt = 0;
  private lastTick = -1;
  private shakeUntil = 0;
  private shakeAmp = 0;
  private level = 0;

  constructor(renderer: Renderer) {
    const dot = shapeTexture(renderer, 'dot', PARTICLE_TEX_PX);
    this.dots = new ParticleSet(dot, PARTICLE_CAPACITY);
    this.rings = new ParticleSet(shapeTexture(renderer, 'shock', PARTICLE_TEX_PX), SPRITE_FX_CAPACITY);
    this.stars = new ParticleSet(shapeTexture(renderer, 'star', PARTICLE_TEX_PX), SPRITE_FX_CAPACITY, true);
    this.discs = new ParticleSet(dot, SPRITE_FX_CAPACITY, true);
    for (let i = 0; i < CRATER_CAPACITY; i++) this.craters.push({ x: 0, y: 0, r: 0, born: -1 });
    this.ground.addChild(this.craterGfx);
    this.view.addChild(this.dots.view, this.rings.view, this.stars.view, this.discs.view);
  }

  /** Reads the FX list of a snapshot once per tick. */
  ingest(s: SnapshotView, nowMs: number): void {
    if (s.tick === this.lastTick) return;
    this.lastTick = s.tick;
    const p = settings.particles.peek();
    this.level = PARTICLE_SCALE[p] * (settings.reducedMotion.peek() ? PARTICLE_REDUCED_FACTOR : 1);
    const hw = cameraView.width / 2 / cameraView.zoom + CULL_M;
    const hh = cameraView.height / 2 / cameraView.zoom + CULL_M;
    for (let i = 0; i < s.fxCount; i++) {
      const type = s.fx[i * 4] as number;
      const x = s.fx[i * 4 + 1] as number;
      const y = s.fx[i * 4 + 2] as number;
      const param = s.fx[i * 4 + 3] as number;
      if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
      this.spawnEvent(FX_TYPES[type] as FxType, x, y, param, nowMs);
    }
  }

  /** Number of particles for an effect with `base` at full level, with stochastic rounding. */
  private n(base: number, scale = 1): number {
    const e = base * this.level * scale;
    const w = Math.floor(e);
    return w + (rnd() < e - w ? 1 : 0);
  }

  private spawnEvent(type: FxType, x: number, y: number, param: number, nowMs: number): void {
    const calm = settings.noFlashes.peek() || settings.reducedMotion.peek();
    switch (type) {
      case 'shot': {
        const f = FX.shot;
        const fx = Math.cos(param);
        const fy = Math.sin(param);
        const size = f.flashM * (0.8 + rnd() * 0.4);
        this.stars.spawn(
          x + fx * 0.8,
          y + fy * 0.8,
          0,
          0,
          f.flashMs,
          calm ? size * 0.5 : size,
          size * 0.4,
          calm ? 0.35 : 1,
          0,
          palette.combat.muzzle,
        );
        for (let k = this.n(f.sparks); k > 0; k--)
          this.dots.spawn(
            x + fx,
            y + fy,
            fx * 9 + (rnd() - 0.5) * 3,
            fy * 9 + (rnd() - 0.5) * 3,
            180,
            0.12,
            0.04,
            1,
            0,
            palette.combat.spark,
          );
        break;
      }
      case 'impact': {
        const f = FX.impact;
        for (let k = this.n(f.sparks); k > 0; k--) {
          const a = rnd() * Math.PI * 2;
          const v = f.sparkSpeedMps * (0.4 + rnd() * 0.6);
          this.dots.spawn(
            x,
            y,
            Math.cos(a) * v,
            Math.sin(a) * v,
            f.sparkMs,
            0.12,
            0.04,
            1,
            0,
            palette.combat.spark,
            2,
          );
        }
        for (let k = this.n(f.puffs); k > 0; k--)
          this.dots.spawn(x, y, 0, 0, f.puffMs, 0.5, 1.3, 0.35, 0, palette.combat.smoke);
        break;
      }
      case 'wallHit': {
        const f = FX.wallHit;
        for (let k = this.n(f.debris); k > 0; k--) {
          const a = rnd() * Math.PI * 2;
          const v = f.debrisSpeedMps * (0.3 + rnd() * 0.7);
          this.dots.spawn(
            x,
            y,
            Math.cos(a) * v,
            Math.sin(a) * v,
            f.debrisMs * (0.6 + rnd() * 0.4),
            0.2,
            0.12,
            1,
            0,
            palette.combat.debris,
            3,
          );
        }
        for (let k = this.n(f.dust); k > 0; k--)
          this.dots.spawn(
            x + (rnd() - 0.5) * 1.5,
            y + (rnd() - 0.5) * 1.5,
            0,
            0,
            f.dustMs,
            0.6,
            1.8,
            0.3,
            0,
            palette.combat.smoke,
          );
        break;
      }
      case 'explosion':
        this.explode(x, y, param > 0 ? param : EXPLOSION_DEFAULT_RADIUS_M, 1, true, nowMs);
        break;
      case 'mineBlast':
        this.explode(x, y, param > 0 ? param : EXPLOSION_DEFAULT_RADIUS_M, FX.mineBlast.scale, false, nowMs);
        break;
      case 'death': {
        if (settings.violence.peek() === 'off') break;
        const k0 = settings.violence.peek() === 'low' ? 0.5 : 1;
        for (let k = this.n(FX.death.puffs, k0); k > 0; k--) {
          const a = rnd() * Math.PI * 2;
          this.dots.spawn(
            x,
            y,
            Math.cos(a) * 1.5,
            Math.sin(a) * 1.5,
            FX.death.puffMs,
            0.3,
            0.7,
            0.8,
            0,
            palette.blood,
            2,
          );
        }
        break;
      }
    }
  }

  private explode(x: number, y: number, radius: number, scale: number, heavy: boolean, nowMs: number): void {
    const f = FX.explosion;
    const r = radius * scale;
    const calm = settings.noFlashes.peek() || settings.reducedMotion.peek();
    // Pressure wave ring: always shown, it carries the blast radius information.
    this.rings.spawn(x, y, 0, 0, f.ringMs, r * 0.3, r * 2 * f.ringEndFactor, 0.9, 0, palette.combat.shock);
    // Bright flash is a light flash: replaced by a dim fireball when flashes are off.
    this.discs.spawn(x, y, 0, 0, f.flashMs, r * 1.2, r * 1.9, calm ? 0.25 : 0.95, 0, palette.combat.flash);
    for (let k = this.n(f.fire, scale); k > 0; k--) {
      const a = rnd() * Math.PI * 2;
      const v = f.fireSpeedMps * (r / 8) * rnd();
      this.dots.spawn(
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v,
        f.fireballMs * (0.6 + rnd() * 0.6),
        r * 0.35,
        r * 0.1,
        0.9,
        0,
        rnd() < 0.5 ? palette.combat.fire : palette.combat.spark,
        2.5,
      );
    }
    for (let k = this.n(f.smoke, scale); k > 0; k--) {
      const a = rnd() * Math.PI * 2;
      const v = 1 + rnd() * 3;
      this.dots.spawn(
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v,
        f.smokeMs * (0.6 + rnd() * 0.4),
        r * 0.3,
        r * 0.9,
        0.5,
        0,
        palette.combat.smoke,
        0.8,
      );
    }
    for (let k = this.n(f.debris, scale); k > 0; k--) {
      const a = rnd() * Math.PI * 2;
      const v = (6 + rnd() * 8) * (r / 8);
      this.dots.spawn(
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v,
        f.debrisMs * (0.6 + rnd() * 0.4),
        0.28,
        0.14,
        1,
        0,
        palette.combat.debris,
        2.5,
      );
    }
    const c = this.craters[this.craterNext] as Crater;
    this.craterNext = (this.craterNext + 1) % CRATER_CAPACITY;
    c.x = x;
    c.y = y;
    c.r = r * 0.45;
    c.born = nowMs;
    this.craterDirty = true;
    if (
      heavy &&
      radius >= SHAKE_MIN_RADIUS_M &&
      settings.screenShake.peek() &&
      !settings.reducedMotion.peek()
    ) {
      const d = Math.hypot(x - cameraView.cx, y - cameraView.cy) * cameraView.zoom;
      if (d < SHAKE_MAX_DISTANCE_PX) {
        const amp = Math.min(SHAKE_MAX_PX, radius * SHAKE_PX_PER_M) * (1 - d / SHAKE_MAX_DISTANCE_PX);
        if (amp > this.shakeAmp * Math.max(0, (this.shakeUntil - nowMs) / SHAKE_MS)) {
          this.shakeAmp = amp;
          this.shakeUntil = nowMs + SHAKE_MS;
        }
      }
    }
  }

  /** Advances particles and craters. Returns true when the screen shake offset changed (camera must re-apply). */
  update(dtMs: number, zoom: number, nowMs: number): boolean {
    const minM = 1.5 / zoom;
    this.dots.update(dtMs, minM * 0.5);
    this.rings.update(dtMs, minM);
    this.stars.update(dtMs, minM);
    this.discs.update(dtMs, minM);
    this.drawCraters(nowMs);
    const px = cameraShake.x;
    const py = cameraShake.y;
    if (nowMs < this.shakeUntil) {
      const a = this.shakeAmp * ((this.shakeUntil - nowMs) / SHAKE_MS);
      cameraShake.x = (rnd() - 0.5) * 2 * a;
      cameraShake.y = (rnd() - 0.5) * 2 * a;
    } else {
      cameraShake.x = 0;
      cameraShake.y = 0;
    }
    return px !== cameraShake.x || py !== cameraShake.y;
  }

  private drawCraters(nowMs: number): void {
    if (!this.craterDirty && nowMs < this.craterRedrawAt) return;
    this.craterRedrawAt = nowMs + 500;
    this.craterDirty = false;
    const g = this.craterGfx;
    g.clear();
    const life = FX.explosion.craterMs;
    for (const c of this.craters) {
      if (c.born < 0) continue;
      const age = nowMs - c.born;
      if (age >= life) {
        c.born = -1;
        continue;
      }
      g.circle(c.x, c.y, c.r).fill({
        color: palette.combat.crater,
        alpha: FX.explosion.craterAlpha * (1 - age / life),
      });
      g.circle(c.x, c.y, c.r).stroke({
        width: Math.max(0.15, c.r * 0.12),
        color: palette.combat.debris,
        alpha: 0.35 * (1 - age / life),
      });
    }
  }

  destroy(): void {
    cameraShake.x = 0;
    cameraShake.y = 0;
  }
}
