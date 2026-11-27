// Victory and defeat (GDD 10 Vier Siegbedingungen, Niederlage; GDD 4 step 15). Checked every
// VICTORY.evaluateEveryTicks in missions. Hold time (holdUntilS) is game time since mission start and needs a
// running outbreak; the fast-victory bonus counts from mission start too. Until M8 civilians
// sheltered in safe zones count as evacuated. Once decided, the outcome stays fixed while the sim keeps running.
import { TICK_RATE } from '../../core/loop';
import { RINGS } from '../../core/types/map';
import type { ScenarioDef } from '../../core/types/mission';
import type { DefeatReason, VictoryKind } from '../../core/types/outcome';
import { CAUSES, DEFEAT, DIFFICULTY_MULTIPLIER, VICTORY } from '../../data/scoring';
import { PH_ENDED } from '../economy/mission';
import { CS_SHELTERED } from '../population/civilian-traits';
import type { SimState } from '../state';
import { soldiersAlive, squadsNear } from './recorder';

export const VICTORY_KINDS: readonly VictoryKind[] = ['eradication', 'evacuation', 'hold', 'containment'];
export const DEFEAT_REASONS: readonly DefeatReason[] = ['hqLost', 'populationLost', 'timeLimit', 'surrender'];
export const VK_ERADICATION = 0;
export const VK_EVACUATION = 1;
export const VK_HOLD = 2;
export const VK_CONTAINMENT = 3;
const DR_HQ = 0;
const DR_POPULATION = 1;
const DR_TIME = 2;
export const DR_SURRENDER = 3;
const INNER = RINGS.indexOf('inner');

export class MissionResult {
  /** Mission with objectives (inactive in free mode). */
  active = false;
  /** Objective kinds in scenario order. */
  readonly kinds = new Uint8Array(VICTORY_KINDS.length);
  kindCount = 0;
  all = false;
  holdTicks = 0;
  evacShare: number = VICTORY.evacuationShare;
  timeLimitTicks = -1;
  multiplier = 1;
  /** Bronze, silver, gold thresholds; none without medals in the scenario. */
  readonly medals = new Float64Array(3);
  hasMedals = false;
  /** Tutorial: defeat conditions are ignored, only Surrender ends the mission. */
  unlosable = false;
  populationStart = 0;
  peakInfected = 0;
  hqOverrunSince = -1;
  containSince = -1;
  // Live values, refreshed at every evaluation.
  saved = 0;
  savedInfected = 0;
  soldiers = 0;
  innerZombies = 0;
  infectedArea = 0;
  /** Per coarse density cell: counted for the infected area (scratch). */
  readonly areaMark: Uint8Array;
  readonly progress = new Float64Array(VICTORY_KINDS.length);
  readonly met = new Uint8Array(VICTORY_KINDS.length);
  // Outcome.
  ended = false;
  victory = false;
  /** Index into VICTORY_KINDS (victory) or DEFEAT_REASONS (defeat). */
  reason = -1;
  endTick = -1;
  /** Kill counters frozen at the end (the sim keeps running). */
  endZombiesKilled = 0;
  endCollateral = 0;

  constructor(coarseCells: number) {
    this.areaMark = new Uint8Array(coarseCells);
  }

  hashValues(): number[] {
    return [
      this.ended ? 1 : 0,
      this.victory ? 1 : 0,
      this.reason,
      this.endTick,
      this.peakInfected,
      this.hqOverrunSince,
      this.containSince,
      this.saved,
      this.soldiers,
    ];
  }
}

export function setupResult(s: SimState, sc: ScenarioDef): void {
  const r = s.result;
  r.active = true;
  r.kindCount = 0;
  for (const k of sc.victory.kinds) {
    const i = VICTORY_KINDS.indexOf(k);
    if (i >= 0 && !r.kinds.subarray(0, r.kindCount).includes(i)) r.kinds[r.kindCount++] = i;
  }
  r.all = sc.victory.all;
  r.unlosable = sc.unlosable === true;
  r.holdTicks = Math.floor((sc.holdUntilS ?? VICTORY.holdDefaultS) * TICK_RATE);
  r.evacShare = sc.evacuationShare ?? VICTORY.evacuationShare;
  r.timeLimitTicks = sc.timeLimitS !== undefined ? Math.floor(sc.timeLimitS * TICK_RATE) : -1;
  r.multiplier = DIFFICULTY_MULTIPLIER[sc.difficulty];
  if (sc.medals) {
    r.hasMedals = true;
    r.medals.set([sc.medals.bronze, sc.medals.silver, sc.medals.gold]);
  }
  r.populationStart = s.civilians.count;
}

/** Ends the mission once; the sim keeps running. */
export function endMission(s: SimState, victory: boolean, reason: number, tick: number): void {
  const r = s.result;
  if (!r.active || r.ended) return;
  refreshLive(s);
  r.endZombiesKilled = s.counters.zombiesKilled;
  r.endCollateral = s.counters.collateralKills;
  r.ended = true;
  r.victory = victory;
  r.reason = reason;
  r.endTick = tick;
  s.mission.phase = PH_ENDED;
  s.stats.moment(victory ? 'victory' : 'defeat', tick, s.eco.hqX, s.eco.hqY);
}

