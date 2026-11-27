// Outlines of economy buildings (GDD 6): operating = accent, under conversion = dim, bottleneck = red with a cross
// (color-blind safe), plus the building picked for repurposing.
import { Graphics } from 'pixi.js';
import type { CityMapData } from '../../core/types/map';
import type { MissionView } from '../../core/types/mission';
import { palette } from '../palette';

const LINE_PX = 2;
const PICK_LINE_PX = 3;

export class EconomyLayer {
  readonly view = new Graphics();
  private map: CityMapData | null = null;

  setMap(map: CityMapData): void {
    this.map = map;
    this.view.clear();
  }

  private rect(b: number): [number, number, number, number] | null {
    const m = this.map;
    if (!m || b < 0 || b >= m.buildings.count) return null;
    const cs = m.cellSizeM;
    return [
      (m.buildings.x[b] as number) * cs,
      (m.buildings.y[b] as number) * cs,
      (m.buildings.w[b] as number) * cs,
      (m.buildings.h[b] as number) * cs,
    ];
  }

  update(mission: MissionView | null, target: number | null, zoom: number): void {
    const g = this.view;
    g.clear();
    if (!this.map) return;
    for (const eb of mission?.buildings ?? []) {
      const r = this.rect(eb.buildingId);
      if (!r) continue;
      const color = eb.bottleneck
        ? palette.economy.bottleneck.color
        : eb.progress < 1
          ? palette.economy.building.color
          : palette.economy.operating.color;
      const w = LINE_PX / zoom;
      g.rect(r[0], r[1], r[2], r[3]).stroke({ width: w, color });
      if (eb.bottleneck)
        g.moveTo(r[0], r[1])
          .lineTo(r[0] + r[2], r[1] + r[3])
          .moveTo(r[0] + r[2], r[1])
          .lineTo(r[0], r[1] + r[3])
          .stroke({ width: w, color, alpha: 0.7 });
    }
    const pick = target === null ? null : this.rect(target);
    if (pick) {
      const pad = 2 / zoom;
      g.rect(pick[0] - pad, pick[1] - pad, pick[2] + 2 * pad, pick[3] + 2 * pad).stroke({
        width: PICK_LINE_PX / zoom,
        color: palette.economy.pick.color,
      });
    }
  }
}
