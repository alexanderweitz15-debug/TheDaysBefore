// Grid of RGBA cells shown as one sprite. Used for the zombie density texture and the debug density overlay.
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';

export class DensitySprite {
  readonly view = new Container();
  private sprite: Sprite | null = null;
  private source: BufferImageSource | null = null;
  private pixels = new Uint8Array(0);
  private w = 0;
  private h = 0;

  constructor(
    private readonly r: number,
    private readonly g: number,
    private readonly b: number,
  ) {
    this.view.visible = false;
  }

  /** Ensures a grid of w x h cells, each `cellM` meters wide. */
  ensure(w: number, h: number, cellM: number): void {
    if (this.sprite && w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.pixels = new Uint8Array(w * h * 4);
    this.sprite?.destroy();
    this.source?.destroy();
    this.source = new BufferImageSource({
      resource: this.pixels,
      width: w,
      height: h,
      format: 'rgba8unorm',
      alphaMode: 'premultiplied-alpha',
      scaleMode: 'linear',
    });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    this.sprite.scale.set(cellM);
    this.view.addChild(this.sprite);
  }

  /** `value(i)` returns 0..1 opacity for cell i. Pixels are premultiplied. */
  fill(value: (i: number) => number): void {
    const px = this.pixels;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const a = value(i);
      const o = i * 4;
      px[o] = this.r * a;
      px[o + 1] = this.g * a;
      px[o + 2] = this.b * a;
      px[o + 3] = a * 255;
    }
    this.source?.update();
  }
}
