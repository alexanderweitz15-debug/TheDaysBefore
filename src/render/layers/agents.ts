// Dummy agents as one pooled ParticleContainer; positions are interpolated between two snapshots.
import { Graphics, Particle, ParticleContainer, type Renderer, type Texture } from 'pixi.js';
import type { SnapshotView } from '../../core/types/snapshot';
import { palette } from '../palette';

const TEX_SIZE = 16;
const MIN_RADIUS_PX = 1.5;
const MAX_RADIUS_PX = 4;
const RADIUS_M = 0.6;

export class AgentsLayer {
  readonly view: ParticleContainer;
  private readonly texture: Texture;
  private readonly pool: Particle[] = [];
  private lastZoom = Number.NaN;

  constructor(renderer: Renderer) {
    const g = new Graphics().circle(TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE / 2).fill(0xffffff);
    this.texture = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    this.view = new ParticleContainer({ texture: this.texture, dynamicProperties: { position: true } });
  }

  /** Scale so a dot stays visible when zoomed out and does not balloon when zoomed in. */
  private applyZoom(zoom: number): void {
    if (zoom === this.lastZoom) return;
    this.lastZoom = zoom;
    const radiusPx = Math.min(MAX_RADIUS_PX, Math.max(MIN_RADIUS_PX, RADIUS_M * zoom));
    const s = (radiusPx * 2) / zoom / TEX_SIZE;
    for (const p of this.pool) {
      p.scaleX = s;
      p.scaleY = s;
    }
    this.view.update();
  }

  private resize(count: number, zoom: number): void {
    const children = this.view.particleChildren;
    if (count < children.length) {
      this.view.removeParticles(count, children.length);
      return;
    }
    const radiusPx = Math.min(MAX_RADIUS_PX, Math.max(MIN_RADIUS_PX, RADIUS_M * zoom));
    const s = (radiusPx * 2) / zoom / TEX_SIZE;
    for (let i = children.length; i < count; i++) {
      let p = this.pool[i];
      if (!p) {
        p = new Particle({
          texture: this.texture,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: s,
          scaleY: s,
          tint: palette.debugAgent,
        });
        this.pool[i] = p;
      }
      p.scaleX = s;
      p.scaleY = s;
      this.view.addParticle(p);
    }
  }

  update(prev: SnapshotView | null, curr: SnapshotView | null, alpha: number, zoom: number): void {
    if (!curr) return;
    const n = curr.agentCount;
    if (this.view.particleChildren.length !== n) this.resize(n, zoom);
    this.applyZoom(zoom);
    const out = this.view.particleChildren;
    const c = curr.positions;
    const p = prev && prev.agentCount > 0 ? prev.positions : null;
    const common = p && prev ? Math.min(prev.agentCount, n) : 0;
    const a = Math.min(1, Math.max(0, alpha));
    for (let i = 0; i < common; i++) {
      const o = out[i] as Particle;
      const px = (p as Float32Array)[i * 2] as number;
      const py = (p as Float32Array)[i * 2 + 1] as number;
      o.x = px + ((c[i * 2] as number) - px) * a;
      o.y = py + ((c[i * 2 + 1] as number) - py) * a;
    }
    for (let i = common; i < n; i++) {
      const o = out[i] as Particle;
      o.x = c[i * 2] as number;
      o.y = c[i * 2 + 1] as number;
    }
  }
}
