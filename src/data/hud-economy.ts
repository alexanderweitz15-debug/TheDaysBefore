// HUD values for the economy windows and the top bar (GDD 6, 14). Display only.
import type { ResourceId } from '../core/commands';

/** Budget trend arrow: perMin currently includes one-off purchases (sim), so it is hidden until it is income only. */
export const SHOW_BUDGET_TREND = true;

export const RESOURCE_ORDER: readonly ResourceId[] = [
  'budget',
  'material',
  'fuel',
  'ammo',
  'medicine',
  'food',
  'power',
  'research',
];
/** Capacity above this counts as unlimited (no fill percentage, no critical colors). */
export const UNLIMITED_CAPACITY = 1e6;
/** Critical values (GDD 14): share of capacity. */
export const WARN_FRACTION = 0.25;
export const CRIT_FRACTION = 0.1;
/** Population sliders: step in percent. */
export const POP_SLIDER_STEP = 1;
/** Morale bands for the bar color, same thresholds as critical values. */
export const MORALE_MAX = 100;
/** Warning marker: screen offset of the popover in px and escalation shown as critical below this many seconds. */
export const WARNING_CRIT_S = 20;
/** Minimum time the loading screen stays, ms, so the steps are readable. */
export const LOADING_MIN_MS = 600;
/** Weights of the loading steps (generate, draw, start); sum 1. */
export const LOADING_WEIGHTS = [0.5, 0.4, 0.1] as const;
/** Briefing map preview edge in px. */
export const PREVIEW_SIZE_PX = 320;
export const LOADING_TIPS = ['tip1', 'tip2', 'tip3'] as const;
