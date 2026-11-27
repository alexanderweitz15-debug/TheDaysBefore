// Situation card, right under the top bar: big counters (GDD 14). Objectives follow below it.
import type { SimView } from '../../core/types/app';
import { numberLocale, t } from '../i18n';
import { Objectives } from './objectives';
import { usePoll } from './use-poll';

export function Situation({ sim }: { sim: SimView }) {
  usePoll();
  const s = sim.stats;
  const c = s.counters;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const items: Array<[string, number, string, string]> = [
    [t('hud.rescued'), c.sheltered, 'rescued', 'ok'],
    [t('hud.dead'), c.civiliansDead, 'dead', c.civiliansDead > 0 ? 'bad' : ''],
    [t('hud.zombies'), s.zombies, 'zombies', ''],
    [t('hud.soldiersLost'), c.soldiersLost, 'losses', ''],
    [t('hud.collateral'), c.collateralKills, 'collateral', c.collateralKills > 0 ? 'bad' : ''],
  ];
  return (
    <aside class="sz-situation" aria-label={t('hud.situation')}>
      <section class="sz-panel sz-stats" data-tutorial-id="hud-situation">
        <h3>{t('hud.situation')}</h3>
        <dl>
          {items.map(([label, value, id, tone]) => (
            <div key={id} class={`sz-stat${tone ? ` sz-stat--${tone}` : ''}`} data-tutorial-id={`hud-${id}`}>
              <dt>{label}</dt>
              <dd class="sz-mono">{fmt.format(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Objectives sim={sim} />
    </aside>
  );
}
