// Minimap (GDD 14): map, zombie density, own units, camera frame. Click or drag jumps the camera.
import { useEffect, useRef } from 'preact/hooks';
import type { SimView } from '../../core/types/app';
import { TERRAIN } from '../../core/types/map';
import { MINIMAP_DENSITY_CELLS, MINIMAP_DENSITY_FULL, MINIMAP_REFRESH_MS } from '../../data/hud';
import { palette, toCss } from '../../render/palette';
import { cameraView, jumpCamera } from '../../render/view-state';
import { t } from '../i18n';

const SIZE = 224;

export function Minimap({ sim }: { sim: SimView }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const base = document.createElement('canvas');
    base.width = SIZE;
    base.height = SIZE;
    const bctx = base.getContext('2d');
    let haveBase = false;
    const buildBase = (): void => {
      const m = sim.map;
      if (!m || !bctx) return;
      const img = bctx.createImageData(SIZE, SIZE);
      const colors = new Map<number, number>([
        [TERRAIN.water, palette.map.water],
        [TERRAIN.park, palette.map.park],
        [TERRAIN.forest, palette.map.forest],
      ]);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const cx = Math.min(m.widthCells - 1, ((x / SIZE) * m.widthCells) | 0);
          const cy = Math.min(m.heightCells - 1, ((y / SIZE) * m.heightCells) | 0);
          const i = cy * m.widthCells + cx;
          const b = m.buildingId[i] as number;
          const c =
            b >= 0
              ? palette.map.roofs.residential
              : (colors.get(m.terrain[i] as number) ?? palette.map.ground);
          const o = (y * SIZE + x) * 4;
          img.data[o] = (c >> 16) & 255;
          img.data[o + 1] = (c >> 8) & 255;
          img.data[o + 2] = c & 255;
          img.data[o + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
      haveBase = true;
    };
    const grid = new Uint16Array(MINIMAP_DENSITY_CELLS * MINIMAP_DENSITY_CELLS);
    const dens = document.createElement('canvas');
    dens.width = MINIMAP_DENSITY_CELLS;
    dens.height = MINIMAP_DENSITY_CELLS;
    const dctx = dens.getContext('2d');
    const viral = palette.infection.viral.color;
    const draw = (): void => {
      if (!haveBase) buildBase();
      ctx.fillStyle = toCss(palette.background);
      ctx.fillRect(0, 0, SIZE, SIZE);
      if (haveBase) ctx.drawImage(base, 0, 0);
      const s = sim.curr;
      if (!s || s.widthM <= 0 || s.heightM <= 0) return;
      const kx = SIZE / s.widthM;
      const ky = SIZE / s.heightM;
      if (dctx) {
        grid.fill(0);
        const z = s.zombies;
        const n = MINIMAP_DENSITY_CELLS;
        for (let i = 0; i < z.count; i++) {
          const cx = Math.min(n - 1, (((z.pos[i * 2] as number) / s.widthM) * n) | 0);
          const cy = Math.min(n - 1, (((z.pos[i * 2 + 1] as number) / s.heightM) * n) | 0);
          grid[cy * n + cx] = (grid[cy * n + cx] as number) + 1;
        }
        const img = dctx.createImageData(n, n);
        for (let i = 0; i < grid.length; i++) {
          const c = grid[i] as number;
          img.data[i * 4] = (viral >> 16) & 255;
          img.data[i * 4 + 1] = (viral >> 8) & 255;
          img.data[i * 4 + 2] = viral & 255;
          img.data[i * 4 + 3] = c > 0 ? 90 + Math.min(1, c / MINIMAP_DENSITY_FULL) * 165 : 0;
        }
        dctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(dens, 0, 0, SIZE, SIZE);
      }
      ctx.fillStyle = toCss(palette.friendly.color);
      const u = s.units;
      for (let i = 0; i < u.count; i++) {
        ctx.fillRect((u.pos[i * 2] as number) * kx - 1.5, (u.pos[i * 2 + 1] as number) * ky - 1.5, 3, 3);
      }
      ctx.strokeStyle = toCss(palette.ui.text);
      ctx.lineWidth = 1;
      const w = (cameraView.width / cameraView.zoom) * kx;
      const h = (cameraView.height / cameraView.zoom) * ky;
      ctx.strokeRect(cameraView.cx * kx - w / 2, cameraView.cy * ky - h / 2, w, h);
    };
    draw();
    const id = window.setInterval(draw, MINIMAP_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [sim]);

  const jump = (e: PointerEvent): void => {
    const c = ref.current;
    const s = sim.curr;
    if (!c || !s) return;
    const r = c.getBoundingClientRect();
    jumpCamera(((e.clientX - r.left) / r.width) * s.widthM, ((e.clientY - r.top) / r.height) * s.heightM);
  };
  return (
    <aside class="sz-panel sz-minimap" data-tutorial-id="minimap" title={t('minimap.tip')}>
      <canvas
        ref={ref}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={t('minimap.label')}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) jump(e);
        }}
      />
    </aside>
  );
}
