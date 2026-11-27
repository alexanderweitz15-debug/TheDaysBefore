// Mission session flow: briefing -> loading -> game, restart and return to the free-mode menu background.
import type { SessionControl } from '../core/types/app';
import type { ScenarioDef } from '../core/types/mission';
import { FREE_MODE } from '../data/scenarios';
import { repurposeTarget, selectedStructure, selectedUnits } from '../render/view-state';
import { activeScenario, briefingOpen, loadingState, menuVisible, openWarning, sidePanel } from './ui-state';

let session: SessionControl | null = null;

export function bindSession(s: SessionControl): void {
  session = s;
}

function resetView(): void {
  selectedUnits.value = [];
  selectedStructure.value = null;
  repurposeTarget.value = null;
  sidePanel.value = null;
  openWarning.value = null;
}

/** Starts a scenario: the sim restarts, the loading screen waits for the map. */
export function startScenario(scenario: ScenarioDef): void {
  if (!session) return;
  resetView();
  activeScenario.value = scenario;
  briefingOpen.value = false;
  loadingState.value = { startedAt: performance.now(), scenario };
  session.restart(scenario.seed, scenario.size, scenario);
}

/** Pause menu "Neustart": same scenario, same seed. */
export function restartMission(): void {
  const s = activeScenario.value;
  if (s) startScenario(s);
}

/** Pause menu "Hauptmenü": back to the free-mode background. */
export function toMainMenu(): void {
  if (!session) return;
  resetView();
  activeScenario.value = null;
  briefingOpen.value = false;
  menuVisible.value = true;
  loadingState.value = { startedAt: performance.now(), scenario: null };
  session.restart(FREE_MODE.seed, FREE_MODE.size);
}

export function finishLoading(): void {
  const l = loadingState.value;
  loadingState.value = null;
  if (l?.scenario) menuVisible.value = false;
}
