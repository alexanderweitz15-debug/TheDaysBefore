// Top bar, left: every resource with icon, value, trend per minute and a tooltip (GDD 14).
import type { ResourceId } from '../../core/commands';
import type { ResourceView } from '../../core/types/mission';
import { CRIT_FRACTION, RESOURCE_ORDER, UNLIMITED_CAPACITY, WARN_FRACTION } from '../../data/hud-economy';
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

/** Non-color marker for the level (color-blind safe). */
export const LEVEL_MARK: Record<Level, string> = { ok: '', warn: '!', crit: '!!' };

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
        const trend = Math.round(r.perMin);
        const cap =
          r.capacity > 0 && r.capacity < UNLIMITED_CAPACITY
            ? `\n${t('hud.capacity', { value: fmt.format(r.capacity) })}`
            : '';
        return (
          <li
            key={id}
            class={`sz-res sz-level--${level}`}
            title={`${t(`res.${id}`)}\n${t(`res.${id}.tip`)}${cap}\n${t('hud.perMin', { value: signed.format(trend) })}`}
            data-tutorial-id={`hud-res-${id}`}
          >
            <ResourceIcon id={id} />
            <span class="sz-mono sz-res__value">{fmt.format(r.amount)}</span>
            {LEVEL_MARK[level] && <span class="sz-level__mark">{LEVEL_MARK[level]}</span>}
            <span class="sz-mono sz-res__trend" data-sign={trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}>
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '–'}
              {trend !== 0 && fmt.format(Math.abs(trend))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
