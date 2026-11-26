// Player-placed civil structures (GDD 7 Zivilisten). Sent from worker on change, small and structured-cloned.

export type ZoneKind = 'safeZone' | 'corridor' | 'rallyPoint';

export interface ZoneView {
  id: number;
  kind: ZoneKind;
  /** safeZone: [x0, y0, x1, y1]; corridor: polyline flat; rallyPoint: [x, y]. Meters. */
  shape: number[];
  capacity: number;
  occupants: number;
  /** True once an infected agent turned inside (GDD 7: outbreak inside the zone). */
  breached: boolean;
}

/** Civilian state codes written into the civilian `kind` byte of the snapshot (GDD 7). */
export const CIVILIAN_STATES = [
  'routine',
  'alerted',
  'fleeing',
  'panic',
  'sheltered',
  'evacuated',
  'incubating',
  'dead',
] as const;
export type CivilianState = (typeof CIVILIAN_STATES)[number];

/** Zombie type codes written into the zombie `kind` byte (GDD 8, viral types first). */
export const ZOMBIE_TYPES = ['walker', 'sprinter', 'screamer', 'colossus', 'patientZero'] as const;
export type ZombieType = (typeof ZOMBIE_TYPES)[number];
