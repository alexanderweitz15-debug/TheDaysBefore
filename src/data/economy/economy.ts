// Economy, population, decrees and warning signs (GDD 6). Starting values for balancing.
import type { EconomyBuildingKind, ResourceId, StructureKind, UnitTypeId } from '../../core/commands';
import type { District } from '../../core/types/map';

export interface EconomyBuildingSpec {
  /** Districts whose buildings can be repurposed into this kind. */
  fromDistricts: District[];
  repurposeCost: Partial<Record<ResourceId, number>>;
  repurposeS: number;
  workers: number;
  /** Power demand in units; produced power counts as negative demand. */
  power: number;
  /** Per minute at full staffing. Inputs are consumed, outputs produced (max two-stage chains). */
  inputsPerMin: Partial<Record<ResourceId, number>>;
  outputsPerMin: Partial<Record<ResourceId, number>>;
  /** Added storage capacity. */
  storage: Partial<Record<ResourceId, number>>;
}

const none = { inputsPerMin: {}, outputsPerMin: {}, storage: {} };

export const ECONOMY_BUILDINGS: Record<EconomyBuildingKind, EconomyBuildingSpec> = {
  hq: {
    ...none,
    fromDistricts: [],
    repurposeCost: {},
    repurposeS: 0,
    workers: 0,
    power: 0,
    storage: { budget: 1e9, material: 2000, fuel: 1000, ammo: 2000, medicine: 500, food: 3000 },
  },
  steelworks: {
    ...none,
    fromDistricts: ['industrial'],
    repurposeCost: { budget: 800 },
    repurposeS: 40,
    workers: 120,
    power: 20,
    outputsPerMin: { material: 60 },
  },
  scrapyard: {
    ...none,
    fromDistricts: ['industrial', 'harbor'],
    repurposeCost: { budget: 300 },
    repurposeS: 20,
    workers: 40,
    power: 0,
    outputsPerMin: { material: 25 },
  },
  chemicalPlant: {
    ...none,
    fromDistricts: ['industrial'],
    repurposeCost: { budget: 900 },
    repurposeS: 45,
    workers: 80,
    power: 25,
    outputsPerMin: { research: 2 },
  },
  ammoFactory: {
    ...none,
    fromDistricts: ['industrial'],
    repurposeCost: { budget: 1200 },
    repurposeS: 50,
    workers: 100,
    power: 20,
    inputsPerMin: { material: 20 },
    outputsPerMin: { ammo: 80 },
  },
  refinery: {
    ...none,
    fromDistricts: ['industrial', 'harbor'],
    repurposeCost: { budget: 1500 },
    repurposeS: 60,
    workers: 90,
    power: 30,
    outputsPerMin: { fuel: 40 },
  },
  fuelDepot: {
    ...none,
    fromDistricts: ['industrial', 'harbor', 'commercial'],
    repurposeCost: { budget: 400 },
    repurposeS: 20,
    workers: 10,
    power: 0,
    storage: { fuel: 2000 },
  },
  powerPlant: {
    ...none,
    fromDistricts: ['industrial'],
    repurposeCost: { budget: 2000 },
    repurposeS: 60,
    workers: 60,
    power: -200,
    inputsPerMin: { fuel: 5 },
  },
  generator: {
    ...none,
    fromDistricts: ['industrial', 'commercial', 'residential', 'hospital'],
    repurposeCost: { budget: 300, material: 50 },
    repurposeS: 15,
    workers: 4,
    power: -30,
    inputsPerMin: { fuel: 3 },
  },
  warehouse: {
    ...none,
    fromDistricts: ['industrial', 'harbor', 'commercial'],
    repurposeCost: { budget: 300 },
    repurposeS: 15,
    workers: 10,
    power: 0,
    storage: { material: 2000, ammo: 2000, food: 4000, medicine: 500 },
  },
  hospital: {
    ...none,
    fromDistricts: ['hospital'],
    repurposeCost: { budget: 500 },
    repurposeS: 30,
    workers: 80,
    power: 25,
    outputsPerMin: { medicine: 15 },
  },
  pharma: {
    ...none,
    fromDistricts: ['industrial', 'university'],
    repurposeCost: { budget: 1500 },
    repurposeS: 60,
    workers: 60,
    power: 25,
    inputsPerMin: { material: 5 },
    outputsPerMin: { medicine: 30 },
  },
  lab: {
    ...none,
    fromDistricts: ['university', 'hospital', 'commercial'],
    repurposeCost: { budget: 1000 },
    repurposeS: 40,
    workers: 30,
    power: 20,
    outputsPerMin: { research: 6 },
  },
  university: {
    ...none,
    fromDistricts: ['university'],
    repurposeCost: { budget: 600 },
    repurposeS: 30,
    workers: 50,
    power: 15,
    outputsPerMin: { research: 10 },
  },
  farm: {
    ...none,
    fromDistricts: ['suburb'],
    repurposeCost: { budget: 300 },
    repurposeS: 20,
    workers: 40,
    power: 0,
    outputsPerMin: { food: 120 },
  },
  market: {
    ...none,
    fromDistricts: ['commercial', 'oldtown'],
    repurposeCost: { budget: 200 },
    repurposeS: 15,
    workers: 20,
    power: 2,
    outputsPerMin: { food: 40, budget: 30 },
  },
};

