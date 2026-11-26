// Combat against humans (GDD 4 step 11, GDD 7 Infektion): zombies hit civilians in reach at their type's rate.
// A hit infects with the pathogen's chance (healthy victims only), otherwise deals damage until death.

import { HOME_BREAK_IN } from '../../data/agents/civilians';
import { NOISE } from '../../data/agents/noise';
import { INFECTION_FIELD } from '../../data/pathogens/viral';
import { ATTACK_REACH_M, CIVILIAN_HP } from '../../data/zombies/viral-types';
import { TYPE_ATTACK_TICKS, TYPE_DAMAGE } from '../horde/zombie-traits';
import { isHiding } from '../population/perception';
import type { SimState } from '../state';

export function zombieAttacks(s: SimState): void {
  const z = s.zombies;
  const c = s.civilians;
  const { cooldown } = s.zt;
  const turn = s.ct.turnTick;
  const reach2 = ATTACK_REACH_M * ATTACK_REACH_M;
  for (let i = 0; i < z.highWater; i++) {
    if (!z.alive[i]) continue;
    const cd = cooldown[i] as number;
    if (cd > 0) {
      cooldown[i] = cd - 1;
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

/**
 * One hit on civilian j. Returns true if the victim is no longer a target (infected or dead). A trapped victim
 * (hiding at home) does not panic and stays where it is.
 */
export function hitCivilian(s: SimState, j: number, damage: number, trapped = false): boolean {
  const c = s.civilians;
  if (!trapped) s.ct.panic[j] = 1;
  s.noise.emit(c.posX[j] as number, c.posY[j] as number, NOISE.attackNoise, NOISE.attackRadiusM);
  if ((s.ct.turnTick[j] as number) < 0 && s.rng.nextFloat() < s.outbreak.infectChance(s.tick)) {
    s.ct.turnTick[j] = s.tick + s.outbreak.incubationTicks(s.rng);
    s.counters.incubating++;
    s.markInfection(c.cell[j] as number, INFECTION_FIELD.bite);
    return true;
  }
  const hp = (c.hp[j] as number) - damage;
  c.hp[j] = hp;
  if (hp > 0) return false;
  killCivilian(s, j);
  return true;
}

/** Civilian j dies: leaves a corpse that may rise (all victims carry the pathogen). */
export function killCivilian(s: SimState, j: number): void {
  const c = s.civilians;
  const cell = c.cell[j] as number;
  s.corpses.add(
    c.posX[j] as number,
    c.posY[j] as number,
    s.outbreak.familyIndex,
    s.outbreak.riseTick(s.rng, s.tick),
  );
  s.markInfection(cell, INFECTION_FIELD.bite);
  s.counters.civiliansDead++;
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
