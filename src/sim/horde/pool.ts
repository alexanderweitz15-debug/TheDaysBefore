// Agent storage: Structure of Arrays with fixed capacity and a LIFO free list.
// Slot indices are stable ids for the lifetime of an agent (snapshot ids, interpolation).

export class AgentPool {
  readonly posX: Float32Array;
  readonly posY: Float32Array;
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  /** Zombies: zombie type. Civilians: civilian state. */
  readonly kind: Uint8Array;
  readonly alive: Uint8Array;
  /** Current 4 m map cell. */
  readonly cell: Int32Array;
  /** Zombies: civilian slot chased, -1 none. */
  readonly target: Int32Array;
  /** Hit points. */
  readonly hp: Float32Array;
  private readonly free: Int32Array;
  private freeTop = 0;
  /** Slots [0, highWater) have been used; iterate these and skip dead ones. */
  highWater = 0;
  count = 0;

  constructor(readonly capacity: number) {
    this.posX = new Float32Array(capacity);
    this.posY = new Float32Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velY = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.cell = new Int32Array(capacity);
    this.target = new Int32Array(capacity).fill(-1);
    this.hp = new Float32Array(capacity);
    this.free = new Int32Array(capacity);
  }

  /** Returns a slot or -1 when full. The slot is alive and zeroed. */
  alloc(): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop] as number;
    else if (this.highWater < this.capacity) i = this.highWater++;
    else return -1;
    this.alive[i] = 1;
    this.posX[i] = 0;
    this.posY[i] = 0;
    this.velX[i] = 0;
    this.velY[i] = 0;
    this.kind[i] = 0;
    this.cell[i] = 0;
    this.target[i] = -1;
    this.hp[i] = 0;
    this.count++;
    return i;
  }

  release(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }

  /** Free-list contents, for hashing. */
  freeSlots(): Int32Array {
    return this.free.subarray(0, this.freeTop);
  }
}
