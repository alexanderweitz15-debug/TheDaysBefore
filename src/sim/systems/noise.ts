// Noise field (GDD 7 Lärm): level per coarse cell, emitted with linear falloff, decays once per second.
// Zombies move up its gradient (weighted per type), civilians are alerted by it.
import { TICK_RATE } from '../../core/loop';
import { NOISE } from '../../data/agents/noise';

export class NoiseField {
  readonly cellM = NOISE.cellM;
  readonly side: number;
  readonly level: Float32Array;
  /** Gradient of the last sample() call (level units per coarse cell). */
  gx = 0;
  gy = 0;

  constructor(sizeM: number) {
    this.side = Math.ceil(sizeM / this.cellM);
    this.level = new Float32Array(this.side * this.side);
  }

  coord(m: number): number {
    const c = Math.floor(m / this.cellM);
    return c < 0 ? 0 : c >= this.side ? this.side - 1 : c;
  }

  /** Adds `amount` at (x, y) falling off linearly to 0 at `radiusM` (capped at the hearing range). */
  emit(x: number, y: number, amount: number, radiusM: number): void {
    const r = Math.min(radiusM, NOISE.hearingRangeM);
    const { side, cellM, level } = this;
    const x0 = this.coord(x - r);
    const x1 = this.coord(x + r);
    const y0 = this.coord(y - r);
    const y1 = this.coord(y + r);
    for (let gy = y0; gy <= y1; gy++) {
      const dy = (gy + 0.5) * cellM - y;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = (gx + 0.5) * cellM - x;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        const c = gy * side + gx;
        level[c] = (level[c] as number) + amount * (1 - d / r);
      }
    }
  }

  /** Once per second: exponential decay, levels below minLevel drop to 0. */
  decay(tick: number): void {
    if (tick % TICK_RATE !== 0) return;
    const { level } = this;
    for (let c = 0; c < level.length; c++) {
      const v = (level[c] as number) * NOISE.keepPerS;
      level[c] = v < NOISE.minLevel ? 0 : v;
    }
  }

  /** Level at (x, y); sets gx, gy to the central-difference gradient there. */
  sample(x: number, y: number): number {
    const { side, level } = this;
    const cx = this.coord(x);
    const cy = this.coord(y);
    const row = cy * side;
    const v = level[row + cx] as number;
    if (v === 0) {
      this.gx = 0;
      this.gy = 0;
      return 0;
    }
    const e = cx < side - 1 ? (level[row + cx + 1] as number) : v;
    const w = cx > 0 ? (level[row + cx - 1] as number) : v;
    const s = cy < side - 1 ? (level[row + side + cx] as number) : v;
    const no = cy > 0 ? (level[row - side + cx] as number) : v;
    this.gx = e - w;
    this.gy = s - no;
    return v;
  }
}
