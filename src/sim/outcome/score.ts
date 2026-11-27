// Score (GDD 10 Wertung): live from the latest evaluation, fixed at the end. Rescued civilians are those in
// safe zones (healthy) plus early evacuees; infected in safe zones count as "infected evacuated" until M8.
import { TICK_RATE } from '../../core/loop';
import { type ObjectiveView, SCORE_LINE_KEYS, type ScoreView } from '../../core/types/outcome';
import { SCORE_POINTS as P } from '../../data/scoring';
import type { SimState } from '../state';
import { soldiersAlive } from './recorder';
import { VICTORY_KINDS } from './result';

/** Fast-victory bonus for a victory at `tick` (linear over the window, game time since mission start). */
export function fastVictoryBonus(tick: number): number {
  const t = tick / TICK_RATE;
  return P.fastVictoryMax * Math.max(0, 1 - t / P.fastVictoryWindowS);
}

export function scoreView(s: SimState): ScoreView {
  const r = s.result;
  const c = s.counters;
  // Free mode has no evaluation: take the live values directly.
  const saved = r.active ? r.saved : c.sheltered;
  const soldiers = r.active ? r.soldiers : soldiersAlive(s);
  const won = r.ended && r.victory;
  const kills = r.ended ? r.endZombiesKilled : c.zombiesKilled;
  const collateral = r.ended ? r.endCollateral : c.collateralKills;
  const minutes = won ? Math.round(r.endTick / (60 * TICK_RATE)) : 0;
  const rows: [number, number][] = [
    [saved, saved * P.civilianSaved],
    [soldiers, soldiers * P.soldierSurvived],
    [kills, kills * P.zombieKilled],
    [minutes, won ? fastVictoryBonus(r.endTick) : 0],
    [collateral, collateral * P.civilianKilledByOwnWeapons],
    [r.savedInfected, r.savedInfected * P.infectedEvacuated],
    // Sector abandonment arrives with M8.
    [0, 0],
  ];
  let sum = 0;
  const lines = rows.map(([count, points], k) => {
    sum += points;
    return {
      key: SCORE_LINE_KEYS[k] as ScoreView['lines'][number]['key'],
      count,
      points: Math.round(points),
    };
  });
  const multiplier = r.active ? r.multiplier : 1;
  const total = Math.round(sum * multiplier);
  let medal: ScoreView['medal'] = 'none';
  if (r.hasMedals && !(r.ended && !r.victory)) {
    if (total >= (r.medals[2] as number)) medal = 'gold';
    else if (total >= (r.medals[1] as number)) medal = 'silver';
    else if (total >= (r.medals[0] as number)) medal = 'bronze';
  }
  return { lines, multiplier, total, medal };
}

export function objectiveViews(s: SimState): ObjectiveView[] {
  const r = s.result;
  const out: ObjectiveView[] = [];
  for (let q = 0; q < r.kindCount; q++) {
    const k = r.kinds[q] as number;
    out.push({
      kind: VICTORY_KINDS[k] as ObjectiveView['kind'],
      progress: r.progress[k] as number,
      met: r.met[k] === 1,
    });
  }
  return out;
}
