// Population (GDD 6 Bevölkerung): assignment in percent, morale 0..100 moving toward the sum of its factors,
// strikes and volunteers (production.ts, helperShare), militia squads from conscripts at the HQ, decrees.
import { TICK_RATE } from '../../core/loop';
import { DECREES, MORALE, POPULATION } from '../../data/economy/economy';
import { placeUnit } from '../combat/units';
import { removeCivilian } from '../infection/attack';
import { nearestCell } from '../map/grid';
import { CS_ROUTINE } from '../population/civilian-traits';
import { ZK_SAFE } from '../population/zones';
import type { SimState } from '../state';
import { DECREE_IDS, MORALE_FACTORS } from './economy';
import { PASS_MIN } from './production';

const F = Object.fromEntries(MORALE_FACTORS.map((k, i) => [k, i])) as Record<string, number>;
const MILITIA_TICKS = POPULATION.militiaEveryS * TICK_RATE;

/** AssignWorkers: shares in percent, together at most 100; the rest are free. */
export function assignWorkers(s: SimState, workers: number, conscripts: number, helpers: number): boolean {
  const e = s.eco;
  const v = [workers, conscripts, helpers];
  if (!e.active || !v.every((x) => Number.isFinite(x) && x >= 0) || workers + conscripts + helpers > 100)
    return false;
  e.workersPct = workers;
  e.conscriptsPct = conscripts;
  e.helpersPct = helpers;
  return true;
}

/** SetDecree. Early evacuation is one-shot at its first activation. */
export function setDecree(s: SimState, name: string, active: boolean): boolean {
  const e = s.eco;
  const k = DECREE_IDS.indexOf(name);
  if (!e.active || k < 0 || typeof active !== 'boolean' || (e.decrees[k] === 1) === active) return false;
  e.decrees[k] = active ? 1 : 0;
  const share = DECREES[name]?.earlyEvacuationShare;
  if (active && share && !e.evacUsed) {
    e.evacUsed = true;
    evacuate(s, share);
  }
  return true;
}

/** Removes `share` of the healthy civilians in routine, spread over the slots (saved, no longer workers). */
function evacuate(s: SimState, share: number): void {
  const c = s.civilians;
  let acc = 0;
  for (let i = 0; i < c.highWater; i++) {
    if (!c.alive[i] || c.kind[i] !== CS_ROUTINE || (s.ct.turnTick[i] as number) >= 0) continue;
    acc += share;
    if (acc < 1) continue;
    acc -= 1;
    removeCivilian(s, i);
    s.eco.evacuated++;
  }
}

/** Morale factors and the move toward their sum; volunteers above the threshold. Once per economy pass. */
export function updateMorale(s: SimState): void {
  const e = s.eco;
  const c = s.counters;
  const f = e.factors;
  let zones = 0;
  for (let z = 0; z < s.zones.kind.length; z++) if (s.zones.kind[z] === ZK_SAFE) zones++;
  let decrees = 0;
  for (let k = 0; k < DECREE_IDS.length; k++)
    if (e.decrees[k]) decrees += DECREES[DECREE_IDS[k] as string]?.moralePerMin ?? 0;
  f[F.base as number] = MORALE.base;
  f[F.food as number] = e.hungry ? MORALE.hunger : MORALE.foodOk;
  f[F.safety as number] = Math.min(MORALE.safetyMax, zones * MORALE.safetyPerSafeZone);
  f[F.losses as number] = ((c.civiliansDead + c.soldiersLost) / 100) * MORALE.lossPer100Dead;
  f[F.collateral as number] = c.collateralKills * MORALE.collateralPerKill;
  f[F.conscription as number] = -(e.conscriptsPct / 10) * POPULATION.conscriptMoralePenaltyPer10Pct;
  f[F.success as number] = Math.min(MORALE.successMax, (c.zombiesKilled / 100) * MORALE.successPer100Kills);
  f[F.decrees as number] = decrees * MORALE.decreeTargetPerRate;
  let target = 0;
  for (let k = 0; k < f.length; k++) target += f[k] as number;
  target = Math.min(100, Math.max(0, target));
  const step = MORALE.ratePerMin * PASS_MIN;
  e.morale = e.morale < target ? Math.min(target, e.morale + step) : Math.max(target, e.morale - step);
  const free = (e.population * (100 - e.workersPct - e.conscriptsPct - e.helpersPct)) / 100;
  e.volunteers = e.morale > MORALE.volunteersAbove ? Math.floor(free * MORALE.volunteerShareOfFree) : 0;
}

/** Conscripts form militia squads next to the HQ, one every militiaEveryS, paid from the budget. */
export function raiseMilitia(s: SimState, tick: number): void {
  const e = s.eco;
  if (e.hq < 0 || e.conscriptsPct <= 0 || tick - e.militiaAt < MILITIA_TICKS) return;
  const conscripts = Math.floor((e.population * e.conscriptsPct) / 100);
  const target = Math.min(
    POPULATION.militiaMaxSquads,
    Math.floor(conscripts / POPULATION.conscriptsPerMilitia),
  );
  if (e.militia >= target) return;
  e.militiaAt = tick;
  const n = s.n;
  const c0 = s.cellOf(e.hqX, e.hqY);
  const c = nearestCell(n, c0 % n, Math.floor(c0 / n), (i) => s.walkable[i] === 1);
  if (c < 0) return;
  const x = ((c % n) + 0.5) * s.cellM;
  const y = (Math.floor(c / n) + 0.5) * s.cellM;
  if (placeUnit(s, POPULATION.militiaUnitType, x, y, POPULATION.militiaCost) >= 0) e.militia++;
}
