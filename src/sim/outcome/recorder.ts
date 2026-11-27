// Mission statistics for the debrief (GDD 10 Auswertung, GDD 4 step 16): history series, heatmaps, time-lapse
// frames, key moments and the facts the defeat analysis needs. All buffers are reserved up front; full history
// or frame buffers drop every second entry and double their interval.
import { TICK_RATE } from '../../core/loop';
import { MOMENT_KEYS, type MomentKey } from '../../core/types/outcome';
import { MORALE } from '../../data/economy/economy';
import { CAUSES, DEBRIEF } from '../../data/scoring';
import { UT_DAMAGE_TYPE } from '../combat/units';
import { R } from '../economy/economy';
import { ZT_COLOSSUS } from '../horde/zombie-traits';
import type { SimState } from '../state';

const MK = Object.fromEntries(MOMENT_KEYS.map((k, i) => [k, i])) as Record<MomentKey, number>;

export const GRID_INFECTION = 0;
export const GRID_LOSSES = 1;
export const GRID_COLLATERAL = 2;
/** History series in HistorySeries order. */
export const SERIES = ['infected', 'civilians', 'soldiers', 'morale', 'budget'] as const;
const NS = SERIES.length;

/** Sum of members over live squads. */
export function soldiersAlive(s: SimState): number {
  const p = s.units.pool;
  let n = 0;
  for (let u = 0; u < p.highWater; u++) if (p.alive[u]) n += s.units.members[u] as number;
  return n;
}

/** Live squads within `radius` of (x, y); anti-armor only: heavy arms or explosives. */
export function squadsNear(
  s: SimState,
  x: number,
  y: number,
  radius: number,
  antiArmorOnly: boolean,
): number {
  const p = s.units.pool;
  let n = 0;
  for (let u = 0; u < p.highWater; u++) {
    if (!p.alive[u]) continue;
    if (antiArmorOnly && UT_DAMAGE_TYPE[p.kind[u] as number] === 'smallArms') continue;
    const dx = (p.posX[u] as number) - x;
    const dy = (p.posY[u] as number) - y;
    if (dx * dx + dy * dy <= radius * radius) n++;
  }
  return n;
}

export class DebriefRecorder {
  readonly cellM: number = DEBRIEF.gridCellM;
  readonly side: number;
  readonly gridCells: number;
  /** 3 x gridCells event counts (infection, losses, collateral). */
  readonly heat: Uint32Array;
  sampleTicks: number = DEBRIEF.historySampleTicks;
  samples = 0;
  /** NS x maxSamples, series-major. */
  readonly history: Float32Array;
  frameTicks: number = DEBRIEF.timelapseFrameTicks;
  frameCount = 0;
  /** maxFrames x (zombies grid, civilians grid). */
  readonly frames: Uint8Array;
  momentCount = 0;
  readonly mTick = new Int32Array(DEBRIEF.maxMoments);
  readonly mKey = new Uint8Array(DEBRIEF.maxMoments);
  readonly mX = new Float32Array(DEBRIEF.maxMoments);
  readonly mY = new Float32Array(DEBRIEF.maxMoments);
  readonly mSeen = new Uint8Array(MOMENT_KEYS.length);
  // Facts for the defeat analysis (tick -1 = never).
  infections = 0;
  shelterInfections = 0;
  shelterInfectionTick = -1;
  wallTick = -1;
  wallZombies = 0;
  wallColossi = 0;
  wallAntiArmor = 0;
  ammoOutTick = -1;
  collateralTick = -1;
  lowMoraleTick = -1;
  lowMorale = 0;
  squadsAtOutbreak = -1;
  hqFallTick = -1;
  hqZombies = 0;
  hqSquads = 0;

  constructor(sizeM: number) {
    this.side = Math.ceil(sizeM / this.cellM);
    this.gridCells = this.side * this.side;
    this.heat = new Uint32Array(3 * this.gridCells);
    this.history = new Float32Array(NS * DEBRIEF.maxSamples);
    this.frames = new Uint8Array(DEBRIEF.maxFrames * 2 * this.gridCells);
  }

  cellAt(x: number, y: number): number {
    const s = this.side;
    const gx = Math.min(s - 1, Math.max(0, Math.floor(x / this.cellM)));
    const gy = Math.min(s - 1, Math.max(0, Math.floor(y / this.cellM)));
    return gy * s + gx;
  }

  mark(grid: number, x: number, y: number): void {
    const i = grid * this.gridCells + this.cellAt(x, y);
    this.heat[i] = (this.heat[i] as number) + 1;
  }

