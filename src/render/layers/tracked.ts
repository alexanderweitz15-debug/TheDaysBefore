// Per-id position tracking for sections whose ids are stable slots (units, projectiles).
// Copies snapshot data so no view is held past the call; interpolates between the last two snapshots.
import type { AgentSection } from '../../core/types/snapshot';

export class Tracked {
  /** Ids present in the current snapshot, in section order. */
  list: Uint32Array = new Uint32Array(0);
  count = 0;
  kind: Uint8Array = new Uint8Array(0);
  private prevPos: Float32Array = new Float32Array(0);
  private currPos: Float32Array = new Float32Array(0);
  private prevAlive: Uint8Array = new Uint8Array(0);
  private currAlive: Uint8Array = new Uint8Array(0);

  constructor(
    capacity: number,
    private readonly maxStepM: number,
  ) {
    this.grow(capacity);
  }

  private grow(capacity: number): void {
    if (capacity <= this.currAlive.length) return;
    const f = (a: Float32Array): Float32Array => {
      const n = new Float32Array(capacity * 2);
      n.set(a);
      return n;
    };
    const u = (a: Uint8Array): Uint8Array => {
      const n = new Uint8Array(capacity);
      n.set(a);
      return n;
    };
    this.prevPos = f(this.prevPos);
    this.currPos = f(this.currPos);
    this.prevAlive = u(this.prevAlive);
    this.currAlive = u(this.currAlive);
    this.kind = u(this.kind);
  }

  ingest(s: AgentSection): void {
    const pp = this.prevPos;
    this.prevPos = this.currPos;
    this.currPos = pp;
    const pa = this.prevAlive;
    this.prevAlive = this.currAlive;
    this.currAlive = pa;
    this.currAlive.fill(0);
    if (this.list.length < s.count) this.list = new Uint32Array(Math.max(s.count, this.list.length * 2));
    this.count = s.count;
    for (let i = 0; i < s.count; i++) {
      const id = s.ids[i] as number;
      if (id >= this.currAlive.length) this.grow(Math.max(id + 1, this.currAlive.length * 2));
      this.list[i] = id;
      this.currAlive[id] = 1;
      this.kind[id] = s.kind[i] as number;
      this.currPos[id * 2] = s.pos[i * 2] as number;
      this.currPos[id * 2 + 1] = s.pos[i * 2 + 1] as number;
    }
  }

  /** Interpolated x of an id (valid after ingest). */
  x(id: number, alpha: number): number {
    const c = this.currPos[id * 2] as number;
    if (!this.prevAlive[id]) return c;
    const p = this.prevPos[id * 2] as number;
    return this.near(id) ? p + (c - p) * alpha : c;
  }

  y(id: number, alpha: number): number {
    const c = this.currPos[id * 2 + 1] as number;
    if (!this.prevAlive[id]) return c;
    const p = this.prevPos[id * 2 + 1] as number;
    return this.near(id) ? p + (c - p) * alpha : c;
  }

  /** True when the id existed in the previous snapshot and moved less than the max step. */
  near(id: number): boolean {
    if (!this.prevAlive[id]) return false;
    return (
      Math.hypot(
        (this.currPos[id * 2] as number) - (this.prevPos[id * 2] as number),
        (this.currPos[id * 2 + 1] as number) - (this.prevPos[id * 2 + 1] as number),
      ) < this.maxStepM
    );
  }

  /** Previous-snapshot position, for direction (valid when near(id)). */
  prevX(id: number): number {
    return this.prevPos[id * 2] as number;
  }
  prevY(id: number): number {
    return this.prevPos[id * 2 + 1] as number;
  }
  currX(id: number): number {
    return this.currPos[id * 2] as number;
  }
  currY(id: number): number {
    return this.currPos[id * 2 + 1] as number;
  }
}
