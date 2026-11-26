// One agent kind (zombies or civilians) as a pooled ParticleContainer.
// Snapshot data is copied into own arrays indexed by stable id, so no snapshot view is held past the call.
import { Particle, ParticleContainer, type Particle as ParticleType, type Texture } from 'pixi.js';
import type { AgentSection } from '../../core/types/snapshot';
import {
  AGENT_CULL_MARGIN_M,
  AGENT_MAX_RADIUS_PX,
  AGENT_MAX_STEP_M,
  AGENT_MIN_RADIUS_PX,
} from '../../data/render';
import { cameraView } from '../view-state';

export class AgentSet {
  readonly view: ParticleContainer;
  private readonly pool: ParticleType[] = [];
  private lastZoom = Number.NaN;
  private count = 0;
  private poolGrew = false;
  private ids: Uint32Array = new Uint32Array(0);
  private prevPos: Float32Array = new Float32Array(0);
  private currPos: Float32Array = new Float32Array(0);
  private prevAlive: Uint8Array = new Uint8Array(0);
  private currAlive: Uint8Array = new Uint8Array(0);

  constructor(
    private readonly texture: Texture,
    private readonly texSize: number,
    private readonly tint: number,
    private readonly radiusM: number,
    initialCapacity: number,
    /** Kind codes this set draws (lookup by kind byte); null takes all. */
    private readonly accept: Uint8Array | null = null,
    private readonly minRadiusPx = AGENT_MIN_RADIUS_PX,
  ) {
    this.view = new ParticleContainer({ texture, dynamicProperties: { position: true } });
    this.grow(initialCapacity);
  }

  get agentCount(): number {
    return this.count;
  }

  private grow(capacity: number): void {
    if (capacity <= this.currAlive.length) return;
    const copyF = (a: Float32Array): Float32Array => {
      const n = new Float32Array(capacity * 2);
      n.set(a);
      return n;
    };
    const copyU = (a: Uint8Array): Uint8Array => {
      const n = new Uint8Array(capacity);
      n.set(a);
      return n;
    };
    this.prevPos = copyF(this.prevPos);
    this.currPos = copyF(this.currPos);
    this.prevAlive = copyU(this.prevAlive);
    this.currAlive = copyU(this.currAlive);
  }

  /** Copies a new snapshot section; the previous current state becomes the interpolation start. */
  ingest(s: AgentSection): void {
    const { accept } = this;
    let maxId = -1;
    for (let i = 0; i < s.count; i++) {
      if (accept && !accept[s.kind[i] as number]) continue;
      if ((s.ids[i] as number) > maxId) maxId = s.ids[i] as number;
    }
    this.grow(Math.max(maxId + 1, this.currAlive.length));
    [this.prevPos, this.currPos] = [this.currPos, this.prevPos];
    [this.prevAlive, this.currAlive] = [this.currAlive, this.prevAlive];
    this.currAlive.fill(0);
    if (this.ids.length < s.count) this.ids = new Uint32Array(Math.max(s.count, this.ids.length * 2));
    let n = 0;
    for (let i = 0; i < s.count; i++) {
      if (accept && !accept[s.kind[i] as number]) continue;
      const id = s.ids[i] as number;
      this.ids[n++] = id;
      this.currPos[id * 2] = s.pos[i * 2] as number;
      this.currPos[id * 2 + 1] = s.pos[i * 2 + 1] as number;
      this.currAlive[id] = 1;
      if (this.prevAlive[id]) {
        const dx = (this.currPos[id * 2] as number) - (this.prevPos[id * 2] as number);
        const dy = (this.currPos[id * 2 + 1] as number) - (this.prevPos[id * 2 + 1] as number);
        // Implausible jump: the slot was reused by another agent, so do not fly across the map.
        if (dx * dx + dy * dy > AGENT_MAX_STEP_M * AGENT_MAX_STEP_M) this.prevAlive[id] = 0;
      }
    }
    this.count = n;
  }

  /** Number of agents whose current position lies inside the rectangle (meters). No allocation. */
  countInRect(minX: number, minY: number, maxX: number, maxY: number): number {
    let n = 0;
    for (let j = 0; j < this.count; j++) {
      const id = this.ids[j] as number;
      const x = this.currPos[id * 2] as number;
      const y = this.currPos[id * 2 + 1] as number;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) n++;
    }
    return n;
  }

  /** Current positions as a flat x,y list for the density aggregation. Valid until the next ingest. */
  forEachPosition(fn: (x: number, y: number) => void): void {
    for (let j = 0; j < this.count; j++) {
      const id = this.ids[j] as number;
      fn(this.currPos[id * 2] as number, this.currPos[id * 2 + 1] as number);
    }
  }

  private scaleFor(zoom: number): number {
    const radiusPx = Math.min(AGENT_MAX_RADIUS_PX, Math.max(this.minRadiusPx, this.radiusM * zoom));
    return (radiusPx * 2) / zoom / this.texSize;
  }

  /** Particle for draw slot `k`. Slot k always holds pool[k], so static buffers stay valid between frames. */
  private particle(k: number, scale: number): ParticleType {
    let p = this.pool[k];
    if (!p) {
      p = new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5, tint: this.tint });
      p.scaleX = scale;
      p.scaleY = scale;
      this.pool[k] = p;
      this.poolGrew = true;
    }
    return p;
  }

  setVisible(v: boolean): void {
    this.view.visible = v;
  }

  /** Positions the particles of agents inside the camera rectangle (plus margin); others are not drawn. */
  update(alpha: number, zoom: number): void {
    const scale = this.scaleFor(zoom);
    const out = this.view.particleChildren;
    const hw = cameraView.width / 2 / zoom + AGENT_CULL_MARGIN_M;
    const hh = cameraView.height / 2 / zoom + AGENT_CULL_MARGIN_M;
    const minX = cameraView.cx - hw;
    const maxX = cameraView.cx + hw;
    const minY = cameraView.cy - hh;
    const maxY = cameraView.cy + hh;
    const a = Math.min(1, Math.max(0, alpha));
    const { ids, currPos, prevPos, prevAlive } = this;
    let k = 0;
    this.poolGrew = false;
    for (let j = 0; j < this.count; j++) {
      const id = ids[j] as number;
      const cx = currPos[id * 2] as number;
      const cy = currPos[id * 2 + 1] as number;
      let x = cx;
      let y = cy;
      if (prevAlive[id]) {
        const px = prevPos[id * 2] as number;
        const py = prevPos[id * 2 + 1] as number;
        x = px + (cx - px) * a;
        y = py + (cy - py) * a;
      }
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const o = this.particle(k, scale);
      o.x = x;
      o.y = y;
      out[k++] = o;
    }
    out.length = k;
    if (zoom !== this.lastZoom) {
      this.lastZoom = zoom;
      for (const p of this.pool) {
        p.scaleX = scale;
        p.scaleY = scale;
      }
      this.view.update();
    } else if (this.poolGrew) this.view.update();
  }
}
