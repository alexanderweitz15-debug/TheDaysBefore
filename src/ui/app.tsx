// UI root: overlay above the map. #ui ignores pointer events, only panels take them.
import { effect } from '@preact/signals';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import type { MountUi, UiDeps } from '../core/types/app';
import { installOverlayHotkey } from './hotkeys';
import { DebugPanel } from './hud/debug-panel';
import { LoadingHint, OverlayBadge } from './hud/overlay-status';
import { PerfOverlay } from './hud/perf-overlay';
import { applyPaletteVars } from './palette-vars';
import { MainMenu } from './screens/main-menu';
import { SettingsPanel } from './settings/settings-panel';
import { settings } from './settings/store';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles.css';
import { debugOpen, menuVisible, settingsOpen, spawnArmed } from './ui-state';

function App({ deps }: { deps: UiDeps }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // One place for Esc: active mode first, then panels, then the menu.
      if (spawnArmed.value) spawnArmed.value = false;
      else if (debugOpen.value) debugOpen.value = false;
      else if (!menuVisible.value) menuVisible.value = true;
      else if (settingsOpen.value) settingsOpen.value = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => installOverlayHotkey(deps.sim), [deps.sim]);

  return (
    <>
      <MainMenu />
      {menuVisible.value && settingsOpen.value && <SettingsPanel />}
      <PerfOverlay sim={deps.sim} renderer={deps.renderer} />
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
