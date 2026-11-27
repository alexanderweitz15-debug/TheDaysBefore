// UI root: overlay above the map. #ui ignores pointer events, only panels take them.
import { effect } from '@preact/signals';
import { render } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import type { MountUi, UiDeps } from '../core/types/app';
import { selectedStructure } from '../render/view-state';
import { installAudio } from './audio/audio';
import { tapCommands } from './command-tap';
import { installGameFlow } from './game-flow';
import { installOverlayHotkey } from './hotkeys';
import { CommandBar } from './hud/command-bar';
import { ContextPanel } from './hud/context-panel';
import { DebugPanel } from './hud/debug-panel';
import { Minimap } from './hud/minimap';
import { OrderDialog } from './hud/order-dialog';
import { OrderList } from './hud/order-list';
import { LoadingHint, OverlayBadge } from './hud/overlay-status';
import { PauseBanner } from './hud/pause-banner';
import { PerfOverlay } from './hud/perf-overlay';
import { Situation } from './hud/situation';
import { ToolHint } from './hud/status-hud';
import { TopBar } from './hud/top-bar';
import { WarningMarkers } from './hud/warning-markers';
import { applyPaletteVars } from './palette-vars';
import { Briefing } from './screens/briefing';
import { Debrief } from './screens/debrief';
import { LoadingScreen } from './screens/loading';
import { MainMenu } from './screens/main-menu';
import { bindSession } from './session';
import { SettingsPanel } from './settings/settings-panel';
import { settings } from './settings/store';
import { installEconomyKeys } from './tools/economy-keys';
import { installTutorial, TutorialOverlay } from './tutorial/tutorial';
import { SidePanel } from './windows/side-panel';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles.css';
import { installAttackTool } from './tools/attack-tool';
import { installBuildTool } from './tools/build-tool';
import { installGameKeys } from './tools/game-keys';
import { installOrderTool } from './tools/order-tool';
import { installSelectTool } from './tools/select-tool';
import { cancelTool, installZoneTools } from './tools/zone-tools';
import {
  activeScenario,
  briefingOpen,
  confirmAction,
  debriefData,
  debriefOpen,
  debugOpen,
  loadingState,
  menuVisible,
  outbreakArmed,
  savesMode,
  settingsOpen,
  sidePanel,
  spawnArmed,
} from './ui-state';

function App({ deps: rawDeps }: { deps: UiDeps }) {
  const deps = useMemo(() => ({ ...rawDeps, commands: tapCommands(rawDeps.commands) }), [rawDeps]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || debriefOpen.value) return;
      // One place for Esc: active mode first, then panels, then the menu.
      if (cancelTool()) return;
      if (selectedStructure.value !== null) {
        selectedStructure.value = null;
        return;
      }
      if (briefingOpen.value) {
        briefingOpen.value = false;
        menuVisible.value = true;
      } else if (sidePanel.value) sidePanel.value = null;
      else if (spawnArmed.value || outbreakArmed.value) {
        spawnArmed.value = false;
        outbreakArmed.value = false;
      } else if (debugOpen.value) debugOpen.value = false;
      else if (savesMode.value) savesMode.value = null;
      else if (confirmAction.value) confirmAction.value = null;
      else if (settingsOpen.value && menuVisible.value) settingsOpen.value = false;
      else if (!menuVisible.value) menuVisible.value = true;
      else if (activeScenario.value && loadingState.value === null) menuVisible.value = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => installOverlayHotkey(deps.sim), [deps.sim]);
  useEffect(() => installGameFlow(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installTutorial(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installAudio(deps.sim), [deps.sim]);
  useEffect(
    () =>
      deps.sim.onDebrief((d) => {
        debriefData.value = d;
        debriefOpen.value = true;
        menuVisible.value = false;
      }),
    [deps.sim],
  );
  useEffect(() => installEconomyKeys(), []);
  useEffect(() => installZoneTools(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installSelectTool(deps.sim), [deps.sim]);
  useEffect(() => installBuildTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installAttackTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installOrderTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installGameKeys(deps.sim, deps.commands), [deps.sim, deps.commands]);

  // HUD only in the game: not behind briefing, loading screen or the free-mode main menu.
  const hud =
    !briefingOpen.value &&
    loadingState.value === null &&
    !(menuVisible.value && activeScenario.value === null);
  return (
    <>
      <MainMenu commands={deps.commands} />
      <Briefing />
      {hud && <WarningMarkers sim={deps.sim} commands={deps.commands} />}
      {hud && <TutorialOverlay sim={deps.sim} />}
      {hud && <SidePanel sim={deps.sim} commands={deps.commands} />}
      {menuVisible.value && settingsOpen.value && <SettingsPanel />}
      <PerfOverlay sim={deps.sim} renderer={deps.renderer} />
      {hud && (
        <>
          <TopBar sim={deps.sim} commands={deps.commands} />
          <ContextPanel sim={deps.sim} commands={deps.commands} />
          <CommandBar sim={deps.sim} commands={deps.commands} />
          <Situation sim={deps.sim} />
          <Minimap sim={deps.sim} />
          <OrderList sim={deps.sim} commands={deps.commands} />
          <OrderDialog sim={deps.sim} />
          <ToolHint />
          <PauseBanner sim={deps.sim} />
        </>
      )}
      <LoadingHint sim={deps.sim} />
      <OverlayBadge />
      <Debrief sim={deps.sim} />
      <LoadingScreen sim={deps.sim} />
      <DebugPanel sim={deps.sim} commands={deps.commands} />
    </>
  );
}

export const mountUi: MountUi = (root, deps) => {
  applyPaletteVars(root);
  bindSession(deps.session);
  // UI scale: all sizes are rem, so scaling the root font size scales the whole UI.
  effect(() => {
    document.documentElement.style.fontSize = `${(16 * settings.uiScale.value) / 100}px`;
  });
  effect(() => {
    document.documentElement.lang = settings.language.value;
  });
  render(<App deps={deps} />, root);
};
