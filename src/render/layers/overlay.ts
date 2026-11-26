// Debug overlays selected with key O: flow arrows, density field, sector borders, test grid.
import { Container, Graphics } from 'pixi.js';
import type { CityMapData } from '../../core/types/map';
import { NONE_U8 } from '../../core/types/map';
import type { DebugField } from '../../core/types/sim';
import { OVERLAY_DENSITY_ALPHA_MAX, OVERLAY_DENSITY_FULL } from '../../data/render';
import { palette } from '../palette';
import { cameraView, type OverlayMode } from '../view-state';
import { DensitySprite } from './density';
import { GridLayer } from './grid';

/** Unit vectors for flow codes 0..7: E, NE, N, NW, W, SW, S, SE (screen y points down). */
const S = Math.SQRT1_2;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [S, -S],
  [0, -1],
  [-S, -S],
  [-1, 0],
  [-S, S],
  [0, 1],
  [S, S],
];
const ARROW_SPACING_PX = 14;

export class OverlayLayer {
  readonly view = new Container();
  readonly grid = new GridLayer();
  private readonly flow = new Graphics();
  private readonly sectors = new Graphics();
  private readonly density = new DensitySprite(
    (palette.overlay.density >> 16) & 255,
    (palette.overlay.density >> 8) & 255,
    palette.overlay.density & 255,
  );
  private flowKey = '';
  private flowField: DebugField | null = null;
  private densityField: DebugField | null = null;

  constructor() {
    this.view.addChild(this.density.view, this.sectors, this.flow, this.grid.view);
  }

  setWorldSize(w: number, h: number): void {
    this.grid.setWorldSize(w, h);
  }

  setMap(map: CityMapData): void {
    const g = this.sectors;
    g.clear();
    const { widthCells: w, heightCells: h, cellSizeM: cs, sector } = map;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = sector[y * w + x];
        if (x + 1 < w && sector[y * w + x + 1] !== s)
          g.moveTo((x + 1) * cs, y * cs).lineTo((x + 1) * cs, (y + 1) * cs);
        if (y + 1 < h && sector[(y + 1) * w + x] !== s)
          g.moveTo(x * cs, (y + 1) * cs).lineTo((x + 1) * cs, (y + 1) * cs);
        if (s !== NONE_U8 && x === 0) g.moveTo(0, y * cs).lineTo(0, (y + 1) * cs);
      }
    }
    g.stroke({ width: 1, color: palette.map.sectorLine, alpha: 0.8, pixelLine: true });
  }

  private drawFlow(field: DebugField, zoom: number): void {
    const g = this.flow;
    g.clear();
    const cs = field.cellSizeM;
    const stride = Math.max(1, Math.ceil(ARROW_SPACING_PX / (cs * zoom)));
    const halfW = cameraView.width / 2 / zoom;
    const halfH = cameraView.height / 2 / zoom;
    const x0 = Math.max(0, Math.floor((cameraView.cx - halfW) / cs));
    const x1 = Math.min(field.widthCells, Math.ceil((cameraView.cx + halfW) / cs));
    const y0 = Math.max(0, Math.floor((cameraView.cy - halfH) / cs));
    const y1 = Math.min(field.heightCells, Math.ceil((cameraView.cy + halfH) / cs));
    const len = cs * stride * 0.4;
    const head = len * 0.45;
    for (let y = y0 - (y0 % stride); y < y1; y += stride) {
      for (let x = x0 - (x0 % stride); x < x1; x += stride) {
        const d = field.data[y * field.widthCells + x] as number;
        const v = DIRS[d];
        if (!v) continue;
        const cx = (x + 0.5) * cs;
        const cy = (y + 0.5) * cs;
        const tx = cx + v[0] * len;
        const ty = cy + v[1] * len;
        g.moveTo(cx - v[0] * len, cy - v[1] * len).lineTo(tx, ty);
        g.moveTo(tx, ty).lineTo(tx - v[0] * head + v[1] * head * 0.5, ty - v[1] * head - v[0] * head * 0.5);
        g.moveTo(tx, ty).lineTo(tx - v[0] * head - v[1] * head * 0.5, ty - v[1] * head + v[0] * head * 0.5);
      }
    }
    g.stroke({ width: 1, color: palette.overlay.flow, alpha: 0.85, pixelLine: true });
  }

  update(mode: OverlayMode, field: DebugField | null, zoom: number): void {
    this.view.visible = mode !== 'off';
    this.grid.view.visible = mode === 'grid';
    this.sectors.visible = mode === 'sectors';
    this.flow.visible = mode === 'flow' && field?.kind === 'flow';
    this.density.view.visible = mode === 'density' && field?.kind === 'density';
    if (mode === 'grid') this.grid.setZoom(zoom);
    if (!field) return;
    if (mode === 'flow' && field.kind === 'flow') {
      const key = `${Math.round(cameraView.cx)}|${Math.round(cameraView.cy)}|${zoom.toFixed(3)}|${cameraView.width}`;
      if (field !== this.flowField || key !== this.flowKey) {
        this.flowField = field;
        this.flowKey = key;
        this.drawFlow(field, zoom);
      }
    } else if (mode === 'density' && field.kind === 'density' && field !== this.densityField) {
      this.densityField = field;
      this.density.ensure(field.widthCells, field.heightCells, field.cellSizeM);
      this.density.fill((i) =>
        Math.min(
          OVERLAY_DENSITY_ALPHA_MAX,
          ((field.data[i] as number) / OVERLAY_DENSITY_FULL) * OVERLAY_DENSITY_ALPHA_MAX,
        ),
      );
    }
  }
}
