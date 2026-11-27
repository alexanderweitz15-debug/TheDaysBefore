// Combat (GDD 4 step 11, GDD 9): staggered target search (targeting.ts), hit chance by range, rank and movement,
// armor, ammo, tracers and mortar shells, MG suppression cones, gunfire noise, morale, depot resupply and medics.
// Allocation-free.
import { TICK_RATE } from '../../core/loop';
import {
  ARMOR_PENETRATION,
  type DamageType,
  ECONOMY_M3,
  MORTAR,
  UNIT_BEHAVIOUR,
  UNIT_ENGINE,
} from '../../data/units/present';
import { ZT_COLOSSUS, ZT_SCREAMER } from '../horde/zombie-traits';
import { atan2Angle, cosU, RAD_PER_UNIT, unitsFromRad } from '../math/trig';
import type { SimState } from '../state';
import { explode, hitZombie } from './explosion';
import { FX } from './fx';
import { PT_SHELL, PT_TRACER } from './projectiles';
import { aimMortar, findTarget, towerBonus } from './targeting';
import { loseMorale } from './unit-damage';
import {
  FM_FREE,
  UT_AMMO,
  UT_AREA,
  UT_DAMAGE,
  UT_DAMAGE_TYPE,
  UT_HEAL,
  UT_HP,
  UT_INDIRECT,
  UT_NOISE,
  UT_RANGE,
  UT_RATE,
  UT_SNIPER,
  UT_SPECIALS,
  UT_SUPPRESSION,
} from './units';

const DT = 1 / TICK_RATE;
const UT_PEN = Float32Array.from(UT_DAMAGE_TYPE, (t) => ARMOR_PENETRATION[t as DamageType]);
const COS_CONE = cosU(unitsFromRad(UNIT_BEHAVIOUR.suppressionConeRad));
const SUPPRESS_MARK_TICKS = Math.max(1, Math.floor(UNIT_BEHAVIOUR.suppressionTicks / 3));

function markSuppression(
  s: SimState,
  x: number,
  y: number,
  tx: number,
  ty: number,
  range: number,
  tick: number,
): void {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-3) return;
  const ux = dx / d;
  const uy = dy / d;
  const n = s.n;
  const cm = s.cellM;
  const ex = x + ux * range;
  const ey = y + uy * range;
  // Bounding box of the cone (apex, far end, and the far edge's half width).
  const hw = range * Math.sqrt(1 - COS_CONE * COS_CONE);
  const x0 = Math.max(0, Math.floor((Math.min(x, ex) - hw) / cm));
  const x1 = Math.min(n - 1, Math.floor((Math.max(x, ex) + hw) / cm));
  const y0 = Math.max(0, Math.floor((Math.min(y, ey) - hw) / cm));
  const y1 = Math.min(n - 1, Math.floor((Math.max(y, ey) + hw) / cm));
  const until = tick + UNIT_BEHAVIOUR.suppressionTicks;
  const sup = s.suppressUntil;
  for (let gy = y0; gy <= y1; gy++) {
    const cy = (gy + 0.5) * cm - y;
    for (let gx = x0; gx <= x1; gx++) {
      const cx = (gx + 0.5) * cm - x;
      const along = cx * ux + cy * uy;
      if (along <= 0 || along > range) continue;
      const l2 = cx * cx + cy * cy;
      if (along * along < COS_CONE * COS_CONE * l2) continue;
      sup[gy * n + gx] = until;
    }
  }
}

/** Projectiles: move, land (shells explode). */
function advanceProjectiles(s: SimState, tick: number): void {
  const P = s.projectiles;
  const p = P.pool;
  for (let i = 0; i < p.highWater; i++) {
    if (!p.alive[i]) continue;
    const t0 = P.t0[i] as number;
    const t1 = P.t1[i] as number;
    if (tick >= t1) {
      const kind = p.kind[i] as number;
      const x = P.tx[i] as number;
      const y = P.ty[i] as number;
      const owner = p.target[i] as number;
      const dmg = p.hp[i] as number;
      const r = P.radius[i] as number;
      p.release(i);
      if (kind === PT_SHELL)
        explode(s, x, y, r, dmg, FX.explosion, {
          pen: ARMOR_PENETRATION.explosive,
          owner,
          source: -1,
          structures: false,
        });
      continue;
    }
    const f = (tick - t0) / (t1 - t0);
    p.posX[i] = (P.sx[i] as number) + ((P.tx[i] as number) - (P.sx[i] as number)) * f;
    p.posY[i] = (P.sy[i] as number) + ((P.ty[i] as number) - (P.sy[i] as number)) * f;
  }
}

