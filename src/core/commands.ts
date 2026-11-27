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

export type UnitTypeId =
  | 'infantry'
  | 'mgTeam'
  | 'sniperTeam'
  | 'mortar'
  | 'engineers'
  | 'riotPolice'
  | 'medics'
  | 'militia';
export type Stance = 'hold' | 'holdUntilLosses' | 'aggressive' | 'retreat';
export type FireMode = 'free' | 'onCommand';
export type StructureKind =
  | 'barricade'
  | 'wall'
  | 'gate'
  | 'wire'
  | 'mines'
  | 'charge'
  | 'watchtower'
  | 'depot';

/** Buys and places a unit (cost from data, deducted from budget). */
export type PlaceUnitCommand = CommandBase<'PlaceUnit', { unitType: UnitTypeId; x: number; y: number }>;
/** Moves units; append = queue as waypoint (Shift). facing in radians or null. */
export type MoveUnitsCommand = CommandBase<
  'MoveUnits',
  { unitIds: number[]; x: number; y: number; append: boolean; facing: number | null }
>;
export type SetStanceCommand = CommandBase<'SetStance', { unitIds: number[]; stance: Stance }>;
export type SetFireModeCommand = CommandBase<'SetFireMode', { unitIds: number[]; mode: FireMode }>;
/** Orders area fire (mortar) or focus fire on a point. */
export type AttackAreaCommand = CommandBase<'AttackArea', { unitIds: number[]; x: number; y: number }>;
/** Places a structure: lines (wall, wire, barricade) use the full polyline, others the first point. */
export type PlaceStructureCommand = CommandBase<
  'PlaceStructure',
  { kind: StructureKind; points: number[]; rotation: number }
>;
export type DemolishStructureCommand = CommandBase<'DemolishStructure', { id: number }>;
export type DetonateChargeCommand = CommandBase<'DetonateCharge', { id: number }>;

export type ResourceId = 'budget' | 'material' | 'fuel' | 'ammo' | 'medicine' | 'food' | 'power' | 'research';
export type EconomyBuildingKind =
  | 'hq'
  | 'steelworks'
  | 'scrapyard'
  | 'chemicalPlant'
  | 'ammoFactory'
  | 'refinery'
  | 'fuelDepot'
  | 'powerPlant'
  | 'generator'
  | 'warehouse'
  | 'hospital'
  | 'pharma'
  | 'lab'
  | 'university'
  | 'farm'
  | 'market';

/** Repurposes an existing city building (map building index) into an economy building (GDD 6). */
export type RepurposeBuildingCommand = CommandBase<
  'RepurposeBuilding',
  { buildingId: number; kind: EconomyBuildingKind }
>;
/** Population assignment in percent; the remainder are free (GDD 6 Bevölkerung). */
export type AssignWorkersCommand = CommandBase<
  'AssignWorkers',
  { workers: number; conscripts: number; helpers: number }
>;
export type SetDecreeCommand = CommandBase<'SetDecree', { decree: string; active: boolean }>;
/** Investigates a warning sign (GDD 6): costs and time from data, rewards time/codex/vaccine progress. */
export type InvestigateWarningCommand = CommandBase<'InvestigateWarning', { warningId: number }>;
/** Gives up the mission (pause menu, GDD 14). */
export type SurrenderCommand = CommandBase<'Surrender', Record<string, never>>;
/** Classic start: triggers the outbreak on demand (GDD 6 Option "Klassischer Start"). */
export type TriggerOutbreakCommand = CommandBase<'TriggerOutbreak', Record<string, never>>;

/** Squads requested per unit type for an order. */
export type SquadRequest = Partial<Record<UnitTypeId, number>>;
/** Order: defend a line (polyline, meters). Squads spread along it and hold. */
export type DefendLineCommand = CommandBase<
  'DefendLine',
  { points: number[]; squads: SquadRequest; stance: Stance }
>;
/** Order: hold an area; squads occupy suitable buildings inside and cover open ground. */
export type HoldZoneCommand = CommandBase<
  'HoldZone',
  { x0: number; y0: number; x1: number; y1: number; squads: SquadRequest; stance: Stance }
>;
/** Order: occupy a city building (map building index); cover and sight bonus by floors (GDD 9). */
export type OccupyBuildingCommand = CommandBase<
  'OccupyBuilding',
  { buildingId: number; squads: SquadRequest; stance: Stance }
>;
/** Changes requested strength or stance of an existing order. */
export type UpdateOrderCommand = CommandBase<
  'UpdateOrder',
  { orderId: number; squads: SquadRequest; stance: Stance }
>;
/** Cancels an order; assigned squads return to the reserve. */
export type CancelOrderCommand = CommandBase<'CancelOrder', { orderId: number }>;

export type PathogenFamily = 'viral' | 'bacterial' | 'fungal' | 'parasitic' | 'chemical' | 'nanotech';

export type Command =
  | SetGameSpeedCommand
  | DebugSpawnCommand
  | StartOutbreakCommand
  | PlaceSafeZoneCommand
  | DrawCorridorCommand
  | SetRallyPointCommand
  | RemoveZoneCommand
  | PlaceUnitCommand
  | MoveUnitsCommand
  | SetStanceCommand
  | SetFireModeCommand
  | AttackAreaCommand
  | PlaceStructureCommand
  | DemolishStructureCommand
  | DetonateChargeCommand
  | RepurposeBuildingCommand
  | AssignWorkersCommand
  | SetDecreeCommand
  | InvestigateWarningCommand
  | TriggerOutbreakCommand
  | SurrenderCommand
  | DefendLineCommand
  | HoldZoneCommand
  | OccupyBuildingCommand
  | UpdateOrderCommand
  | CancelOrderCommand;
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
