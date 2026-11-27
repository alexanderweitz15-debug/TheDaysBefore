// Render events (FX_TYPES) as flat [type, x, y, param]. Collected over ticks until the host reads them
// (writeFx clears), capped; events beyond the cap are dropped. Not part of the world hash.
// param (core/types/combat.ts): shot = direction in rad, explosion/mineBlast = radius in m, else 0.
import { FX_TYPES, type FxType } from '../../core/types/combat';

export const FX = Object.fromEntries(FX_TYPES.map((t, i) => [t, i])) as Record<FxType, number>;

export class FxBuffer {
  readonly data: Float32Array;
  count = 0;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * 4);
  }

  push(type: number, x: number, y: number, param: number): void {
    if (this.count >= this.capacity) return;
    const k = this.count * 4;
    this.data[k] = type;
    this.data[k + 1] = x;
    this.data[k + 2] = y;
    this.data[k + 3] = param;
    this.count++;
  }

  /** Copies up to out.length / 4 events and clears the buffer. */
  drain(out: Float32Array): void {
    const n = Math.min(this.count * 4, out.length - (out.length % 4));
    out.set(this.data.subarray(0, n));
    this.count = 0;
  }
}
