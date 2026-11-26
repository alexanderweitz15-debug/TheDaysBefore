import { describe, expect, it } from 'vitest';
import { KEY_SITES } from '../../core/types/map';
import { CityWorld } from '../world';

const MEDIUM = { size: 'medium' } as const;
/** 5 and 15 minutes of outbreak at 20 Hz. */
const FIVE_MIN = 6000;
const FIFTEEN_MIN = 18_000;
/** Coarse grid for the connectivity of the infected area (m). */
const AREA_CELL_M = 16;

function hospital(w: CityWorld): { x: number; y: number } {
  const b = w.map.buildings;
  const k = KEY_SITES.indexOf('hospital');
  const cs = w.map.cellSizeM;
  for (let i = 0; i < b.count; i++)
    if (b.keySite[i] === k)
      return {
        x: ((b.x[i] as number) + (b.w[i] as number) / 2) * cs,
        y: ((b.y[i] as number) + (b.h[i] as number) / 2) * cs,
      };
  throw new Error('no hospital');
}

/** Infected area (infection field > 0) on a coarse grid: cell count, largest 8-connected share, reach. */
function area(w: CityWorld, ox: number, oy: number): { cells: number; largest: number; reachM: number } {
  const s = w.s;
  const r = AREA_CELL_M / s.cellM;
  const side = Math.ceil(s.n / r);
  const occ = new Uint8Array(side * side);
  for (let c = 0; c < s.cells; c++) {
    if (s.infection[c] === 0) continue;
    const x = c % s.n;
    const y = (c - x) / s.n;
    occ[Math.floor(y / r) * side + Math.floor(x / r)] = 1;
  }
  const seen = new Uint8Array(side * side);
  let cells = 0;
  let largest = 0;
  let reach = 0;
  const stack: number[] = [];
  for (let c0 = 0; c0 < occ.length; c0++) {
    if (!occ[c0]) continue;
    cells++;
    const d = Math.hypot(
      ((c0 % side) + 0.5) * AREA_CELL_M - ox,
      (Math.floor(c0 / side) + 0.5) * AREA_CELL_M - oy,
    );
    if (d > reach) reach = d;
    if (seen[c0]) continue;
    let size = 0;
    seen[c0] = 1;
    stack.push(c0);
    while (stack.length > 0) {
      const c = stack.pop() as number;
      size++;
      const cx = c % side;
      const cy = (c - cx) / side;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= side || y >= side) continue;
          const j = y * side + x;
          if (occ[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (size > largest) largest = size;
  }
  return { cells, largest: cells > 0 ? largest / cells : 0, reachM: reach };
}

describe('outbreak spread without intervention (medium city, DECISIONS M2 target)', () => {
  it('>= 1000 infected after 5 min, connected street by street; >= 30 % infected or dead after 15 min', () => {
    for (const seed of [1, 2]) {
      const w = new CityWorld(seed, MEDIUM);
      const pop = w.civilianCount;
      const o = hospital(w);
      w.applyCommand({
        tick: 0,
        playerId: 0,
        type: 'StartOutbreak',
        payload: { x: o.x, y: o.y, family: 'viral' },
      });
      const reach: number[] = [];
      let t = 0;
      for (; t < FIVE_MIN; t++) {
        w.step(t);
        if ((t + 1) % 1500 === 0) {
          const a = area(w, o.x, o.y);
          reach.push(a.reachM);
          if (a.cells >= 30) expect(a.largest).toBeGreaterThanOrEqual(0.8);
        }
      }
      expect(w.zombieCount + w.counters.incubating).toBeGreaterThanOrEqual(1000);
      // The infected area grows outwards from the start.
      for (let k = 1; k < reach.length; k++)
        expect(reach[k] as number).toBeGreaterThanOrEqual(reach[k - 1] as number);
      expect((reach[reach.length - 1] as number) - (reach[0] as number)).toBeGreaterThan(100);
      if (seed !== 1) continue;
      for (; t < FIFTEEN_MIN; t++) w.step(t);
      const lost = pop - w.civilianCount + w.counters.incubating;
      expect(lost / pop).toBeGreaterThanOrEqual(0.3);
    }
  }, 400_000);
});
