// Debrief (GDD 10 Auswertung, GDD 15 "Warum habe ich verloren?"): copies the recorded statistics once at the
// end and ranks one to three defeat causes from them. Allocates (called once).

import { TICK_RATE } from '../../core/loop';
import { type CauseKey, type DebriefData, type KeyMoment, MOMENT_KEYS } from '../../core/types/outcome';
import { CAUSES, DEBRIEF } from '../../data/scoring';
import { outcomeView } from '../economy/mission-view';
import type { SimState } from '../state';
import { SERIES } from './recorder';
import { DEFEAT_REASONS } from './result';
import { scoreView } from './score';

type Cause = DebriefData['causes'][number];

/** Heat counts scaled to 0..255 (relative to the hottest cell). */
function scaled(src: Uint32Array): Uint8Array {
  let max = 0;
  for (let i = 0; i < src.length; i++) if ((src[i] as number) > max) max = src[i] as number;
  const out = new Uint8Array(src.length);
  if (max === 0) return out;
  for (let i = 0; i < src.length; i++) {
    const v = src[i] as number;
    if (v > 0) out[i] = Math.max(1, Math.round((255 * v) / max));
  }
  return out;
}

/**
 * Candidate causes with weights; the strongest (at most CAUSES.maxCauses) are reported. Only CAUSE_KEYS exist:
 * hqOverrun, wallLost / noAntiArmor (colossi at the wall, no anti-armor squad near), zoneBreached (share of
 * infections inside safe zones), ammoOut, lateOutbreakResponse (too few squads when the outbreak began),
 * collateral, lowMorale, and the defeat reasons populationLost / timeLimit. HQ, population and time-limit
 * defeats therefore always carry at least one cause; a surrender may have none.
 */
function causes(s: SimState): Cause[] {
  const st = s.stats;
  const W = CAUSES.weights;
  const out: { w: number; c: Cause }[] = [];
  const add = (w: number, key: CauseKey, tick: number, params: Record<string, number>): void => {
    out.push({ w, c: { key, tick, params } });
  };
  if (st.hqFallTick >= 0)
    add(W.hqOverrun, 'hqOverrun', st.hqFallTick, { zombies: st.hqZombies, squads: st.hqSquads });
  if (st.wallTick >= 0) {
    const colossi = st.wallColossi > 0 && st.wallAntiArmor === 0;
    add(colossi ? W.noAntiArmor : W.wallLost, colossi ? 'noAntiArmor' : 'wallLost', st.wallTick, {
      zombies: st.wallZombies,
      colossi: st.wallColossi,
      antiArmor: st.wallAntiArmor,
    });
  }
  if (st.squadsAtOutbreak >= 0 && st.squadsAtOutbreak < CAUSES.fewSquads)
    add(W.lateOutbreakResponse, 'lateOutbreakResponse', Math.max(0, s.outbreak.startTick), {
      squads: st.squadsAtOutbreak,
    });
  if (st.ammoOutTick >= 0) add(W.ammoOut, 'ammoOut', st.ammoOutTick, {});
  const share = st.infections > 0 ? st.shelterInfections / st.infections : 0;
  if (st.shelterInfections >= CAUSES.shelterInfectionMin && share >= CAUSES.shelterInfectionShare)
    add(W.zoneBreached * (1 + share), 'zoneBreached', st.shelterInfectionTick, {
      pct: Math.round(100 * share),
    });
  if (s.counters.collateralKills >= CAUSES.collateralKillsMin)
    add(W.collateral, 'collateral', st.collateralTick, { kills: s.result.endCollateral });
  if (st.lowMoraleTick >= 0)
    add(W.lowMorale, 'lowMorale', st.lowMoraleTick, { morale: Math.round(st.lowMorale) });
  const reason = DEFEAT_REASONS[s.result.reason];
  const r = s.result;
  if (reason === 'populationLost')
    add(W.populationLost, 'populationLost', r.endTick, {
      pct: Math.round((100 * s.civilians.count) / Math.max(1, r.populationStart)),
    });
  if (reason === 'timeLimit')
    add(W.timeLimit, 'timeLimit', r.endTick, { minutes: Math.round(r.timeLimitTicks / (60 * TICK_RATE)) });
  // Stable order: weight, then earlier first.
  out.sort((a, b) => b.w - a.w || a.c.tick - b.c.tick);
  return out.slice(0, CAUSES.maxCauses).map((o) => o.c);
}

export function buildDebrief(s: SimState): DebriefData | null {
  const r = s.result;
  if (!r.active || !r.ended) return null;
  const st = s.stats;
  const m = DEBRIEF.maxSamples;
  const series = (k: number): Float32Array => st.history.slice(k * m, k * m + st.samples);
  const g = st.gridCells;
  const moments: KeyMoment[] = [];
  for (let k = 0; k < st.momentCount; k++)
    moments.push({
      tick: st.mTick[k] as number,
      key: MOMENT_KEYS[st.mKey[k] as number] as KeyMoment['key'],
      x: st.mX[k] as number,
      y: st.mY[k] as number,
    });
  return {
    outcome: outcomeView(s) as DebriefData['outcome'],
    score: scoreView(s),
    history: {
      sampleTicks: st.sampleTicks,
      infected: series(SERIES.indexOf('infected')),
      civilians: series(SERIES.indexOf('civilians')),
      soldiers: series(SERIES.indexOf('soldiers')),
      morale: series(SERIES.indexOf('morale')),
      budget: series(SERIES.indexOf('budget')),
    },
    grids: {
      widthCells: st.side,
      heightCells: st.side,
      cellM: st.cellM,
      infection: scaled(st.heat.subarray(0, g)),
      losses: scaled(st.heat.subarray(g, 2 * g)),
      collateral: scaled(st.heat.subarray(2 * g, 3 * g)),
      frameCount: st.frameCount,
      frameTicks: st.frameTicks,
      frames: st.frames.slice(0, st.frameCount * 2 * g),
    },
    moments,
    causes: r.victory ? [] : causes(s),
  };
}
