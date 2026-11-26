// Loading hint until the city map exists, and a badge for the active debug overlay.
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { SimView } from '../../core/types/app';
import { overlayMode } from '../../render/view-state';
import { t } from '../i18n';

export function LoadingHint({ sim }: { sim: SimView }) {
  const ready = useSignal(sim.map !== null);
  useEffect(() => sim.onMap(() => (ready.value = true)), [sim, ready]);
  if (ready.value) return null;
  return (
    <div class="sz-panel sz-loading" role="status" data-tutorial-id="loading-city">
      {t('loading.city')} ...
    </div>
  );
}

export function OverlayBadge() {
  const mode = overlayMode.value;
  if (mode === 'off') return null;
  return (
    <div class="sz-panel sz-overlay-badge" role="status" data-tutorial-id="overlay-badge">
      {t('overlay.label')}: {t(`overlay.${mode}`)}
    </div>
  );
}
