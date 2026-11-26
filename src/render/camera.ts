// Camera: pans and zooms the world container. No rotation. 1 m = 1 px at zoom 1.
import type { Container } from 'pixi.js';
import { settings } from '../ui/settings/store';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
const BASE_SPEED_PX_S = 700;
const EDGE_PX = 8;
const WHEEL_STEP = 0.0015;
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function typingInField(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  );
}

export class Camera {
  zoom = 1;
  /** World point at the screen center. */
  private cx = 0;
  private cy = 0;
  private worldW = 0;
  private worldH = 0;
  private fitted = false;
  private readonly keys = new Set<string>();
  private mouseX = -1;
  private mouseY = -1;
  private mouseOverMap = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly world: Container,
  ) {
    const on = <E extends keyof WindowEventMap>(t: E, fn: (e: WindowEventMap[E]) => void): void => {
      window.addEventListener(t, fn);
      this.offs.push(() => window.removeEventListener(t, fn));
    };
    on('keydown', (e) => {
      if (PAN_KEYS[e.code] && !typingInField() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
    });
    on('keyup', (e) => this.keys.delete(e.code));
    on('blur', () => this.keys.clear());
    on('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      // Edge scrolling only while the pointer is on the map, not over a UI panel.
      this.mouseOverMap = e.target === this.canvas;
    });
    document.addEventListener('mouseleave', this.onLeave);
    this.offs.push(() => document.removeEventListener('mouseleave', this.onLeave));
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onUp);
    host.addEventListener('auxclick', this.onAux);
  }

  private readonly onLeave = (): void => {
    this.mouseOverMap = false;
  };

  private readonly onAux = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };

  private get w(): number {
    return this.host.clientWidth;
  }
  private get h(): number {
    return this.host.clientHeight;
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * Math.exp(-e.deltaY * unit * WHEEL_STEP)));
    const rect = this.host.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // Keep the world point under the cursor fixed: wp = c + (s - size/2) / zoom.
    const wx = this.cx + (sx - this.w / 2) / this.zoom;
    const wy = this.cy + (sy - this.h / 2) / this.zoom;
    this.zoom = next;
    this.cx = wx - (sx - this.w / 2) / next;
    this.cy = wy - (sy - this.h / 2) / next;
    this.apply();
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 1) return;
    e.preventDefault();
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.host.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.cx -= (e.clientX - this.drag.x) / this.zoom;
    this.cy -= (e.clientY - this.drag.y) / this.zoom;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.apply();
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.drag?.id === e.pointerId) {
      this.host.releasePointerCapture(e.pointerId);
      this.drag = null;
    }
  };

  /** Sets the world size; on the first call the whole world is fitted into the view. */
  setWorldSize(widthM: number, heightM: number): void {
    this.worldW = widthM;
    this.worldH = heightM;
    if (this.fitted || widthM <= 0 || heightM <= 0 || this.w === 0) return;
    this.fitted = true;
    this.cx = widthM / 2;
    this.cy = heightM / 2;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(this.w / widthM, this.h / heightM) * 0.9));
    this.apply();
  }

  /** Per-frame input: held keys and edge scrolling. */
  update(dtMs: number): void {
    let dx = 0;
    let dy = 0;
    for (const k of this.keys) {
      const v = PAN_KEYS[k];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    if (settings.edgeScroll.peek() && this.mouseOverMap && !this.drag && document.hasFocus()) {
      if (this.mouseX <= EDGE_PX) dx -= 1;
      else if (this.mouseX >= this.w - EDGE_PX) dx += 1;
      if (this.mouseY <= EDGE_PX) dy -= 1;
      else if (this.mouseY >= this.h - EDGE_PX) dy += 1;
    }
    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy);
    const speed = (BASE_SPEED_PX_S * settings.cameraSpeed.peek()) / 100;
    const step = (speed * dtMs) / 1000 / this.zoom / len;
    this.cx += dx * step;
    this.cy += dy * step;
    this.apply();
  }

  /** Re-applies the transform, e.g. after a resize. */
  apply(): void {
    if (this.worldW > 0) {
      this.cx = Math.min(this.worldW, Math.max(0, this.cx));
      this.cy = Math.min(this.worldH, Math.max(0, this.cy));
    }
    this.world.scale.set(this.zoom);
    this.world.position.set(this.w / 2 - this.cx * this.zoom, this.h / 2 - this.cy * this.zoom);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.removeEventListener('wheel', this.onWheel);
    this.host.removeEventListener('pointerdown', this.onDown);
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerup', this.onUp);
    this.host.removeEventListener('pointercancel', this.onUp);
    this.host.removeEventListener('auxclick', this.onAux);
  }
}
