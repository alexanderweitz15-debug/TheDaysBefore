// Structure kind and state tables (GDD 9 Bauwerke), indexed like STRUCTURE_KINDS.
import type { StructureKind } from '../../core/commands';
import type { StructureState } from '../../core/types/combat';
import { STRUCTURES } from '../../data/buildings/defense';

export const STRUCTURE_KINDS: readonly StructureKind[] = [
  'barricade',
  'wall',
  'gate',
  'wire',
  'mines',
  'charge',
  'watchtower',
  'depot',
];
export const SK = Object.fromEntries(STRUCTURE_KINDS.map((k, i) => [k, i])) as Record<StructureKind, number>;
export const STATES: readonly StructureState[] = ['building', 'done', 'destroyed'];
export const SS_BUILDING = 0;
export const SS_DONE = 1;
export const SS_DESTROYED = 2;

export const SPEC = STRUCTURE_KINDS.map((k) => STRUCTURES[k]);
export const SK_BLOCKS = Uint8Array.from(SPEC, (s) => (s.blocks ? 1 : 0));
export const SK_ARMOR = Float32Array.from(SPEC, (s) => s.armor);
/** Kinds without footprint cells. */
export const POINTLESS = (k: number): boolean => k === SK.mines || k === SK.charge;

export const MAX_STRUCTURES = 4096;
/** Footprint cells and neighbor ring cells per structure. */
export const MAX_CELLS = 32;
export const MAX_RING = 64;
