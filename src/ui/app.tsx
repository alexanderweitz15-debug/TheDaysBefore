// UI root: overlay above the map. #ui ignores pointer events, only panels take them.
import { effect } from '@preact/signals';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import type { MountUi, UiDeps } from '../core/types/app';
import { selectedStructure, selectedUnits } from '../render/view-state';
import { installOverlayHotkey } from './hotkeys';
import { CommandBar } from './hud/command-bar';
import { ContextPanel } from './hud/context-panel';
import { DebugPanel } from './hud/debug-panel';
import { Minimap } from './hud/minimap';
import { LoadingHint, OverlayBadge } from './hud/overlay-status';
import { PerfOverlay } from './hud/perf-overlay';
import { SelectionBox } from './hud/selection-box';
import { ToolHint } from './hud/status-hud';
import { TopBar } from './hud/top-bar';
import { applyPaletteVars } from './palette-vars';
import { MainMenu } from './screens/main-menu';
import { SettingsPanel } from './settings/settings-panel';
import { settings } from './settings/store';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles.css';
import { installAttackTool } from './tools/attack-tool';
import { installBuildTool } from './tools/build-tool';
import { installGameKeys } from './tools/game-keys';
import { installSelectTool } from './tools/select-tool';
import { cancelTool, installZoneTools } from './tools/zone-tools';
import { debugOpen, menuVisible, outbreakArmed, settingsOpen, spawnArmed } from './ui-state';

function App({ deps }: { deps: UiDeps }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // One place for Esc: active mode first, then panels, then the menu.
      if (cancelTool()) return;
      if (selectedUnits.value.length > 0 || selectedStructure.value !== null) {
        selectedUnits.value = [];
        selectedStructure.value = null;
        return;
      }
      if (spawnArmed.value || outbreakArmed.value) {
        spawnArmed.value = false;
        outbreakArmed.value = false;
      } else if (debugOpen.value) debugOpen.value = false;
      else if (!menuVisible.value) menuVisible.value = true;
      else if (settingsOpen.value) settingsOpen.value = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => installOverlayHotkey(deps.sim), [deps.sim]);
  useEffect(() => installZoneTools(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installSelectTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installBuildTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installAttackTool(deps.sim, deps.commands), [deps.sim, deps.commands]);
  useEffect(() => installGameKeys(deps.sim, deps.commands), [deps.sim, deps.commands]);

  return (
    <>
      <MainMenu />
      {menuVisible.value && settingsOpen.value && <SettingsPanel />}
      <PerfOverlay sim={deps.sim} renderer={deps.renderer} />
      <TopBar sim={deps.sim} commands={deps.commands} />
      <ContextPanel sim={deps.sim} commands={deps.commands} />
      <CommandBar sim={deps.sim} />
      <Minimap sim={deps.sim} />
      <SelectionBox />
      <ToolHint />
      <LoadingHint sim={deps.sim} />
      <OverlayBadge />
      <DebugPanel sim={deps.sim} commands={deps.commands} />
    </>
  );
}

export const mountUi: MountUi = (root, deps) => {
  applyPaletteVars(root);
  // UI scale: all sizes are rem, so scaling the root font size scales the whole UI.
  effect(() => {
    document.documentElement.style.fontSize = `${(16 * settings.uiScale.value) / 100}px`;
  });
  effect(() => {
    document.documentElement.lang = settings.language.value;
  });
  render(<App deps={deps} />, root);
};
