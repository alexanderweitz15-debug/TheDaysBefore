// Outbreak state (GDD 8): patient zero, early-kill slowdown, maturity and the transformation table.

import { TICK_RATE } from '../../core/loop';
import type { Rng } from '../../core/rng';
import { PATIENT_ZERO, VIRAL } from '../../data/pathogens/viral';
import { ZT_COLOSSUS, ZT_SCREAMER, ZT_SPRINTER, ZT_WALKER } from '../horde/zombie-traits';

/** Pathogen family index (PathogenFamily order); M2 only simulates viral. */
export const FAMILY_VIRAL = 0;

export class Outbreak {
  /** Start tick, -1 before the outbreak. */
  startTick = -1;
  familyIndex = FAMILY_VIRAL;
  /** Slot of patient zero while alive, else -1. */
  pzSlot = -1;
  /** Spread is slowed until this tick (patient zero killed early). */
  slowUntil = -1;

  get started(): boolean {
    return this.startTick >= 0;
  }

  onZombieKilled(slot: number, tick: number): void {
    if (slot !== this.pzSlot) return;
    this.pzSlot = -1;
    if (tick - this.startTick <= PATIENT_ZERO.earlyKillWindowS * TICK_RATE)
      this.slowUntil = tick + PATIENT_ZERO.slowdownDurationS * TICK_RATE;
  }

  /** Infection chance per hit at `tick`. */
  infectChance(tick: number): number {
    return tick < this.slowUntil
      ? VIRAL.infectChance * PATIENT_ZERO.slowdownInfectFactor
      : VIRAL.infectChance;
  }

  /** Special-type multiplier: 1 at the start, maturityMaxFactor after maturityFullS. */
  maturity(tick: number): number {
    if (!this.started) return 1;
    const f = Math.min(1, (tick - this.startTick) / (VIRAL.maturityFullS * TICK_RATE));
    return 1 + (VIRAL.maturityMaxFactor - 1) * f;
  }

  /** Zombie type for a turning human or rising corpse (transformation table scaled by maturity). */
  pickType(rng: Rng, tick: number): number {
    const m = this.maturity(tick);
    const w = VIRAL.turnWeights;
    const sprinter = w.sprinter * m;
    const screamer = w.screamer * m;
    const colossus = w.colossus * m;
    const walker = Math.max(
      0,
      w.walker + w.sprinter + w.screamer + w.colossus - sprinter - screamer - colossus,
    );
    const r = rng.nextFloat() * (walker + sprinter + screamer + colossus);
    if (r < walker) return ZT_WALKER;
    if (r < walker + sprinter) return ZT_SPRINTER;
    if (r < walker + sprinter + screamer) return ZT_SCREAMER;
    return ZT_COLOSSUS;
  }

  incubationTicks(rng: Rng): number {
    const lo = VIRAL.incubationMinS * TICK_RATE;
    return lo + Math.floor(rng.nextFloat() * (VIRAL.incubationMaxS * TICK_RATE - lo));
  }

  /** Rise tick for a fresh corpse, or -1 if it stays down. */
  riseTick(rng: Rng, tick: number): number {
    return rng.nextFloat() < VIRAL.corpseRiseChance ? tick + VIRAL.corpseRiseDelayS * TICK_RATE : -1;
  }

  hashValues(): number[] {
    return [this.startTick, this.familyIndex, this.pzSlot, this.slowUntil];
  }
}
