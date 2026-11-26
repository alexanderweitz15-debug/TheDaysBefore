// Agent storage as Structure of Arrays with a fixed capacity, allocated once per world.

export interface AgentSoA {
  readonly capacity: number;
  /** Position in meters. */
  readonly posX: Float32Array;
  readonly posY: Float32Array;
  /** Velocity in meters per second. */
  readonly velX: Float32Array;
  readonly velY: Float32Array;
}

export function allocAgents(capacity: number): AgentSoA {
  return {
    capacity,
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    velX: new Float32Array(capacity),
    velY: new Float32Array(capacity),
  };
}
