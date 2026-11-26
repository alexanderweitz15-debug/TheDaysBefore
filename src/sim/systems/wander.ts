// Dummy movement: random heading drift at constant speed, reflection at the world edges.
import type { Rng } from '../../core/rng';
import type { AgentSoA } from '../agents';
import { cosU, sinU } from '../math/trig';

export interface WanderParams {
  /** Max heading change per tick in angle units. */
  readonly jitterUnits: number;
  readonly speedMps: number;
  /** Tick length in seconds. */
  readonly dt: number;
  readonly widthM: number;
  readonly heightM: number;
}

/** Advances agents [0, count) by one tick. Mutates only `agents` and `rng`, allocates nothing. */
export function wander(agents: AgentSoA, count: number, rng: Rng, p: WanderParams): void {
  const { posX, posY, velX, velY } = agents;
  const { jitterUnits, speedMps, dt, widthM, heightM } = p;
  for (let i = 0; i < count; i++) {
    const turn = rng.nextInt(-jitterUnits, jitterUnits + 1);
    const c = cosU(turn);
    const s = sinU(turn);
    const vx0 = velX[i] as number;
    const vy0 = velY[i] as number;
    let vx = vx0 * c - vy0 * s;
    let vy = vx0 * s + vy0 * c;
    // Renormalize so float rounding never lets the speed drift.
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) {
      const k = speedMps / len;
      vx *= k;
      vy *= k;
    } else {
      vx = speedMps;
      vy = 0;
    }

    let x = (posX[i] as number) + vx * dt;
    let y = (posY[i] as number) + vy * dt;
    if (x < 0) {
      x = -x;
      vx = -vx;
    } else if (x > widthM) {
      x = 2 * widthM - x;
      vx = -vx;
    }
    if (y < 0) {
      y = -y;
      vy = -vy;
    } else if (y > heightM) {
      y = 2 * heightM - y;
      vy = -vy;
    }

    posX[i] = Math.min(Math.max(x, 0), widthM);
    posY[i] = Math.min(Math.max(y, 0), heightM);
    velX[i] = vx;
    velY[i] = vy;
  }
}
