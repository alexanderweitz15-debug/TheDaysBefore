// Corpse decals (GDD 5, Atmosphäre): static particles, capped by a setting, with a violence level.
// off: nothing. low: small dim bodies. normal: bodies on a stylized blood spot.
import { Container, Particle, ParticleContainer, type Renderer } from 'pixi.js';
import type { AgentSection } from '../../core/types/snapshot';
import {
  AGENT_MIN_RADIUS_PX,
  AGENT_TEX_SIZE,
  BLOOD_ALPHA,
  BLOOD_RADIUS_M,
  CORPSE_ALPHA_LOW,
  CORPSE_DARKEN,
  CORPSE_RADIUS_M,
} from '../../data/render';
import { settings } from '../../ui/settings/store';
import { scaleColor } from '../map/color';
import { palette } from '../palette';
import { shapeTexture } from './shapes';

const FAMILIES = Object.keys(palette.infection) as Array<keyof typeof palette.infection>;

export class CorpseLayer {
  readonly view = new Container();
  private readonly bodies: ParticleContainer;
  private readonly blood: ParticleContainer;
  private readonly bodyPool: Particle[] = [];
  private readonly bloodPool: Particle[] = [];
  private readonly tints: number[];
  private lastSection: AgentSection | null = null;
  private lastHash = 0;
  private lastLimit = -1;
  private lastViolence = '';
  private lastZoom = Number.NaN;

  constructor(renderer: Renderer) {
    const tex = shapeTexture(renderer, 'bar', AGENT_TEX_SIZE);
    const dot = shapeTexture(renderer, 'dot', AGENT_TEX_SIZE);
    this.bodies = new ParticleContainer({ texture: tex });
    this.blood = new ParticleContainer({ texture: dot });
    this.blood.alpha = BLOOD_ALPHA;
    this.view.addChild(this.blood, this.bodies);
    this.tints = FAMILIES.map((f) => scaleColor(palette.infection[f].color, CORPSE_DARKEN));
  }

  private static scaleFor(radiusM: number, zoom: number): number {
    const px = Math.min(5, Math.max(AGENT_MIN_RADIUS_PX, radiusM * zoom));
    return (px * 2) / zoom / AGENT_TEX_SIZE;
  }

  /** Rebuilds the particles when the corpse set, the limit or the violence level changed. */
  update(s: AgentSection | null, zoom: number): void {
    const violence = settings.violence.value;
    const limit = settings.corpseLimit.value;
    const show = violence !== 'off' && limit > 0 && s !== null && s.count > 0;
    this.view.visible = show;
    if (!show || !s) return;
    const n = Math.min(s.count, limit);
    const first = s.count - n;
    // Hash over every visible id (FNV-1a, numbers only): catches a corpse that rose while another appeared.
    // Recomputed only for a new snapshot section, so there is no per-frame work or allocation between snapshots.
    let rebuilt = limit !== this.lastLimit || violence !== this.lastViolence;
    if (s !== this.lastSection) {
      let h = 2166136261 ^ s.count;
      for (let j = first; j < s.count; j++) {
        h = Math.imul(h ^ (s.ids[j] as number), 16777619);
        h = Math.imul(
          h ^ (((s.pos[j * 2] as number) * 8) | 0) ^ ((((s.pos[j * 2 + 1] as number) * 8) | 0) << 11),
          16777619,
        );
      }
      if (h !== this.lastHash) rebuilt = true;
      this.lastHash = h;
      this.lastSection = s;
    }
    const zoomChanged = zoom !== this.lastZoom;
    if (rebuilt) {
      this.lastLimit = limit;
      this.lastViolence = violence;
      this.fill(s, first, n, violence === 'normal');
    }
    if (rebuilt || zoomChanged) {
      this.lastZoom = zoom;
      this.rescale(zoom);
    }
    this.bodies.alpha = violence === 'low' ? CORPSE_ALPHA_LOW : 1;
  }

  private fill(s: AgentSection, first: number, n: number, withBlood: boolean): void {
    this.bodies.removeParticles();
    this.blood.removeParticles();
    for (let i = 0; i < n; i++) {
      const j = first + i;
      const x = s.pos[j * 2] as number;
      const y = s.pos[j * 2 + 1] as number;
      const tint = this.tints[s.kind[j] as number] ?? this.tints[0] ?? 0;
      let b = this.bodyPool[i];
      if (!b) {
        b = new Particle({ texture: this.bodies.texture, anchorX: 0.5, anchorY: 0.5 });
        this.bodyPool[i] = b;
      }
      b.x = x;
      b.y = y;
      b.tint = tint;
      // Deterministic pseudo-random angle so bodies do not all lie the same way.
      b.rotation = ((Math.imul(s.ids[j] as number, 2654435761) >>> 8) % 628) / 100;
      this.bodies.addParticle(b);
      if (withBlood) {
        let d = this.bloodPool[i];
        if (!d) {
          d = new Particle({ texture: this.blood.texture, anchorX: 0.5, anchorY: 0.5, tint: palette.blood });
          this.bloodPool[i] = d;
        }
        d.x = x;
        d.y = y;
        this.blood.addParticle(d);
      }
    }
  }

  private rescale(zoom: number): void {
    const sb = CorpseLayer.scaleFor(CORPSE_RADIUS_M, zoom);
    for (const p of this.bodies.particleChildren) {
      p.scaleX = sb;
      p.scaleY = sb;
    }
    const sd = CorpseLayer.scaleFor(BLOOD_RADIUS_M, zoom);
    for (const p of this.blood.particleChildren) {
      p.scaleX = sd;
      p.scaleY = sd;
    }
    this.bodies.update();
    this.blood.update();
  }
}
