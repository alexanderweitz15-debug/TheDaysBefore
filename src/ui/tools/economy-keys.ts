// P opens the population window, a second P the decrees, a third closes (GDD 14: P = Bevölkerung und Erlasse).
import { keyOf } from '../settings/store';
import { menuVisible, settingsOpen, sidePanel } from '../ui-state';

export function installEconomyKeys(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== keyOf('population') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type !== 'range') return;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
    if (menuVisible.value || settingsOpen.value) return;
    const cur = sidePanel.value;
    sidePanel.value = cur === 'population' ? 'decrees' : cur === 'decrees' ? null : 'population';
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
