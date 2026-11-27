// Zombie flow goals (GDD 8 rules 2-3): blocks with many healthy civilians, with hysteresis and a minimum
// restart interval so commuting does not restart the field constantly. Fallback: the city center.
import { AGENT_CAPACITY, FLOW_FIELD } from '../../data/agents/horde';
import type { SimState } from '../state';

export class ZombieGoals {
  private readonly blockSide: number;
  private readonly blockCount: Int32Array;
  private readonly goalCells: Int32Array;
  /** Per block: 1 while it is a goal (between goalEnterFrac and goalLeaveFrac of the mean). */
  readonly goalFlag: Uint8Array;
  lastStart = 0;
  /** Set when walkability changed: the next evaluation restarts the field even with unchanged goals. */
  forceRestart = false;

  constructor(
    n: number,
    readonly centerCell: number,
  ) {
    this.blockSide = Math.ceil(n / FLOW_FIELD.blockCells);
    this.blockCount = new Int32Array(this.blockSide * this.blockSide);
    this.goalFlag = new Uint8Array(this.blockSide * this.blockSide);
    this.goalCells = new Int32Array(AGENT_CAPACITY.civilians + 1);
  }

  private blockOf(cell: number, n: number): number {
    const bc = FLOW_FIELD.blockCells;
    return Math.floor(Math.floor(cell / n) / bc) * this.blockSide + Math.floor((cell % n) / bc);
  }

  evaluate(s: SimState, tick: number): void {
    const { blockCount, goalFlag } = this;
    const c = s.civilians;
    const turn = s.ct.turnTick;
    const n = s.n;
    blockCount.fill(0);
    let total = 0;
    let used = 0;
    for (let i = 0; i < c.highWater; i++) {
      if (!c.alive[i] || (turn[i] as number) >= 0) continue;
      const b = this.blockOf(c.cell[i] as number, n);
      if (blockCount[b] === 0) used++;
      blockCount[b] = (blockCount[b] as number) + 1;
      total++;
    }
    let sig = 0x811c9dc5;
    for (let b = 0; b < goalFlag.length; b++) {
      const weighted = (blockCount[b] as number) * used;
      if (goalFlag[b]) {
        if (weighted < total * FLOW_FIELD.goalLeaveFrac) goalFlag[b] = 0;
      } else if (total > 0 && weighted >= total * FLOW_FIELD.goalEnterFrac) goalFlag[b] = 1;
      if (goalFlag[b]) sig = Math.imul(sig ^ b, 0x01000193);
    }
    let k = 0;
    if (total > 0) {
      for (let i = 0; i < c.highWater; i++) {
        if (!c.alive[i] || (turn[i] as number) >= 0) continue;
        const cell = c.cell[i] as number;
        if (goalFlag[this.blockOf(cell, n)]) this.goalCells[k++] = cell;
      }
    }
    if (k === 0) {
      this.goalCells[k++] = this.centerCell;
      sig = Math.imul(sig ^ this.centerCell, 0x01000193) ^ 0x5a5a5a5a;
    }
    sig >>>= 0;
    const age = tick - this.lastStart;
    const changed = sig !== s.flow.activeSignature && (age >= FLOW_FIELD.goalMinIntervalTicks || tick === 0);
    if (changed || age >= FLOW_FIELD.goalRefreshTicks || this.forceRestart) {
      this.forceRestart = false;
      s.flow.start(this.goalCells, k, sig);
      this.lastStart = tick;
    }
  }
}
