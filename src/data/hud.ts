// HUD tuning values (GDD 14). Display only.
import type { GameSpeed } from '../core/commands';

/** Speed buttons in the top bar, in order. */
export const HUD_SPEEDS: readonly GameSpeed[] = [0, 0.5, 1, 2, 4];
/** HUD refresh interval for counters and unit details, ms. */
export const HUD_REFRESH_MS = 250;
/** Click on a unit or structure: pick radius in screen px. */
export const PICK_RADIUS_PX = 14;
/** Armed confirmation (demolish) expires after this time, ms. */
export const CONFIRM_MS = 3000;
/** Minimap: density grid edge in cells, redraw interval in ms. */
export const MINIMAP_DENSITY_CELLS = 64;
export const MINIMAP_REFRESH_MS = 200;
export const MINIMAP_DENSITY_FULL = 12;
/** Structure placement: minimum line length in meters. */
export const MIN_LINE_LENGTH_M = 3;
/** Rotation step for point structures (key R), radians. */
export const ROTATE_STEP = Math.PI / 2;
/** Resources shown as chips only while relevant (non-zero amount or trend, or critical). */
export const RELEVANT_ONLY_RESOURCES = ['power', 'research'] as const;
/** Countdown colors: warn below, crit below, seconds. */
export const COUNTDOWN_WARN_S = 120;
export const COUNTDOWN_CRIT_S = 60;
