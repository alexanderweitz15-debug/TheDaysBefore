// Defensive structures (GDD 9 Bauwerke der Verteidigung). Starting values; GDD gives functions, not numbers.
import type { StructureKind } from '../../core/commands';

export interface StructureSpec {
  /** Line structures cost and hp per meter; point structures per piece. */
  line: boolean;
  cost: number;
  hp: number;
  /** Build time in seconds per meter (line) or per piece, for one engineer squad; without engineers x3. */
  buildS: number;
  /** Blocks movement of zombies and civilians (gates open for own units/civilians). */
  blocks: boolean;
  /** Slow factor for zombies passing through (wire -60 %). */
  slow: number;
  /** Line thickness or footprint radius in meters; gates: width along the rotation. */
  sizeM: number;
  /** Sight bonus (watchtower). */
  sightBonusM: number;
  armor: number;
}

export const STRUCTURES: Record<StructureKind, StructureSpec> = {
  barricade: {
    line: true,
    cost: 8,
    hp: 150,
    buildS: 1,
    blocks: true,
    slow: 0,
    sizeM: 2,
    sightBonusM: 0,
    armor: 0,
  },
  wall: {
    line: true,
    cost: 25,
    hp: 800,
    buildS: 3,
    blocks: true,
    slow: 0,
    sizeM: 2,
    sightBonusM: 0,
    armor: 0.3,
  },
  gate: {
    line: false,
    cost: 200,
    hp: 1200,
    buildS: 15,
    blocks: true,
    slow: 0,
    sizeM: 4,
    sightBonusM: 0,
    armor: 0.3,
  },
  wire: {
    line: true,
    cost: 4,
    hp: 60,
    buildS: 0.5,
    blocks: false,
    slow: 0.6,
    sizeM: 3,
    sightBonusM: 0,
    armor: 0,
  },
  mines: {
    line: false,
    cost: 250,
    hp: 1,
    buildS: 10,
    blocks: false,
    slow: 0,
    sizeM: 10,
    sightBonusM: 0,
    armor: 0,
  },
  charge: {
    line: false,
    cost: 300,
    hp: 50,
    buildS: 12,
    blocks: false,
    slow: 0,
    sizeM: 2,
    sightBonusM: 0,
    armor: 0,
  },
  watchtower: {
    line: false,
    cost: 250,
    hp: 400,
    buildS: 20,
    blocks: true,
    slow: 0,
    // Footprint radius 2 m (one 4 m cell): a tower should not close a street.
    sizeM: 2,
    sightBonusM: 30,
    armor: 0.2,
  },
  depot: {
    line: false,
    cost: 400,
    hp: 600,
    buildS: 25,
    blocks: true,
    slow: 0,
    sizeM: 6,
    sightBonusM: 0,
    armor: 0.1,
  },
};

export const STRUCTURE_RULES = {
  /** Pressure damage per second per zombie pushing against a blocking structure (GDD 8 rule 5). */
  pressureDpsPerZombie: 2,
  /** Zombies count as pushing within this distance of the structure line. */
  pressureRangeM: 1.5,
  /** Above this zombie count per meter of wall, single zombies climb over low structures (barricade). */
  climbDensityPerM: 6,
  climbChancePerS: 0.02,
  /** Gate closes automatically with zombies within this radius (GDD 9: 15 m). */
  gateCloseRadiusM: 15,
  mines: { charges: 6, triggerRadiusM: 3, blastRadiusM: 8, damage: 400 },
  charge: { blastRadiusM: 15, damage: 1500, destroysStructures: true },
  depotRadiusM: 40,
  /** Line structures are split into segments of this length (local breaches, per-segment ids). */
  segmentM: 8,
  /** Pressure and climbing are evaluated every this many ticks. */
  pressureIntervalTicks: 10,
  /** Engineers build and repair structures within this distance; repair rate per squad. */
  buildRangeM: 30,
  repairHpPerS: 20,
  /** Without engineers, at most this many structures progress at once (in id order), buildS x slowBuildFactor. */
  slowBuildSlots: 2,
  slowBuildFactor: 3,
  /** Demolishing refunds this share of the cost; destroyed structures stay visible this long. */
  demolishRefund: 0.5,
  rubbleS: 10,
  /** Gates check for zombies every this many ticks. */
  gateCheckTicks: 5,
  /** Mine field: pause between two charges. */
  mineCooldownTicks: 10,
  /** Pathing refresh after walkability changes: wait this many ticks so line builds batch. */
  repathDebounceTicks: 40,
  /** Work units per tick when civilian routine fields are recomputed after a walkability change (initial: 60k). */
  routineRepathCellsPerTick: 20_000,
  /** Build cost multiplier after the outbreak (GDD 6: +25 %), applied from M4. */
  postOutbreakCostFactor: 1.25,
} as const;