/** Once per second per squad (staggered): morale, depot resupply, medics. */
function perSecond(s: SimState, u: number): void {
  const U = s.units;
  const p = U.pool;
  const t = p.kind[u] as number;
  const x = p.posX[u] as number;
  const y = p.posY[u] as number;
  // Terror: colossi and screamers nearby.
  const n = s.n;
  const cm = s.cellM;
  const r = UNIT_BEHAVIOUR.terrorRadiusM;
  const zb = s.zombieBuckets;
  const z = s.zombies;
  let terror = 0;
  const x0 = Math.max(0, Math.floor((x - r) / cm));
  const x1 = Math.min(n - 1, Math.floor((x + r) / cm));
  const y0 = Math.max(0, Math.floor((y - r) / cm));
  const y1 = Math.min(n - 1, Math.floor((y + r) / cm));
  scan: for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      // Buckets were built before movement: use their ranges, not the live cell counts.
      const c = gy * n + gx;
      const end = zb.start[c + 1] as number;
      for (let k = zb.start[c] as number; k < end; k++) {
        const j = zb.items[k] as number;
        const kind = z.kind[j] as number;
        if (!z.alive[j] || (kind !== ZT_COLOSSUS && kind !== ZT_SCREAMER)) continue;
        const dx = (z.posX[j] as number) - x;
        const dy = (z.posY[j] as number) - y;
        if (dx * dx + dy * dy > r * r) continue;
        if (++terror >= UNIT_BEHAVIOUR.terrorCap) break scan;
      }
    }
  }
  if (terror > 0) loseMorale(s, u, terror * UNIT_BEHAVIOUR.moraleLossPerTerrorPerS);
  else U.morale[u] = Math.min(1, (U.morale[u] as number) + UNIT_BEHAVIOUR.moraleRecoveryPerS);
  // Depot resupply.
  const maxAmmo = UT_AMMO[t] as number;
  if (
    maxAmmo > 0 &&
    (U.ammo[u] as number) < maxAmmo &&
    (s.structures.nearestDone(s, 'depot', x, y, s.structures.depotRadius) >= 0 ||
      s.eco.nearHq(x, y, s.structures.depotRadius))
  ) {
    const ammo = U.ammo[u] as number;
    U.ammo[u] = ammo + s.eco.drawAmmo(Math.min(maxAmmo - ammo, maxAmmo * ECONOMY_M3.depotResupplyPerS));
  }
  // Medics heal nearby squads (not beyond their living members).
  if (UT_HEAL[t]) {
    const hr = UNIT_BEHAVIOUR.healRadiusM;
    const amount = UNIT_BEHAVIOUR.healHpPerS * U.strength(u);
    for (let v = 0; v < p.highWater; v++) {
      if (!p.alive[v]) continue;
      const dx = (p.posX[v] as number) - x;
      const dy = (p.posY[v] as number) - y;
      if (dx * dx + dy * dy > hr * hr) continue;
      const cap = (U.members[v] as number) * (UT_HP[p.kind[v] as number] as number);
      p.hp[v] = Math.min(cap, (p.hp[v] as number) + amount);
    }
  }
}

