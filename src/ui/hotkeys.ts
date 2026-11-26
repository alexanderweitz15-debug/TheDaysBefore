// Global keys: O cycles the debug overlay and requests the matching field from the sim.
import type { SimView } from '../core/types/app';
import { OVERLAY_MODES, overlayMode } from '../render/view-state';

export function installOverlayHotkey(sim: SimView): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyO' || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
      return;
    const next =
      OVERLAY_MODES[(OVERLAY_MODES.indexOf(overlayMode.value) + 1) % OVERLAY_MODES.length] ?? 'off';
    overlayMode.value = next;
    sim.requestDebugField(
      next === 'flow' || next === 'density' || next === 'infection' || next === 'noise' || next === 'safety'
        ? next
        : null,
    );
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
