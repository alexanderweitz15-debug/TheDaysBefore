// Civilian perception and panic (GDD 4 step 5, GDD 7 Zivilisten). Each civilian looks (zombie density) and
// listens (noise field) every scanIntervalTicks, staggered by slot. Panic rises with zombies in sight and loud
// noise and decays otherwise; state transitions routine -> alerted -> fleeing <-> panic follow from threat,
// city alarm, guidance and panic. Unaware routine civilians do not run from zombies (they do not recognize the
// threat) until they hear loud noise, the city alarm runs or they panic. Alerted civilians that reached home hide
// indoors: they no longer look outside (zombies find them, a hit makes them panic). Sheltered civilians stay inside.
import { TICK_RATE } from '../../core/loop';
import { CIVILIAN_ALERT, CIVILIAN_PANIC, CIVILIAN_STAMINA } from '../../data/agents/civilians';
import { DIR_NONE } from '../horde/flow-field';
import { ANGLE_UNITS, cosU, sinU } from '../math/trig';
import type { SimState } from '../state';
import { CS_ALERTED, CS_FLEEING, CS_PANIC, CS_ROUTINE, CS_SHELTERED } from './civilian-traits';

const INTERVAL = CIVILIAN_ALERT.scanIntervalTicks;
const DT_S = INTERVAL / TICK_RATE;
const ALARM_TICKS = CIVILIAN_ALERT.cityAlarmDelayS * TICK_RATE;
const CALM_TICKS = CIVILIAN_ALERT.calmDownS * TICK_RATE;
const SPREAD_TICKS = CIVILIAN_ALERT.alarmSpreadS * TICK_RATE;
const RUN_S = CIVILIAN_STAMINA.runS;
const RECOVER = CIVILIAN_STAMINA.recoverPerS * DT_S;

/** Two independent fractions in [0, 1) per slot (integer hash, no RNG draw). */
function slotFrac(i: number, salt: number): number {
  let h = Math.imul(i ^ salt, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * True if the staggered city alarm has reached civilian i and it heeds it: the alarm starts cityAlarmDelayS
 * after the outbreak and reaches each civilian within alarmSpreadS; only alarmHeedShare of them react.
 */
export function alarmReached(s: SimState, i: number, tick: number): boolean {
  if (!cityAlarm(s, tick)) return false;
  if (slotFrac(i, 0x2545f491) >= CIVILIAN_ALERT.alarmHeedShare) return false;
  return tick >= s.outbreak.startTick + ALARM_TICKS + Math.floor(slotFrac(i, 0x68e31da4) * SPREAD_TICKS);
}

/** True if civilian i is alerted and at home (a door cell of its home field): it hides indoors. */
export function isHiding(s: SimState, i: number): boolean {
  if (s.civilians.kind[i] !== CS_ALERTED) return false;
  const r = s.routine;
  const hf = r.home[i] as number;
  return (
    hf >= 0 && r.fieldReady[hf] === 1 && r.dirs[hf * s.cells + (s.civilians.cell[i] as number)] === DIR_NONE
  );
}

/** True once the city-wide alarm runs (cityAlarmDelayS after the outbreak start). */
export function cityAlarm(s: SimState, tick: number): boolean {
  return s.outbreak.started && tick >= s.outbreak.startTick + ALARM_TICKS;
}

/** True if civilian i at (x, y) knows the way to safety (guidance mask and a ready safety field). */
export function isGuided(s: SimState, x: number, y: number): boolean {
  if (!s.safety.ready) return false;
  const side = s.noise.side;
  return s.zones.guided[s.noise.coord(y) * side + s.noise.coord(x)] === 1;
}

export function perceive(s: SimState, tick: number): void {
  const c = s.civilians;
  const { panic, lastThreat, fleeX, fleeY, headless, stamina, knows } = s.ct;
  const { kind, posX, posY, alive } = c;
  const alarm = cityAlarm(s, tick);
  const ready = s.safety.ready === 1;
  const sight = CIVILIAN_ALERT.sightRangeM;
  const loud = CIVILIAN_ALERT.noiseThreshold;
  const P = CIVILIAN_PANIC;
  const riseFactor = s.eco.panicRiseFactor();
  const hw = c.highWater;
  for (let i = (INTERVAL - (tick % INTERVAL)) % INTERVAL; i < hw; i += INTERVAL) {
    if (!alive[i]) continue;
    const st = kind[i] as number;
    if (st === CS_SHELTERED) continue;
    const x = posX[i] as number;
    const y = posY[i] as number;
    const hiding = isHiding(s, i);
    const seen = hiding ? 0 : s.density.query(x, y, sight);
    const level = s.noise.sample(x, y);
    const heard = level >= loud;
    if (seen > 0) {
      lastThreat[i] = tick;
      // Flee heading: away from the centroid of the zombies in sight.
      const dx = x - s.density.cx;
      const dy = y - s.density.cy;
      const l2 = dx * dx + dy * dy;
      if (l2 > 1e-6) {
        const l = Math.sqrt(l2);
        fleeX[i] = dx / l;
        fleeY[i] = dy / l;
      } else if (fleeX[i] === 0 && fleeY[i] === 0) {
        const a = Math.floor(s.rng.nextFloat() * ANGLE_UNITS);
        fleeX[i] = cosU(a);
        fleeY[i] = sinU(a);
      }
    }
    // Unaware routine civilians do not recognize zombies as a threat; only loud noise frightens them.
    const rise =
      ((st === CS_ROUTINE ? 0 : P.perZombiePerS * seen) + (heard ? P.perNoisePerS * level : 0)) * riseFactor;
    const p = Math.min(1, Math.max(0, (panic[i] as number) + (rise > 0 ? rise : -P.decayPerS) * DT_S));
    panic[i] = p;

    // Stamina recovers unless running from a threat (see flight-move).
    if (st !== CS_PANIC && (st !== CS_FLEEING || tick - (lastThreat[i] as number) >= CALM_TICKS))
      stamina[i] = Math.min(RUN_S, (stamina[i] as number) + RECOVER);
    if (!ready) knows[i] = 0;
    else if (st !== CS_ROUTINE && isGuided(s, x, y)) knows[i] = 1;
    const guided = knows[i] === 1;

    let next = st;
    const threat = seen > 0;
    const recent = tick - (lastThreat[i] as number) < CALM_TICKS;
    if (st === CS_ROUTINE) {
      if (heard || (alarm && alarmReached(s, i, tick))) next = threat ? CS_FLEEING : CS_ALERTED;
      if (next !== CS_ROUTINE && isGuided(s, x, y)) knows[i] = 1;
    } else if (st === CS_ALERTED) {
      if (threat || guided) next = CS_FLEEING;
    } else if (st === CS_FLEEING) {
      if (!recent && !guided) next = CS_ALERTED;
    } else if (st === CS_PANIC && p < P.panicExitThreshold) {
      next = recent || guided ? CS_FLEEING : CS_ALERTED;
    }
    if (next !== CS_PANIC && p >= P.panicThreshold) next = CS_PANIC;
    kind[i] = next;
    headless[i] = next === CS_PANIC && s.rng.nextFloat() < P.ignoreGuidanceChance ? 1 : 0;
  }
}
