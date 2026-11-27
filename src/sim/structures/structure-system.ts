// Structures per tick (GDD 4 step 14): construction by engineers (fast) or slowly without, repair, pressure damage
// from zombies at and next to a structure (GDD 8 rule 5), climbing over barricades at high density, gates closing
// with zombies near, mine fields, rubble removal, evicting agents from newly blocked cells and the debounced
// pathing refresh (zombie flow field, safety field, civilian routine fields, unit paths).
import { TICK_RATE } from '../../core/loop';
import { ZOMBIE_MOVEMENT } from '../../data/agents/horde';
import { STRUCTURE_RULES } from '../../data/buildings/defense';
import { ARMOR_PENETRATION } from '../../data/units/present';
import { explode } from '../combat/explosion';
import { FX } from '../combat/fx';
import { coverAt, UT_BUILD } from '../combat/units';
import { buildRate } from '../economy/mission';
import type { AgentPool } from '../horde/pool';
import type { SimState } from '../state';
import { SK, SS_BUILDING, SS_DESTROYED, SS_DONE } from './kinds';

const DT = 1 / TICK_RATE;
const PRESSURE_DT = STRUCTURE_RULES.pressureIntervalTicks / TICK_RATE;

/** DetonateCharge: blows up a finished charge. */
export function detonate(s: SimState, id: number): boolean {
  const S = s.structures;
  const i = S.slotOfId(id);
  if (i < 0 || S.kind[i] !== SK.charge || S.state[i] !== SS_DONE) return false;
  const x = S.cx[i] as number;
  const y = S.cy[i] as number;
  S.remove(s, i, s.tick);
  const c = STRUCTURE_RULES.charge;
  explode(s, x, y, c.blastRadiusM, c.damage, FX.explosion, {
    pen: ARMOR_PENETRATION.explosive,
    owner: -1,
    source: i,
    structures: c.destroysStructures,
  });
  return true;
}

/** Completes structure i: blocking, gate open, charge armed. */
export function finishStructure(s: SimState, i: number, tick: number): void {
  const S = s.structures;
  S.state[i] = SS_DONE;
  S.progress[i] = 1;
  const k = S.kind[i] as number;
  if (k === SK.gate || k === SK.charge) S.flag[i] = 1;
  S.applyFootprint(s, i, true, tick);
  S.version++;
}

function build(s: SimState, tick: number): void {
  const S = s.structures;
  const U = s.units;
  const p = U.pool;
  const range = STRUCTURE_RULES.buildRangeM;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u] || !UT_BUILD[p.kind[u] as number]) continue;
    const x = p.posX[u] as number;
    const y = p.posY[u] as number;
    // Nearest structure under construction, else the nearest damaged finished one.
    let best = -1;
    let bestD = range * range;
    let repair = -1;
    let repairD = range * range;
    for (let i = 0; i < S.highWater; i++) {
      if (!S.alive[i]) continue;
      const st = S.state[i] as number;
      if (st === SS_DESTROYED) continue;
      const dx = (S.cx[i] as number) - x;
      const dy = (S.cy[i] as number) - y;
      const d = dx * dx + dy * dy;
      if (st === SS_BUILDING) {
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      } else if ((S.hp[i] as number) < (S.maxHp[i] as number) && d < repairD) {
        repairD = d;
        repair = i;
      }
    }
    const strength = U.strength(u);
    if (best >= 0) {
      S.workedAt[best] = tick;
      S.progress[best] =
        (S.progress[best] as number) + (DT * strength * buildRate(s, best)) / (S.buildS[best] as number);
      if ((S.progress[best] as number) >= 1) finishStructure(s, best, tick);
    } else if (repair >= 0) {
      S.hp[repair] = Math.min(
        S.maxHp[repair] as number,
        (S.hp[repair] as number) + STRUCTURE_RULES.repairHpPerS * DT * strength,
      );
    }
  }
  // Without engineers a few structures progress slowly, in slot order.
  let slots = STRUCTURE_RULES.slowBuildSlots;
  for (let i = 0; i < S.highWater && slots > 0; i++) {
    if (!S.alive[i] || S.state[i] !== SS_BUILDING || S.workedAt[i] === tick) continue;
    slots--;
    S.progress[i] =
      (S.progress[i] as number) +
      (DT * buildRate(s, i)) / ((S.buildS[i] as number) * STRUCTURE_RULES.slowBuildFactor);
    if ((S.progress[i] as number) >= 1) finishStructure(s, i, tick);
  }
}

