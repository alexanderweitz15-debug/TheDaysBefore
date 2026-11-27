// Screamer (GDD 8 type 3): with a human in sight it screams. The scream is noise and gives zombies within its
// radius a speed boost for a while; then a cooldown.
import { TICK_RATE } from '../../core/loop';
import { SCREAMER } from '../../data/zombies/viral-types';
import type { SimState } from '../state';
import { ZT_SCREAMER } from './zombie-traits';

export function screams(s: SimState): void {
  const z = s.zombies;
  const { screamAt, boostUntil } = s.zt;
  const tick = s.tick;
  const b = s.zombieBuckets;
  const n = s.n;
  const r = SCREAMER.radiusM;
  const r2 = r * r;
  const until = tick + SCREAMER.durationS * TICK_RATE;
  for (let i = 0; i < z.highWater; i++) {
    if (
      !z.alive[i] ||
      z.kind[i] !== ZT_SCREAMER ||
      ((z.target[i] as number) < 0 && (s.zt.unitTarget[i] as number) < 0)
    )
      continue;
    if ((screamAt[i] as number) > tick) continue;
    screamAt[i] = tick + SCREAMER.cooldownS * TICK_RATE;
    const x = z.posX[i] as number;
    const y = z.posY[i] as number;
    s.noise.emit(x, y, SCREAMER.noise, r);
    const x0 = Math.max(0, Math.floor((x - r) / s.cellM));
    const x1 = Math.min(n - 1, Math.floor((x + r) / s.cellM));
    const y0 = Math.max(0, Math.floor((y - r) / s.cellM));
    const y1 = Math.min(n - 1, Math.floor((y + r) / s.cellM));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * n + gx;
        const end = b.start[c + 1] as number;
        for (let k = b.start[c] as number; k < end; k++) {
          const dx = (b.x[k] as number) - x;
          const dy = (b.y[k] as number) - y;
          if (dx * dx + dy * dy <= r2) boostUntil[b.items[k] as number] = until;
        }
      }
    }
  }
}
