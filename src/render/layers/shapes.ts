// Sprite textures drawn from code (GDD 5, "Formen statt Assets"). All are white and tinted per set.
import { Graphics, type Renderer, type Texture } from 'pixi.js';
import type { ZombieShape } from '../../data/render';
import { palette } from '../palette';

export type ShapeName = ZombieShape | 'dot' | 'ring' | 'bar' | 'shock';

function draw(shape: ShapeName, s: number): Graphics {
  const h = s / 2;
  const base = palette.spriteBase;
  const g = new Graphics();
  switch (shape) {
    case 'dot':
      return g.circle(h, h, h).fill(base);
    case 'ring':
      // Dot with a clear gap and an outer ring: panic in pattern mode.
      return g
        .circle(h, h, h * 0.45)
        .fill(base)
        .circle(h, h, h * 0.92)
        .stroke({ width: s * 0.12, color: base });
    case 'diamond':
      return g.poly([h, 0, s, h, h, s, 0, h]).fill(base);
    case 'ellipse':
      return g.ellipse(h, h, h * 0.55, h).fill(base);
    case 'notched':
      // Diamond with a bite taken out of the top.
      return g.poly([0, h, h * 0.7, 0, h, h * 0.45, h * 1.3, 0, s, h, h, s]).fill(base);
    case 'rimmed':
      // Large square with a clear gap between body and rim.
      return g
        .roundRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88, s * 0.12)
        .stroke({ width: s * 0.1, color: base })
        .rect(s * 0.28, s * 0.28, s * 0.44, s * 0.44)
        .fill(base);
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? h : h * 0.5;
        pts.push(h + Math.cos(a) * r, h + Math.sin(a) * r);
      }
      return g.poly(pts).fill(base);
    }
    case 'shock':
      // Thin ring for pressure waves.
      return g.circle(h, h, h * 0.94).stroke({ width: s * 0.07, color: base });
    case 'bar':
      return g.roundRect(0, s * 0.25, s, s * 0.5, s * 0.25).fill(base);
  }
}

const cache = new WeakMap<Renderer, Map<string, Texture>>();

/** Texture for a shape, generated once per renderer and size. */
export function shapeTexture(renderer: Renderer, shape: ShapeName, size: number): Texture {
  let m = cache.get(renderer);
  if (!m) {
    m = new Map();
    cache.set(renderer, m);
  }
  const key = `${shape}:${size}`;
  let tex = m.get(key);
  if (!tex) {
    const g = draw(shape, size);
    tex = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    m.set(key, tex);
  }
  return tex;
}
