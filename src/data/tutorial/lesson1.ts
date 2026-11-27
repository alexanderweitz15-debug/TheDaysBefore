// Lesson 1 "Erste Linie" (GDD 15): camera, select, move, stances, wall and gate, safe zone, pause and speed.
import { parseScenario } from '../scenarios/schema';
import type { Lesson } from './types';

export const LESSON_1: Lesson = {
  id: 'lesson1',
  title: 'tutorial.l1.title',
  goal: 'tutorial.l1.goal',
  unlosable: true,
  scenario: parseScenario('tutorial/lesson1', {
    id: 'tutorial-1',
    textKey: 'tutorial1',
    seed: 0x5e2401,
    size: 'small',
    era: 'present',
    faction: 'army',
    pathogen: 'viral',
    patientZeroSite: 'school',
    farmDurationS: 60,
    classicStart: true,
    startResources: { budget: 6000, material: 400, fuel: 200, ammo: 1500, medicine: 100, food: 1500 },
    population: 340,
    difficulty: 'easy',
    unlosable: true,
    victory: { kinds: ['evacuation'], all: false },
    evacuationShare: 0.59,
    medals: { bronze: 500, silver: 1500, gold: 3000 },
  }),
  steps: [
    {
      id: 'camera',
      text: 'tutorial.l1.camera',
      marker: { ui: 'minimap' },
      done: { kind: 'all', of: [{ kind: 'cameraMoved' }, { kind: 'zoomed' }] },
    },
    {
      id: 'placeUnit',
      text: 'tutorial.l1.placeUnit',
      marker: { ui: 'cmd-unit-infantry' },
      done: { kind: 'command', command: 'PlaceUnit' },
    },
    {
      id: 'select',
      text: 'tutorial.l1.select',
      marker: { area: { x: 0.5, y: 0.5, r: 0.12 } },
      done: { kind: 'selected', min: 1 },
    },
    {
      id: 'move',
      text: 'tutorial.l1.move',
      marker: { area: { x: 0.5, y: 0.5, r: 0.12 } },
      done: { kind: 'command', command: 'MoveUnits' },
    },
    {
      id: 'stance',
      text: 'tutorial.l1.stance',
      marker: { ui: 'ctx-stance-hold' },
      done: { kind: 'command', command: 'SetStance' },
    },
    {
      id: 'wall',
      text: 'tutorial.l1.wall',
      marker: { ui: 'cmd-tab-defense' },
      done: { kind: 'command', command: 'PlaceStructure', match: { kind: 'wall' } },
    },
    {
      id: 'gate',
      text: 'tutorial.l1.gate',
      marker: { ui: 'cmd-structure-gate' },
      done: { kind: 'command', command: 'PlaceStructure', match: { kind: 'gate' } },
    },
    {
      id: 'safeZone',
      text: 'tutorial.l1.safeZone',
      marker: { ui: 'cmd-tab-civil' },
      done: { kind: 'command', command: 'PlaceSafeZone' },
    },
    {
      id: 'pause',
      text: 'tutorial.l1.pause',
      marker: { ui: 'speed-0' },
      done: { kind: 'speed', exactly: 0 },
    },
    {
      id: 'speed',
      text: 'tutorial.l1.speed',
      marker: { ui: 'speed-2' },
      done: { kind: 'speed', atLeast: 2 },
    },
    {
      id: 'outbreak',
      text: 'tutorial.l1.outbreak',
      marker: { ui: 'hud-phase' },
      done: { kind: 'phase', phase: 'outbreak' },
      start: [{ kind: 'outbreak' }],
    },
    {
      id: 'rescue',
      text: 'tutorial.l1.rescue',
      marker: { ui: 'objectives' },
      done: { kind: 'sheltered', min: 200 },
    },
  ],
};
