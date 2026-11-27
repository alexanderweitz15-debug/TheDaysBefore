// Mission phases (GDD 6 Phasen, Countdown und Warnzeichen): farm -> outbreak (patient zero at the scenario site)
// -> defense (infected above a threshold). Countdown from farmDurationS, shortened by escalating warning signs,
// extended by investigating them. Classic start: no countdown, no warnings, outbreak on TriggerOutbreak.
// Inactive without a scenario.
import type { PathogenFamily } from '../../core/commands';
import { TICK_RATE } from '../../core/loop';
import { KEY_SITES, NONE_U8 } from '../../core/types/map';
import type { MissionPhase, ScenarioDef } from '../../core/types/mission';
import { ECONOMY_RULES, PHASES, WARNINGS } from '../../data/economy/economy';
import { infectCivilian } from '../infection/attack';
import { startOutbreak } from '../infection/incubation';
import type { SimState } from '../state';
import { raiseMilitia, updateMorale } from './population';
import { buildingCentre, economyPass } from './production';

export const PHASE_NAMES: readonly MissionPhase[] = ['farm', 'outbreak', 'defense', 'ended'];
export const PH_FARM = 0;
export const PH_OUTBREAK = 1;
export const PH_DEFENSE = 2;
export const PH_ENDED = 3;
/** Warning states. */
export const WS_PENDING = 0;
export const WS_OPEN = 1;
export const WS_INVESTIGATING = 2;
export const WS_INVESTIGATED = 3;
export const WS_ESCALATED = 4;
const MAXW = WARNINGS.count;
const ESCALATE_TICKS = WARNINGS.escalateAfterS * TICK_RATE;

export class Mission {
  active = false;
  phase = PH_FARM;
  classic = false;
  countdownVisible = false;
  family: PathogenFamily = 'viral';
  /** Tick the countdown runs out (farm phase, not classic). */
  outbreakAt = 0;
  pressure = 0;
  pzX = 0;
  pzY = 0;
  readonly wAt = new Int32Array(MAXW);
  readonly wState = new Uint8Array(MAXW);
  /** Escalation tick (open) or end of investigation (investigating). */
  readonly wUntil = new Int32Array(MAXW);
  readonly wX = new Float32Array(MAXW);
  readonly wY = new Float32Array(MAXW);
  readonly wKey: string[] = [];

  hashArrays(): ArrayBufferView[] {
    return [
      this.wAt,
      this.wState,
      this.wUntil,
      this.wX,
      this.wY,
      Float64Array.of(this.pressure, this.pzX, this.pzY),
    ];
  }

  hashValues(): number[] {
    return [this.active ? 1 : 0, this.phase, this.classic ? 1 : 0, this.outbreakAt];
  }
}

/** Random building centre among `pick` (all buildings if none qualifies). */
function siteOf(s: SimState, site: string): { x: number; y: number } {
  const B = s.map.buildings;
  const want = KEY_SITES.indexOf(site as never);
  let k = 0;
  for (let b = 0; b < B.count; b++) if (want >= 0 ? B.keySite[b] === want : B.keySite[b] !== NONE_U8) k++;
  if (k === 0) return buildingCentre(s, s.rng.nextInt(0, B.count));
  // A named site: the first such building; random: one of the key sites.
  let pick = want >= 0 ? 0 : s.rng.nextInt(0, k);
  for (let b = 0; b < B.count; b++) {
    if (!(want >= 0 ? B.keySite[b] === want : B.keySite[b] !== NONE_U8)) continue;
    if (pick-- === 0) return buildingCentre(s, b);
  }
  return buildingCentre(s, 0);
}

