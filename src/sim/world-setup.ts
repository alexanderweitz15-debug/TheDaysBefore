// World setup helpers: residents, civilian spawning, the flow fallback goal.
import { CELL_SIZE_M, DISTRICTS, RINGS } from '../core/types/map';
import { AGENT_CAPACITY, CIVILIAN_MOVEMENT, ZOMBIE_MOVEMENT } from '../data/agents/horde';
import { DISTRICT_SPECS } from '../data/city/generator';
import { initZombie, ZT_WALKER } from './horde/zombie-traits';
import { initCivilian } from './infection/attack';
import type { SimState } from './state';

/** Places civilians around (x, y) and assigns their routine; they dwell up to `dwellTicks` first. */
export function placeCivilians(s: SimState, x: number, y: number, count: number, dwellTicks: number): number {
  const placed = s.placeAround(s.civilians, s.civilianCells, CIVILIAN_MOVEMENT.maxPerCell, x, y, count);
  for (let k = 0; k < placed; k++) {
    const slot = s.placed[k] as number;
    initCivilian(s, slot);
    s.routine.assign(slot, s.civilians.cell[slot] as number, s.rng, dwellTicks);
  }
  if (placed > 0) s.civiliansDirty = true;
  return placed;
}

/** Debug spawn of walkers around (x, y). */
export function placeWalkers(s: SimState, x: number, y: number, count: number): number {
  const placed = s.placeAround(
    s.zombies,
    s.zombieCells,
    ZOMBIE_MOVEMENT.maxPerCell,
    x,
    y,
    count,
    s.zombieWalk,
  );
  for (let k = 0; k < placed; k++) initZombie(s, s.placed[k] as number, ZT_WALKER);
  return placed;
}

/** Civilians around their homes, proportional to residents (floors x footprint x district density). */
export function placeResidents(s: SimState, population: number, dwellTicks: number): void {
  const b = s.map.buildings;
  const area = CELL_SIZE_M * CELL_SIZE_M;
  let totalResidents = 0;
  const residents = new Float64Array(b.count);
  for (let i = 0; i < b.count; i++) {
    const spec = DISTRICT_SPECS[DISTRICTS[b.district[i] as number] ?? 'residential'];
    const r =
      (((b.floors[i] as number) * (b.w[i] as number) * (b.h[i] as number) * area) / 100) *
      spec.residentsPer100m2Floor;
    residents[i] = r;
    totalResidents += r;
  }
  if (totalResidents <= 0) return;
  const want = Math.min(population, AGENT_CAPACITY.civilians);
  let cumulative = 0;
  let placed = 0;
  for (let i = 0; i < b.count; i++) {
    cumulative += residents[i] as number;
    const quota = Math.round((cumulative / totalResidents) * want) - placed;
    if (quota <= 0) continue;
    const x = ((b.x[i] as number) + (b.w[i] as number) / 2) * CELL_SIZE_M;
    const y = ((b.y[i] as number) + (b.h[i] as number) / 2) * CELL_SIZE_M;
    placed += quota;
    placeCivilians(s, x, y, quota, dwellTicks);
  }
}

/** Walkable cell nearest the center of the inner ring. */
export function findCenterCell(s: SimState): number {
  const sec = s.map.sectors;
  let x = s.sizeM / 2;
  let y = s.sizeM / 2;
  for (let i = 0; i < sec.count; i++) {
    if (sec.ring[i] === RINGS.indexOf('inner')) {
      x = sec.centerX[i] as number;
      y = sec.centerY[i] as number;
      break;
    }
  }
  const n = s.n;
  const c0 = s.cellOf(x, y);
  const cx = c0 % n;
  const cy = (c0 - cx) / n;
  for (let r = 0; r < n; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx >= 0 && yy >= 0 && xx < n && yy < n && s.walkable[yy * n + xx]) return yy * n + xx;
      }
    }
  }
  return 0;
}
