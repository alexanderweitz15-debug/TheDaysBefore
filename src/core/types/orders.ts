// Order-based troop control (decision 2026-11-27: no RTS). Units are bought into a reserve at the HQ;
// the player issues orders, the sim assigns squads from the reserve and replaces losses.
import type { Stance, UnitTypeId } from '../commands';

export type OrderKind = 'defendLine' | 'holdZone' | 'occupyBuilding';

export interface OrderView {
  id: number;
  kind: OrderKind;
  /** defendLine: polyline flat; holdZone: [x0, y0, x1, y1]; occupyBuilding: [x, y] of the building center. Meters. */
  shape: number[];
  /** occupyBuilding: map building index; otherwise -1. */
  buildingId: number;
  /** Requested squads per type (what the player asked for). */
  requested: Partial<Record<UnitTypeId, number>>;
  /** Unit ids currently assigned (en route or in position). */
  assigned: number[];
  /** Squads already in position. */
  inPosition: number;
  stance: Stance;
  /** pending: waiting for reserve; active: holding; failing: overrun or understaffed; lost: position fell. */
  status: 'pending' | 'active' | 'failing' | 'lost';
}

export interface ReserveView {
  /** Idle squads at the HQ per type. */
  idle: Partial<Record<UnitTypeId, number>>;
  /** Squads walking back to the reserve. */
  returning: number;
}

/** Occupied city buildings (garrisons), for render and the context panel. */
export interface GarrisonView {
  buildingId: number;
  unitIds: number[];
  /** Building integrity 0..1 under zombie pressure; at 0 the garrison is forced out. */
  integrity: number;
}
