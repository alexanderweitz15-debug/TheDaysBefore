// Top bar, left: budget large, other resources as labeled chips (icon, value, trend). Tooltip lists sources.
import type { ResourceId } from '../../core/commands';
import type { ResourceView } from '../../core/types/mission';
import { RELEVANT_ONLY_RESOURCES } from '../../data/hud';
import {
  CRIT_FRACTION,
  RESOURCE_ORDER,
  SHOW_BUDGET_TREND,
  UNLIMITED_CAPACITY,
  WARN_FRACTION,
} from '../../data/hud-economy';
import { ResourceIcon } from '../components/icons';
import { numberLocale, t } from '../i18n';

export type Level = 'ok' | 'warn' | 'crit';

/** Critical colors (GDD 14): yellow at 25 % of capacity, red at 10 %. Power is critical when negative. */
export function levelOf(id: ResourceId, r: ResourceView): Level {
  if (id === 'power') return r.amount < 0 ? 'crit' : 'ok';
  if (r.capacity <= 0 || r.capacity >= UNLIMITED_CAPACITY)
    return r.amount <= 0 && id !== 'research' ? 'crit' : 'ok';
  const f = r.amount / r.capacity;
  return f <= CRIT_FRACTION ? 'crit' : f <= WARN_FRACTION ? 'warn' : 'ok';
}

const isRelevantOnly = (id: ResourceId): boolean =>
  (RELEVANT_ONLY_RESOURCES as readonly ResourceId[]).includes(id);

export function ResourceBar({ resources }: { resources: Record<ResourceId, ResourceView> }) {
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const signed = new Intl.NumberFormat(numberLocale(), {
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  });
  return (
    <ul class="sz-resources" data-tutorial-id="hud-resources">
      {RESOURCE_ORDER.map((id) => {
        const r = resources[id];
        if (!r) return null;
        const level = levelOf(id, r);
        const trend = id === 'budget' && !SHOW_BUDGET_TREND ? 0 : Math.round(r.perMin);
        // Power and research only appear once they matter.
        if (isRelevantOnly(id) && level === 'ok' && Math.round(r.amount) === 0 && trend === 0) return null;
        const cap =
          r.capacity > 0 && r.capacity < UNLIMITED_CAPACITY
            ? `\n${t('hud.capacity', { value: fmt.format(r.capacity) })}`
            : '';
        return (
          <li
            key={id}
            class={`sz-res sz-level--${level}${id === 'budget' ? ' sz-res--main' : ''}`}
            title={`${t(`res.${id}`)}\n${t(`res.${id}.tip`)}${cap}\n${t('hud.perMin', { value: signed.format(trend) })}`}
            data-tutorial-id={`hud-res-${id}`}
          >
            <span class="sz-res__label">
              <ResourceIcon id={id} />
              {t(`res.${id}`)}
            </span>
            <span class="sz-res__line">
              <span class="sz-mono sz-res__value">{fmt.format(r.amount)}</span>
              <span class="sz-mono sz-res__trend" data-sign={trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}>
                {trend > 0 ? '▲' : trend < 0 ? '▼' : ''}
                {trend !== 0 && fmt.format(Math.abs(trend))}
              </span>
            </span>
            {level !== 'ok' && (
              <span class="sz-sr">{level === 'crit' ? t('hud.critical') : t('hud.low')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
