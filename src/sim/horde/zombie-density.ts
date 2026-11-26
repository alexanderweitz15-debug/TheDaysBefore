// Zombie counts and position sums per coarse cell, rebuilt every tick. Cheap "how many and where" queries for
// civilian perception and the safety field's zombie repulsion.
import type { AgentPool } from './pool';

export class ZombieDensity {
  readonly side: number;
  readonly count: Uint16Array;
  private readonly sumX: Float32Array;
  private readonly sumY: Float32Array;
  /** Result of the last query(): zombies in the window and their centroid. */
  found = 0;
  cx = 0;
  cy = 0;

  constructor(
    sizeM: number,
    readonly cellM: number,
  ) {
    this.side = Math.ceil(sizeM / cellM);
    const cells = this.side * this.side;
    this.count = new Uint16Array(cells);
    this.sumX = new Float32Array(cells);
    this.sumY = new Float32Array(cells);
  }

  coord(m: number): number {
    const c = Math.floor(m / this.cellM);
    return c < 0 ? 0 : c >= this.side ? this.side - 1 : c;
  }

  build(pool: AgentPool): void {
    const { count, sumX, sumY, side } = this;
    count.fill(0);
    sumX.fill(0);
    sumY.fill(0);
    const { posX, posY, alive } = pool;
    for (let i = 0; i < pool.highWater; i++) {
      if (!alive[i]) continue;
      const x = posX[i] as number;
      const y = posY[i] as number;
      const c = this.coord(y) * side + this.coord(x);
      count[c] = Math.min(0xffff, (count[c] as number) + 1);
      sumX[c] = (sumX[c] as number) + x;
      sumY[c] = (sumY[c] as number) + y;
    }
  }

  /**
   * Zombies in coarse cells overlapping the square of half-size r around (x, y) whose centroid lies within r.
   * Returns found; cx, cy are their centroid.
   */
  query(x: number, y: number, r: number): number {
    const { count, sumX, sumY, side } = this;
    const x0 = this.coord(x - r);
    const x1 = this.coord(x + r);
    const y0 = this.coord(y - r);
    const y1 = this.coord(y + r);
    const r2 = r * r;
    let k = 0;
    let sx = 0;
    let sy = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * side + gx;
        const m = count[c] as number;
        if (m === 0) continue;
        const ax = sumX[c] as number;
        const ay = sumY[c] as number;
        const dx = ax / m - x;
        const dy = ay / m - y;
        if (dx * dx + dy * dy > r2) continue;
        k += m;
        sx += ax;
        sy += ay;
      }
    }
    this.found = k;
    if (k > 0) {
      this.cx = sx / k;
      this.cy = sy / k;
    }
    return k;
  }
}
