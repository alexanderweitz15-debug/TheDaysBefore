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
