// Combat against humans (GDD 4 step 11, GDD 7 Infektion): zombies hit civilians in reach at their type's rate.
// A hit infects with the pathogen's chance (healthy victims only), otherwise deals damage until death.

import { HOME_BREAK_IN } from '../../data/agents/civilians';
import { NOISE } from '../../data/agents/noise';
import { INFECTION_FIELD } from '../../data/pathogens/viral';
import { UNIT_BEHAVIOUR } from '../../data/units/present';
import { ATTACK_REACH_M, CIVILIAN_HP } from '../../data/zombies/viral-types';
import { damageUnit, infectMember } from '../combat/unit-damage';
import { TYPE_ATTACK_TICKS, TYPE_DAMAGE } from '../horde/zombie-traits';
import { GRID_INFECTION, GRID_LOSSES } from '../outcome/recorder';
import { isHiding } from '../population/perception';
import type { SimState } from '../state';

export function zombieAttacks(s: SimState): void {
  const z = s.zombies;
  const c = s.civilians;
  const { cooldown } = s.zt;
  const turn = s.ct.turnTick;
  const reach2 = ATTACK_REACH_M * ATTACK_REACH_M;
  const ur = ATTACK_REACH_M + UNIT_BEHAVIOUR.squadRadiusM;
  const unitReach2 = ur * ur;
  for (let i = 0; i < z.highWater; i++) {
    if (!z.alive[i]) continue;
    const cd = cooldown[i] as number;
    if (cd > 0) {
      cooldown[i] = cd - 1;
      continue;
    }
    const ut = s.zt.unitTarget[i] as number;
    if (ut >= 0) {
      attackUnit(s, i, ut, unitReach2);
      continue;
    }
    const t = z.target[i] as number;
    if (t < 0) continue;
    if (!c.alive[t] || (turn[t] as number) >= 0) {
      z.target[i] = -1;
      continue;
    }
    const dx = (c.posX[t] as number) - (z.posX[i] as number);
    const dy = (c.posY[t] as number) - (z.posY[i] as number);
    if (dx * dx + dy * dy > reach2) continue;
    const type = z.kind[i] as number;
    cooldown[i] = (TYPE_ATTACK_TICKS[type] as number) - 1;
    if (isHiding(s, t)) {
      // Hiding at home: the zombie hammers at the door until it gives way; the trapped hider cannot run.
      if (s.rng.nextFloat() >= HOME_BREAK_IN.chancePerAttack) {
        s.noise.emit(
          c.posX[t] as number,
          c.posY[t] as number,
          HOME_BREAK_IN.doorNoise,
          HOME_BREAK_IN.doorNoiseRadiusM,
        );
        continue;
      }
      if (hitCivilian(s, t, TYPE_DAMAGE[type] as number, true)) z.target[i] = -1;
      continue;
    }
    if (hitCivilian(s, t, TYPE_DAMAGE[type] as number)) z.target[i] = -1;
  }
}

/** Zombie i hits squad u within reach: infects one member with the pathogen's chance, else deals damage. */
function attackUnit(s: SimState, i: number, u: number, reach2: number): void {
  const z = s.zombies;
  const p = s.units.pool;
  if (!p.alive[u]) {
    s.zt.unitTarget[i] = -1;
    return;
  }
  // Garrisons cannot be attacked from the street; the building takes the pressure (orders/garrison.ts).
  if ((s.units.garrison[u] as number) >= 0) return;
  const dx = (p.posX[u] as number) - (z.posX[i] as number);
  const dy = (p.posY[u] as number) - (z.posY[i] as number);
  if (dx * dx + dy * dy > reach2) return;
  const type = z.kind[i] as number;
  s.zt.cooldown[i] = (TYPE_ATTACK_TICKS[type] as number) - 1;
  s.noise.emit(p.posX[u] as number, p.posY[u] as number, NOISE.attackNoise, NOISE.attackRadiusM);
  if (s.rng.nextFloat() < s.outbreak.infectChance(s.tick)) infectMember(s, u);
  damageUnit(s, u, TYPE_DAMAGE[type] as number, true);
}

/**
 * One hit on civilian j. Returns true if the victim is no longer a target (infected or dead). A trapped victim
 * (hiding at home) does not panic and stays where it is.
 */
export function hitCivilian(s: SimState, j: number, damage: number, trapped = false): boolean {
  const c = s.civilians;
  if (!trapped) s.ct.panic[j] = 1;
  s.noise.emit(c.posX[j] as number, c.posY[j] as number, NOISE.attackNoise, NOISE.attackRadiusM);
  if ((s.ct.turnTick[j] as number) < 0 && s.rng.nextFloat() < s.outbreak.infectChance(s.tick)) {
    infectCivilian(s, j);
    return true;
  }
  const hp = (c.hp[j] as number) - damage;
  c.hp[j] = hp;
  if (hp > 0) return false;
  killCivilian(s, j);
  return true;
}

/** Healthy civilian j is infected now: incubation from the pathogen, infection field mark. */
export function infectCivilian(s: SimState, j: number): void {
  s.ct.turnTick[j] = s.tick + s.outbreak.incubationTicks(s.rng);
  s.counters.incubating++;
  s.markInfection(s.civilians.cell[j] as number, INFECTION_FIELD.bite);
  const st = s.stats;
  st.mark(GRID_INFECTION, s.civilians.posX[j] as number, s.civilians.posY[j] as number);
  st.infections++;
  if ((s.ct.zone[j] as number) >= 0) {
    st.shelterInfections++;
    if (st.shelterInfectionTick < 0) st.shelterInfectionTick = s.tick;
  }
}

/**
 * Civilian j dies: leaves a corpse that may rise (all zombie victims carry the pathogen). With `bitten` false
 * (own fire), only an already infected victim may rise.
 */
export function killCivilian(s: SimState, j: number, bitten = true): void {
  const c = s.civilians;
  const cell = c.cell[j] as number;
  const carrier = bitten || (s.ct.turnTick[j] as number) >= 0;
  s.corpses.add(
    c.posX[j] as number,
    c.posY[j] as number,
    s.outbreak.familyIndex,
    carrier ? s.outbreak.riseTick(s.rng, s.tick) : -1,
  );
  if (carrier) s.markInfection(cell, INFECTION_FIELD.bite);
  s.counters.civiliansDead++;
  s.stats.mark(GRID_LOSSES, c.posX[j] as number, c.posY[j] as number);
  removeCivilian(s, j);
}

/** Frees a civilian slot and its bookkeeping (cell count, incubation and shelter counters). */
export function removeCivilian(s: SimState, j: number): void {
  const c = s.civilians;
  const cell = c.cell[j] as number;
  s.civilianCells[cell] = (s.civilianCells[cell] as number) - 1;
  if ((s.ct.turnTick[j] as number) >= 0) s.counters.incubating--;
  const z = s.ct.zone[j] as number;
  if (z >= 0) s.zones.leave(s, z);
  s.ct.reset(j);
  c.release(j);
  s.civiliansDirty = true;
}

/** Initializes a freshly placed civilian. */
export function initCivilian(s: SimState, j: number): void {
  s.civilians.hp[j] = CIVILIAN_HP;
  s.civilians.kind[j] = 0;
  s.ct.reset(j);
}