export function fireUnits(s: SimState, tick: number): void {
  advanceProjectiles(s, tick);
  const U = s.units;
  const p = U.pool;
  if (p.count === 0) return;
  const { posX, posY, target } = p;
  const z = s.zombies;
  const rng = s.rng;
  const P = s.projectiles;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    const t = p.kind[u] as number;
    if ((u + tick) % TICK_RATE === 0) perSecond(s, u);
    if (!p.alive[u]) continue;
    const rate = UT_RATE[t] as number;
    if (rate <= 0) continue;
    const x = posX[u] as number;
    const y = posY[u] as number;
    const indirect = UT_INDIRECT[t] === 1;

    // Target search (staggered) or validation.
    if (indirect) {
      if (tick % MORTAR.retargetEveryTicks === 0 || tick >= (U.nextScan[u] as number)) {
        U.nextScan[u] = tick + MORTAR.retargetEveryTicks;
        U.rangeBonus[u] = towerBonus(s, x, y);
        aimMortar(s, u, tick);
      }
    } else {
      const range = (UT_RANGE[t] as number) + (U.rangeBonus[u] as number);
      let tg = target[u] as number;
      if (tg >= 0) {
        const dx = (z.posX[tg] as number) - x;
        const dy = (z.posY[tg] as number) - y;
        if (!z.alive[tg] || dx * dx + dy * dy > range * range) tg = -1;
      }
      const allowed = U.fireMode[u] === FM_FREE || U.attackOn[u] === 1;
      if (!allowed) tg = -1;
      else if (tick >= (U.nextScan[u] as number)) {
        U.nextScan[u] = tick + UNIT_BEHAVIOUR.retargetEveryTicks;
        U.rangeBonus[u] = towerBonus(s, x, y);
        const r = (UT_RANGE[t] as number) + (U.rangeBonus[u] as number);
        const specials = UT_SPECIALS[t] === 1;
        tg = -1;
        if (U.attackOn[u])
          tg = findTarget(
            s,
            x,
            y,
            0,
            r,
            U.attackX[u] as number,
            U.attackY[u] as number,
            UNIT_BEHAVIOUR.focusRadiusM,
            specials,
          );
        if (tg < 0 && U.fireMode[u] === FM_FREE) tg = findTarget(s, x, y, 0, r, x, y, r, specials);
      }
      target[u] = tg;
    }

    const hasAim = indirect ? U.aimOn[u] === 1 : (target[u] as number) >= 0;
    let acc = (U.fireAcc[u] as number) + rate * U.strength(u) * DT;
    if (!hasAim || (U.ammo[u] as number) < 1) {
      U.fireAcc[u] = Math.min(acc, 1);
      continue;
    }
    let shots = Math.min(Math.floor(acc), UNIT_BEHAVIOUR.maxShotsPerTick, Math.floor(U.ammo[u] as number));
    acc -= shots;
    U.fireAcc[u] = acc;
    if (shots <= 0) continue;
    U.ammo[u] = (U.ammo[u] as number) - shots;
    U.lastShot[u] = tick;
    const dmg = UT_DAMAGE[t] as number;
    let tx = 0;
    let ty = 0;
    if (indirect) {
      tx = U.aimX[u] as number;
      ty = U.aimY[u] as number;
      const d = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y));
      const spread =
        (MORTAR.scatterBaseM + MORTAR.scatterPerM * d) *
        (U.aimSpotted[u] ? 1 : MORTAR.unspottedScatterFactor);
      const flight = Math.max(1, Math.ceil((d / MORTAR.shellSpeedMps) * TICK_RATE));
      for (; shots > 0; shots--) {
        const lx = Math.fround(tx + (rng.nextFloat() + rng.nextFloat() - 1) * spread);
        const ly = Math.fround(ty + (rng.nextFloat() + rng.nextFloat() - 1) * spread);
        P.launch(PT_SHELL, x, y, lx, ly, tick, tick + flight, dmg, UT_AREA[t] as number, u);
      }
    } else {
      const tg = target[u] as number;
      tx = z.posX[tg] as number;
      ty = z.posY[tg] as number;
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const range = (UT_RANGE[t] as number) + (U.rangeBonus[u] as number);
      const base = UNIT_BEHAVIOUR.hitChanceAtMaxRange;
      let chance = base + (1 - base) * (1 - Math.min(1, d / range));
      chance *= 1 + UNIT_BEHAVIOUR.rankBonus * (U.rank[u] as number);
      if (p.velX[u] !== 0 || p.velY[u] !== 0) chance *= UNIT_BEHAVIOUR.movingAccuracyFactor;
      if (t === UT_SNIPER && (U.rangeBonus[u] as number) > 0) chance += UNIT_BEHAVIOUR.towerSniperHitBonus;
      chance = Math.min(chance, UNIT_BEHAVIOUR.maxHitChance);
      let hit = false;
      for (; shots > 0; shots--) {
        if (rng.nextFloat() >= chance) continue;
        hit = true;
        if (hitZombie(s, tg, dmg, UT_PEN[t] as number, u)) {
          target[u] = -1;
          U.nextScan[u] = tick + 1;
          break;
        }
      }
      const mx = hit ? tx : tx + (rng.nextFloat() - 0.5) * 4;
      const my = hit ? ty : ty + (rng.nextFloat() - 0.5) * 4;
      P.launch(PT_TRACER, x, y, mx, my, tick, tick + UNIT_ENGINE.tracerTicks, 0, 0, u);
      s.fx.push(FX.impact, mx, my, 0);
      if ((UT_SUPPRESSION[t] as number) > 0 && tick - (U.suppressAt[u] as number) >= SUPPRESS_MARK_TICKS) {
        U.suppressAt[u] = tick;
        markSuppression(s, x, y, tx, ty, range, tick);
      }
    }
    s.fx.push(FX.shot, x, y, atan2Angle(ty - y, tx - x) * RAD_PER_UNIT);
    if (
      tick - (U.noiseAt[u] as number) >= UNIT_BEHAVIOUR.noiseIntervalTicks ||
      (U.noiseAt[u] as number) < 0
    ) {
      U.noiseAt[u] = tick;
      s.noise.emit(x, y, UT_NOISE[t] as number, UNIT_BEHAVIOUR.shotNoiseRadiusM);
    }
  }
}
