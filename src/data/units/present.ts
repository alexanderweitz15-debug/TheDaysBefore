// Present-day units, reference values from GDD 9 (Referenzwerte Gegenwart). Other eras derive via factors (M10).
import type { UnitTypeId } from '../../core/commands';

export type DamageType =
  | 'smallArms'
  | 'heavyArms'
  | 'explosive'
  | 'fire'
  | 'gas'
  | 'electric'
  | 'melee'
  | 'crush';

export interface UnitSpec {
  /** Soldiers per squad. */
  size: number;
  /** HP per soldier. */
  hpPerMember: number;
  /** Max range in meters; minRangeM > 0 for indirect fire. */
  rangeM: number;
  minRangeM: number;
  /** Damage per second of the whole squad at full strength; area weapons apply it within areaRadiusM. */
  dps: number;
  areaRadiusM: number;
  damageType: DamageType;
  /** Damage per single hit (snipers 200); rate derives from dps / hitDamage. */
  hitDamage: number;
  cost: number;
  /** Upkeep per minute (M4). */
  upkeepPerMin: number;
  speedMps: number;
  /** Ammo rounds carried; one round = one hit/volley. */
  ammo: number;
  /** Noise per shot (noise units, see data/agents/noise.ts). */
  shotNoise: number;
  /** Needs line of sight to fire (false for mortar with observer, M8). */
  needsSight: boolean;
  /** Prefers special zombie types (sniper). */
  prefersSpecials: boolean;
  /** Slows zombies in the fire cone (MG suppression, GDD 9: -30 %). */
  suppression: number;
  /** Corridor compliance bonus for civilians nearby (police +50 %). */
  corridorBonus: number;
  canBuild: boolean;
  canHeal: boolean;
}

/** Stable order: the snapshot units section uses the index into this list as kind. */
export const UNIT_TYPE_ORDER: readonly UnitTypeId[] = [
  'infantry',
  'mgTeam',
  'sniperTeam',
  'mortar',
  'engineers',
  'riotPolice',
  'medics',
];

const base = {
  minRangeM: 0,
  areaRadiusM: 0,
  upkeepPerMin: 0,
  needsSight: true,
  prefersSpecials: false,
  suppression: 0,
  corridorBonus: 0,
  canBuild: false,
  canHeal: false,
} as const;

export const UNITS: Record<UnitTypeId, UnitSpec> = {
  infantry: {
    ...base,
    size: 8,
    hpPerMember: 100,
    rangeM: 40,
    dps: 60,
    damageType: 'smallArms',
    hitDamage: 20,
    cost: 300,
    speedMps: 1.6,
    ammo: 600,
    shotNoise: 30,
  },
  mgTeam: {
    ...base,
    size: 3,
    hpPerMember: 100,
    rangeM: 60,
    dps: 120,
    damageType: 'smallArms',
    hitDamage: 15,
    cost: 450,
    speedMps: 1.2,
    ammo: 1500,
    shotNoise: 45,
    suppression: 0.3,
  },
  sniperTeam: {
    ...base,
    size: 2,
    hpPerMember: 90,
    rangeM: 150,
    dps: 40,
    damageType: 'heavyArms',
    hitDamage: 200,
    cost: 400,
    speedMps: 1.4,
    ammo: 60,
    shotNoise: 35,
    prefersSpecials: true,
  },
  mortar: {
    ...base,
    size: 3,
    hpPerMember: 100,
    rangeM: 600,
    minRangeM: 60,
    dps: 150,
    areaRadiusM: 8,
    damageType: 'explosive',
    hitDamage: 150,
    cost: 600,
    speedMps: 1.0,
    ammo: 80,
    shotNoise: 70,
  },
  engineers: {
    ...base,
    size: 6,
    hpPerMember: 100,
    rangeM: 30,
    dps: 20,
    damageType: 'smallArms',
    hitDamage: 15,
    cost: 350,
    speedMps: 1.5,
    ammo: 300,
    shotNoise: 25,
    canBuild: true,
  },
  riotPolice: {
    ...base,
    size: 8,
    hpPerMember: 90,
    rangeM: 25,
    dps: 20,
    damageType: 'smallArms',
    hitDamage: 12,
    cost: 200,
    speedMps: 1.6,
    ammo: 400,
    shotNoise: 25,
    corridorBonus: 0.5,
  },
  medics: {
    ...base,
    size: 4,
    hpPerMember: 90,
    rangeM: 0,
    dps: 0,
    damageType: 'smallArms',
    hitDamage: 0,
    cost: 300,
    speedMps: 1.6,
    ammo: 0,
    shotNoise: 0,
    canHeal: true,
  },
};