export function setupMission(s: SimState, sc: ScenarioDef): void {
  const m = s.mission;
  m.active = true;
  m.classic = sc.classicStart === true;
  m.family = sc.pathogen;
  m.countdownVisible = !m.classic && (PHASES.countdownVisible as readonly string[]).includes(sc.difficulty);
  const farm = Math.max(1, Math.floor(sc.farmDurationS * TICK_RATE));
  m.outbreakAt = farm;
  const pz = siteOf(s, sc.patientZeroSite);
  m.pzX = pz.x;
  m.pzY = pz.y;
  const keys = WARNINGS.keys[sc.pathogen] as readonly string[];
  for (let k = 0; k < MAXW; k++) {
    m.wKey[k] = keys[k % keys.length] as string;
    m.wAt[k] = Math.floor(farm * (WARNINGS.firstAtFraction + (k * (1 - WARNINGS.firstAtFraction)) / MAXW));
    const p = buildingCentre(s, s.rng.nextInt(0, s.map.buildings.count));
    m.wX[k] = p.x;
    m.wY[k] = p.y;
    m.wState[k] = WS_PENDING;
  }
}

/**
 * Nearest busy spot to (x, y) (GDD 6: patient zero appears in a crowd): the nearest civilian-hash cell within
 * crowdSearchM whose window holds at least crowdMin civilians, else the busiest cell. Returns the first civilian
 * of that cell, or the site if nobody is around.
 */
export function crowdNear(s: SimState, x: number, y: number): { x: number; y: number } {
  if (s.civiliansDirty) {
    s.civilianHash.build(s.civilians);
    s.civilianHash.buildCounts();
    s.civiliansDirty = false;
  }
  const h = s.civilianHash;
  const side = h.side;
  const r = PHASES.patientZeroCrowdSearchM;
  const k = PHASES.patientZeroCrowdWindowCells;
  const min = PHASES.patientZeroCrowdMin;
  const cm = h.cellM;
  const x0 = h.coord(x - r);
  const x1 = h.coord(x + r);
  const y0 = h.coord(y - r);
  const y1 = h.coord(y + r);
  let near = -1;
  let nearD = 0;
  let busy = -1;
  let busyN = 0;
  let busyD = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * side + cx;
      if ((h.start[c + 1] as number) === (h.start[c] as number)) continue;
      const dx = (cx + 0.5) * cm - x;
      const dy = (cy + 0.5) * cm - y;
      const d = dx * dx + dy * dy;
      if (d > r * r) continue;
      const n = h.windowCount(
        Math.max(0, cx - k),
        Math.max(0, cy - k),
        Math.min(side - 1, cx + k),
        Math.min(side - 1, cy + k),
      );
      if (n >= min && (near < 0 || d < nearD)) {
        near = c;
        nearD = d;
      }
      if (n > busyN || (n === busyN && d < busyD)) {
        busy = c;
        busyN = n;
        busyD = d;
      }
    }
  }
  const best = near >= 0 ? near : busy;
  if (best < 0) return { x, y };
  const i = h.items[h.start[best] as number] as number;
  return { x: s.civilians.posX[i] as number, y: s.civilians.posY[i] as number };
}

/**
 * The crowd around patient zero carries the first chain: the `n` nearest healthy civilians in the crowd window
 * around (x, y) are infected (nearest first, ties by hash order).
 */
function firstChain(s: SimState, x: number, y: number, n: number): void {
  const h = s.civilianHash;
  const side = h.side;
  const k = PHASES.patientZeroCrowdWindowCells;
  const cx = h.coord(x);
  const cy = h.coord(y);
  const c = s.civilians;
  const turn = s.ct.turnTick;
  for (let round = 0; round < n; round++) {
    let best = -1;
    let bestD = 0;
    for (let gy = Math.max(0, cy - k); gy <= Math.min(side - 1, cy + k); gy++) {
      for (let gx = Math.max(0, cx - k); gx <= Math.min(side - 1, cx + k); gx++) {
        const g = gy * side + gx;
        for (let q = h.start[g] as number; q < (h.start[g + 1] as number); q++) {
          const i = h.items[q] as number;
          if (!c.alive[i] || (turn[i] as number) >= 0) continue;
          const dx = (c.posX[i] as number) - x;
          const dy = (c.posY[i] as number) - y;
          const d = dx * dx + dy * dy;
          if (best < 0 || d < bestD) {
            best = i;
            bestD = d;
          }
        }
      }
    }
    if (best < 0) return;
    infectCivilian(s, best);
  }
}