export const POPULATION = {
  /** Taxes per resident per minute at morale 100 (scaled by morale/100). */
  taxPerResidentPerMin: 0.08,
  /** Food per resident per minute; shortage lowers morale. */
  foodPerResidentPerMin: 0.01,
  /** Conscripts form militia: residents per militia squad (GDD 9: Miliz 10 Personen). */
  conscriptsPerMilitia: 10,
  /** Default assignment in percent. */
  defaultAssignment: { workers: 30, conscripts: 0, helpers: 10 },
  /** Conscription lowers taxes and morale (GDD 6). */
  conscriptTaxPenalty: 1,
  conscriptMoralePenaltyPer10Pct: 3,
  /** Helpers speed up building and repurposing: +x per 10 % helpers. */
  helperBuildBonusPer10Pct: 0.1,
  /** Militia from conscripts (GDD 9 Miliz: 80 budget + 10 conscripts); not placeable via PlaceUnit. */
  militiaUnitType: 'militia' as UnitTypeId,
  militiaCost: 80,
  militiaMaxSquads: 20,
  militiaEveryS: 2,
} as const;

export const MORALE = {
  start: 70,
  /** Target morale contributions; morale moves toward the sum at rate per minute. */
  base: 50,
  foodOk: 10,
  hunger: -25,
  safetyPerSafeZone: 3,
  safetyMax: 15,
  lossPer100Dead: -5,
  collateralPerKill: -0.5,
  abandonedSector: -10,
  ratePerMin: 10,
  /** Effects (GDD 6): below these thresholds. */
  strikeBelow: 30,
  strikeProductionFactor: 0.5,
  /** Below strikeBelow civilians panic earlier in the outbreak (GDD 6): panic rise x this. */
  lowMoralePanicFactor: 1.5,
  volunteersAbove: 80,
  productionBonusAbove80: 0.1,
  /** Successes: zombies killed raise the target (GDD 6 Erfolge). */
  successPer100Kills: 2,
  successMax: 10,
  /** Decree moralePerMin times this is its contribution to the target (a drift alone would be absorbed). */
  decreeTargetPerRate: 10,
  /** Above volunteersAbove this share of the free population volunteers as helpers. */
  volunteerShareOfFree: 0.05,
} as const;

/** Economy engine rules (GDD 6, GDD 4 step 4). */
export const ECONOMY_RULES = {
  maxBuildings: 64,
  /** Production pass interval in ticks (GDD 4: every 20 ticks). */
  passTicks: 20,
  /** Zombies in the coarse cells around a building that shut it down (sector overrun follows in M8). */
  overrunZombies: 6,
  /** Capacity of resources without a storage entry. */
  unlimited: 1e9,
  /** Trend window for ResourceView.perMin, in passes (1 per second). */
  trendPasses: 60,
} as const;

