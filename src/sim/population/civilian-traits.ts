// Per-civilian state beyond the pool (GDD 7 Zivilisten). Behaviour state = pool.kind (CIVILIAN_STATES code);
// infection is tracked separately so an incubating civilian keeps behaving (and looking) normal.
import { CIVILIAN_STATES } from '../../core/types/zones';
import { CIVILIAN_STAMINA } from '../../data/agents/civilians';

export const CS_ROUTINE = CIVILIAN_STATES.indexOf('routine');
export const CS_ALERTED = CIVILIAN_STATES.indexOf('alerted');
export const CS_FLEEING = CIVILIAN_STATES.indexOf('fleeing');
export const CS_PANIC = CIVILIAN_STATES.indexOf('panic');
export const CS_SHELTERED = CIVILIAN_STATES.indexOf('sheltered');
export const CS_INCUBATING = CIVILIAN_STATES.indexOf('incubating');

/** lastThreat value of a civilian that never saw a zombie. */
export const NEVER = -0x40000000;

export class CivilianTraits {
  /** Panic 0..1. */
  readonly panic: Float32Array;
  /** Tick at which an infected civilian turns, -1 healthy. */
  readonly turnTick: Int32Array;
  /** Zone slot while sheltered, -1 otherwise. */
  readonly zone: Int8Array;
  /** Last tick a zombie was in sight (NEVER if none). */
  readonly lastThreat: Int32Array;
  /** Flight heading (unit vector) away from the last seen zombies, or the headless run heading. */
  readonly fleeX: Float32Array;
  readonly fleeY: Float32Array;
  /** 1 while a panicking civilian ignores guidance (re-decided at every perception scan). */
  readonly headless: Uint8Array;
  /** Seconds of running left (CIVILIAN_STAMINA). */
  readonly stamina: Float32Array;
  /** 1 once the civilian knows the way to safety (was in the guidance area); keeps following the field. */
  readonly knows: Uint8Array;

  constructor(capacity: number) {
    this.panic = new Float32Array(capacity);
    this.turnTick = new Int32Array(capacity).fill(-1);
    this.zone = new Int8Array(capacity).fill(-1);
    this.lastThreat = new Int32Array(capacity).fill(NEVER);
    this.fleeX = new Float32Array(capacity);
    this.fleeY = new Float32Array(capacity);
    this.headless = new Uint8Array(capacity);
    this.stamina = new Float32Array(capacity).fill(CIVILIAN_STAMINA.runS);
    this.knows = new Uint8Array(capacity);
  }

  reset(i: number): void {
    this.panic[i] = 0;
    this.turnTick[i] = -1;
    this.zone[i] = -1;
    this.lastThreat[i] = NEVER;
    this.fleeX[i] = 0;
    this.fleeY[i] = 0;
    this.headless[i] = 0;
    this.stamina[i] = CIVILIAN_STAMINA.runS;
    this.knows[i] = 0;
  }

  hashArrays(hw: number): ArrayBufferView[] {
    return [
      this.panic,
      this.turnTick,
      this.zone,
      this.lastThreat,
      this.fleeX,
      this.fleeY,
      this.headless,
      this.stamina,
      this.knows,
    ].map((a) => a.subarray(0, hw));
  }
}
