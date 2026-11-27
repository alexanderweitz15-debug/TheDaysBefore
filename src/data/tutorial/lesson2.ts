// Lesson 2 "Ruhe vor dem Sturm" (GDD 15): resources, repurposing, population, morale, countdown, warning signs.
import { parseScenario } from '../scenarios/schema';
import type { Lesson } from './types';

export const LESSON_2: Lesson = {
  id: 'lesson2',
  title: 'tutorial.l2.title',
  goal: 'tutorial.l2.goal',
  unlosable: true,
  scenario: parseScenario('tutorial/lesson2', {
    id: 'tutorial-2',
    textKey: 'tutorial2',
    seed: 0x5e2402,
    size: 'small',
    era: 'present',
    faction: 'army',
    pathogen: 'viral',
    patientZeroSite: 'hospital',
    farmDurationS: 240,
    classicStart: false,
    startResources: { budget: 5000, material: 300, fuel: 150, ammo: 1200, medicine: 80, food: 1200 },
    difficulty: 'easy',
    unlosable: true,
    victory: { kinds: ['eradication'], all: false },
    medals: { bronze: 500, silver: 1500, gold: 3000 },
  }),
  steps: [
    {
      id: 'resources',
      text: 'tutorial.l2.resources',
      marker: { ui: 'cmd-win-economy' },
      done: { kind: 'panel', panel: 'economy' },
    },
    {
      id: 'repurpose',
      text: 'tutorial.l2.repurpose',
      marker: { ui: 'win-economy' },
      done: { kind: 'command', command: 'RepurposeBuilding' },
    },
    {
      id: 'population',
      text: 'tutorial.l2.population',
      marker: { ui: 'cmd-win-population' },
      done: { kind: 'command', command: 'AssignWorkers' },
    },
    {
      id: 'morale',
      text: 'tutorial.l2.morale',
      marker: { ui: 'cmd-win-decrees' },
      done: { kind: 'panel', panel: 'decrees' },
    },
    {
      id: 'countdown',
      text: 'tutorial.l2.countdown',
      marker: { ui: 'hud-countdown' },
      done: { kind: 'speed', atLeast: 2 },
    },
    {
      id: 'defend',
      text: 'tutorial.l2.defend',
      marker: { ui: 'cmd-tab-units' },
      done: { kind: 'phase', phase: 'outbreak' },
    },
    {
      id: 'repel',
      text: 'tutorial.l2.repel',
      marker: { ui: 'objectives' },
      done: { kind: 'phase', phase: 'ended' },
    },
  ],
};
