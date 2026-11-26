// Shared test doubles for the core tests: a tiny valid map and a fake SimWorld (v2). Does not import src/sim.
import type { Command } from '../../src/core/commands';
import { type HashState, hashU32 } from '../../src/core/hash';
import { createRng, type Rng } from '../../src/core/rng';
import { type CityMapData, NONE_U8 } from '../../src/core/types/map';
import type { DebugField, DebugFieldKind, SimWorld, WorldOptions } from '../../src/core/types/sim';
import type { AgentSection } from '../../src/core/types/snapshot';

export function tinyMap(seed: number, size: CityMapData['size'] = 'small'): CityMapData {
  return {
    seed,
    size,
    widthCells: 2,
    heightCells: 2,
    cellSizeM: 4,
    terrain: new Uint8Array(4),
    elevation: new Uint8Array(4),
    district: new Uint8Array(4).fill(NONE_U8),
    sector: new Uint8Array(4).fill(NONE_U8),
    buildingId: new Int32Array(4).fill(-1),
    buildings: {
      count: 0,
      x: new Uint16Array(0),
      y: new Uint16Array(0),
      w: new Uint16Array(0),
      h: new Uint16Array(0),
      floors: new Uint8Array(0),
      district: new Uint8Array(0),
      keySite: new Uint8Array(0),
    },
    roads: {
      nodeCount: 0,
      nodeX: new Float32Array(0),
      nodeY: new Float32Array(0),
      edgeCount: 0,
      edgeA: new Uint32Array(0),
      edgeB: new Uint32Array(0),
      edgeWidth: new Uint8Array(0),
      edgeKind: new Uint8Array(0),
    },
    sectors: {
      count: 0,
      ring: new Uint8Array(0),
      centerX: new Float32Array(0),
      centerY: new Float32Array(0),
    },
    sewer: {
      manholeCount: 0,
      x: new Float32Array(0),
      y: new Float32Array(0),
      edgeCount: 0,
      edgeA: new Uint32Array(0),
      edgeB: new Uint32Array(0),
    },
    evacuation: { count: 0, kind: new Uint8Array(0), x: new Float32Array(0), y: new Float32Array(0) },
  };
}

/**
 * Fake world: RNG-driven state, spawn counters per kind, call log. Slot ids are the spawn index.
 * Each zombie moves x by +1 per step so positions are checkable.
 */
export class FakeWorld implements SimWorld {
  readonly widthM = 100;
  readonly heightM = 100;
  readonly map: CityMapData;
  zombieCount = 0;
  civilianCount = 0;
  stepsRun = 0;
  readonly calls: string[] = [];
  readonly applied: Command[] = [];
  readonly appliedAt: { cmdTick: number; stepTick: number }[] = [];
  readonly options: WorldOptions;
  private readonly rng: Rng;
  private acc = 0;
  private lastStep = -1;

  constructor(seed: number, options: WorldOptions = { size: 'small' }) {
    this.options = options;
    this.map = tinyMap(seed, options.size);
    this.rng = createRng(seed);
  }

  applyCommand(cmd: Command): void {
    this.calls.push(`apply:${cmd.type}@${cmd.tick}`);
    this.applied.push(cmd);
    // Applied before step(tick), so the pending tick is lastStep + 1.
    this.appliedAt.push({ cmdTick: cmd.tick, stepTick: this.lastStep + 1 });
    if (cmd.type === 'DebugSpawn') {
      if (cmd.payload.kind === 'civilian') this.civilianCount += cmd.payload.count;
      else this.zombieCount += cmd.payload.count;
    }
  }

  step(tick: number): void {
    this.calls.push(`step:${tick}`);
    this.lastStep = tick;
    this.stepsRun++;
    this.acc = (this.acc + this.rng.nextU32()) >>> 0;
  }

  hash(h: HashState): void {
    hashU32(h, this.acc);
    hashU32(h, this.stepsRun);
    hashU32(h, this.zombieCount);
    hashU32(h, this.civilianCount);
  }

  private fill(out: AgentSection, count: number, idBase: number, kind: number): void {
    for (let i = 0; i < count; i++) {
      out.ids[i] = idBase + i;
      out.pos[2 * i] = i + this.stepsRun;
      out.pos[2 * i + 1] = idBase;
      out.kind[i] = kind;
    }
  }

  writeZombies(out: AgentSection): void {
    this.fill(out, this.zombieCount, 0, 1);
  }

  writeCivilians(out: AgentSection): void {
    this.fill(out, this.civilianCount, 1000, 2);
  }

  debugField(_kind: DebugFieldKind): DebugField | null {
    return null;
  }
}

export const createFakeWorld = (seed: number, options: WorldOptions): FakeWorld =>
  new FakeWorld(seed, options);
