// Compact dialog while an order is being prepared: strength per type from the reserve, stance, hint.
import type { UnitTypeId } from '../../core/commands';
import type { SimView } from '../../core/types/app';
import { ORDER_STANCES } from '../../data/hud-orders';
import { orderHover } from '../../render/view-state';
import { t } from '../i18n';
import { buildingInfo, ORDERABLE } from '../tools/order-tool';
import { cancelTool } from '../tools/zone-tools';
import { orderDraft } from '../ui-state';
import { usePoll } from './use-poll';

export function OrderDialog({ sim }: { sim: SimView }) {
  usePoll(150);
  const d = orderDraft.value;
  if (!d) return null;
  const set = (u: UnitTypeId, n: number): void => {
    const cur = orderDraft.value;
    if (cur) orderDraft.value = { ...cur, squads: { ...cur.squads, [u]: n } };
  };
  const info = d.kind === 'occupyBuilding' ? buildingInfo(sim, orderHover.buildingId) : null;
  return (
    <section
      class="sz-panel sz-orderdlg"
      data-tutorial-id="order-dialog"
      aria-label={t(`cmd.order.${d.kind}`)}
    >
      <header>
        <h3>{t(`cmd.order.${d.kind}`)}</h3>
        <button type="button" class="sz-btn sz-btn--compact" onClick={() => cancelTool()}>
          {t('orders.cancel')}
        </button>
      </header>
      <p class="sz-orderdlg__hint">{t(`tool.${d.kind}`)}</p>
      {d.kind === 'occupyBuilding' && (
        <p class="sz-orderdlg__info sz-mono">
          {info ? t('orders.building.info', info) : t('orders.building.none')}
        </p>
      )}
      <h4 class="sz-hud__label">{t('orders.strength')}</h4>
      <ul class="sz-orderdlg__types">
        {ORDERABLE.map((u) => {
          const idle = sim.reserve.idle[u] ?? 0;
          const n = d.squads[u] ?? 0;
          if (idle === 0 && n === 0) return null;
          return (
            <li key={u}>
              <span>{t(`unit.${u}`)}</span>
              <span class="sz-stepper">
                <button
                  type="button"
                  class="sz-btn sz-btn--icon"
                  aria-label={t('orders.less')}
                  disabled={n <= 0}
                  onClick={() => set(u, n - 1)}
                >
                  −
                </button>
                <span class="sz-mono sz-stepper__n" data-tutorial-id={`order-n-${u}`}>
                  {n}
                </span>
                <button
                  type="button"
                  class="sz-btn sz-btn--icon"
                  aria-label={t('orders.more')}
                  disabled={n >= idle}
                  onClick={() => set(u, n + 1)}
                >
                  +
                </button>
              </span>
              <span class="sz-dim sz-mono">{t('orders.inReserve', { count: idle })}</span>
            </li>
          );
        })}
      </ul>
      <fieldset class="sz-context__group">
        <legend class="sz-hud__label">{t('orders.stance')}</legend>
        {ORDER_STANCES.map((s) => (
          <button
            key={s}
            type="button"
            class="sz-btn sz-btn--compact"
            aria-pressed={d.stance === s}
            onClick={() => (orderDraft.value = { ...d, stance: s })}
          >
            {t(`stance.${s}`)}
          </button>
        ))}
      </fieldset>
    </section>
  );
}
