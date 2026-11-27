// Objectives with progress and the live score (GDD 10, 14): small panel below the top bar, left.
import type { SimView } from '../../core/types/app';
import { numberLocale, t } from '../i18n';
import { usePoll } from './use-poll';

const MEDAL_MARK = { none: '–', bronze: 'III', silver: 'II', gold: 'I' } as const;

export function Objectives({ sim }: { sim: SimView }) {
  usePoll(500);
  const m = sim.mission;
  if (!m || m.objectives.length === 0) return null;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  return (
    <aside class="sz-panel sz-objectives" data-tutorial-id="objectives" aria-label={t('hud.objectives')}>
      <h3>{t('hud.objectives')}</h3>
      <ul>
        {m.objectives.map((o) => (
          <li key={o.kind} aria-label={`${t(`victory.${o.kind}`)} ${Math.round(o.progress * 100)} %`}>
            <span>
              {o.met ? '✓ ' : ''}
              {t(`victory.${o.kind}`)}
            </span>
            <span class="sz-mono">{Math.round(o.progress * 100)} %</span>
            <div class="sz-bar" aria-hidden="true">
              <div class="sz-bar__fill" style={{ width: `${Math.min(1, o.progress) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p class="sz-objectives__score" title={t('hud.score.tip')} data-tutorial-id="hud-score">
        <span class="sz-hud__label">{t('hud.score')}</span>{' '}
        <strong class="sz-mono">{fmt.format(m.score.total)}</strong>{' '}
        <span class="sz-badge" title={t(`medal.${m.score.medal}`)}>
          {t(`medal.${m.score.medal}`)} {MEDAL_MARK[m.score.medal]}
        </span>
      </p>
    </aside>
  );
}
