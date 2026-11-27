// HUD values for the order system (decision 2026-11-27: troops are controlled by orders, not selection).
import type { Stance } from '../core/commands';

export const ORDER_TOOLS = ['defendLine', 'holdZone', 'occupyBuilding'] as const;
export type OrderTool = (typeof ORDER_TOOLS)[number];
export const ORDER_STANCES: readonly Stance[] = ['hold', 'holdUntilLosses', 'aggressive'];
export const DEFAULT_ORDER_STANCE: Stance = 'hold';
/** New order dialog: share of each reserve type requested by default. */
export const ORDER_DEFAULT_SHARE = 0.5;
/** Minimum drawn size of an order shape, meters. */
export const ORDER_MIN_LINE_M = 8;
export const ORDER_MIN_ZONE_M = 10;
/** Shift on a buy button buys this many squads at once. */
export const BUY_SHIFT_COUNT = 5;
/** Garrison capacity estimate for the building preview (the sim decides the real value): cells of floor area per squad. */
export const GARRISON_PREVIEW = { floorCellsPerSquad: 14, maxSquads: 6 };
/** Integrity below this share shows the garrison as endangered (red). */
export const INTEGRITY_WARN = 0.35;
/** Strength markers on the map: spacing in meters along line/zone, cap per order. */
export const MARKER_SPACING_M = 14;
export const MARKER_RADIUS_PX = 5;
export const ORDER_LINE_PX = 3;
export const ORDER_DASH_PX = 10;
