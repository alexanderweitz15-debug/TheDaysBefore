// Fixed-step accumulator. Wall-clock time enters here only; the sim sees nothing but tick numbers.

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
/** Upper bound of ticks per advance, so a stalled tab does not freeze while catching up. */
export const MAX_TICKS_PER_ADVANCE = 16;

export class FixedStepLoop {
  speed = 1;
  private accumulatorMs = 0;

  constructor(private readonly runTick: () => void) {}

  /** Advances by `elapsedMs` of wall time scaled by speed. Returns the number of ticks run. */
  advance(elapsedMs: number): number {
    if (this.speed <= 0) return 0;
    this.accumulatorMs += elapsedMs * this.speed;
    let ran = 0;
    while (this.accumulatorMs >= TICK_MS && ran < MAX_TICKS_PER_ADVANCE) {
      this.runTick();
      this.accumulatorMs -= TICK_MS;
      ran++;
    }
    if (ran === MAX_TICKS_PER_ADVANCE) this.accumulatorMs = Math.min(this.accumulatorMs, TICK_MS);
    return ran;
  }
}
