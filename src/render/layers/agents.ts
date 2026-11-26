// Zombies and civilians. Zombies switch to a density texture above the sprite limit (visible zombies) or at strategic zoom.
// Shapes differ for color-blind safety (GDD 5): civilians are round dots, every zombie type has its own non-round shape.
import type { Renderer } from 'pixi.js';
import type { SnapshotView } from '../../core/types/snapshot';
import { CIVILIAN_STATES, ZOMBIE_TYPES } from '../../core/types/zones';
import {
  AGENT_TEX_SIZE,
  CIVILIAN_CAPACITY,
  CIVILIAN_RADIUS_M,
  DENSITY_ALPHA_MAX,
  DENSITY_ALPHA_MIN,
  DENSITY_CELL_M,
  DENSITY_FULL_COUNT,
  HIGHLIGHT_MIN_RADIUS_PX,
  PANIC_CAPACITY,
  PANIC_FLICKER_DIM,
  PANIC_FLICKER_MS,
  SPRITE_LIMIT_HYSTERESIS,
  ZOMBIE_LOOK,
  ZOOM_STRATEGIC,
  ZOOM_STRATEGIC_HYSTERESIS,
} from '../../data/render';
import { settings } from '../../ui/settings/store';
import { palette } from '../palette';
import { cameraView } from '../view-state';
import { AgentSet } from './agent-set';
import { DensitySprite } from './density';
import { shapeTexture } from './shapes';

const TEX = AGENT_TEX_SIZE;

function mask(codes: readonly number[]): Uint8Array {
  const m = new Uint8Array(256);
  for (const c of codes) m[c] = 1;
  return m;
}

const STATE = (name: (typeof CIVILIAN_STATES)[number]): number => CIVILIAN_STATES.indexOf(name);
// Sheltered, evacuated and dead civilians are not on the street, so they are not drawn.
const NORMAL_STATES = mask((['routine', 'alerted', 'fleeing', 'incubating'] as const).map(STATE));
const PANIC_STATES = mask([STATE('panic')]);

export class AgentsLayer {
  /** Normal civilians (incubating look normal, GDD 7). */
  readonly civilians: AgentSet;
  /** Panicking civilians, round dot with flicker, and a ring variant for pattern mode. */
  readonly panic: AgentSet;
  readonly panicRing: AgentSet;
  readonly zombieSets: AgentSet[] = [];
  readonly density: DensitySprite;
  private densityMode = false;
  private grid = new Uint16Array(0);
  private gw = 0;
  private gh = 0;

  constructor(renderer: Renderer) {
    const dot = shapeTexture(renderer, 'dot', TEX);
    const ring = shapeTexture(renderer, 'ring', TEX);
    this.civilians = new AgentSet(
      dot,
      TEX,
      palette.civilian.color,
      CIVILIAN_RADIUS_M,
      CIVILIAN_CAPACITY,
      NORMAL_STATES,
    );
    const pc = palette.civilianPanic.color;
    this.panic = new AgentSet(dot, TEX, pc, CIVILIAN_RADIUS_M, PANIC_CAPACITY, PANIC_STATES);
    this.panicRing = new AgentSet(ring, TEX, pc, CIVILIAN_RADIUS_M * 1.4, PANIC_CAPACITY, PANIC_STATES);
    const v = palette.infection.viral.color;
    ZOMBIE_TYPES.forEach((type, code) => {
      const look = ZOMBIE_LOOK[type];
      const tint = type === 'patientZero' ? palette.patientZero.color : v;
      const minPx = type === 'patientZero' ? HIGHLIGHT_MIN_RADIUS_PX : undefined;
      this.zombieSets.push(
        new AgentSet(
          shapeTexture(renderer, look.shape, TEX),
          TEX,
          tint,
          look.radiusM,
          look.capacity,
          mask([code]),
          minPx,
        ),
      );
    });
    this.civilianViews = [this.civilians, this.panic, this.panicRing];
    this.density = new DensitySprite((v >> 16) & 255, (v >> 8) & 255, v & 255);
  }

  /** Civilian sets in draw order (a fixed array, so ingest allocates nothing). */
  readonly civilianViews: readonly AgentSet[];

  ingest(s: SnapshotView): void {
    for (const z of this.zombieSets) z.ingest(s.zombies);
    for (const c of this.civilianViews) c.ingest(s.civilians);
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
    const add = (x: number, y: number): void => {
      const cx = Math.min(gw - 1, Math.max(0, (x / DENSITY_CELL_M) | 0));
      const cy = Math.min(gh - 1, Math.max(0, (y / DENSITY_CELL_M) | 0));
      const i = cy * gw + cx;
      if (grid[i] !== 0xffff) grid[i] = (grid[i] as number) + 1;
    };
    for (const z of this.zombieSets) z.forEachPosition(add);
    this.density.ensure(gw, gh, DENSITY_CELL_M);
    this.density.fill((i) =>
      Math.min(
        1,
        ((grid[i] as number) / DENSITY_FULL_COUNT) * DENSITY_ALPHA_MAX +
          ((grid[i] as number) > 0 ? DENSITY_ALPHA_MIN : 0),
      ),
    );
  }

  private visibleZombies(zoom: number): number {
    const hw = cameraView.width / 2 / zoom;
    const hh = cameraView.height / 2 / zoom;
    const x0 = cameraView.cx - hw;
    const y0 = cameraView.cy - hh;
    const x1 = cameraView.cx + hw;
    const y1 = cameraView.cy + hh;
    let n = 0;
    for (const z of this.zombieSets) n += z.countInRect(x0, y0, x1, y1);
    return n;
  }

  /** Decides sprite or density mode; returns true when the mode changed. */
  private chooseMode(zoom: number): boolean {
    const limit = settings.spriteLimit.peek();
    const count = this.visibleZombies(zoom);
    const strategic = this.densityMode
      ? zoom < ZOOM_STRATEGIC * ZOOM_STRATEGIC_HYSTERESIS
      : zoom < ZOOM_STRATEGIC;
    const tooMany = this.densityMode ? count > limit * SPRITE_LIMIT_HYSTERESIS : count > limit;
    const next = strategic || tooMany;
    const changed = next !== this.densityMode;
    this.densityMode = next;
    return changed;
  }

  update(sim: SnapshotView | null, alpha: number, zoom: number, nowMs: number): void {
    if (!sim) return;
    if (this.chooseMode(zoom)) {
      if (this.densityMode) this.aggregate(sim.widthM, sim.heightM);
    }
    for (const z of this.zombieSets) {
      z.setVisible(!this.densityMode);
      if (!this.densityMode) z.update(alpha, zoom);
    }
    this.density.view.visible = this.densityMode;
    const patterns = settings.patternMode.peek();
    const still = settings.reducedMotion.peek();
    this.civilians.update(alpha, zoom);
    this.panic.setVisible(!patterns);
    this.panicRing.setVisible(patterns);
    (patterns ? this.panicRing : this.panic).update(alpha, zoom);
    const dim = !still && nowMs % PANIC_FLICKER_MS > PANIC_FLICKER_MS / 2;
    this.panic.view.alpha = dim ? PANIC_FLICKER_DIM : 1;
  }
}