function refreshLive(s: SimState): void {
  const r = s.result;
  const c = s.civilians;
  let sheltered = 0;
  let infected = 0;
  for (let j = 0; j < c.highWater; j++) {
    if (!c.alive[j] || c.kind[j] !== CS_SHELTERED) continue;
    sheltered++;
    if ((s.ct.turnTick[j] as number) >= 0) infected++;
  }
  r.saved = sheltered - infected + s.eco.evacuated;
  r.savedInfected = infected;
  r.soldiers = soldiersAlive(s);
  const z = s.zombies;
  const sector = s.map.sector;
  const ring = s.map.sectors.ring;
  let inner = 0;
  for (let i = 0; i < z.highWater; i++) {
    if (!z.alive[i]) continue;
    const sec = sector[z.cell[i] as number] as number;
    if (sec < ring.length && ring[sec] === INNER) inner++;
  }
  r.innerZombies = inner;
  // Infected area: coarse cells with zombies or incubating civilians.
  const d = s.density;
  const scratch = r.areaMark;
  const cells = d.side * d.side;
  scratch.fill(0);
  let area = 0;
  for (let k = 0; k < cells; k++)
    if ((d.count[k] as number) > 0) {
      scratch[k] = 1;
      area++;
    }
  for (let j = 0; j < c.highWater; j++) {
    if (!c.alive[j] || (s.ct.turnTick[j] as number) < 0) continue;
    const k = d.coord(c.posY[j] as number) * d.side + d.coord(c.posX[j] as number);
    if (!scratch[k]) {
      scratch[k] = 1;
      area++;
    }
  }
  r.infectedArea = area / cells;
  const total = s.zombies.count + s.counters.incubating;
  if (total > r.peakInfected) r.peakInfected = total;
}

/** Zombies still to come: rising corpses and infected soldiers. */
function pendingInfected(s: SimState): number {
  let n = 0;
  const p = s.corpses.pool;
  for (let k = 0; k < p.highWater; k++) if (p.alive[k] && (s.corpses.riseTick[k] as number) >= 0) n++;
  const U = s.units;
  for (let u = 0; u < U.pool.highWater; u++) if (U.pool.alive[u]) n += U.infCount[u] as number;
  return n;
}

function objectives(s: SimState, tick: number): void {
  const r = s.result;
  const started = s.outbreak.started;
  const hqStands = r.hqOverrunSince < 0;
  for (let q = 0; q < r.kindCount; q++) {
    const k = r.kinds[q] as number;
    let p = 0;
    let met = false;
    if (k === VK_ERADICATION) {
      const left = s.zombies.count + s.counters.incubating;
      p = started && r.peakInfected > 0 ? 1 - left / r.peakInfected : 0;
      met = started && left === 0 && pendingInfected(s) === 0;
    } else if (k === VK_EVACUATION) {
      const want = r.evacShare * r.populationStart;
      p = want > 0 ? r.saved / want : 0;
      met = started && r.saved >= want && hqStands;
    } else if (k === VK_HOLD) {
      const held = hqStands && r.innerZombies < VICTORY.holdCoreMaxZombies;
      p = r.holdTicks > 0 ? tick / r.holdTicks : 1;
      met = started && tick >= r.holdTicks && held;
    } else {
      // Containment; nests and fruiting bodies arrive with M6.
      const below = started && r.infectedArea < VICTORY.containmentAreaShare;
      if (!below) r.containSince = -1;
      else if (r.containSince < 0) r.containSince = tick;
      const hold = VICTORY.containmentHoldS * TICK_RATE;
      p = below ? (tick - r.containSince) / hold : 0;
      met = below && tick - r.containSince >= hold;
    }
    r.progress[k] = Math.min(1, Math.max(0, p));
    r.met[k] = met ? 1 : 0;
  }
}

function hqCheck(s: SimState, tick: number): boolean {
  const r = s.result;
  const e = s.eco;
  if (e.hq < 0 || !e.alive[e.hq]) return false;
  if (!e.overrun[e.hq]) {
    r.hqOverrunSince = -1;
    return false;
  }
  if (r.hqOverrunSince < 0) r.hqOverrunSince = tick;
  if (tick - r.hqOverrunSince < DEFEAT.hqOverrunS * TICK_RATE) return false;
  const st = s.stats;
  st.hqFallTick = tick;
  st.moment('hqLost', tick, e.hqX, e.hqY);
  const d = s.density;
  st.hqZombies = d.count[d.coord(e.hqY) * d.side + d.coord(e.hqX)] as number;
  st.hqSquads = squadsNear(s, e.hqX, e.hqY, CAUSES.hqSquadRadiusM, false);
  return true;
}

/** GDD 4 step 15: refreshes live values, then defeat before victory. */
export function evaluateOutcome(s: SimState, tick: number): void {
  const r = s.result;
  if (!r.active || r.ended || tick % VICTORY.evaluateEveryTicks !== 0) return;
  refreshLive(s);
  objectives(s, tick);
  if (!r.unlosable) {
    if (r.timeLimitTicks >= 0 && tick >= r.timeLimitTicks) {
      endMission(s, false, DR_TIME, tick);
      return;
    }
    if (hqCheck(s, tick)) {
      endMission(s, false, DR_HQ, tick);
      return;
    }
    const alive = s.civilians.count - s.counters.incubating + s.eco.evacuated;
    if (s.outbreak.started && alive < DEFEAT.populationShare * r.populationStart) {
      endMission(s, false, DR_POPULATION, tick);
      return;
    }
  }
  let any = false;
  let every = r.kindCount > 0;
  let first = -1;
  for (let q = 0; q < r.kindCount; q++) {
    const k = r.kinds[q] as number;
    if (r.met[k]) {
      any = true;
      if (first < 0) first = k;
    } else every = false;
  }
  if (r.all ? every : any) endMission(s, true, first, tick);
}
