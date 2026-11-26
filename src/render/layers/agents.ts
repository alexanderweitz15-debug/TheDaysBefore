// Zombies and civilians. Zombies switch to a density texture above the sprite limit (visible zombies) or at strategic zoom.
// Shapes differ for color-blind safety: civilians are round dots, zombies diamonds.
import { Graphics, type Renderer, type Texture } from 'pixi.js';
import type { SnapshotView } from '../../core/types/snapshot';
import {
  AGENT_TEX_SIZE,
  CIVILIAN_CAPACITY,
  CIVILIAN_RADIUS_M,
  DENSITY_ALPHA_MAX,
  DENSITY_ALPHA_MIN,
  DENSITY_CELL_M,
  DENSITY_FULL_COUNT,
  SPRITE_LIMIT_HYSTERESIS,
  ZOMBIE_CAPACITY,
  ZOMBIE_RADIUS_M,
  ZOOM_STRATEGIC,
  ZOOM_STRATEGIC_HYSTERESIS,
} from '../../data/render';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { cameraView } from '../view-state';
import { AgentSet } from './agent-set';
import { DensitySprite } from './density';

const TEX_SIZE = AGENT_TEX_SIZE;

export class AgentsLayer {
  readonly civilians: AgentSet;
  readonly zombies: AgentSet;
  readonly density: DensitySprite;
  private densityMode = false;
  private grid = new Uint16Array(0);
  private gw = 0;
  private gh = 0;

  constructor(renderer: Renderer) {
    const h = TEX_SIZE / 2;
    const base = palette.spriteBase;
    const dot = new Graphics().circle(h, h, h).fill(base);
    const dotTex: Texture = renderer.generateTexture({ target: dot, resolution: 2 });
    dot.destroy();
    const diamond = new Graphics().poly([h, 0, TEX_SIZE, h, h, TEX_SIZE, 0, h]).fill(base);
    const diamondTex: Texture = renderer.generateTexture({ target: diamond, resolution: 2 });
    diamond.destroy();
    const v = palette.infection.viral.color;
    this.civilians = new AgentSet(
      dotTex,
      TEX_SIZE,
      palette.civilian.color,
      CIVILIAN_RADIUS_M,
      CIVILIAN_CAPACITY,
    );
    this.zombies = new AgentSet(diamondTex, TEX_SIZE, v, ZOMBIE_RADIUS_M, ZOMBIE_CAPACITY);
    this.density = new DensitySprite((v >> 16) & 255, (v >> 8) & 255, v & 255);
  }

  ingest(s: SnapshotView): void {
    this.zombies.ingest(s.zombies);
    this.civilians.ingest(s.civilians);
    if (this.densityMode) this.aggregate(s.widthM, s.heightM);
  }

  private aggregate(widthM: number, heightM: number): void {
    const gw = Math.ceil(widthM / DENSITY_CELL_M);
    const gh = Math.ceil(heightM / DENSITY_CELL_M);
    if (gw !== this.gw || gh !== this.gh) {
      this.gw = gw;
      this.gh = gh;
      this.grid = new Uint16Array(gw * gh);
    } else {
      this.grid.fill(0);
    }
    const grid = this.grid;
    this.zombies.forEachPosition((x, y) => {
      const cx = Math.min(gw - 1, Math.max(0, (x / DENSITY_CELL_M) | 0));
      const cy = Math.min(gh - 1, Math.max(0, (y / DENSITY_CELL_M) | 0));
      const i = cy * gw + cx;
      if (grid[i] !== 0xffff) grid[i] = (grid[i] as number) + 1;
    });
    this.density.ensure(gw, gh, DENSITY_CELL_M);
    this.density.fill((i) =>
      Math.min(
        1,
        ((grid[i] as number) / DENSITY_FULL_COUNT) * DENSITY_ALPHA_MAX +
          ((grid[i] as number) > 0 ? DENSITY_ALPHA_MIN : 0),
      ),
    );
  }

  /** Decides sprite or density mode; returns true when the mode changed. */
  private chooseMode(zoom: number): boolean {
    const limit = settings.spriteLimit.peek();
    const hw = cameraView.width / 2 / zoom;
    const hh = cameraView.height / 2 / zoom;
    const count = this.zombies.countInRect(
      cameraView.cx - hw,
      cameraView.cy - hh,
      cameraView.cx + hw,
      cameraView.cy + hh,
    );
    const strategic = this.densityMode
      ? zoom < ZOOM_STRATEGIC * ZOOM_STRATEGIC_HYSTERESIS
      : zoom < ZOOM_STRATEGIC;
    const tooMany = this.densityMode ? count > limit * SPRITE_LIMIT_HYSTERESIS : count > limit;
    const next = strategic || tooMany;
    const changed = next !== this.densityMode;
    this.densityMode = next;
    return changed;
  }

  update(sim: SnapshotView | null, alpha: number, zoom: number): void {
    if (!sim) return;
    if (this.chooseMode(zoom)) {
      if (this.densityMode) this.aggregate(sim.widthM, sim.heightM);
    }
    this.zombies.setVisible(!this.densityMode);
    this.density.view.visible = this.densityMode;
    if (!this.densityMode) this.zombies.update(alpha, zoom);
    this.civilians.update(alpha, zoom);
  }
}