export const UNIT_BEHAVIOUR = {
  /** holdUntilLosses retreats below this squad strength (GDD 9: 50 %). */
  lossRetreatThreshold: 0.5,
  /** Morale: loss per lost member, per nearby colossus/screamer per second; recovery per second. */
  moraleLossPerMember: 0.08,
  moraleLossPerTerrorPerS: 0.02,
  moraleRecoveryPerS: 0.01,
  /** Below this morale units retreat on their own. */
  moraleBreakThreshold: 0.25,
  /** Rank thresholds in kills; each rank +10 % accuracy and morale (GDD 9). */
  rankKills: [0, 50, 200],
  rankBonus: 0.1,
  /** Cover bonus for infantry in or next to buildings and sandbags (GDD 9: +50 %). */
  coverDamageReduction: 0.5,
  /** Target re-evaluation cadence in ticks. */
  retargetEveryTicks: 10,
  /** Base hit chance against a moving target at max range; scales up linearly to 1 at point blank. */
  hitChanceAtMaxRange: 0.5,
  /** Area weapons may hit civilians in the blast; fire mode onCommand prevents automatic area fire. */
  collateralEnabled: true,
  /** Hit chance cap and factor while moving. */
  maxHitChance: 0.95,
  movingAccuracyFactor: 0.5,
  /** Squad footprint radius: zombies reach the squad within attack reach + this. */
  squadRadiusM: 2,
  /** Units at most this many shots per tick (fire accumulator cap). */
  maxShotsPerTick: 4,
  /** Gunfire noise: one emission per firing unit and interval (noise per burst, not per round). */
  noiseIntervalTicks: 20,
  shotNoiseRadiusM: 150,
  /** Colossi and screamers within this radius scare the squad (moraleLossPerTerrorPerS each, at most terrorCap). */
  terrorRadiusM: 30,
  terrorCap: 5,
  /** Broken units retreat until morale recovers to this value. */
  moraleRecoverThreshold: 0.5,
  /** Morale loss of units near a civilian killed by own fire (GDD 9 Kollateral). */
  moraleLossPerCollateral: 0.05,
  collateralMoraleRadiusM: 60,
  /** Aggressive squads close in on zombies within this radius when idle. */
  aggressiveSeekM: 80,
  /** Group moves: spacing of the squad grid around the target point. */
  formationSpacingM: 6,
  arriveRadiusM: 0.75,
  /** Focus fire (AttackArea, direct-fire units): targets within this radius of the point. */
  focusRadiusM: 10,
  /** MG suppression: cone half angle (rad), length = weapon range, lasts this many ticks after a burst. */
  suppressionConeRad: 0.26,
  suppressionTicks: 15,
  /** Soldiers turn into colossi with this chance (GDD 8: colossi preferably from soldiers), else by the table. */
  soldierColossusChance: 0.3,
  /** Medics heal squads within this radius (members cannot be revived). */
  healRadiusM: 15,
  healHpPerS: 4,
  /** Watchtower: units within radiusM of a finished tower get the tower's sight bonus; snipers also hit better. */
  towerRadiusM: 6,
  towerSniperHitBonus: 0.15,
} as const;

/** Indirect fire (mortar). Shell flight time = distance / shellSpeedMps; landing scatter grows with range. */
export const MORTAR = {
  shellSpeedMps: 120,
  scatterBaseM: 2,
  scatterPerM: 0.015,
  /** Auto fire (fire mode free): densest spotted 16 m cell with at least minCluster zombies. */
  minCluster: 4,
  retargetEveryTicks: 20,
  /** A cell counts as spotted within this radius of any own unit (GDD 9: needs sight or observer). */
  spotRadiusM: 60,
  /** AttackArea on a point no own squad or watchtower sees: scatter times this (observers and radio in M8). */
  unspottedScatterFactor: 3,
  /** Auto fire never targets cells this close to own units. */
  dangerCloseM: 20,
  /** Blast falloff: damage at the rim = (1 - falloff) of the center. */
  blastFalloff: 0.5,
  explosionNoise: 90,
  explosionNoiseRadiusM: 200,
} as const;

/** Armor effect per damage type: effective damage = damage * (1 - zombie armor * factor). */
export const ARMOR_PENETRATION: Record<DamageType, number> = {
  smallArms: 1,
  heavyArms: 0.5,
  explosive: 0.5,
  fire: 0,
  gas: 0,
  electric: 0.5,
  melee: 1,
  crush: 0.25,
};

/** Projectile type list: the projectiles snapshot section uses the index as kind. */
export const PROJECTILE_TYPES = ['tracer', 'shell'] as const;
export type ProjectileType = (typeof PROJECTILE_TYPES)[number];

/** Engine limits and scheduling for units (performance knobs, not balance). */
export const UNIT_ENGINE = {
  capacity: 2_000,
  projectileCapacity: 4_096,
  /** FX events buffered between two snapshot reads. */
  fxCapacity: 1_024,
  /** Small-arms tracers live this many ticks (render only, hits are instant). */
  tracerTicks: 2,
  /** A* node expansions per tick over all path requests, and per request before giving up (closest node). */
  pathExpansionsPerTick: 20_000,
  pathMaxExpansions: 60_000,
  /** Smoothed path corners kept per unit; longer paths are re-planned at the end. */
  pathMaxCorners: 64,
  /** Queued waypoints per unit (Shift moves). */
  maxWaypoints: 8,
} as const;

export const ECONOMY_M3 = {
  /** Start budget until the economy exists (M4). */
  startBudget: 8_000,
  /** Ammo resupply per second within a depot radius, in fraction of max ammo. */
  depotResupplyPerS: 0.05,
} as const;
