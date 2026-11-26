// Small hand-built city for render tests without the generator: grid streets, river with bridge, park, rail, buildings.
import {
  CELL_SIZE_M,
  type CityMapData,
  DISTRICTS,
  KEY_SITES,
  NONE_U8,
  ROAD_KINDS,
  TERRAIN,
} from '../../core/types/map';

export function fixtureMap(cells = 250): CityMapData {
  const n = cells;
  const terrain = new Uint8Array(n * n);
  const district = new Uint8Array(n * n).fill(NONE_U8);
  const sector = new Uint8Array(n * n);
  const buildingId = new Int32Array(n * n).fill(-1);
  const bx: number[] = [];
  const by: number[] = [];
  const bw: number[] = [];
  const bh: number[] = [];
  const bf: number[] = [];
  const bd: number[] = [];
  const bk: number[] = [];
  const mark = (x: number, y: number, w: number, h: number, code: number): void => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) terrain[j * n + i] = code;
  };
  // River across the middle, forest and park blobs.
  const riverY = Math.floor(n * 0.55);
  mark(0, riverY, n, 12, TERRAIN.water);
  mark(10, 10, 40, 30, TERRAIN.forest);
  mark(n - 70, n - 60, 40, 40, TERRAIN.park);
  const street = 20;
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const edges: Array<[number, number, number, number]> = [];
  const lines = Math.floor(n / street);
  const idx = (i: number, j: number): number => j * (lines + 1) + i;
  for (let j = 0; j <= lines; j++) {
    for (let i = 0; i <= lines; i++) {
      nodeX.push(i * street * CELL_SIZE_M);
      nodeY.push(j * street * CELL_SIZE_M);
    }
  }
  for (let j = 0; j <= lines; j++) {
    for (let i = 0; i <= lines; i++) {
      const main = i % 3 === 0 || j % 3 === 0;
      const onRiver = Math.abs(j * street - riverY) < 8;
      if (i < lines && !onRiver) edges.push([idx(i, j), idx(i + 1, j), main ? 10 : 6, main ? 1 : 0]);
      if (j < lines) {
        const crossesRiver = j * street < riverY && (j + 1) * street > riverY;
        edges.push([
          idx(i, j),
          idx(i, j + 1),
          crossesRiver ? 9 : main ? 10 : 6,
          crossesRiver ? 2 : main ? 1 : 0,
        ]);
      }
    }
  }
  // Rail along the top.
  const railA = nodeX.length;
  nodeX.push(0, n * CELL_SIZE_M);
  nodeY.push(30 * CELL_SIZE_M, 36 * CELL_SIZE_M);
  edges.push([railA, railA + 1, 4, 3]);
  // Buildings in each block that is dry.
  let seed = 7;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const hospitalIdx = KEY_SITES.indexOf('hospital');
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < lines; i++) {
      const x0 = i * street + 3;
      const y0 = j * street + 3;
      if (terrain[y0 * n + x0] !== TERRAIN.ground || terrain[(y0 + 13) * n + x0 + 13] !== TERRAIN.ground)
        continue;
      const d = (i * 5 + j * 3) % DISTRICTS.length;
      for (let k = 0; k < 4; k++) {
        const w = 5 + Math.floor(rnd() * 3);
        const h = 5 + Math.floor(rnd() * 3);
        const x = x0 + (k % 2) * 7;
        const y = y0 + Math.floor(k / 2) * 7;
        bx.push(x);
        by.push(y);
        bw.push(w);
        bh.push(h);
        bf.push(1 + Math.floor(rnd() * (d === 2 ? 20 : 5)));
        bd.push(d);
        bk.push(i === 4 && j === 4 && k === 0 ? hospitalIdx : NONE_U8);
        mark(x, y, w, h, TERRAIN.building);
      }
    }
  }
  const nb = bx.length;
  const sectorsPerSide = 3;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      sector[y * n + x] =
        Math.floor((y / n) * sectorsPerSide) * sectorsPerSide + Math.floor((x / n) * sectorsPerSide);
  const edgeCount = edges.length;
  return {
    seed: 1,
    size: 'small',
    widthCells: n,
    heightCells: n,
    cellSizeM: CELL_SIZE_M,
    terrain,
    elevation: new Uint8Array(n * n),
    district,
    sector,
    buildingId,
    buildings: {
      count: nb,
      x: Uint16Array.from(bx),
      y: Uint16Array.from(by),
      w: Uint16Array.from(bw),
      h: Uint16Array.from(bh),
      floors: Uint8Array.from(bf),
      district: Uint8Array.from(bd),
      keySite: Uint8Array.from(bk),
    },
    roads: {
      nodeCount: nodeX.length,
      nodeX: Float32Array.from(nodeX),
      nodeY: Float32Array.from(nodeY),
      edgeCount,
      edgeA: Uint32Array.from(edges.map((e) => e[0])),
      edgeB: Uint32Array.from(edges.map((e) => e[1])),
      edgeWidth: Uint8Array.from(edges.map((e) => e[2])),
      edgeKind: Uint8Array.from(
        edges.map((e) =>
          e[3] === 3 ? ROAD_KINDS.indexOf('rail') : e[3] === 2 ? ROAD_KINDS.indexOf('bridge') : e[3],
        ),
      ),
    },
    sectors: {
      count: 9,
      ring: new Uint8Array(9),
      centerX: new Float32Array(9),
      centerY: new Float32Array(9),
    },
    sewer: {
      manholeCount: 0,
      x: new Float32Array(0),
      y: new Float32Array(0),
      edgeCount: 0,
      edgeA: new Uint32Array(0),
      edgeB: new Uint32Array(0),
    },
    evacuation: { count: 0, kind: new Uint8Array(0), x: new Float32Array(0), y: new Float32Array(0) },
  };
}
