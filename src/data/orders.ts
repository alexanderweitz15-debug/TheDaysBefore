// Order system (decision 2026-11-27: no RTS; GDD 2 "Ziele und Haltungen vorgeben", GDD 9 Infanterie besetzt
// Gebäude, Deckung +50 %, GDD 7 Sicht nach Höhe). Starting values; GDD gives functions, not numbers.
import type { UnitTypeId } from '../core/commands';

export const ORDER_LIMITS = {
  /** Open orders at once. */
  maxOrders: 64,
  /** Squads per order (sum over all types). */
  maxSquadsPerOrder: 24,
  /** DefendLine polyline points (more are dropped). */
  maxLinePoints: 32,
} as const;

export const ORDER_RULES = {
  /** Reserve assignment and status pass every this many ticks. */
  assignIntervalTicks: 10,
  /** Enemy side of a line re-evaluated every this many ticks. */
  sideCheckTicks: 40,
  /** Enemy side probe: distance from the line midpoint and probe radius (zombie density). */
  sideProbeM: 60,
  sideProbeRadiusM: 50,
  /** The enemy side flips only if the other side has this factor more zombies plus sideFlipMin. */
  sideFlipFactor: 1.5,
  sideFlipMin: 5,
  /** Line posts stand this far behind the line (friendly side), so a line drawn on a wall stays walkable. */
  lineBackoffM: 3,
  /** A squad counts as at its post (or at the building door) within this distance. */
  arriveM: 3,
  /** Posted squads further than this from their post walk back (aggressive squads only without zombies near). */
  returnM: 4,
  /** Aggressive squads pursue within this radius of their post, beyond it they return. */
  aggressiveLeashM: 60,
  /** Squads that could not reach their goal retry this often (ticks). */
  retryTicks: 40,
  /** holdZone: open-ground posts are spread over road cells sampled on this grid (cells). */
  zoneSampleCells: 2,
  /** HoldZone squads engage zombies inside the zone (aggressive: zone + weapon range); checks every this many ticks. */
  engageCheckTicks: 20,
  /** Squads close in to this share of their weapon range. */
  engageRangeShare: 0.7,
  /** Idle reserve squads at the HQ engage zombies within this radius of their spot, then walk back. */
  reserveDefendM: 80,
  /** Garrison integrity below this marks the order as failing. */
  failingIntegrity: 0.3,
} as const;

/** City buildings occupied by squads (garrisons). */
export const GARRISON = {
  /** Unit types that can fire from inside a building; others take posts next to it. */
  types: ['infantry', 'mgTeam', 'sniperTeam', 'riotPolice', 'militia'] as readonly UnitTypeId[],
  /** Squads per building: one per this many floor-cells (footprint cells x floors, 4 m cells), 1..maxSquads. */
  floorCellsPerSquad: 14,
  maxSquads: 6,
  /** Damage reduction inside (GDD 9: cover +50 %). */
  coverDamageReduction: 0.5,
  /** Sight and weapon range bonus per floor above the ground floor (GDD 7: posts on high-rises see further). */
  sightPerFloorM: 3,
  maxSightBonusM: 36,
  /** Building integrity HP: base + per footprint cell. Zombies next to it deal STRUCTURE_RULES pressure. */
  hpBase: 1000,
  hpPerCell: 300,
  /** At integrity 0 the garrison is forced out; each squad takes this share of its full HP (before cover). */
  ejectDamageShare: 0.25,
} as const;

/** Squads that fit into a city building (shared by sim and UI). */
export function garrisonCapacity(floors: number, footprintCells: number): number {
  const fc = Math.max(1, floors) * footprintCells;
  return Math.min(GARRISON.maxSquads, Math.max(1, Math.floor(fc / GARRISON.floorCellsPerSquad)));
}
