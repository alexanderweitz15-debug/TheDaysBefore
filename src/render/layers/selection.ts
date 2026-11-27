// Rings around selected units (own forces: green, GDD 5).
import { Graphics } from 'pixi.js';
import type { AgentSection } from '../../core/types/snapshot';
import { SELECT_RING_LINE_PX, SELECT_RING_PX } from '../../data/hud';
import { palette } from '../palette';
import { selectedUnits } from '../view-state';

export class SelectionLayer {
  readonly view = new Graphics();
  private ids: ReadonlySet<number> = new Set();
  private source: readonly number[] | null = null;

  update(units: AgentSection | null, zoom: number): void {
    const g = this.view;
    g.clear();
    const sel = selectedUnits.value;
    if (sel !== this.source) {
      this.source = sel;
      this.ids = new Set(sel);
    }
    if (!units || sel.length === 0) return;
    const r = SELECT_RING_PX / zoom;
    for (let i = 0; i < units.count; i++) {
      if (this.ids.has(units.ids[i] as number))
        g.circle(units.pos[i * 2] as number, units.pos[i * 2 + 1] as number, r);
    }
    g.stroke({ width: SELECT_RING_LINE_PX / zoom, color: palette.friendly.color });
  }
}
