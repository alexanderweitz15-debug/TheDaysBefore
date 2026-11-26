import { describe, expect, it } from 'vitest';
import { createHash, hashHex } from '../../core/hash';
import { type CityMapData, type CitySize, KEY_SITES, NONE_U8, RINGS, TERRAIN } from '../../core/types/map';
import { CITY_SIZES } from '../../data/city/generator';
import { generateCity, generateCityWithReport, hashCityMap } from './generate';
import { isWalkable } from './grid';
import { validateCity } from './validate';

const mapHash = (m: CityMapData): string => {
  const h = createHash();
  hashCityMap(h, m);
  return hashHex(h);
};

describe('city generator', () => {
  for (const size of ['small', 'medium'] as CitySize[]) {
    it(`same seed gives an identical ${size} city, another seed differs`, () => {
      const a = generateCity(4242, size);
      const b = generateCity(4242, size);
      const c = generateCity(4243, size);
      expect(mapHash(a)).toBe(mapHash(b));
      expect(mapHash(a)).not.toBe(mapHash(c));
    });

    it(`${size}: grid size matches the data`, () => {
      const m = generateCity(7, size);
      const n = CITY_SIZES[size].sizeM / 4;
      expect(m.widthCells).toBe(n);
      expect(m.heightCells).toBe(n);
      expect(m.cellSizeM).toBe(4);
      for (const a of [m.terrain, m.elevation, m.district, m.sector, m.buildingId])
        expect(a.length).toBe(n * n);
      expect(m.size).toBe(size);
      expect(m.seed).toBe(7);
    });

    it(`${size}: validation rules hold for 20 seeds`, () => {
      const spec = CITY_SIZES[size];
      for (let seed = 100; seed < 120; seed++) {
        const { map: m, validation } = generateCityWithReport(seed, size);
        expect(validation.reasons).toEqual([]);
        expect(validation.evacKinds).toBeGreaterThanOrEqual(2);
        expect(m.sectors.count).toBeGreaterThanOrEqual(spec.sectorsMin);
        expect(m.sectors.count).toBeLessThanOrEqual(spec.sectorsMax);
        for (let r = 0; r < RINGS.length; r++) expect(Array.from(m.sectors.ring)).toContain(r);
        const sites = Array.from(m.buildings.keySite);
        for (const k of ['hospital', 'stadium', 'police', 'fire', 'station', 'school', 'church'] as const) {
          expect(sites).toContain(KEY_SITES.indexOf(k));
        }
        expect(m.sewer.manholeCount).toBeGreaterThan(0);
        expect(m.roads.edgeCount).toBeGreaterThan(m.roads.nodeCount / 2);
      }
    });
  }

  it('buildings are consistent with the grid and have 1 to 20 floors', () => {
    const m = generateCity(11, 'small');
    const b = m.buildings;
    expect(b.count).toBeGreaterThan(100);
    for (let i = 0; i < b.count; i++) {
      expect(b.floors[i]).toBeGreaterThanOrEqual(1);
      expect(b.floors[i]).toBeLessThanOrEqual(20);
      const c = (b.y[i] as number) * m.widthCells + (b.x[i] as number);
      expect(m.buildingId[c]).toBe(i);
      expect(m.terrain[c]).toBe(TERRAIN.building);
    }
    for (let c = 0; c < m.terrain.length; c++) {
      expect((m.buildingId[c] as number) >= 0).toBe(m.terrain[c] === TERRAIN.building);
    }
  });

  it('manholes lie on roads, evacuation points on walkable cells', () => {
    const m = generateCity(12, 'medium');
    const n = m.widthCells;
    const clampC = (v: number): number => Math.min(n - 1, Math.floor(v / 4));
    const cell = (x: number, y: number): number => clampC(y) * n + clampC(x);
    for (let i = 0; i < m.sewer.manholeCount; i++) {
      expect(m.terrain[cell(m.sewer.x[i] as number, m.sewer.y[i] as number)]).toBe(TERRAIN.road);
    }
    for (let i = 0; i < m.evacuation.count; i++) {
      const t = m.terrain[cell(m.evacuation.x[i] as number, m.evacuation.y[i] as number)] as number;
      expect(isWalkable(t)).toBe(true);
    }
  });

  it('water cells belong to no sector, land cells to one', () => {
    const m = generateCity(13, 'small');
    for (let i = 0; i < m.terrain.length; i++) {
      expect(m.sector[i] === NONE_U8).toBe(m.terrain[i] === TERRAIN.water);
    }
  });
});

describe('city validation', () => {
  it('detects an enclosed walkable cell', () => {
    const m = generateCity(21, 'small');
    const n = m.widthCells;
    let c = -1;
    for (let i = n * 10; i < m.terrain.length - n * 10 && c < 0; i++)
      if (m.terrain[i] === TERRAIN.ground) c = i;
    for (const d of [-1, 1, -n, n]) m.terrain[c + d] = TERRAIN.building;
    expect(validateCity(m).reasons.join()).toContain('unreachable');
  });

  it('detects a sector without road access and missing evacuation routes', () => {
    const m = generateCity(22, 'small');
    for (let i = 0; i < m.terrain.length; i++) {
      if (m.sector[i] === 0 && m.terrain[i] === TERRAIN.road) m.terrain[i] = TERRAIN.ground;
    }
    m.evacuation.count = 1;
    const reasons = validateCity(m).reasons.join();
    expect(reasons).toContain('sector 0 without road access');
    expect(reasons).toContain('evacuation');
  });
});
