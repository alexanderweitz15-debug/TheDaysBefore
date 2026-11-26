// Top-center counters: rescued, dead, zombies. Incubating civilians are never shown (GDD 7, needs research).
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { SimView } from '../../core/types/app';
import { activeTool } from '../../render/view-state';
import { numberLocale, t } from '../i18n';
import { undoRemoval } from '../tools/zone-tools';
import { pendingRemoval, toolNotice } from '../ui-state';

const REFRESH_MS = 250;

export function StatusHud({ sim }: { sim: SimView }) {
  const v = useSignal({ rescued: 0, dead: 0, zombies: 0 });
  useEffect(() => {
    const read = (): void => {
      const s = sim.stats;
      const n = { rescued: s.counters.sheltered, dead: s.counters.civiliansDead, zombies: s.zombies };
      if (n.rescued !== v.value.rescued || n.dead !== v.value.dead || n.zombies !== v.value.zombies)
        v.value = n;
    };
    read();
    const id = window.setInterval(read, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [sim, v]);
  const fmt = new Intl.NumberFormat(numberLocale());
  const rows: Array<[string, number]> = [
    [t('hud.rescued'), v.value.rescued],
    [t('hud.dead'), v.value.dead],
    [t('hud.zombies'), v.value.zombies],
  ];
  return (
    <aside class="sz-panel sz-hud" data-tutorial-id="status-hud" aria-label={t('hud.rescued')}>
      {rows.map(([label, value]) => (
        <span key={label} class="sz-hud__item">
          <span class="sz-hud__label">{label}</span> <span class="sz-mono">{fmt.format(value)}</span>
        </span>
      ))}
    </aside>
  );
}

export function ToolHint() {
  const tool = activeTool.value;
  const notice = toolNotice.value;
  if (pendingRemoval.value !== null) {
    return (
      <div class="sz-panel sz-tool-hint" role="status" data-tutorial-id="tool-undo">
        {t('tool.remove.pending')}{' '}
        <button type="button" class="sz-btn sz-btn--compact" onClick={undoRemoval}>
          {t('tool.remove.undo')}
        </button>
      </div>
    );
  }
  if (tool === 'none') return null;
  return (
    <div class="sz-panel sz-tool-hint" role="status" data-tutorial-id="tool-hint">
      {t(`tool.${tool}`)}
      {notice && <div>{t(notice)}</div>}
    </div>
  );
}
