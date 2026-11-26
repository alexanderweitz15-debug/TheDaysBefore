// Owns world, command queue and tick counter. Runs in the worker (or headless in tests and bench).
import { type Command, type CommandInput, CommandQueue } from './commands';
import { createHash, type HashState } from './hash';
import { FixedStepLoop } from './loop';
import type { CreateWorld, SimWorld } from './types/sim';

export class SimHost {
  readonly world: SimWorld;
  readonly queue = new CommandQueue();
  readonly loop: FixedStepLoop;
  /** Number of completed ticks. The next tick to run has this number. */
  tick = 0;

  constructor(
    readonly seed: number,
    createWorld: CreateWorld,
    private readonly onTickTimed?: (ms: number) => void,
    private readonly now: () => number = () => 0,
  ) {
    this.world = createWorld(seed);
    this.loop = new FixedStepLoop(() => this.runTick());
  }

  /** Accepts a command for the next tick to run. */
  submit(input: CommandInput): Command {
    const cmd = { ...input, tick: this.tick } as Command;
    this.queue.push(cmd);
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
