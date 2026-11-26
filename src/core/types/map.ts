// City map transfer format. Generated deterministically in src/sim/map, sent once to the main thread.
// Grid: cells of CELL_SIZE_M meters, row-major, index = y * widthCells + x.

export const CELL_SIZE_M = 4;

export const TERRAIN = {
  ground: 0,
  water: 1,
  road: 2,
  building: 3,
  park: 4,
  forest: 5,
  bridge: 6,
  rail: 7,
} as const;
export type TerrainCode = (typeof TERRAIN)[keyof typeof TERRAIN];

export const DISTRICTS = [
  'oldtown',
  'residential',
  'highrise',
  'industrial',
  'harbor',
  'university',
  'hospital',
  'commercial',
  'suburb',
  'military',
  'station',
  'airport',
] as const;
export type District = (typeof DISTRICTS)[number];

export const KEY_SITES = [
  'hospital',
  'police',
  'fire',
  'barracks',
  'powerplant',
  'waterworks',
  'radiotower',
  'station',
  'harbor',
  'airport',
  'stadium',
  'school',
  'church',
] as const;
export type KeySite = (typeof KEY_SITES)[number];

export const RINGS = ['inner', 'middle', 'outer'] as const;
export const EVAC_KINDS = ['road', 'rail', 'harbor', 'helipad'] as const;
export const ROAD_KINDS = ['street', 'main', 'bridge', 'rail'] as const;
/** Sentinel for "none" in Uint8 index fields. */
export const NONE_U8 = 255;

export type CitySize = 'small' | 'medium';

export interface CityMapData {
  seed: number;
  size: CitySize;
  widthCells: number;
  heightCells: number;
  cellSizeM: number;
  /** Per cell: TERRAIN code. Water is impassable except bridges; buildings are impassable. */
  terrain: Uint8Array;
  /** Per cell: 0..255 relative height (hills raise sight range). */
  elevation: Uint8Array;
  /** Per cell: index into DISTRICTS, NONE_U8 outside the city. */
  district: Uint8Array;
  /** Per cell: sector id, NONE_U8 outside sectors. */
  sector: Uint8Array;
  /** Per cell: index into buildings, -1 if none. */
  buildingId: Int32Array;
  /** Axis-aligned building footprints in cells. */
  buildings: {
    count: number;
    x: Uint16Array;
    y: Uint16Array;
    w: Uint16Array;
    h: Uint16Array;
    floors: Uint8Array;
    district: Uint8Array;
    /** Index into KEY_SITES or NONE_U8. */
    keySite: Uint8Array;
  };
  /** Road graph in meters. Edges are undirected. */
  roads: {
    nodeCount: number;
    nodeX: Float32Array;
    nodeY: Float32Array;
    edgeCount: number;
    edgeA: Uint32Array;
    edgeB: Uint32Array;
    /** Width in meters. */
    edgeWidth: Uint8Array;
    /** Index into ROAD_KINDS. */
    edgeKind: Uint8Array;
  };
  sectors: {
    count: number;
    /** Index into RINGS. */
    ring: Uint8Array;
    centerX: Float32Array;
    centerY: Float32Array;
  };
  /** Sewer: manholes (meters) and schematic tunnels between them. */
  sewer: {
    manholeCount: number;
    x: Float32Array;
    y: Float32Array;
    edgeCount: number;
    edgeA: Uint32Array;
    edgeB: Uint32Array;
  };
  evacuation: {
    count: number;
    /** Index into EVAC_KINDS. */
    kind: Uint8Array;
    x: Float32Array;
    y: Float32Array;
  };
}
