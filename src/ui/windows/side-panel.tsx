// Side panel host for the windows (GDD 14 Fenster). The game keeps running.
import type { CommandSink, SimView } from '../../core/types/app';
import { usePoll } from '../hud/use-poll';
import { t } from '../i18n';
import { type SidePanelId, sidePanel } from '../ui-state';
import { DecreesWindow } from './decrees-window';
import { EconomyWindow } from './economy-window';
import { PopulationWindow } from './population-window';

export const PANEL_IDS: readonly SidePanelId[] = ['economy', 'population', 'decrees'];

export function SidePanel({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  const id = sidePanel.value;
  const mission = sim.mission;
  if (!id || !mission) return null;
  return (
    <aside class="sz-panel sz-side" data-tutorial-id="side-panel" aria-label={t(`win.${id}`)}>
      <div class="sz-side__tabs" role="tablist">
        {PANEL_IDS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            class="sz-btn sz-btn--compact"
            aria-selected={id === p}
            data-tutorial-id={`win-tab-${p}`}
            onClick={() => (sidePanel.value = p)}
          >
            {t(`win.${p}`)}
          </button>
        ))}
        <button
          type="button"
          class="sz-btn sz-btn--compact sz-side__close"
          title={t('win.close')}
          aria-label={t('win.close')}
          data-tutorial-id="win-close"
          onClick={() => (sidePanel.value = null)}
        >
          x
        </button>
      </div>
      <div class="sz-side__body">
        {id === 'economy' && <EconomyWindow sim={sim} mission={mission} commands={commands} />}
        {id === 'population' && <PopulationWindow mission={mission} commands={commands} />}
        {id === 'decrees' && <DecreesWindow mission={mission} commands={commands} />}
      </div>
    </aside>
  );
}
