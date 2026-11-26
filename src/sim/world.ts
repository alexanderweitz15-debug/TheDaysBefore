// M0 dummy world: wandering agents in an empty rectangle. Replaced by the real world in M1.
import type { Command } from '../core/commands';
import { type HashState, hashU32, hashView } from '../core/hash';
import { TICK_RATE } from '../core/loop';
import { createRng, type Rng } from '../core/rng';
import type { CreateWorld, SimWorld } from '../core/types/sim';
import { DUMMY_SIM, type DummySimConfig } from '../data/dev/dummy-sim';
import { type AgentSoA, allocAgents } from './agents';
import { ANGLE_MASK, cosU, sinU, unitsFromRad } from './math/trig';
import { type WanderParams, wander } from './systems/wander';

export class DummyWorld implements SimWorld {
  readonly widthM: number;
  readonly heightM: number;
  readonly agents: AgentSoA;
  private count = 0;
  private readonly rng: Rng;
  private readonly wanderParams: WanderParams;

  constructor(
    seed: number,
    private readonly cfg: DummySimConfig,
  ) {
    this.widthM = cfg.widthM;
    this.heightM = cfg.heightM;
    this.agents = allocAgents(cfg.capacity);
    this.rng = createRng(seed);
    this.wanderParams = {
      jitterUnits: unitsFromRad(cfg.headingJitterRad),
      speedMps: cfg.speedMps,
      dt: 1 / TICK_RATE,
      widthM: cfg.widthM,
      heightM: cfg.heightM,
    };
    this.spawnUniform(cfg.initialAgents);
  }

  get agentCount(): number {
    return this.count;
  }

  applyCommand(cmd: Command): void {
    if (cmd.type !== 'DebugSpawn') return;
    const { x, y, count } = cmd.payload;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(count)) return;
    this.spawnDisc(x, y, this.cfg.spawnRadiusM, count);
  }

  step(_tick: number): void {
    wander(this.agents, this.count, this.rng, this.wanderParams);
  }

  hash(h: HashState): void {
    const n = this.count;
    const { posX, posY, velX, velY } = this.agents;
    hashView(h, this.rng.getState());
    hashU32(h, n);
    hashView(h, posX.subarray(0, n));
    hashView(h, posY.subarray(0, n));
    hashView(h, velX.subarray(0, n));
    hashView(h, velY.subarray(0, n));
  }

  writePositions(out: Float32Array): void {
    const { posX, posY } = this.agents;
    for (let i = 0; i < this.count; i++) {
      out[2 * i] = posX[i] as number;
      out[2 * i + 1] = posY[i] as number;
    }
  }

  /** Number of agents that fit, given a requested count. */
  private room(requested: number): number {
    const n = Math.floor(requested);
    const free = this.agents.capacity - this.count;
    return Math.max(0, Math.min(n, free));
  }

  private spawnUniform(requested: number): void {
    const n = this.room(requested);
    for (let k = 0; k < n; k++) {
      const x = this.rng.nextFloat() * this.widthM;
      const y = this.rng.nextFloat() * this.heightM;
      this.add(x, y);
    }
  }

  /** Uniform distribution in a disc, clamped to the world. */
  private spawnDisc(cx: number, cy: number, radiusM: number, requested: number): void {
    const n = this.room(requested);
    for (let k = 0; k < n; k++) {
      const a = this.rng.nextU32() & ANGLE_MASK;
      const r = radiusM * Math.sqrt(this.rng.nextFloat());
      this.add(cx + cosU(a) * r, cy + sinU(a) * r);
    }
  }

  private add(x: number, y: number): void {
    const i = this.count++;
    const heading = this.rng.nextU32() & ANGLE_MASK;
    const { posX, posY, velX, velY } = this.agents;
    posX[i] = Math.min(Math.max(x, 0), this.widthM);
    posY[i] = Math.min(Math.max(y, 0), this.heightM);
    velX[i] = cosU(heading) * this.cfg.speedMps;
    velY[i] = sinU(heading) * this.cfg.speedMps;
  }
}

/** Dummy world with explicit parameters (tests, bench). */
export const createDummyWorld = (seed: number, cfg: DummySimConfig): DummyWorld => new DummyWorld(seed, cfg);

export const createWorld: CreateWorld = (seed) => new DummyWorld(seed, DUMMY_SIM);
