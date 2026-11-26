// Every input (player, bot, replay) is a Command. The sim host stamps `tick` when the command is accepted.

export type PlayerId = number;

export type GameSpeed = 0 | 0.25 | 0.5 | 1 | 2 | 4;
export const GAME_SPEEDS: readonly GameSpeed[] = [0, 0.25, 0.5, 1, 2, 4];

interface CommandBase<T extends string, P> {
  tick: number;
  playerId: PlayerId;
  type: T;
  payload: P;
}

export type SetGameSpeedCommand = CommandBase<'SetGameSpeed', { speed: GameSpeed }>;
/** Debug/sandbox spawn: `count` agents of `kind` (default zombie) in a disc around (x, y) meters. */
export type DebugSpawnCommand = CommandBase<
  'DebugSpawn',
  { x: number; y: number; count: number; kind?: 'zombie' | 'civilian' }
>;

/** Starts the outbreak: patient zero of `family` at (x, y) meters. */
export type StartOutbreakCommand = CommandBase<
  'StartOutbreak',
  { x: number; y: number; family: PathogenFamily }
>;
/** Safe zone: axis-aligned rectangle in meters. Capacity is derived from buildings inside (data). */
export type PlaceSafeZoneCommand = CommandBase<
  'PlaceSafeZone',
  { x0: number; y0: number; x1: number; y1: number }
>;
/** Corridor: polyline in meters, flat [x0, y0, x1, y1, ...]; the last point is the destination end. */
export type DrawCorridorCommand = CommandBase<'DrawCorridor', { points: number[] }>;
/** Rally point with capacity from data. */
export type SetRallyPointCommand = CommandBase<'SetRallyPoint', { x: number; y: number }>;
/** Removes a zone, corridor or rally point by id. */
export type RemoveZoneCommand = CommandBase<'RemoveZone', { id: number }>;

export type PathogenFamily = 'viral' | 'bacterial' | 'fungal' | 'parasitic' | 'chemical' | 'nanotech';

export type Command =
  | SetGameSpeedCommand
  | DebugSpawnCommand
  | StartOutbreakCommand
  | PlaceSafeZoneCommand
  | DrawCorridorCommand
  | SetRallyPointCommand
  | RemoveZoneCommand;
export type CommandType = Command['type'];
/** What UI and bots submit: the host assigns the tick. */
export type CommandInput = Omit<Command, 'tick'>;

/**
 * Ordered queue. Commands are applied at the start of their tick in a stable order
 * (tick, playerId, arrival sequence), so every client applies them identically.
 */
export class CommandQueue {
  private pending: { cmd: Command; seq: number }[] = [];
  private seq = 0;
  readonly log: Command[] = [];

  push(cmd: Command): void {
    this.pending.push({ cmd, seq: this.seq++ });
  }

  /** Removes and returns all commands with tick <= `tick`, sorted deterministically, and appends them to the log. */
  drain(tick: number): Command[] {
    const due = this.pending.filter((p) => p.cmd.tick <= tick);
    if (due.length === 0) return [];
    this.pending = this.pending.filter((p) => p.cmd.tick > tick);
    due.sort((a, b) => a.cmd.tick - b.cmd.tick || a.cmd.playerId - b.cmd.playerId || a.seq - b.seq);
    const cmds = due.map((p) => p.cmd);
    this.log.push(...cmds);
    return cmds;
  }

  get size(): number {
    return this.pending.length;
  }
}