/** Starts the outbreak in a crowd at the scenario site (countdown, pressure or TriggerOutbreak). */
function beginOutbreak(s: SimState): void {
  const m = s.mission;
  if (!s.outbreak.started) {
    const p = crowdNear(s, m.pzX, m.pzY);
    if (startOutbreak(s, p.x, p.y)) firstChain(s, p.x, p.y, PHASES.patientZeroFirstChain);
  }
  m.phase = PH_OUTBREAK;
  s.eco.postOutbreak = true;
}

/** TriggerOutbreak: classic start only, during the farm phase. */
export function triggerOutbreak(s: SimState): boolean {
  const m = s.mission;
  if (!m.active || !m.classic || m.phase !== PH_FARM) return false;
  beginOutbreak(s);
  return true;
}

/** InvestigateWarning: an open sign, paid up front; done after investigateS. */
export function investigateWarning(s: SimState, id: number, tick: number): boolean {
  const m = s.mission;
  const k = id - 1;
  if (!m.active || m.phase !== PH_FARM || !Number.isInteger(id) || k < 0 || k >= MAXW) return false;
  const cost = WARNINGS.investigateCost.budget;
  if (m.wState[k] !== WS_OPEN || s.counters.budget < cost) return false;
  s.counters.budget -= cost;
  m.wState[k] = WS_INVESTIGATING;
  m.wUntil[k] = tick + WARNINGS.investigateS * TICK_RATE;
  return true;
}

function advanceWarnings(s: SimState, tick: number): void {
  const m = s.mission;
  for (let k = 0; k < MAXW; k++) {
    const st = m.wState[k];
    if (st === WS_PENDING && tick >= (m.wAt[k] as number)) {
      m.wState[k] = WS_OPEN;
      m.wUntil[k] = tick + ESCALATE_TICKS;
    } else if (st === WS_OPEN && tick >= (m.wUntil[k] as number)) {
      // Ignored: more pressure, the rest of the countdown shrinks by the same share.
      m.wState[k] = WS_ESCALATED;
      const add = WARNINGS.pressurePerEscalation * s.eco.decreeFactor('outbreakPressureFactor');
      m.pressure = Math.min(1, m.pressure + add);
      m.outbreakAt = tick + Math.floor((m.outbreakAt - tick) * Math.max(0, 1 - add));
    } else if (st === WS_INVESTIGATING && tick >= (m.wUntil[k] as number)) {
      m.wState[k] = WS_INVESTIGATED;
      m.outbreakAt += WARNINGS.investigateRewardS * TICK_RATE;
    }
  }
}

/** GDD 4 step 4 in missions: phase changes every tick, the economy pass every passTicks. */
export function missionTick(s: SimState, tick: number): void {
  const m = s.mission;
  if (!m.active) return;
  if (m.phase === PH_FARM) {
    if (!m.classic) {
      advanceWarnings(s, tick);
      if (tick >= m.outbreakAt || m.pressure >= 1) beginOutbreak(s);
    }
    if (s.outbreak.started && m.phase === PH_FARM) beginOutbreak(s);
  } else if (m.phase === PH_OUTBREAK) {
    if (s.zombies.count + s.counters.incubating > PHASES.outbreakToDefenseInfected) {
      m.phase = PH_DEFENSE;
      s.stats.moment('defense', tick, m.pzX, m.pzY);
    }
  }
  if (tick % ECONOMY_RULES.passTicks === 0) {
    economyPass(s);
    updateMorale(s);
    raiseMilitia(s, tick);
  }
}

/** Build speed factor for structure i: helpers speed it up, zombies at the site halve it (missions only). */
export function buildRate(s: SimState, i: number): number {
  if (!s.eco.active) return 1;
  const d = s.density;
  const S = s.structures;
  const c = d.coord(S.cy[i] as number) * d.side + d.coord(S.cx[i] as number);
  const fire = (d.count[c] as number) > 0 ? PHASES.underFireBuildFactor : 1;
  return s.eco.helperBonus() / fire;
}
