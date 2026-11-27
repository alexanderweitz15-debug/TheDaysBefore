// Order list (left, under the top bar): status, assigned/requested, strength per type, stance, dissolve.
import type { Stance, UnitTypeId } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import type { OrderView } from '../../core/types/orders';
import { ORDER_STANCES } from '../../data/hud-orders';
import { jumpCamera } from '../../render/view-state';
import { Glyph } from '../components/icons';
import { t } from '../i18n';
import { ORDERABLE } from '../tools/order-tool';
import { ordersCollapsed, sidePanel } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;
const STATUS_MARK: Record<OrderView['status'], string> = {
  pending: '…',
  active: '●',
  failing: '!',
  lost: '×',
};

/** Map point an order is centered on (meters). */
function center(o: OrderView): { x: number; y: number } {
  const s = o.shape;
  if (o.kind === 'holdZone')
    return { x: ((s[0] as number) + (s[2] as number)) / 2, y: ((s[1] as number) + (s[3] as number)) / 2 };
  let x = 0;
  let y = 0;
  const n = Math.floor(s.length / 2);
  for (let i = 0; i < n; i++) {
    x += s[i * 2] as number;
    y += s[i * 2 + 1] as number;
  }
  return { x: x / Math.max(1, n), y: y / Math.max(1, n) };
}

export function OrderList({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  if (sidePanel.value) return null;
  const orders = sim.orders;
  const collapsed = ordersCollapsed.value;
  const update = (o: OrderView, squads: OrderView['requested'], stance: Stance): void =>
    commands.submit({
      playerId: LOCAL_PLAYER,
      type: 'UpdateOrder',
      payload: { orderId: o.id, squads, stance },
    });
  const typeOf = new Map(sim.units.map((u) => [u.id, u.type] as const));
  return (
    <aside class="sz-panel sz-orders" data-tutorial-id="order-list" aria-label={t('orders.title')}>
      <button
        type="button"
        class="sz-orders__head"
        aria-expanded={!collapsed}
        title={t('orders.fold')}
        onClick={() => (ordersCollapsed.value = !collapsed)}
      >
        <span>{t('orders.title')}</span>
        <span class="sz-mono">{orders.length}</span>
      </button>
      {!collapsed && (
        <>
          <p class="sz-orders__reserve sz-mono" data-tutorial-id="reserve-line">
            {t('orders.reserve')}{' '}
            {ORDERABLE.filter((u) => (sim.reserve.idle[u] ?? 0) > 0)
              .map((u) => `${sim.reserve.idle[u]}× ${t(`unit.${u}`)}`)
              .join(', ') || '0'}
            {sim.reserve.returning > 0 && ` · ${t('orders.returning', { count: sim.reserve.returning })}`}
          </p>
          {orders.length === 0 && <p class="sz-dim">{t('orders.empty')}</p>}
          <ul>
            {orders.map((o) => {
              const requested = Object.values(o.requested).reduce((a, n) => a + (n ?? 0), 0);
              const counts = new Map<UnitTypeId, number>();
              for (const id of o.assigned) {
                const ty = typeOf.get(id);
                if (ty) counts.set(ty, (counts.get(ty) ?? 0) + 1);
              }
              return (
                <li key={o.id} class={`sz-order sz-order--${o.status}`} data-tutorial-id={`order-${o.id}`}>
                  <button
                    type="button"
                    class="sz-order__title"
                    title={t('orders.jump')}
                    onClick={() => {
                      const c = center(o);
                      jumpCamera(c.x, c.y);
                    }}
                  >
                    <Glyph
                      id={
                        o.kind === 'defendLine'
                          ? 'defendLine'
                          : o.kind === 'holdZone'
                            ? 'holdZone'
                            : 'occupyBuilding'
                      }
                      size={18}
                    />
                    <span>{t(`cmd.order.${o.kind}`)}</span>
                    <span class="sz-order__status">
                      <span aria-hidden="true">{STATUS_MARK[o.status]}</span> {t(`orders.status.${o.status}`)}
                    </span>
                  </button>
                  <div class="sz-mono sz-order__count">
                    {t('orders.assigned', { assigned: o.assigned.length, requested })}
                  </div>
                  <ul class="sz-order__types">
                    {(Object.entries(o.requested) as [UnitTypeId, number][]).map(([u, n]) => (
                      <li key={u}>
                        <span>{t(`unit.${u}`)}</span>
                        <span class="sz-stepper">
                          <button
                            type="button"
                            class="sz-btn sz-btn--icon"
                            aria-label={t('orders.less')}
                            disabled={n <= 1 && requested <= 1}
                            onClick={() => update(o, { ...o.requested, [u]: Math.max(0, n - 1) }, o.stance)}
                          >
                            −
                          </button>
                          <span class="sz-mono sz-stepper__n">
                            {counts.get(u) ?? 0}/{n}
                          </span>
                          <button
                            type="button"
                            class="sz-btn sz-btn--icon"
                            aria-label={t('orders.more')}
                            disabled={(sim.reserve.idle[u] ?? 0) <= 0}
                            onClick={() => update(o, { ...o.requested, [u]: n + 1 }, o.stance)}
                          >
                            +
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div class="sz-order__actions">
                    <button
                      type="button"
                      class="sz-btn sz-btn--compact"
                      title={t('orders.stance')}
                      data-tutorial-id={`order-stance-${o.id}`}
                      onClick={() =>
                        update(
                          o,
                          o.requested,
                          ORDER_STANCES[(ORDER_STANCES.indexOf(o.stance) + 1) % ORDER_STANCES.length] ??
                            o.stance,
                        )
                      }
                    >
                      {t('orders.stance')}: {t(`stance.${o.stance}`)}
                    </button>
                    <button
                      type="button"
                      class="sz-btn sz-btn--compact sz-btn--danger"
                      data-tutorial-id={`order-cancel-${o.id}`}
                      onClick={() =>
                        commands.submit({
                          playerId: LOCAL_PLAYER,
                          type: 'CancelOrder',
                          payload: { orderId: o.id },
                        })
                      }
                    >
                      {t('orders.dissolve')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
