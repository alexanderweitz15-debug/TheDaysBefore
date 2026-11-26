// Corpses (GDD 7 Infektion): static bodies with a pathogen family; some rise again after a delay.
import { CORPSES } from '../../data/agents/civilians';
import { AgentPool } from '../horde/pool';

export class Corpses {
  readonly pool = new AgentPool(CORPSES.capacity);
  /** Tick at which the corpse rises, -1 never. */
  readonly riseTick = new Int32Array(CORPSES.capacity);

  get count(): number {
    return this.pool.count;
  }

  /** Adds a corpse; returns the slot or -1 when the pool is full. */
  add(x: number, y: number, family: number, riseTick: number): number {
    const i = this.pool.alloc();
    if (i < 0) return -1;
    this.pool.posX[i] = x;
    this.pool.posY[i] = y;
    this.pool.kind[i] = family;
    this.riseTick[i] = riseTick;
    return i;
  }
}
