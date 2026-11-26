// Procedural city generator parameters (GDD section 7). Values are starting points for balancing.
import type { CitySize, District } from '../../core/types/map';

export interface CitySizeSpec {
  /** Edge length in meters (square map). */
  sizeM: number;
  population: number;
  sectorsMin: number;
  sectorsMax: number;
}

export interface DistrictSpec {
  floorsMin: number;
  floorsMax: number;
  /** Lot edge length range in meters. */
  lotMinM: number;
  lotMaxM: number;
  /** Fraction of a lot covered by the building footprint. */
  coverage: number;
  /** Street spacing in meters (smaller = denser, narrower alleys). */
  blockM: number;
  /** Relative weight when assigning districts; 0 = only placed explicitly. */
  weight: number;
  /** Residents per floor per 100 m² of footprint. */
  residentsPer100m2Floor: number;
}

export const CITY_SIZES: Record<CitySize, CitySizeSpec> = {
  small: { sizeM: 1000, population: 5_000, sectorsMin: 8, sectorsMax: 10 },
  medium: { sizeM: 2000, population: 20_000, sectorsMin: 10, sectorsMax: 16 },
};

export const TERRAIN_GEN = {
  riversMin: 0,
  riversMax: 2,
  /** River width range in meters. */
  riverWidthMinM: 24,
  riverWidthMaxM: 60,
  bridgesMin: 2,
  bridgesMax: 6,
  /** Probability that one map edge is coast. */
  coastChance: 0.3,
  /** Forest band at the map edge in meters. */
  forestEdgeM: 60,
  hillCountMax: 3,
} as const;

export const ROAD_GEN = {
  mainRoadWidthM: 16,
  streetWidthM: 8,
  alleyWidthM: 4,
  bridgeWidthM: 12,
  railWidthM: 8,
  /** Probability of a radial (vs grid) main road layout. */
  radialChance: 0.5,
} as const;

export const DISTRICT_SPECS: Record<District, DistrictSpec> = {
  oldtown: {
    floorsMin: 2,
    floorsMax: 5,
    lotMinM: 8,
    lotMaxM: 20,
    coverage: 0.85,
    blockM: 40,
    weight: 1,
    residentsPer100m2Floor: 3,
  },
  residential: {
    floorsMin: 2,
    floorsMax: 6,
    lotMinM: 16,
    lotMaxM: 32,
    coverage: 0.55,
    blockM: 80,
    weight: 4,
    residentsPer100m2Floor: 2.5,
  },
  highrise: {
    floorsMin: 8,
    floorsMax: 20,
    lotMinM: 28,
    lotMaxM: 48,
    coverage: 0.35,
    blockM: 120,
    weight: 1,
    residentsPer100m2Floor: 3,
  },
  industrial: {
    floorsMin: 1,
    floorsMax: 3,
    lotMinM: 40,
    lotMaxM: 90,
    coverage: 0.6,
    blockM: 160,
    weight: 2,
    residentsPer100m2Floor: 0,
  },
  harbor: {
    floorsMin: 1,
    floorsMax: 3,
    lotMinM: 30,
    lotMaxM: 70,
    coverage: 0.5,
    blockM: 140,
    weight: 0,
    residentsPer100m2Floor: 0,
  },
  university: {
    floorsMin: 3,
    floorsMax: 6,
    lotMinM: 30,
    lotMaxM: 60,
    coverage: 0.4,
    blockM: 120,
    weight: 1,
    residentsPer100m2Floor: 0.5,
  },
  hospital: {
    floorsMin: 4,
    floorsMax: 10,
    lotMinM: 40,
    lotMaxM: 70,
    coverage: 0.5,
    blockM: 120,
    weight: 1,
    residentsPer100m2Floor: 0.5,
  },
  commercial: {
    floorsMin: 2,
    floorsMax: 8,
    lotMinM: 20,
    lotMaxM: 40,
    coverage: 0.7,
    blockM: 90,
    weight: 2,
    residentsPer100m2Floor: 1,
  },
  suburb: {
    floorsMin: 1,
    floorsMax: 2,
    lotMinM: 14,
    lotMaxM: 24,
    coverage: 0.35,
    blockM: 70,
    weight: 3,
    residentsPer100m2Floor: 2,
  },
  military: {
    floorsMin: 1,
    floorsMax: 3,
    lotMinM: 30,
    lotMaxM: 60,
    coverage: 0.3,
    blockM: 150,
    weight: 0,
    residentsPer100m2Floor: 0.5,
  },
  station: {
    floorsMin: 2,
    floorsMax: 4,
    lotMinM: 40,
    lotMaxM: 80,
    coverage: 0.5,
    blockM: 140,
    weight: 0,
    residentsPer100m2Floor: 0,
  },
  airport: {
    floorsMin: 1,
    floorsMax: 3,
    lotMinM: 60,
    lotMaxM: 120,
    coverage: 0.25,
    blockM: 240,
    weight: 0,
    residentsPer100m2Floor: 0,
  },
};

