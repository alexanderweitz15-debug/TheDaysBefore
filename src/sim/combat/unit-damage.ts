// Squad losses (GDD 9, GDD 8): damage with cover, fallen members leave corpses, ranks from kills, morale loss,
// bitten members turn into zombies after incubation.
import { UNIT_BEHAVIOUR } from '../../data/units/present';
import { spawnZombie, ZT_COLOSSUS } from '../horde/zombie-traits';
import type { SimState } from '../state';
import { FX } from './fx';
import { PATH_NONE, UT_HP, UT_MORALE_LOSS } from './units';

/** Rank from kills (GDD 9: three ranks). */
export function rankOf(kills: number): number {
  const r = UNIT_BEHAVIOUR.rankKills;
  return kills >= (r[2] as number) ? 2 : kills >= (r[1] as number) ? 1 : 0;
}

/** Credits a zombie kill to unit u (rank up). */
export function creditKill(s: SimState, u: number): void {
  const U = s.units;
  if (u < 0 || !U.pool.alive[u]) return;
  const k = (U.kills[u] as number) + 1;
  U.kills[u] = k;
  U.rank[u] = rankOf(k);
}

/** Morale loss scaled down by rank (GDD 9: +10 % morale per rank), up by the type (militia morale-sensitive). */
export function loseMorale(s: SimState, u: number, amount: number): void {
  const U = s.units;
  const f = 1 - UNIT_BEHAVIOUR.rankBonus * (U.rank[u] as number);
  const m = UT_MORALE_LOSS[U.pool.kind[u] as number] as number;
  U.morale[u] = Math.max(0, (U.morale[u] as number) - amount * f * m);
}

/**
 * Damage to squad u (cover reduces it). Lost members count as soldiersLost and leave corpses; corpses of members
 * killed by zombies may rise. Removes the squad at 0 members.
 */
export function damageUnit(s: SimState, u: number, damage: number, byZombie: boolean): void {
  const U = s.units;
  const p = U.pool;
  if (!p.alive[u] || damage <= 0) return;
  const t = p.kind[u] as number;
  const d = U.cover[u] ? damage * (1 - UNIT_BEHAVIOUR.coverDamageReduction) : damage;
  const hp = (p.hp[u] as number) - d;
  p.hp[u] = hp;
  const left = hp > 0 ? Math.ceil(hp / (UT_HP[t] as number)) : 0;
  setMembers(s, u, left, byZombie);
}

/** Reduces squad u to `left` members (no-op if not fewer). */
function setMembers(s: SimState, u: number, left: number, risable: boolean): void {
  const U = s.units;
  const p = U.pool;
  const old = U.members[u] as number;
  if (left >= old) return;
  const lost = old - left;
  const x = p.posX[u] as number;
  const y = p.posY[u] as number;
  s.counters.soldiersLost += lost;
  for (let k = 0; k < lost; k++) {
    s.corpses.add(x, y, s.outbreak.familyIndex, risable ? s.outbreak.riseTick(s.rng, s.tick) : -1);
    s.fx.push(FX.death, x, y, 0);
  }
  U.members[u] = left;
  // Infected members are among the fallen first.
  if ((U.infCount[u] as number) > left) U.infCount[u] = left;
  if (left === 0) {
    removeUnit(s, u);
    return;
  }
  loseMorale(s, u, lost * UNIT_BEHAVIOUR.moraleLossPerMember);
}

export function removeUnit(s: SimState, u: number): void {
  const U = s.units;
  if (!U.pool.alive[u]) return;
  U.members[u] = 0;
  U.infCount[u] = 0;
  U.moving[u] = 0;
  U.pathState[u] = PATH_NONE;
  U.pool.release(u);
  s.unitsDirty = true;
}

/** A zombie bite infected one healthy member; it turns after the pathogen's incubation time. */
export function infectMember(s: SimState, u: number): void {
  const U = s.units;
  const k = U.infCount[u] as number;
  if (k >= (U.members[u] as number)) return;
  U.infTurn[u * U.maxSize + k] = s.tick + s.outbreak.incubationTicks(s.rng);
  U.infCount[u] = k + 1;
}

/** Step 12 for soldiers: infected members turn into zombies, colossi preferred (GDD 8). */
export function advanceUnitInfection(s: SimState): void {
  const U = s.units;
  const p = U.pool;
  const tick = s.tick;
  const ms = U.maxSize;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u] || U.infCount[u] === 0) continue;
    let k = 0;
    while (k < (U.infCount[u] as number)) {
      const base = u * ms;
      if ((U.infTurn[base + k] as number) > tick) {
        k++;
        continue;
      }
      // Remove entry k (swap with last).
      const last = (U.infCount[u] as number) - 1;
      U.infTurn[base + k] = U.infTurn[base + last] as number;
      U.infCount[u] = last;
      const t = p.kind[u] as number;
      const x = p.posX[u] as number;
      const y = p.posY[u] as number;
      const members = (U.members[u] as number) - 1;
      p.hp[u] = Math.min(p.hp[u] as number, members * (UT_HP[t] as number));
      s.counters.soldiersLost++;
      U.members[u] = members;
      const type =
        s.rng.nextFloat() < UNIT_BEHAVIOUR.soldierColossusChance
          ? ZT_COLOSSUS
          : s.outbreak.pickType(s.rng, tick);
      spawnZombie(s, x, y, type);
      if (members === 0) {
        removeUnit(s, u);
        break;
      }
      loseMorale(s, u, UNIT_BEHAVIOUR.moraleLossPerMember);
    }
  }
}
