// Ground, water, park and forest of one tile as horizontal runs of cells.
import type { Graphics } from 'pixi.js';
import { type CityMapData, TERRAIN } from '../../core/types/map';
import { palette } from '../palette';
import type { Rect } from './rect';

const LAYERS = [
  [TERRAIN.water, palette.map.water],
  [TERRAIN.park, palette.map.park],
  [TERRAIN.forest, palette.map.forest],
] as const;

export function drawTerrain(g: Graphics, map: CityMapData, r: Rect): void {
  const cs = map.cellSizeM;
  const worldW = map.widthCells * cs;
  const worldH = map.heightCells * cs;
  const x1 = Math.min(r.x1, worldW);
  const y1 = Math.min(r.y1, worldH);
  if (x1 <= r.x0 || y1 <= r.y0) return;
  g.rect(r.x0, r.y0, x1 - r.x0, y1 - r.y0).fill(palette.map.ground);
  const cx0 = Math.floor(r.x0 / cs);
  const cx1 = Math.min(map.widthCells, Math.ceil(x1 / cs));
  const cy0 = Math.floor(r.y0 / cs);
  const cy1 = Math.min(map.heightCells, Math.ceil(y1 / cs));
  for (const [code, color] of LAYERS) {
    let any = false;
    for (let y = cy0; y < cy1; y++) {
      const row = y * map.widthCells;
      let x = cx0;
      while (x < cx1) {
        if (map.terrain[row + x] !== code) {
          x++;
          continue;
        }
        const start = x;
        while (x < cx1 && map.terrain[row + x] === code) x++;
        g.rect(start * cs, y * cs, (x - start) * cs, cs);
        any = true;
      }
    }
    if (any) g.fill(color);
  }
}
