// Infection progress (GDD 4 step 12): incubating civilians turn, corpses rise, patient zero starts the outbreak,
// the infection density field follows the horde.
import { TICK_RATE } from '../../core/loop';
import { INFECTION_FIELD } from '../../data/pathogens/viral';
import { spawnZombie, ZT_PATIENT_ZERO } from '../horde/zombie-traits';
import type { SimState } from '../state';
import { removeCivilian } from './attack';

/** StartOutbreak: patient zero at the nearest walkable cell. Ignored once an outbreak runs. */
export function startOutbreak(s: SimState, x: number, y: number): boolean {
  const o = s.outbreak;
  if (o.started) return false;
  const slot = spawnZombie(s, x, y, ZT_PATIENT_ZERO);
  if (slot < 0) return false;
  o.startTick = s.tick;
  o.pzSlot = slot;
  s.counters.outbreakTick = s.tick;
  s.markInfection(s.zombies.cell[slot] as number, INFECTION_FIELD.turn);
  return true;
}

export function advanceInfection(s: SimState): void {
  const c = s.civilians;
  const turn = s.ct.turnTick;
  const tick = s.tick;
  for (let j = 0; j < c.highWater; j++) {
    if (!c.alive[j]) continue;
    const t = turn[j] as number;
    if (t < 0 || t > tick) continue;
    const x = c.posX[j] as number;
    const y = c.posY[j] as number;
    const z = s.ct.zone[j] as number;
    s.markInfection(c.cell[j] as number, INFECTION_FIELD.turn);
    removeCivilian(s, j);
    // Turning inside a shelter breaks the zone open (GDD 7).
    if (z >= 0) s.zones.breach(s, z);
    spawnZombie(s, x, y, s.outbreak.pickType(s.rng, tick));
  }
  const d = s.corpses;
  const p = d.pool;
  for (let k = 0; k < p.highWater; k++) {
    if (!p.alive[k]) continue;
    const t = d.riseTick[k] as number;
    if (t < 0 || t > tick) continue;
    spawnZombie(s, p.posX[k] as number, p.posY[k] as number, s.outbreak.pickType(s.rng, tick));
    p.release(k);
  }
  if (tick % TICK_RATE === 0 && s.outbreak.started) {
    const zc = s.zombieCells;
    for (let cell = 0; cell < zc.length; cell++) {
      const m = zc[cell] as number;
      if (m === 0) continue;
      const v = Math.min(255, INFECTION_FIELD.base + m * INFECTION_FIELD.perZombie);
      if (v > (s.infection[cell] as number)) s.infection[cell] = v;
    }
  }
}
