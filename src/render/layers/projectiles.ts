// Projectiles in flight (GDD 5, nah): bullets as short tracers along the flight direction, shells as dark dots
// with a warm core. Redraws a few hundred primitives per frame, no allocation of own objects.
import { Container, Graphics } from 'pixi.js';
import type { SnapshotView } from '../../core/types/snapshot';
import { PROJECTILE_BULLET, SHELL_RADIUS_PX, TRACER_LENGTH_M, TRACER_MIN_PX } from '../../data/render-combat';
import { palette } from '../palette';
import { cameraView } from '../view-state';
import { Tracked } from './tracked';

/** Projectiles that jump farther than this between snapshots are reused slots. */
const MAX_STEP_M = 400;

export class ProjectilesLayer {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly tracked = new Tracked(1024, MAX_STEP_M);

  constructor() {
    this.view.addChild(this.g);
  }

  ingest(s: SnapshotView): void {
    this.tracked.ingest(s.projectiles);
  }

  update(alpha: number, zoom: number): void {
    const g = this.g;
    g.clear();
    const tr = this.tracked;
    if (tr.count === 0) return;
    const px = 1 / zoom;
    const hw = cameraView.width / 2 / zoom + 20;
    const hh = cameraView.height / 2 / zoom + 20;
    const minLen = TRACER_MIN_PX * px;
    let bullets = false;
    for (let n = 0; n < tr.count; n++) {
      const id = tr.list[n] as number;
      if (tr.kind[id] !== PROJECTILE_BULLET) continue;
      const x = tr.x(id, alpha);
      const y = tr.y(id, alpha);
      if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
      let dx = 0;
      let dy = 0;
      if (tr.near(id)) {
        dx = tr.currX(id) - tr.prevX(id);
        dy = tr.currY(id) - tr.prevY(id);
      }
      const len = Math.hypot(dx, dy);
      const tl = Math.max(minLen, TRACER_LENGTH_M);
      if (len > 1e-6) g.moveTo(x - (dx / len) * tl, y - (dy / len) * tl).lineTo(x, y);
      else g.moveTo(x - tl, y).lineTo(x, y);
      bullets = true;
    }
    if (bullets) g.stroke({ width: Math.max(0.12, px * 1.2), color: palette.combat.tracer, alpha: 0.9 });
    let shells = false;
    const r = SHELL_RADIUS_PX * px;
    for (let n = 0; n < tr.count; n++) {
      const id = tr.list[n] as number;
      if (tr.kind[id] === PROJECTILE_BULLET) continue;
      const x = tr.x(id, alpha);
      const y = tr.y(id, alpha);
      if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
      g.circle(x, y, r * 1.6);
      shells = true;
    }
    if (shells) g.fill({ color: palette.structure.shade, alpha: 0.7 });
    for (let n = 0; n < tr.count; n++) {
      const id = tr.list[n] as number;
      if (tr.kind[id] === PROJECTILE_BULLET) continue;
      const x = tr.x(id, alpha);
      const y = tr.y(id, alpha);
      if (Math.abs(x - cameraView.cx) > hw || Math.abs(y - cameraView.cy) > hh) continue;
      g.circle(x, y, r);
    }
    if (shells) g.fill(palette.combat.shell);
  }
}
