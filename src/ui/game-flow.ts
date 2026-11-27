// Session behaviors without a screen: menu pause, default speed, autopause on phase change, autosave.
import type { GameSpeed } from '../core/commands';
import type { CommandSink, SimView } from '../core/types/app';
import type { MissionPhase } from '../core/types/mission';
import { AUTOSAVE_POLL_MS } from '../data/game';
import { autosave, refreshSaves } from './saves';
import { settings } from './settings/store';
import { activeScenario, loadingState, menuVisible } from './ui-state';

const LOCAL_PLAYER = 0;

export function installGameFlow(sim: SimView, commands: CommandSink): () => void {
  const setSpeed = (speed: GameSpeed): void =>
    commands.submit({ playerId: LOCAL_PLAYER, type: 'SetGameSpeed', payload: { speed } });

  let pausedByMenu: GameSpeed | null = null;
  let wasLoading = false;
  let phase: MissionPhase | null = null;
  let sinceAutosaveMs = 0;
  let last = performance.now();

  const tick = (): void => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const loading = loadingState.peek() !== null;
    const inMission = activeScenario.peek() !== null && !loading;
    const speed = sim.stats.speed as GameSpeed;

    // Mission just started: apply the default speed (GDD 13).
    if (wasLoading && !loading && activeScenario.peek()) {
      pausedByMenu = null;
      phase = sim.mission?.phase ?? null;
      sinceAutosaveMs = 0;
      const def = settings.gameSpeed.peek() as GameSpeed;
      if (def !== 1) setSpeed(def);
    }
    wasLoading = loading;
    if (!inMission) return;

    // The pause menu pauses the game and restores the speed on close.
    const ended = sim.mission?.outcome != null;
    if (menuVisible.peek() && !ended) {
      if (pausedByMenu === null && speed !== 0) {
        pausedByMenu = speed;
        setSpeed(0);
      }
    } else if (pausedByMenu !== null) {
      const back = pausedByMenu;
      pausedByMenu = null;
      if (!ended) setSpeed(back);
    }

    const m = sim.mission;
    if (!m || ended) return;
    if (phase !== null && m.phase !== phase) {
      if (
        settings.autopause.peek() &&
        (m.phase === 'outbreak' || m.phase === 'defense') &&
        pausedByMenu === null
      )
        setSpeed(0);
      void autosave();
      sinceAutosaveMs = 0;
    }
    phase = m.phase;

    const every = settings.autosaveMin.peek();
    if (speed > 0 && !document.hidden) sinceAutosaveMs += dt;
    if (every > 0 && sinceAutosaveMs >= every * 60_000) {
      sinceAutosaveMs = 0;
      void autosave();
    }
  };
  void refreshSaves();
  const id = window.setInterval(tick, AUTOSAVE_POLL_MS / 4);
  return () => window.clearInterval(id);
}
