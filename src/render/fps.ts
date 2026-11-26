// Frames per second measured over a sliding one-second window.
export class FpsMeter {
  private readonly stamps: number[] = [];

  /** Call once per rendered frame with performance.now(). */
  tick(nowMs: number): void {
    this.stamps.push(nowMs);
    const cutoff = nowMs - 1000;
    let drop = 0;
    while (drop < this.stamps.length && (this.stamps[drop] as number) < cutoff) drop++;
    if (drop > 0) this.stamps.splice(0, drop);
  }

  fps(): number {
    return this.stamps.length;
  }
}
