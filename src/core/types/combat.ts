// Units, structures and combat effects as seen by render and UI (GDD 9). Structured-cloned, small.
import type { FireMode, Stance, StructureKind, UnitTypeId } from '../commands';

/** Per-unit view, sent with every snapshot (max 2,000 units). Position comes from the units AgentSection. */
export interface UnitView {
  id: number;
  type: UnitTypeId;
  /** Soldiers alive in the squad. */
  members: number;
  /** Squad HP 0..1 and ammo 0..1. */
  hp: number;
  ammo: number;
  stance: Stance;
  fireMode: FireMode;
  /** Current order target in meters, or null. */
  target: [number, number] | null;
  /** Unit morale 0..1 (GDD 9 Moral der Truppe). */
  morale: number;
  rank: 0 | 1 | 2;
}

export type StructureState = 'building' | 'done' | 'destroyed';

export interface StructureView {
  id: number;
  kind: StructureKind;
  /** Line kinds: polyline flat in meters; point kinds: [x, y]. */
  shape: number[];
  rotation: number;
  hp: number;
  maxHp: number;
  state: StructureState;
  /** Build progress 0..1. */
  progress: number;
  /** Gate: true = open. Charge: true = armed. Otherwise false. */
  flag: boolean;
}

/**
 * Short-lived render events, flat Float32 quadruples [type, x, y, param] per snapshot.
 * param: shot = direction in radians; explosion, mineBlast = radius in meters; others = 0.
 * Projectile kind in the snapshot: 0 = bullet tracer, 1 = shell/grenade.
 */
export const FX_TYPES = ['shot', 'impact', 'explosion', 'wallHit', 'mineBlast', 'death'] as const;
export type FxType = (typeof FX_TYPES)[number];