  /** Records the first occurrence of `key` (victory/defeat once each). Returns true if it was new. */
  moment(key: MomentKey, tick: number, x: number, y: number): boolean {
    const k = MK[key];
    if (this.mSeen[k] || this.momentCount >= this.mTick.length) return false;
    this.mSeen[k] = 1;
    const m = this.momentCount++;
    this.mTick[m] = tick;
    this.mKey[m] = k;
    this.mX[m] = x;
    this.mY[m] = y;
    return true;
  }

  /** First blocking structure destroyed: moment and who stood there (zombies, colossi, anti-armor squads). */
  wallLost(s: SimState, x: number, y: number, tick: number): void {
    if (this.wallTick >= 0) return;
    this.wallTick = tick;
    this.moment('firstWallLost', tick, x, y);
    const r = CAUSES.wallScanRadiusM;
    const z = s.zombies;
    let near = 0;
    let colossi = 0;
    for (let i = 0; i < z.highWater; i++) {
      if (!z.alive[i]) continue;
      const dx = (z.posX[i] as number) - x;
      const dy = (z.posY[i] as number) - y;
      if (dx * dx + dy * dy > r * r) continue;
      near++;
      if (z.kind[i] === ZT_COLOSSUS) colossi++;
    }
    this.wallZombies = near;
    this.wallColossi = colossi;
    this.wallAntiArmor = squadsNear(s, x, y, CAUSES.antiArmorRadiusM, true);
  }

  /** GDD 4 step 16: samples history and time-lapse frames when due, watches ammo stock and morale. */
  record(s: SimState, tick: number): void {
    if (tick >= this.samples * this.sampleTicks) {
      if (this.samples >= DEBRIEF.maxSamples) this.halveHistory();
      if (tick >= this.samples * this.sampleTicks) this.sample(s);
    }
    if (tick >= this.frameCount * this.frameTicks) {
      if (this.frameCount >= DEBRIEF.maxFrames) this.halveFrames();
      if (tick >= this.frameCount * this.frameTicks) this.frame(s);
    }
    if (tick % TICK_RATE !== 0 || !s.outbreak.started) return;
    const e = s.eco;
    if (e.active && this.ammoOutTick < 0 && (e.amount[R.ammo] as number) < 1) {
      this.ammoOutTick = tick;
      this.moment('ammoOut', tick, e.hqX, e.hqY);
    }
    if (e.active && this.lowMoraleTick < 0 && e.morale < MORALE.strikeBelow) {
      this.lowMoraleTick = tick;
      this.lowMorale = e.morale;
    }
  }

  private sample(s: SimState): void {
    const k = this.samples++;
    const m = DEBRIEF.maxSamples;
    const h = this.history;
    h[k] = s.zombies.count + s.counters.incubating;
    h[m + k] = s.civilians.count;
    h[2 * m + k] = soldiersAlive(s);
    h[3 * m + k] = s.eco.morale;
    h[4 * m + k] = s.counters.budget;
  }

  private halveHistory(): void {
    const m = DEBRIEF.maxSamples;
    const h = this.history;
    const half = this.samples >> 1;
    for (let q = 0; q < NS; q++) {
      for (let k = 0; k < half; k++) h[q * m + k] = h[q * m + 2 * k] as number;
      h.fill(0, q * m + half, (q + 1) * m);
    }
    this.samples = half;
    this.sampleTicks *= 2;
  }

  private frame(s: SimState): void {
    const g = this.gridCells;
    const base = this.frameCount++ * 2 * g;
    const f = this.frames;
    f.fill(0, base, base + 2 * g);
    const z = s.zombies;
    for (let i = 0; i < z.highWater; i++) {
      if (!z.alive[i]) continue;
      const c = base + this.cellAt(z.posX[i] as number, z.posY[i] as number);
      if ((f[c] as number) < 255) f[c] = (f[c] as number) + 1;
    }
    const v = s.civilians;
    for (let i = 0; i < v.highWater; i++) {
      if (!v.alive[i]) continue;
      const c = base + g + this.cellAt(v.posX[i] as number, v.posY[i] as number);
      if ((f[c] as number) < 255) f[c] = (f[c] as number) + 1;
    }
  }

  private halveFrames(): void {
    const n = 2 * this.gridCells;
    const half = this.frameCount >> 1;
    for (let k = 1; k < half; k++) this.frames.copyWithin(k * n, 2 * k * n, (2 * k + 1) * n);
    this.frames.fill(0, half * n);
    this.frameCount = half;
    this.frameTicks *= 2;
  }
}
