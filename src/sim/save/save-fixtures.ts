// Shared fixtures for the save tests (imported only by *.test.ts): a scripted mission driven like the SimHost.
import type { Command, CommandInput } from '../../core/commands';
import { createHash, hashHex } from '../../core/hash';
import type { WorldOptions } from '../../core/types/sim';
import { scenario } from '../economy/test-fixtures';
import type { CityWorld } from '../world';

export const SEED = 31337;

export const missionOptions = (): WorldOptions => ({
  size: 'small',
  scenario: scenario({ classicStart: true, startResources: { budget: 50_000, material: 5_000, food: 1500 } }),
});

/** Commands by tick, relative to the HQ; covers units, structures, zones and the outbreak. */
export function script(w: CityWorld): Command[] {
  const { hqX: x, hqY: y } = w.s.eco;
  const at = (tick: number, input: Omit<CommandInput, 'playerId'>): Command =>
    ({ ...input, playerId: 0, tick }) as Command;
  return [
    at(3, { type: 'PlaceUnit', payload: { unitType: 'infantry', x: x + 30, y } }),
    at(4, { type: 'PlaceUnit', payload: { unitType: 'mgTeam', x: x - 30, y } }),
    at(6, {
      type: 'PlaceStructure',
      payload: { kind: 'wall', points: [x - 40, y + 40, x + 40, y + 40], rotation: 0 },
    }),
    at(8, { type: 'PlaceSafeZone', payload: { x0: x - 20, y0: y - 60, x1: x + 20, y1: y - 30 } }),
    at(40, { type: 'TriggerOutbreak', payload: {} }),
    at(260, {
      type: 'PlaceStructure',
      payload: { kind: 'barricade', points: [x + 50, y - 20, x + 50, y + 20], rotation: 0 },
    }),
    at(300, {
      type: 'MoveUnits',
      payload: { unitIds: [1], x: x + 80, y: y + 10, append: false, facing: null },
    }),
    at(420, { type: 'PlaceUnit', payload: { unitType: 'infantry', x, y: y + 60 } }),
  ];
}

/** Applies due commands, then steps, like SimHost.runTick. */
export function runTo(
  w: CityWorld,
  commands: readonly Command[],
  end: number,
  each?: (tick: number) => void,
): void {
  for (let t = w.completedTicks; t < end; t++) {
    for (const c of commands) if (c.tick === t) w.applyCommand(c);
    w.step(t);
    each?.(t + 1);
  }
}

export function hashOf(w: CityWorld): string {
  const h = createHash();
  w.hash(h);
  return hashHex(h);
}