export const VALIDATION = {
  /** Minimum independent evacuation routes (road, rail, harbor, helipad). */
  minEvacuationRoutes: 2,
  /** Max generation attempts with derived seeds before failing loudly. */
  maxAttempts: 8,
} as const;

/** Structural constants of the generator algorithm (shape, not balance). */
export const LAYOUT = {
  /** District seeds per square kilometer. */
  districtSeedsPerKm2: 6,
  /** Ring boundaries as a fraction of the half map size (districts and sectors). */
  innerRingFrac: 0.25,
  middleRingFrac: 0.6,
  /** Spacing of grid-layout avenues. */
  avenueSpacingM: 400,
  radialSpokesMin: 5,
  radialSpokesMax: 8,
  /** Ring road radius as a fraction of the half map size. */
  ringRoadFrac: 0.45,
  ringRoadVertices: 24,
  /** River center band as a fraction of the map edge. */
  riverMarginFrac: 0.25,
  /** Coast depth range as a fraction of the map edge. */
  coastDepthMinFrac: 0.07,
  coastDepthMaxFrac: 0.14,
  hillRadiusMinM: 150,
  hillRadiusMaxM: 400,
  hillHeightMin: 60,
  hillHeightMax: 180,
  baseElevation: 20,
  /** Longest water crossing that may become a bridge. */
  maxBridgeLengthM: 140,
  /** Split jitter of the block subdivision (organic old town vs regular grid). */
  splitJitter: 0.15,
  organicSplitJitter: 0.35,
  /** Blocks stop splitting below this multiple of the district block size. */
  leafFactor: 1.3,
  parkChance: 0.07,
  /** Sewer: one manhole per square of this many cells. */
  sewerSpacingCells: 32,
  /** Unreachable walkable pockets up to this size touching water become shore water. */
  maxShorePocketCells: 400,
  /** Lower bound of district seeds on small maps. */
  minDistrictSeeds: 6,
  /** Preferred distance of the hospital / station district seed from the center, fraction of the map edge. */
  hospitalDistanceFrac: 0.18,
  stationDistanceFrac: 0.22,
  /** Harbor seed: distance to the coast plus this weight times distance to the center. */
  harborCenterWeight: 0.3,
  /** An airport district needs at least this many district seeds. */
  airportMinDistrictSeeds: 16,
  /** From this many sectors on, the inner ring gets two sectors instead of one. */
  twoInnerSectorsFrom: 12,
  /** Share of the remaining sectors in the middle ring. */
  middleSectorShare: 0.4,
  /** Coast and river outlines: random walk damping and drift per cell. */
  wobbleDamping: 0.96,
  coastDrift: 0.4,
  riverDrift: 0.25,
  /** Coast outline range as a multiple of its depth. */
  coastWobbleMinFrac: 0.6,
  coastWobbleMaxFrac: 1.4,
  /** Two parallel rivers: first band ends and second band starts at these fractions of the map edge. */
  parallelRiverSplitLoFrac: 0.45,
  parallelRiverSplitHiFrac: 0.55,
  /** Single river band inset beyond riverMarginFrac. */
  singleRiverInsetFrac: 0.05,
  /** Position jitter of grid avenues and radial spokes, fraction of their spacing. */
  avenueJitterFrac: 0.3,
  spokeJitterFrac: 0.3,
  /** Ring road vertex radius range: (min .. min + span) x ringRoadFrac radius. */
  ringRoadRadiusMinFrac: 0.9,
  ringRoadRadiusSpanFrac: 0.2,
  /** Waterworks site score penalty (meters) outside industrial districts. */
  waterworksOutsideIndustryPenalty: 50,
  /** Preferred school distance from the town center, fraction of the map edge. */
  schoolDistanceFrac: 0.2,
  /** Smallest building edge in cells. */
  minBuildingCells: 3,
} as const;