/** Moves zombie j into cell c (center plus jitter) if it has room. */
function relocateZombie(s: SimState, j: number, c: number): boolean {
  if (!s.zombieWalk[c] || (s.zombieCells[c] as number) >= ZOMBIE_MOVEMENT.maxPerCell) return false;
  const z = s.zombies;
  const n = s.n;
  const cm = s.cellM;
  const old = z.cell[j] as number;
  s.zombieCells[old] = (s.zombieCells[old] as number) - 1;
  s.zombieCells[c] = (s.zombieCells[c] as number) + 1;
  z.cell[j] = c;
  z.posX[j] = Math.fround(((c % n) + 0.2 + 0.6 * s.rng.nextFloat()) * cm);
  z.posY[j] = Math.fround((Math.floor(c / n) + 0.2 + 0.6 * s.rng.nextFloat()) * cm);
  return true;
}

/** Zombies in ring cell a of barricade i climb to the opposite side with climbChancePerS. */
function climb(s: SimState, i: number, a: number): void {
  const S = s.structures;
  const n = s.n;
  const cells = S.cellsOf(i);
  const ax = a % n;
  const ay = (a - ax) / n;
  // Footprint cell next to a; the landing cell lies straight across.
  let land = -1;
  for (let q = 0; q < cells.length && land < 0; q++) {
    const f = cells[q] as number;
    const fx = f % n;
    const fy = (f - fx) / n;
    const dx = fx - ax;
    const dy = fy - ay;
    if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
    for (let step = 1; step <= 2; step++) {
      const lx = fx + dx * step;
      const ly = fy + dy * step;
      if (lx < 0 || ly < 0 || lx >= n || ly >= n) break;
      const l = ly * n + lx;
      if (s.zombieWalk[l]) {
        land = l;
        break;
      }
    }
  }
  if (land < 0) return;
  const zb = s.zombieBuckets;
  const z = s.zombies;
  const chance = STRUCTURE_RULES.climbChancePerS * PRESSURE_DT;
  const end = zb.start[a + 1] as number;
  for (let k = zb.start[a] as number; k < end; k++) {
    const j = zb.items[k] as number;
    if (!z.alive[j] || z.cell[j] !== a) continue;
    if (s.rng.nextFloat() >= chance) continue;
    if (!relocateZombie(s, j, land)) return;
  }
}

function pressure(s: SimState, tick: number): void {
  const S = s.structures;
  const zc = s.zombieCells;
  const dps = STRUCTURE_RULES.pressureDpsPerZombie;
  for (let i = 0; i < S.highWater; i++) {
    if (!S.alive[i] || S.state[i] === SS_DESTROYED) continue;
    const k = S.kind[i] as number;
    if (k === SK.mines || k === SK.charge) continue;
    const cells = S.cellsOf(i);
    const ring = S.ringOf(i);
    let count = 0;
    for (let q = 0; q < cells.length; q++) count += zc[cells[q] as number] as number;
    for (let q = 0; q < ring.length; q++) count += zc[ring[q] as number] as number;
    if (count === 0) continue;
    const dmg = count * dps * PRESSURE_DT;
    S.damage(s, i, dmg, tick);
    if (S.state[i] === SS_DONE) s.fx.push(FX.wallHit, S.cx[i] as number, S.cy[i] as number, 0);
    if (
      k === SK.barricade &&
      S.state[i] === SS_DONE &&
      count / (S.lengthM[i] as number) >= STRUCTURE_RULES.climbDensityPerM
    )
      for (let q = 0; q < ring.length; q++)
        if ((zc[ring[q] as number] as number) > 0) climb(s, i, ring[q] as number);
  }
}

function gates(s: SimState): void {
  const S = s.structures;
  const n = s.n;
  const cm = s.cellM;
  const r = STRUCTURE_RULES.gateCloseRadiusM;
  for (let i = 0; i < S.highWater; i++) {
    if (!S.alive[i] || S.kind[i] !== SK.gate || S.state[i] !== SS_DONE) continue;
    const x = S.cx[i] as number;
    const y = S.cy[i] as number;
    const x0 = Math.max(0, Math.floor((x - r) / cm));
    const x1 = Math.min(n - 1, Math.floor((x + r) / cm));
    const y0 = Math.max(0, Math.floor((y - r) / cm));
    const y1 = Math.min(n - 1, Math.floor((y + r) / cm));
    let near = false;
    for (let gy = y0; gy <= y1 && !near; gy++) {
      const dy = Math.max(0, Math.abs((gy + 0.5) * cm - y) - cm / 2);
      for (let gx = x0; gx <= x1; gx++) {
        const dx = Math.max(0, Math.abs((gx + 0.5) * cm - x) - cm / 2);
        if (dx * dx + dy * dy <= r * r && (s.zombieCells[gy * n + gx] as number) > 0) {
          near = true;
          break;
        }
      }
    }
    S.setGate(s, i, !near);
  }
}

