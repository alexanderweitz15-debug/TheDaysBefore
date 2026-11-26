// Test grid over the world: faint lines every 20 m, strong lines every 100 m, world border.
import { Container, Graphics } from 'pixi.js';
import { palette } from '../palette';

const MINOR_M = 20;
const MAJOR_M = 100;
const MINOR_FADE_IN = 0.3;
const MINOR_FULL = 0.6;

export class GridLayer {
  readonly view = new Container();
  private readonly minor = new Graphics();
  private readonly major = new Graphics();
  private readonly border = new Graphics();
  private widthM = 0;
  private heightM = 0;

  constructor() {
    this.view.addChild(this.minor, this.major, this.border);
  }

  /** Redraws only when the world size changes. */
  setWorldSize(widthM: number, heightM: number): void {
    if (widthM === this.widthM && heightM === this.heightM) return;
    this.widthM = widthM;
    this.heightM = heightM;
    this.minor.clear();
    this.major.clear();
    this.border.clear();
    for (let x = 0; x <= widthM; x += MINOR_M) {
      if (x % MAJOR_M !== 0) this.minor.moveTo(x, 0).lineTo(x, heightM);
    }
    for (let y = 0; y <= heightM; y += MINOR_M) {
      if (y % MAJOR_M !== 0) this.minor.moveTo(0, y).lineTo(widthM, y);
    }
    this.minor.stroke({ width: 1, color: palette.gridMinor, pixelLine: true });
    for (let x = 0; x <= widthM; x += MAJOR_M) this.major.moveTo(x, 0).lineTo(x, heightM);
    for (let y = 0; y <= heightM; y += MAJOR_M) this.major.moveTo(0, y).lineTo(widthM, y);
    this.major.stroke({ width: 1, color: palette.gridMajor, pixelLine: true });
    this.border.rect(0, 0, widthM, heightM).stroke({ width: 4, color: palette.worldBorder, alignment: 1 });
  }

  /** Fades the weak lines out when zoomed far away. */
  setZoom(zoom: number): void {
    const a = Math.min(1, Math.max(0, (zoom - MINOR_FADE_IN) / (MINOR_FULL - MINOR_FADE_IN)));
    this.minor.alpha = a;
    this.minor.visible = a > 0;
  }
}