/** Material per meter (lines) or per piece; the budget part is STRUCTURES[kind].cost. */
export const STRUCTURE_MATERIAL: Record<StructureKind, number> = {
  barricade: 1,
  wall: 4,
  gate: 30,
  wire: 0.5,
  mines: 20,
  charge: 15,
  watchtower: 60,
  depot: 40,
};

export interface DecreeSpec {
  /** Effects while active; keys interpreted by the economy system. */
  taxFactor?: number;
  productionFactor?: number;
  moralePerMin?: number;
  foodFactor?: number;
  panicFactor?: number;
  outbreakPressureFactor?: number;
  /** One-shot: evacuate share of children/elderly at activation (saved civilians, fewer workers). */
  earlyEvacuationShare?: number;
}

export const DECREES: Record<string, DecreeSpec> = {
  curfew: { productionFactor: 0.85, panicFactor: 0.6, moralePerMin: -0.5 },
  rationing: { foodFactor: 0.7, moralePerMin: -0.8 },
  emergencyLaw: { productionFactor: 1.15, moralePerMin: -1 },
  mandatoryVaccination: { moralePerMin: -0.3 },
  earlyEvacuation: { earlyEvacuationShare: 0.15, productionFactor: 0.9 },
  martialLaw: { panicFactor: 0.5, taxFactor: 0.8, moralePerMin: -1.5 },
  stationLockdown: { outbreakPressureFactor: 0.6, moralePerMin: -0.5 },
};

export const WARNINGS = {
  /** Warning signs per mission and spacing during the farm phase. */
  count: 4,
  firstAtFraction: 0.25,
  /** Ignored warning escalates after this many seconds and adds pressure. */
  escalateAfterS: 90,
  pressurePerEscalation: 0.25,
  /** Pressure 1 = outbreak now; pressure shortens the remaining countdown proportionally. */
  investigateCost: { budget: 300 },
  investigateS: 30,
  /** Reward: countdown extension in seconds. */
  investigateRewardS: 60,
  /** i18n keys per pathogen family (GDD 6 examples). */
  keys: {
    viral: ['sickReports', 'deadAnimals', 'radioSilence'],
    bacterial: ['contaminatedWater', 'sickReports'],
    fungal: ['sewerFungus'],
    parasitic: ['deadAnimals', 'rashDockworkers'],
    chemical: ['contaminatedWater'],
    nanotech: ['radioSilence'],
  },
} as const;

export const PHASES = {
  /** Outbreak phase ends when infected exceed this many (then defense). */
  outbreakToDefenseInfected: 50,
  /** Build cost factor after outbreak (GDD 6: +25 %). */
  postOutbreakCostFactor: 1.25,
  /** Build time factor under fire (GDD 6: x2). */
  underFireBuildFactor: 2,
  /** Countdown visible on these difficulties (GDD 6). */
  countdownVisible: ['easy', 'normal'] as const,
  /**
   * Patient zero appears in a crowd at the site (GDD 6: first infection chain at once): the nearest 8-m cell
   * within crowdSearchM whose window of +-crowdWindowCells cells holds at least crowdMin civilians.
   */
  patientZeroCrowdSearchM: 400,
  patientZeroCrowdWindowCells: 1,
  patientZeroCrowdMin: 25,
  /** Patient zero has already bitten this many of the crowd (nearest first) when the outbreak is noticed. */
  patientZeroFirstChain: 8,
} as const;

/** Default start resources if the scenario does not set them. */
export const START_RESOURCES: Record<ResourceId, number> = {
  budget: 6000,
  material: 400,
  fuel: 200,
  ammo: 1500,
  medicine: 100,
  food: 1500,
  power: 0,
  research: 0,
};
