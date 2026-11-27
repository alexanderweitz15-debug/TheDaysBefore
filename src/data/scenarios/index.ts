// Scenario registry: every file is validated at load, its texts must exist in both languages.
import type { PathogenFamily } from '../../core/commands';
import type { ScenarioDef } from '../../core/types/mission';
import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { SCENARIO as hafenstadt } from './hafenstadt';
import { SCENARIO as rheinstadt } from './rheinstadt';
import { parseScenario } from './schema';

export const SCENARIOS: readonly ScenarioDef[] = [
  parseScenario('rheinstadt.ts', rheinstadt),
  parseScenario('hafenstadt.ts', hafenstadt),
];

const TEXT_FIELDS = ['name', 'briefing', 'goal'] as const;
for (const s of SCENARIOS)
  for (const f of TEXT_FIELDS) {
    const key = `scenario.${s.textKey}.${f}`;
    if (!(key in de) || !(key in en)) throw new Error(`Scenario ${s.id}: i18n key ${key} missing in de/en`);
  }

/** Difficulties that get exact pathogen hints in the briefing (GDD 6: vague or exact by difficulty). */
export const PRECISE_HINT_DIFFICULTIES: readonly ScenarioDef['difficulty'][] = ['easy', 'normal'];

export const PATHOGEN_FAMILIES: readonly PathogenFamily[] = [
  'viral',
  'bacterial',
  'fungal',
  'parasitic',
  'chemical',
  'nanotech',
];

/** Score multiplier shown on the start button, per difficulty. */
export const SCORE_MULTIPLIER: Record<ScenarioDef['difficulty'], number> = {
  easy: 0.75,
  normal: 1,
  hard: 1.5,
  nightmare: 2,
};

/** Free mode (menu background and "Hauptmenü" return): same seed and size as the first boot. */
export const FREE_MODE = { seed: 0x5e2201, size: 'medium' } as const;
