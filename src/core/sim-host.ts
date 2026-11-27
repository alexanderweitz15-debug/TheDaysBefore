// Owns world, command queue and tick counter. Runs in the worker (or headless in tests and bench).
import { type Command, type CommandInput, CommandQueue } from './commands';
import { createHash, type HashState } from './hash';
import { FixedStepLoop } from './loop';
import type { CreateWorld, SimWorld, WorldOptions } from './types/sim';

export class SimHost {
  readonly world: SimWorld;
  readonly queue = new CommandQueue();
  readonly loop: FixedStepLoop;
  /** Number of completed ticks. The next tick to run has this number. */
  tick = 0;

  constructor(
    readonly seed: number,
    readonly options: WorldOptions,
    createWorld: CreateWorld,
    private readonly onTickTimed?: (ms: number) => void,
    private readonly now: () => number = () => 0,
    /** Restoring a save: the restored world, its tick and the command log so far. */
    restored?: { world: SimWorld; tick: number; log: readonly Command[] },
  ) {
    this.world = restored ? restored.world : createWorld(seed, options);
    if (restored) {
      this.tick = restored.tick;
      this.queue.log.push(...restored.log);
    }
    this.loop = new FixedStepLoop(() => this.runTick());
  }

  /**
   * Accepts a command for the next tick to run. While paused the loop runs no ticks, so the game speed is
   * applied immediately (it never changes world state; the logged copy re-applies it at its tick on replay).
   * Other commands given during pause wait for the next tick, as GDD 14 intends ("commands in pause").
   * Surrender while paused runs one tick so the mission can end and the debrief appears.
   */
  submit(input: CommandInput): Command {
    const cmd = { ...input, tick: this.tick } as Command;
    this.queue.push(cmd);
    if (cmd.type === 'SetGameSpeed') this.loop.speed = cmd.payload.speed;
    else if (cmd.type === 'Surrender' && this.loop.speed <= 0) this.runTick();
    return cmd;
  }

  /** Replays a pre-stamped command (replay, tests). */
  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  runTick(): void {
    const t0 = this.now();
    for (const cmd of this.queue.drain(this.tick)) {
      if (cmd.type === 'SetGameSpeed') this.loop.speed = cmd.payload.speed;
      this.world.applyCommand(cmd);
    }
    this.world.step(this.tick);
    this.tick++;
    this.onTickTimed?.(this.now() - t0);
  }

  hash(): HashState {
    const h = createHash();
    this.world.hash(h);
    return h;
  }
}
