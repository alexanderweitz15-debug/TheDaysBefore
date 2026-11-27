// Area damage (shells, mines, charges; GDD 9 Kollateral): zombies, civilians and own squads within the radius take
// damage with linear falloff. Civilians killed by own weapons count as collateral kills and cost nearby squads morale.

import { ZOMBIE_TYPES } from '../../core/types/zones';
import { MORTAR, UNIT_BEHAVIOUR } from '../../data/units/present';
import { ZOMBIE_TYPE_SPECS } from '../../data/zombies/viral-types';
import { killZombie, ZT_PATIENT_ZERO } from '../horde/zombie-traits';
import { killCivilian } from '../infection/attack';
import { GRID_COLLATERAL } from '../outcome/recorder';
import type { SimState } from '../state';
import { FX } from './fx';
import { creditKill, damageUnit, loseMorale } from './unit-damage';

/** Zombie armor per type (ZOMBIE_TYPES order; patient zero as walker). */
export const ZOMBIE_ARMOR = Float32Array.from(ZOMBIE_TYPES, (t, i) =>
  i === ZT_PATIENT_ZERO
    ? ZOMBIE_TYPE_SPECS.walker.armor
    : ZOMBIE_TYPE_SPECS[t as keyof typeof ZOMBIE_TYPE_SPECS].armor,
);

/** Damage to zombie j after armor; kills credit unit `owner` (-1 none). Returns true if it died. */
export function hitZombie(s: SimState, j: number, damage: number, pen: number, owner: number): boolean {
  const z = s.zombies;
  const hp = (z.hp[j] as number) - damage * (1 - (ZOMBIE_ARMOR[z.kind[j] as number] as number) * pen);
  z.hp[j] = hp;
  if (hp > 0) return false;
  s.fx.push(FX.death, z.posX[j] as number, z.posY[j] as number, 0);
  killZombie(s, j);
  creditKill(s, owner);
  return true;
}

export interface BlastOptions {
  /** Armor penetration of the damage type. */
  pen: number;
  /** Unit slot credited with kills, -1 none. */
  owner: number;
  /** Structure slot that is the source (charge) and excluded from structure damage, -1 none. */
  source: number;
  /** Destroy structures in the radius (charges). */
  structures: boolean;
}

export function explode(
  s: SimState,
  x: number,
  y: number,
  r: number,
  damage: number,
  fxType: number,
  o: BlastOptions,
): void {
  const fo = MORTAR.blastFalloff;
  const r2 = r * r;
  const n = s.n;
  const cm = s.cellM;
  // Zombies: bucket cells around the disc (one cell margin for movement since the buckets were built).
  const zb = s.zombieBuckets;
  const z = s.zombies;
  const x0 = Math.max(0, Math.floor((x - r) / cm) - 1);
  const x1 = Math.min(n - 1, Math.floor((x + r) / cm) + 1);
  const y0 = Math.max(0, Math.floor((y - r) / cm) - 1);
  const y1 = Math.min(n - 1, Math.floor((y + r) / cm) + 1);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const c = gy * n + gx;
      const end = zb.start[c + 1] as number;
      for (let k = zb.start[c] as number; k < end; k++) {
        const j = zb.items[k] as number;
        if (!z.alive[j]) continue;
        const dx = (z.posX[j] as number) - x;
        const dy = (z.posY[j] as number) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        hitZombie(s, j, damage * (1 - (fo * Math.sqrt(d2)) / r), o.pen, o.owner);
      }
    }
  }
  // Civilians (8 m hash, rebuilt every few ticks).
  const h = s.civilianHash;
  const cv = s.civilians;
  const hx0 = h.coord(x - r - cm);
  const hx1 = h.coord(x + r + cm);
  const hy0 = h.coord(y - r - cm);
  const hy1 = h.coord(y + r + cm);
  let collateral = 0;
  for (let gy = hy0; gy <= hy1; gy++) {
    for (let gx = hx0; gx <= hx1; gx++) {
      const c = gy * h.side + gx;
      const end = h.start[c + 1] as number;
      for (let k = h.start[c] as number; k < end; k++) {
        const j = h.items[k] as number;
        if (!cv.alive[j]) continue;
        const dx = (cv.posX[j] as number) - x;
        const dy = (cv.posY[j] as number) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const hp = (cv.hp[j] as number) - damage * (1 - (fo * Math.sqrt(d2)) / r);
        cv.hp[j] = hp;
        s.ct.panic[j] = 1;
        if (hp > 0) continue;
        s.fx.push(FX.death, cv.posX[j] as number, cv.posY[j] as number, 0);
        killCivilian(s, j, false);
        s.counters.collateralKills++;
        s.stats.mark(GRID_COLLATERAL, x, y);
        if (s.stats.collateralTick < 0) s.stats.collateralTick = s.tick;
        collateral++;
      }
    }
  }
  // Own squads (few; linear scan).
  const U = s.units;
  const p = U.pool;
  const rr = r + UNIT_BEHAVIOUR.squadRadiusM;
  const mr = UNIT_BEHAVIOUR.collateralMoraleRadiusM;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const dx = (p.posX[u] as number) - x;
    const dy = (p.posY[u] as number) - y;
    const d2 = dx * dx + dy * dy;
    if (collateral > 0 && (d2 <= mr * mr || u === o.owner))
      loseMorale(s, u, collateral * UNIT_BEHAVIOUR.moraleLossPerCollateral);
    if (d2 > rr * rr) continue;
    damageUnit(s, u, damage * (1 - (fo * Math.min(r, Math.sqrt(d2))) / r), false);
  }
  if (o.structures) s.structures.blast(s, x, y, r, o.source);
  s.fx.push(fxType, x, y, r);
  s.noise.emit(x, y, MORTAR.explosionNoise, MORTAR.explosionNoiseRadiusM);
}
