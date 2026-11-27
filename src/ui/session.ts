// Mission session flow: briefing -> loading -> game, restart, load and return to the free-mode menu background.
import type { SessionControl } from '../core/types/app';
import type { ScenarioDef } from '../core/types/mission';
import type { SaveGame } from '../core/types/save';
import { FREE_MODE, makeSkirmish, newSkirmishSeed } from '../data/scenarios';
import { LESSONS } from '../data/tutorial';
import { repurposeTarget, selectedStructure } from '../render/view-state';
import {
  activeLessonId,
  activeScenario,
  briefingOpen,
  confirmAction,
  debriefOpen,
  loadingState,
  menuVisible,
  openWarning,
  savesMode,
  settingsOpen,
  sidePanel,
  tutorialMenuOpen,
} from './ui-state';

let session: SessionControl | null = null;

export function bindSession(s: SessionControl): void {
  session = s;
}

export function getSession(): SessionControl | null {
  return session;
}

function resetView(): void {
  selectedStructure.value = null;
  repurposeTarget.value = null;
  sidePanel.value = null;
  openWarning.value = null;
  debriefOpen.value = false;
  savesMode.value = null;
  confirmAction.value = null;
  settingsOpen.value = false;
  tutorialMenuOpen.value = false;
}

/** Starts a scenario: the sim restarts, the loading screen waits for the map. */
export function startScenario(scenario: ScenarioDef, lessonId: string | null = null): void {
  if (!session) return;
  resetView();
  activeScenario.value = scenario;
  activeLessonId.value = lessonId;
  briefingOpen.value = false;
  loadingState.value = { startedAt: performance.now(), scenario };
  session.restart(scenario.seed, scenario.size, scenario);
}

export function startLesson(id: string): void {
  const l = LESSONS.find((x) => x.id === id);
  if (l) startScenario(l.scenario, l.id);
}

/** Quick skirmish (GDD 12): random city from a fresh seed. */
export function startSkirmish(seed: number = newSkirmishSeed()): void {
  startScenario(makeSkirmish(seed));
}

/** Same scenario, same seed. */
export function restartMission(): void {
  const s = activeScenario.value;
  if (s) startScenario(s, activeLessonId.value);
}

/** Same scenario, new seed (skirmish rebuilds the whole setup from the seed). */
export function restartNewSeed(): void {
  const s = activeScenario.value;
  if (!s) return;
  const seed = newSkirmishSeed();
  startScenario(s.id === 'skirmish' ? makeSkirmish(seed) : { ...s, seed }, activeLessonId.value);
}

/** Pause menu "Hauptmenü": back to the free-mode background. */
export function toMainMenu(): void {
  if (!session) return;
  resetView();
  activeScenario.value = null;
  activeLessonId.value = null;
  briefingOpen.value = false;
  menuVisible.value = true;
  loadingState.value = { startedAt: performance.now(), scenario: null };
  session.restart(FREE_MODE.seed, FREE_MODE.size);
}

/** Loads a save game into the running worker. */
export function loadGame(save: SaveGame): void {
  if (!session) return;
  resetView();
  activeScenario.value = save.scenario;
  activeLessonId.value = null;
  briefingOpen.value = false;
  loadingState.value = { startedAt: performance.now(), scenario: save.scenario };
  session.load(save);
}

export function finishLoading(): void {
  const l = loadingState.value;
  loadingState.value = null;
  if (l?.scenario) menuVisible.value = false;
}