function mines(s: SimState, tick: number): void {
  const S = s.structures;
  const m = STRUCTURE_RULES.mines;
  const n = s.n;
  const cm = s.cellM;
  const zb = s.zombieBuckets;
  const z = s.zombies;
  const tr2 = m.triggerRadiusM * m.triggerRadiusM;
  for (let i = 0; i < S.highWater; i++) {
    if (!S.alive[i] || S.kind[i] !== SK.mines || S.state[i] !== SS_DONE) continue;
    if ((S.until[i] as number) > tick) continue;
    const cells = S.cellsOf(i);
    // A charge goes off when a zombie comes within the trigger radius of its cell center.
    let fired = -1;
    for (let q = 0; q < cells.length && fired < 0; q++) {
      const c = cells[q] as number;
      const px = ((c % n) + 0.5) * cm;
      const py = (Math.floor(c / n) + 0.5) * cm;
      const cx = c % n;
      const cy = (c - cx) / n;
      for (let dy = -1; dy <= 1 && fired < 0; dy++) {
        for (let dx = -1; dx <= 1 && fired < 0; dx++) {
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const b = yy * n + xx;
          const end = zb.start[b + 1] as number;
          for (let k = zb.start[b] as number; k < end; k++) {
            const j = zb.items[k] as number;
            if (!z.alive[j]) continue;
            const ox = (z.posX[j] as number) - px;
            const oy = (z.posY[j] as number) - py;
            if (ox * ox + oy * oy <= tr2) {
              fired = q;
              break;
            }
          }
        }
      }
    }
    if (fired < 0) continue;
    const c = cells[fired] as number;
    S.dropCell(i, fired);
    S.until[i] = tick + STRUCTURE_RULES.mineCooldownTicks;
    const left = S.cellCount[i] as number;
    if (left === 0) S.remove(s, i, tick);
    else S.version++;
    explode(s, ((c % n) + 0.5) * cm, (Math.floor(c / n) + 0.5) * cm, m.blastRadiusM, m.damage, FX.mineBlast, {
      pen: ARMOR_PENETRATION.explosive,
      owner: -1,
      source: i,
      structures: false,
    });
  }
}

/** Moves agents out of cells they may no longer stand in, to the nearest allowed neighbor cell. */
function evictPool(s: SimState, pool: AgentPool, walk: Uint8Array, counts: Uint16Array | null): void {
  const n = s.n;
  const cm = s.cellM;
  for (let i = 0; i < pool.highWater; i++) {
    if (!pool.alive[i]) continue;
    const c = pool.cell[i] as number;
    if (walk[c]) continue;
    const x = c % n;
    const y = (c - x) / n;
    let to = -1;
    for (let r = 1; r <= 3 && to < 0; r++) {
      for (let dy = -r; dy <= r && to < 0; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n || !walk[yy * n + xx]) continue;
          to = yy * n + xx;
          break;
        }
      }
    }
    if (to < 0) continue;
    if (counts) {
      counts[c] = (counts[c] as number) - 1;
      counts[to] = (counts[to] as number) + 1;
    }
    pool.cell[i] = to;
    pool.posX[i] = Math.fround(((to % n) + 0.5) * cm);
    pool.posY[i] = Math.fround((Math.floor(to / n) + 0.5) * cm);
  }
}

function refreshPathing(s: SimState, tick: number): void {
  const S = s.structures;
  if (S.pathHandled === S.pathVersion || tick - S.pathChangedAt < STRUCTURE_RULES.repathDebounceTicks) return;
  S.pathHandled = S.pathVersion;
  s.goals.forceRestart = true;
  s.safety.invalidate();
  s.routine.invalidate();
  const U = s.units;
  const p = U.pool;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    U.cover[u] = coverAt(s, p.cell[u] as number);
    if (U.moving[u]) s.planner.request(s, u);
  }
}

export function updateStructures(s: SimState, tick: number): void {
  const S = s.structures;
  if (S.highWater > 0) {
    build(s, tick);
    if (tick % STRUCTURE_RULES.pressureIntervalTicks === 0) pressure(s, tick);
    if (tick % STRUCTURE_RULES.gateCheckTicks === 0) gates(s);
    mines(s, tick);
    const linger = STRUCTURE_RULES.rubbleS * TICK_RATE;
    for (let i = 0; i < S.highWater; i++)
      if (S.alive[i] && S.state[i] === SS_DESTROYED && tick - (S.until[i] as number) >= linger)
        S.remove(s, i, tick);
  }
  if (S.evictPending) {
    S.evictPending = false;
    evictPool(s, s.zombies, s.zombieWalk, s.zombieCells);
    evictPool(s, s.civilians, s.civWalk, s.civilianCells);
    evictPool(s, s.units.pool, s.civWalk, null);
    s.civiliansDirty = true;
  }
  refreshPathing(s, tick);
}
